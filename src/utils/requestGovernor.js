const DEFAULT_POLL_CACHE_MS = 15000;
const TRACKED_FILES_CHANGE_CHECK_MS = 3000;
const TRACKED_FILES_PATH = '/edi835/api/tracked-files/';
const TRACKED_FILES_TOKEN_URL = '/edi835/api/ui-change-token/';
const CONVERSION_POLL_MS = 1500;
const CONVERSION_MAX_POLLS = 800;
const inFlight = new Map();
const cache = new Map();
let activeMutations = 0;
let trackedFilesToken = null;
let trackedFilesTokenCheckedAt = 0;
let trackedFilesTokenInFlight = null;

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

function isTrackedFilesRequest(input, options = {}) {
  if (methodOf(options, input) !== 'GET') return false;
  return urlOf(input)?.pathname === TRACKED_FILES_PATH;
}

function isBackgroundPollingRequest(input, options = {}) {
  if (methodOf(options, input) !== 'GET') return false;
  const url = urlOf(input);
  const path = url?.pathname || '';
  if (!path) return false;

  return (
    path === TRACKED_FILES_PATH ||
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

function markTrackedFilesForImmediateChangeCheck() {
  trackedFilesTokenCheckedAt = 0;
}

function clearPollingCacheAfterMutation() {
  // Keep the large tracked-files snapshot. The tiny tracked-files token will
  // decide whether that snapshot really became stale. Other dashboard caches
  // keep their previous invalidation behavior.
  const trackedEntries = [];
  for (const [key, value] of cache.entries()) {
    if (key.includes(`:${TRACKED_FILES_PATH}`)) trackedEntries.push([key, value]);
  }
  cache.clear();
  for (const [key, value] of trackedEntries) cache.set(key, value);
  markTrackedFilesForImmediateChangeCheck();
}

function resetAllPollingCache() {
  cache.clear();
  trackedFilesToken = null;
  trackedFilesTokenCheckedAt = 0;
}

function isAuthenticationMutation(input) {
  const path = urlOf(input)?.pathname || '';
  return (
    path.startsWith('/accounts/api/login') ||
    path.startsWith('/accounts/api/logout') ||
    path.startsWith('/admin-panel/api/login') ||
    path.startsWith('/admin-panel/api/logout')
  );
}

async function readTrackedFilesToken(nativeFetch, options = {}) {
  const now = Date.now();
  if (
    trackedFilesToken !== null &&
    now - trackedFilesTokenCheckedAt < TRACKED_FILES_CHANGE_CHECK_MS
  ) {
    return { ok: true, changed: false };
  }

  if (trackedFilesTokenInFlight) return trackedFilesTokenInFlight;

  trackedFilesTokenInFlight = nativeFetch(TRACKED_FILES_TOKEN_URL, {
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

      const nextToken = String(data?.token || '');
      if (!nextToken) return { ok: false, changed: true };

      const changed = trackedFilesToken !== null && nextToken !== trackedFilesToken;
      trackedFilesToken = nextToken;
      trackedFilesTokenCheckedAt = Date.now();
      return { ok: true, changed };
    })
    .catch(() => ({ ok: false, changed: true }))
    .finally(() => {
      trackedFilesTokenInFlight = null;
    });

  return trackedFilesTokenInFlight;
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
  // worker owns the job, allow normal tracked-file change detection while the
  // activity-specific job endpoint reports progress.
  activeMutations += 1;
  let startResponse;
  try {
    startResponse = await nativeFetch(endpoint, startOptions);
  } finally {
    activeMutations = Math.max(0, activeMutations - 1);
    clearPollingCacheAfterMutation();
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
      clearPollingCacheAfterMutation();
      return responseFromJson(statusData.result || { success: true }, Number(statusData.status_code || 200));
    }

    if (statusData.state === 'FAILED') {
      clearPollingCacheAfterMutation();
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
        if (isAuthenticationMutation(input)) {
          resetAllPollingCache();
        } else {
          clearPollingCacheAfterMutation();
        }
      }
    }

    const url = urlOf(input);
    const requestIdentity = url ? `${url.pathname}${url.search}` : String(input);
    const key = `${method}:${requestIdentity}`;
    const now = Date.now();
    let cached = cache.get(key);
    let cachedResponse = cloneCached(cached);

    if ((activeMutations > 0 || document.visibilityState === 'hidden') && cachedResponse) {
      return cachedResponse;
    }

    if (isTrackedFilesRequest(input, options)) {
      // The application may still ask every three seconds, but the actual
      // tracked-files endpoint is downloaded only when its database-backed
      // fingerprint changes. Otherwise return the existing response locally.
      const changeState = await readTrackedFilesToken(nativeFetch, options);

      if (cachedResponse && changeState.ok && !changeState.changed) {
        return cachedResponse;
      }

      if (cachedResponse && changeState.ok && changeState.changed) {
        cache.delete(key);
        cached = null;
        cachedResponse = null;
      }
      // If the token endpoint is unavailable, fall through to the real
      // tracked-files endpoint so correctness is never sacrificed for caching.
    } else if (cachedResponse && now - cached.timestamp < DEFAULT_POLL_CACHE_MS) {
      return cachedResponse;
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
