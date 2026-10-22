import { encodeDemoValue, getDemoRevealValue } from '../../utils/demoEncoder.js';
import { withCsrf } from '../../utils/api';

function getAuthHeaders() {
  const token = localStorage.getItem('onesmarter_admin_token');
  const headers = {};
  if (token) headers.Authorization = `Token ${token}`;
  const activeScreen = new URLSearchParams(window.location.search).get('nav');
  if (activeScreen) headers['X-Admin-Screen'] = activeScreen;
  return headers;
}

async function getClaimsPage(clientId, page, pageSize, signal) {
  const params = new URLSearchParams({
    client_id: clientId, q: '', field: 'all',
    page: String(page), page_size: String(pageSize),
  });
  const res = await fetch(`/edi835/api/837/search/?${params}`, withCsrf({
    credentials: 'include',
    headers: getAuthHeaders(),
    signal,
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Unable to load universal claims.');
  return data;
}

export function visibleSearchValues(row, field) {
  const lifecycle = row.lifecycle || {};
  const sourceName = type => {
    const source = lifecycle[type] || {};
    return [source.filename, source.original_filename, source.source_filename, source.file_name];
  };
  const fields = {
    highmark: [row.highmark_claim_number],
    internal: [row.internal_claim_number],
    patient: [row.patient_name, row.patient_first_name, row.patient_last_name],
    '837': sourceName('837'),
    '835': sourceName('835'),
    mir: sourceName('mir'),
    recon: sourceName('recon'),
  };
  // Never search raw record contents, internal database identifiers, or hidden fields.
  const values = field === 'all' ? Object.values(fields).flat() : fields[field] || [];
  return values.filter(value => value != null).flatMap(value => {
    const displayed = String(value);
    // JSON values can be encoded by the client response interceptor; other
    // paths may render the frontend encoded representation after data loading.
    // Match either visible variant without searching any unloaded claims.
    const unmasked = getDemoRevealValue(displayed);
    const candidates = [displayed, unmasked, encodeDemoValue(displayed, false),
      encodeDemoValue(displayed, true)];
    return candidates.filter(Boolean).map(text => String(text).toLocaleLowerCase());
  });
}

export async function searchUniversalClaims(clientId, query = '', field = 'all', page = 1, pageSize = 25, signal) {
  return getClaimsPage(clientId, page, pageSize, signal);
}
