const DEFAULT_POLL_CACHE_MS = 15000;
const TRACKED_FILES_CACHE_MS = 1000;
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
  // History is the live source for Conversion, Checks and Archive. Keep only a
  // tiny cache so a DB commit becomes visible on the next refresh/poll instead
  // of being hidden behind the old 15-second cache.
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

export function installRequestGovernor() {
  if (window.__mir835RequestGovernorInstalled) return;
  window.__mir835RequestGovernorInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function governedFetch(input, options = {}) {
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
        // Any successful or failed mutation may have changed server state.
        // Drop polling caches so the refresh triggered by the screen reads DB
        // state immediately.
        cache.clear();
      }
    }

    const url = urlOf(input);
    const requestIdentity = url ? `${url.pathname}${url.search}` : String(input);
    const key = `${method}:${requestIdentity}`;
    const now = Date.now();
    const cached = cache.get(key);
    const cachedResponse = cloneCached(cached);

    // Do not create background competition while an action is still running.
    if ((activeMutations > 0 || document.visibilityState === 'hidden') && cachedResponse) {
      return cachedResponse;
    }

    if (cachedResponse && now - cached.timestamp < cacheLifetime(input)) {
      return cachedResponse;
    }

    // Never stack identical polls. Once the first fast DB response completes,
    // every waiter receives the same response clone.
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
