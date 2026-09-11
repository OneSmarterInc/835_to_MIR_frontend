const POLL_CACHE_MS = 15000;
const inFlight = new Map();
const cache = new Map();
let activeMutations = 0;

function methodOf(options = {}) {
  return String(options?.method || 'GET').toUpperCase();
}

function pathnameOf(input) {
  try {
    if (typeof input === 'string') {
      return new URL(input, window.location.origin).pathname;
    }
    if (input instanceof Request) {
      return new URL(input.url, window.location.origin).pathname;
    }
  } catch (_) {}
  return '';
}

function isBackgroundPollingRequest(input, options = {}) {
  if (methodOf(options) !== 'GET') return false;
  const path = pathnameOf(input);
  if (!path) return false;

  return (
    path === '/edi835/api/tracked-files/' ||
    path === '/edi835/api/metrics/' ||
    path === '/edi835/api/sftp/get/' ||
    path === '/admin-panel/api/clients/' ||
    /^\/admin-panel\/api\/clients\/[^/]+\/state\/$/.test(path)
  );
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
    const method = methodOf(options);
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
        // Force the next background refresh to see the mutation's new state.
        cache.clear();
      }
    }

    const path = pathnameOf(input);
    const key = `${method}:${path}`;
    const now = Date.now();
    const cached = cache.get(key);
    const cachedResponse = cloneCached(cached);

    // During validation/conversion or while the tab is hidden, never start a
    // competing poll if we already have usable screen data.
    if ((activeMutations > 0 || document.visibilityState === 'hidden') && cachedResponse) {
      return cachedResponse;
    }

    // The UI currently asks for these endpoints every few seconds. Reuse a
    // recent successful response instead of repeatedly hitting Django.
    if (cachedResponse && now - cached.timestamp < POLL_CACHE_MS) {
      return cachedResponse;
    }

    // If the previous poll is still waiting on Django, share it rather than
    // opening another connection for the same resource.
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
