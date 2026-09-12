const CHANGE_TOKEN_URL = '/edi835/api/ui-change-token/';
const CHANGE_CHECK_MS = 10000;
const POLL_CACHE_MS = CHANGE_CHECK_MS;
const CONVERSION_POLL_MS = 1500;
const CONVERSION_MAX_POLLS = 800;
const inFlight = new Map();
const cache = new Map();
let activeMutations = 0;
let lastKnownChangeToken = null;
let lastChangeCheckAt = 0;
let changeTokenInFlight = null;

function methodOf(options = {}, input = null) {
  if (options?.method) return String(options.method).toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request && input.method) {
    return String(input.method).toUpperCase();
  }
  return 'GET';
}

function urlOf(input) {
  try {
    if (typeof input === 'string') {
      return new URL(input, window.location.origin);
    }
    if (input instanceof Request) {
      return new URL(input.url, window.location.origin);
    }
  } catch (_) {}
  return null;
}

function isBackgroundPollingRequest(input, options = {}) {
  if (methodOf(options, input) !== 'GET') return false;
  const url = urlOf(input);
  const path = url?.pathname || '';
  if (!path) return false;

  return (
    path === '/edi835/api/tracked-files/' ||
    path === '/edi835/api/metrics/' ||
    path === '/edi835/api/sftp/get/' ||
    path === '/admin-panel/api/clients/' ||
    /^\/admin-panel\/api\/clients\/[^/]+\/state\/$/.test(path) ||
    /^\/admin-panel\/api\/clients\/[^/]+\/offboarding\/state\/$/.test(path)
  );
}

function cloneCached(entry) {
  try {
    return entry?.response?.clone() || null;
  } catch (_) {
    return null;
  }
}

function invalidatePollingCache() {
  cache.clear();
  lastKnownChangeToken = null;
  lastChangeCheckAt = 0;
}

function jsonBody(options = {}) {
  if (typeof options?.body !== 'string') return null;
  try {
    return JSON.parse(options.body);
  } catch (_) {
    return null;
  }
}

function shouldUseAsyncConversion(input, options = {}) {
  const url = urlOf(input);
  if (methodOf(options, input) !== 'POST' || url?.pathname !== '/api/convert/') return false;
  const body = jsonBody(options);
  // Single-file Process MIR always has the validated file id. Multi-file
  // conversions still use the existing endpoint until they have durable rows.
  return Boolean(body?.file_id) && !Array.isArray(body?.files);
}

function asyncConversionUrl(input) {
  const url = urlOf(input);
  if (!url) return '/api/convert-async/';
  url.pathname = '/api/convert-async/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function responseFromJson(payload, status = 200) {
  return new Response(JSON.stringify(payload || {}), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeaders(options = {}) {
  const headers = new Headers(options.headers || {});
  const result = { Accept: 'application/json' };
  const authorization = headers.get('Authorization');
  if (authorization) result.Authorization = authorization;
  return result;
}

async function readChangeToken(nativeFetch, options = {}) {
  const now = Date.now();
  if (lastKnownChangeToken && now - lastChangeCheckAt < CHANGE_CHECK_MS) {
    return { ok: true, changed: false };
  }
  if (changeTokenInFlight) return changeTokenInFlight;

  changeTokenInFlight = nativeFetch(CHANGE_TOKEN_URL, {
    method: 'GET',
    credentials: options.credentials || 'include',
    headers: authHeaders(options),
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) return { ok: false, changed: true };
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        return { ok: false, changed: true };
      }
      const token = String(data?.token || '');
      if (!token) return { ok: false, changed: true };

      const changed = lastKnownChangeToken !== null && token !== lastKnownChangeToken;
      lastKnownChangeToken = token;
      lastChangeCheckAt = Date.now();
      return { ok: true, changed };
    })
    .catch(() => ({ ok: false, changed: true }))
    .finally(() => {
      changeTokenInFlight = null;
    });

  return changeTokenInFlight;
}

