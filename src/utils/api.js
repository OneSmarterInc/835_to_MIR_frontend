const inFlightGetRequests = new Map();

function withAdminChecksClient(url) {
  if (typeof url !== "string" || typeof window === "undefined") return url;
  const clientId = String(window.__MIR_ADMIN_CHECKS_CLIENT_ID || "").trim();
  if (!clientId) return url;

  const shouldScope =
    url.includes("/edi835/api/checks/") ||
    (url.includes("/edi835/api/tracked-files/") && url.includes("/details/"));
  if (!shouldScope) return url;

  const [base, hash = ""] = url.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  const scoped = /(?:^|[?&])client_id=/.test(base)
    ? base
    : `${base}${separator}client_id=${encodeURIComponent(clientId)}`;
  return hash ? `${scoped}#${hash}` : scoped;
}

// 2026-09-23 - Yash: Added CSRF token cookie reader and header injection helper
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

export function withCsrf(options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return { credentials: "include", ...options };
  const token = readCookie("csrftoken");
  return {
    credentials: "include",
    ...options,
    headers: { ...(options.headers || {}), "X-CSRFToken": token },
  };
}

export function portalFetch(url, options = {}) {
  let requestUrl = withAdminChecksClient(url);
  if (typeof requestUrl === "string" && /^https?:\/\//i.test(requestUrl)) {
    const parsed = new URL(requestUrl);
    requestUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return fetch(requestUrl, withCsrf(options));
}

function shouldDeduplicate(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  return (
    method === "GET" &&
    typeof url === "string" &&
    url.includes("/edi835/api/tracked-files/")
  );
}

async function fetchJsonOnce(url, options = {}) {
  const res = await portalFetch(url, options);
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    if (!res.ok) {
      throw new Error(`Server error (${res.status} ${res.statusText || ""}). Please ensure the Django backend server is running.`);
    }
    throw new Error(`Server returned non-JSON response (${res.status}). Please check backend connection.`);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error("Invalid JSON response from server.");
  }

  return { res, data };
}

export async function safeFetchJson(url, options = {}) {
  const scopedUrl = withAdminChecksClient(url);
  if (!shouldDeduplicate(scopedUrl, options)) {
    return fetchJsonOnce(scopedUrl, options);
  }

  const key = `${String(options.method || "GET").toUpperCase()}:${scopedUrl}`;
  const existing = inFlightGetRequests.get(key);
  if (existing) return existing;

  const request = fetchJsonOnce(scopedUrl, options).finally(() => {
    if (inFlightGetRequests.get(key) === request) {
      inFlightGetRequests.delete(key);
    }
  });

  inFlightGetRequests.set(key, request);
  return request;
}
