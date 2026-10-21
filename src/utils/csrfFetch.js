const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const API_PATH = /^\/(?:api|accounts|edi835|admin-panel)\//;
const AUTH_CHANGE = /^\/(?:accounts\/api\/(?:login|logout)|admin-panel\/api\/auth\/(?:login|logout|register))\/?$/;

// Use the server-issued masked token, not document.cookie: the API may be
// hosted on a different origin whose cookies this page cannot read.
export function createCsrfFetch(fetchImpl, { frontendOrigin, backendUrl = '' }) {
  const trustedOrigins = new Set([new URL(frontendOrigin).origin]);
  if (backendUrl) trustedOrigins.add(new URL(backendUrl, frontendOrigin).origin);
  const tokens = new Map();

  async function tokenFor(origin) {
    if (!tokens.has(origin)) {
      const pending = fetchImpl(`${origin}/accounts/api/user/`, {
        credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
      }).then(async (response) => {
        if (!response.ok) throw new Error('Unable to initialize secure session. Please refresh and try again.');
        const data = await response.json();
        if (typeof data.csrf_token !== 'string' || !data.csrf_token) {
          throw new Error('The API did not provide a CSRF token. Please update the backend and try again.');
        }
        return data.csrf_token;
      }).catch((error) => {
        tokens.delete(origin);
        throw error;
      });
      tokens.set(origin, pending);
    }
    return tokens.get(origin);
  }

  return async function csrfFetch(input, options = {}) {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), frontendOrigin);
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    if (SAFE_METHODS.has(method) || !trustedOrigins.has(url.origin) || !API_PATH.test(url.pathname)) {
      return fetchImpl(input, options);
    }
    const headers = new Headers(options.headers ?? request?.headers);
    if (!headers.has('X-CSRFToken')) headers.set('X-CSRFToken', await tokenFor(url.origin));
    const response = await fetchImpl(input, {
      ...options, credentials: 'include', headers: Object.fromEntries(headers),
    });
    // Django rotates its CSRF secret at login. Bootstrap again for subsequent
    // mutations, including the second step of authentication.
    if (AUTH_CHANGE.test(url.pathname)) tokens.delete(url.origin);
    if (response.status === 403) {
      const body = await response.clone().json().catch(() => ({}));
      if (/csrf/i.test(String(body.error || body.detail || ''))) tokens.delete(url.origin);
    }
    // Never automatically replay a mutation.
    return response;
  };
}