async function runAsyncConversion(nativeFetch, input, options = {}) {
  const endpoint = asyncConversionUrl(input);
  const startOptions = {
    ...options,
    headers: {
      ...(options.headers || {}),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: options.credentials || 'include',
  };

  // Queueing is the only mutation that must complete synchronously. Once the
  // worker owns the job, its small job-status endpoint remains activity-specific.
  activeMutations += 1;
  let startResponse;
  try {
    startResponse = await nativeFetch(endpoint, startOptions);
  } finally {
    activeMutations = Math.max(0, activeMutations - 1);
    invalidatePollingCache();
  }

  let startData = {};
  try {
    startData = await startResponse.clone().json();
  } catch (_) {}

  if ((!startResponse.ok && startResponse.status !== 202) || !startData?.job_id) {
    return responseFromJson(
      startData?.error ? startData : { error: `Conversion could not be queued (${startResponse.status}).` },
      startResponse.status || 500
    );
  }

  const statusUrl = new URL(endpoint);
  statusUrl.searchParams.set('job_id', startData.job_id);

  for (let attempt = 0; attempt < CONVERSION_MAX_POLLS; attempt += 1) {
    await sleep(CONVERSION_POLL_MS);
    const statusResponse = await nativeFetch(statusUrl.toString(), {
      method: 'GET',
      credentials: options.credentials || 'include',
      headers: { Accept: 'application/json' },
    });

    let statusData = {};
    try {
      statusData = await statusResponse.json();
    } catch (_) {
      if (!statusResponse.ok) {
        return responseFromJson({ error: `Unable to read conversion status (${statusResponse.status}).` }, statusResponse.status || 500);
      }
      continue;
    }

    if (!statusResponse.ok) {
      return responseFromJson(statusData, statusResponse.status);
    }

    if (statusData.state === 'COMPLETED') {
      invalidatePollingCache();
      return responseFromJson(statusData.result || { success: true }, Number(statusData.status_code || 200));
    }

    if (statusData.state === 'FAILED') {
      invalidatePollingCache();
      const result = statusData.result || { success: false, error: 'Background conversion failed.' };
      return responseFromJson(result, Number(statusData.status_code || 500));
    }
  }

  return responseFromJson({
    success: false,
    error: 'Conversion is still running in the background. Refresh the Conversion screen to see its latest status.',
  }, 504);
}

export function installRequestGovernor() {
  if (window.__mir835RequestGovernorInstalled) return;
  window.__mir835RequestGovernorInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function governedFetch(input, options = {}) {
    if (shouldUseAsyncConversion(input, options)) {
      return runAsyncConversion(nativeFetch, input, options);
    }

    const method = methodOf(options, input);
    const isPolling = isBackgroundPollingRequest(input, options);

    if (!isPolling) {
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        return nativeFetch(input, options);
      }

      activeMutations += 1;
      try {
        return await nativeFetch(input, options);
      } finally {
        activeMutations = Math.max(0, activeMutations - 1);
        invalidatePollingCache();
      }
    }

    const url = urlOf(input);
    const requestIdentity = url ? `${url.pathname}${url.search}` : String(input);
    const key = `${method}:${requestIdentity}`;
    const now = Date.now();
    let cached = cache.get(key);
    let cachedResponse = cloneCached(cached);

    // A hidden tab never burns network traffic merely to keep dashboard data warm.
    if (document.visibilityState === 'hidden' && cachedResponse) {
      return cachedResponse;
    }

    // During a mutation, preserve the last stable dashboard snapshot. The
    // mutation invalidates it as soon as the write finishes.
    if (activeMutations > 0 && cachedResponse) {
      return cachedResponse;
    }

    if (cachedResponse && now - cached.timestamp < POLL_CACHE_MS) {
      return cachedResponse;
    }

    if (cachedResponse) {
      const changeState = await readChangeToken(nativeFetch, options);
      if (changeState.ok && !changeState.changed) {
        // Database fingerprint is unchanged. Extend the cached response instead
        // of downloading the same metrics/files/client state again.
        cached.timestamp = Date.now();
        cache.set(key, cached);
        return cachedResponse;
      }
      if (changeState.ok && changeState.changed) {
        cache.clear();
        cached = null;
        cachedResponse = null;
      }
      // If the tiny token endpoint is unavailable, fall through to the real
      // endpoint. Correctness wins over caching during a backend/network issue.
    }

    const existing = inFlight.get(key);
    if (existing) {
      const response = await existing;
      return response.clone();
    }

    const request = nativeFetch(input, options)
      .then((response) => {
        if (response.ok) {
          try {
            cache.set(key, { timestamp: Date.now(), response: response.clone() });
          } catch (_) {}
        }
        return response;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, request);
    const response = await request;
    return response.clone();
  };
}

installRequestGovernor();
