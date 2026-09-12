const DEFAULT_POLL_CACHE_MS = 15000;
// Tracked-file history is no longer polled every three seconds. Keep a short
// cache only to collapse duplicate requests triggered by the same UI action.
const TRACKED_FILES_CACHE_MS = 15000;
const CONVERSION_POLL_MS = 1500;
const CONVERSION_MAX_POLLS = 800;
const inFlight = new Map();
const cache = new Map();
let activeMutations = 0;

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
    /^\/admin-panel\/api\/clients\/[^/]+\/state\/$/.test(path)
  );
}

function cacheLifetime(input) {
  const path = urlOf(input)?.pathname || '';
  if (path === '/edi835/api/tracked-files/') return TRACKED_FILES_CACHE_MS;
  return DEFAULT_POLL_CACHE_MS;
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
  // worker owns the job, allow normal tracked-files refresh after completion.
  activeMutations += 1;
  let startResponse;
  try {
    startResponse = await nativeFetch(endpoint, startOptions);
  } finally {
    activeMutations = Math.max(0, activeMutations - 1);
    cache.clear();
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
      cache.clear();
      return responseFromJson(statusData.result || { success: true }, Number(statusData.status_code || 200));
    }

    if (statusData.state === 'FAILED') {
      cache.clear();
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
        // Any completed write may affect tracked-file state. Invalidate once so
        // the next explicit UI refresh obtains the current summary.
        cache.clear();
      }
    }

    const url = urlOf(input);
    const requestIdentity = url ? `${url.pathname}${url.search}` : String(input);
    const key = `${method}:${requestIdentity}`;
    const now = Date.now();
    const cached = cache.get(key);
    const cachedResponse = cloneCached(cached);

    if ((activeMutations > 0 || document.visibilityState === 'hidden') && cachedResponse) {
      return cachedResponse;
    }

    if (cachedResponse && now - cached.timestamp < cacheLifetime(input)) {
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
