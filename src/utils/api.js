export async function safeFetchJson(url, options = {}) {
  const fetchOptions = { credentials: "include", ...options };
  const res = await fetch(url, fetchOptions);
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
