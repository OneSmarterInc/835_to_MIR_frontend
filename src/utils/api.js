const inFlightGetRequests = new Map();

export function portalFetch(url, options = {}) {
  let requestUrl = url;
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    const parsed = new URL(url);
    requestUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return fetch(requestUrl, { ...options, credentials: "include" });
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
  if (!shouldDeduplicate(url, options)) {
    return fetchJsonOnce(url, options);
  }

  const key = `${String(options.method || "GET").toUpperCase()}:${url}`;
  const existing = inFlightGetRequests.get(key);
  if (existing) return existing;

  const request = fetchJsonOnce(url, options).finally(() => {
    if (inFlightGetRequests.get(key) === request) {
      inFlightGetRequests.delete(key);
    }
  });

  inFlightGetRequests.set(key, request);
  return request;
}
