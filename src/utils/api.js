const inFlightGetRequests = new Map();

function withAdminChecksClient(url) {
  if (typeof url !== "string" || typeof window === "undefined") return url;
  const clientId = String(window.__MIR_ADMIN_CHECKS_CLIENT_ID || "").trim();
  if (!clientId) return url;

  const shouldScope = url.includes("/edi835/api/checks/") || (url.includes("/edi835/api/tracked-files/") && url.includes("/details/"));
  if (!shouldScope) return url;

  const [base, hash = ""] = url.split("#", 2);
  const separator = base.includes("?") ? "&" : "?";
  const scoped = /(?:^|[?&])client_id=/.test(base) ? base : `${base}${separator}client_id=${encodeURIComponent(clientId)}`;
  return hash ? `${scoped}#${hash}` : scoped;
}

export function portalFetch(url, options = {}) {
  let requestUrl = withAdminChecksClient(url);
  if (typeof requestUrl === "string" && /^https?:\/\//i.test(requestUrl)) {
    const parsed = new URL(requestUrl);
    requestUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return fetch(requestUrl, { ...options, credentials: "include" });
}

function shouldDeduplicate(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  return method === "GET" && typeof url === "string" && url.includes("/edi835/api/tracked-files/");
}

async function fetchJsonOnce(url, options = {}) {
  const res = await portalFetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error(`Server returned non-JSON response (${res.status}).`);

  const data = await res.json();
  return { res, data };
}

export async function safeFetchJson(url, options = {}) {
  const scopedUrl = withAdminChecksClient(url);
  if (!shouldDeduplicate(scopedUrl, options)) return fetchJsonOnce(scopedUrl, options);

  const key = `${String(options.method || "GET").toUpperCase()}:${scopedUrl}`;
  const existing = inFlightGetRequests.get(key);
  if (existing) return existing;

  const request = fetchJsonOnce(scopedUrl, options).finally(() => inFlightGetRequests.delete(key));
  inFlightGetRequests.set(key, request);
  return request;
}
