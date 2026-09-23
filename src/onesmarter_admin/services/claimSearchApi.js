import { encodeDemoData } from '../../utils/demoEncoder';

function getAuthHeaders() {
  const token = localStorage.getItem('onesmarter_admin_token');
  const headers = {};
  if (token) headers.Authorization = `Token ${token}`;
  const activeScreen = new URLSearchParams(window.location.search).get('nav');
  if (activeScreen) headers['X-Admin-Screen'] = activeScreen;
  return headers;
}

export async function searchUniversalClaims(clientId, query = '', field = 'all', page = 1, pageSize = 25, signal) {
  const params = new URLSearchParams({
    client_id: clientId,
    q: query,
    field,
    page: String(page),
    page_size: String(pageSize),
  });
  const res = await fetch(`/edi835/api/837/search/?${params}`, {
    credentials: 'include',
    headers: getAuthHeaders(),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Unable to load universal claims.');
  return encodeDemoData(data);
}
