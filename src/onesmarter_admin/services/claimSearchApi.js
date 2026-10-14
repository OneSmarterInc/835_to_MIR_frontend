import { encodeDemoData } from '../../utils/demoEncoder';

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
  const res = await fetch(`/edi835/api/837/search/?${params}`, {
    credentials: 'include', headers: getAuthHeaders(), signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'Unable to load universal claims.');
  return data;
}

function visibleSearchValues(row, field) {
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
  return values.filter(value => value != null).map(value => String(value).toLocaleLowerCase());
}

export async function searchUniversalClaims(clientId, query = '', field = 'all', page = 1, pageSize = 25, signal) {
  const term = String(query || '').trim().toLocaleLowerCase();
  if (!term) return getClaimsPage(clientId, page, pageSize, signal);

  // Backend searches original PHI and therefore cannot search encoded display
  // text. Fetch unfiltered pages and match the frontend representation instead.
  const first = await getClaimsPage(clientId, 1, 250, signal);
  const all = [...(first.results || [])];
  const totalPages = Math.max(1, Number(first.pages || 1));
  for (let current = 2; current <= totalPages; current += 1) {
    const next = await getClaimsPage(clientId, current, 250, signal);
    all.push(...(next.results || []));
  }
  const matches = all.filter(row => visibleSearchValues(encodeDemoData(row), field)
    .some(value => value.includes(term)));
  const count = matches.length;
  const pages = Math.ceil(count / pageSize);
  const currentPage = Math.max(1, Math.min(page, pages || 1));
  return {
    ...first, results: matches.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    count, pages, page: currentPage,
    has_previous: currentPage > 1,
    has_next: currentPage < pages,
  };
}
