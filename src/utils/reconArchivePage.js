const EYE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
const DOWNLOAD_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';

function authHeaders() {
  const token = localStorage.getItem('onesmarter_admin_token');
  const headers = {};
  if (token) headers.Authorization = `Token ${token}`;
  const nav = new URLSearchParams(window.location.search).get('nav');
  if (nav) headers['X-Admin-Screen'] = nav;
  return headers;
}

function currentClientId() {
  return new URLSearchParams(window.location.search).get('client') || '';
}

function parseMeta(row) {
  const smalls = [...row.querySelectorAll('small')].map((node) => (node.textContent || '').trim());
  const bits = (smalls[0] || '').split('·').map((value) => value.trim());
  return {
    filename: row.querySelector('b')?.textContent?.trim() || 'RECON file',
    date: bits[0] || '—',
    status: bits[1] || '—',
    claims: bits[2] || '—',
    size: bits[3] || '—',
    importMode: (smalls[1] || '').replace(/^Import Mode:\s*/i, '') || '—',
  };
}

async function loadClients(select) {
  if (!select || select.dataset.loaded === '1') return;
  select.dataset.loaded = '1';
  try {
    const response = await fetch('/admin-panel/api/clients/', { headers: authHeaders(), credentials: 'include' });
    if (!response.ok) throw new Error('Unable to load clients');
    const data = await response.json();
    const clients = data.results || data.clients || (Array.isArray(data) ? data : []);
    select.innerHTML = '<option value="">-- None (Global System Default) --</option>';
    clients.forEach((client) => {
      const option = document.createElement('option');
      option.value = client.id;
      option.textContent = `${client.name || client.client_name || 'Client'}${client.client_code || client.code ? ` (${client.client_code || client.code})` : ''}`;
      select.appendChild(option);
    });
    select.value = currentClientId();
  } catch {
    select.closest('.recon-archive-client')?.remove();
  }
}

async function resolveFileId(filename) {
  const params = new URLSearchParams();
  const clientId = currentClientId();
  if (clientId) params.set('client_id', clientId);
  else if (window.location.pathname.toLowerCase().includes('administrator')) params.set('scope', 'global');
  const response = await fetch(`/edi835/api/recon/files/?${params}`, { headers: authHeaders(), credentials: 'include' });
  if (!response.ok) throw new Error('Unable to load RECON file details.');
  const data = await response.json();
  return (data.files || []).find((file) => String(file.original_filename || '') === String(filename || ''))?.id || null;
}

function renderHighlighted(preview, text, query, index) {
  preview.textContent = '';
  const term = query.trim();
  if (!term) {
    preview.textContent = text;
    return [];
  }
  const lower = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  const refs = [];
  let cursor = 0;
  let match = 0;
  while (cursor < text.length) {
    const at = lower.indexOf(needle, cursor);
    if (at < 0) {
      preview.append(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (at > cursor) preview.append(document.createTextNode(text.slice(cursor, at)));
    const mark = document.createElement('mark');
    mark.className = match === index ? 'recon-file-search active' : 'recon-file-search';
    mark.textContent = text.slice(at, at + term.length);
    preview.append(mark);
    refs.push(mark);
    match += 1;
    cursor = at + term.length;
  }
  return refs;
}

async function openPreview(filename) {
  let fileId;
  try {
    fileId = await resolveFileId(filename);
    if (!fileId) throw new Error('RECON file record was not found.');
  } catch (error) {
    window.alert(error.message);
    return;
  }

  const page = document.createElement('section');
  page.className = 'recon-file-preview-page';
  page.innerHTML = `<header><div><span>RECON FILE VIEWER</span><h2></h2></div><button type="button" class="recon-archive-back">← Back to Uploaded RECON files</button></header><div class="recon-file-preview-toolbar"><input type="search" placeholder="Search file…" aria-label="Search RECON file"><button type="button" class="recon-file-nav" aria-label="Previous match">↑</button><span>0 / 0</span><button type="button" class="recon-file-nav" aria-label="Next match">↓</button></div><div class="recon-file-preview-body"><pre>Loading file…</pre></div>`;
  page.querySelector('h2').textContent = filename;
  document.body.append(page);

  const back = page.querySelector('.recon-archive-back');
  back.addEventListener('click', () => page.remove());
  const input = page.querySelector('input');
  const buttons = page.querySelectorAll('.recon-file-nav');
  const counter = page.querySelector('.recon-file-preview-toolbar span');
  const preview = page.querySelector('pre');
  let text = '';
  let refs = [];
  let index = 0;

  const refresh = () => {
    refs = renderHighlighted(preview, text, input.value, index);
    if (!refs.length) index = 0;
    else if (index >= refs.length) index = 0;
    refs = renderHighlighted(preview, text, input.value, index);
    counter.textContent = input.value.trim() ? `${refs.length ? index + 1 : 0} / ${refs.length}` : '0 / 0';
    buttons.forEach((button) => { button.disabled = !refs.length; });
    if (refs.length) refs[index]?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  };

  input.addEventListener('input', () => { index = 0; refresh(); });
  buttons[0].addEventListener('click', () => { if (!refs.length) return; index = (index - 1 + refs.length) % refs.length; refresh(); });
  buttons[1].addEventListener('click', () => { if (!refs.length) return; index = (index + 1) % refs.length; refresh(); });

  try {
    const response = await fetch(`/edi835/api/recon/files/${fileId}/download/`, { headers: authHeaders(), credentials: 'include' });
    if (!response.ok) throw new Error(`Unable to open file (${response.status}).`);
    text = await response.text();
    preview.textContent = text || '(Empty file)';
  } catch (error) {
    preview.textContent = `Error: ${error.message}`;
  }
}

function enhanceArchive(backdrop) {
  const modal = backdrop.querySelector('.result-files-modal');
  const heading = modal?.querySelector('#uploaded-recon-title');
  if (!modal || !heading || backdrop.dataset.reconArchiveEnhanced === '1') return;
  backdrop.dataset.reconArchiveEnhanced = '1';
  backdrop.classList.add('recon-archive-page-shell');
  modal.classList.add('recon-archive-page');
  modal.removeAttribute('role');
  modal.removeAttribute('aria-modal');

  const titleBar = modal.querySelector('.result-detail-title');
  const close = titleBar?.querySelector('button');
  if (close) {
    close.className = 'recon-archive-back';
    close.textContent = '← Back to Reconciliation';
  }

  const tools = document.createElement('div');
  tools.className = 'recon-archive-tools';
  tools.innerHTML = `<div class="recon-archive-client"><label>Client</label><select aria-label="Select client"></select></div><label class="recon-archive-search"><span>Search</span><input type="search" placeholder="Search filename, status, import mode…"></label>`;
  titleBar?.after(tools);
  const clientSelect = tools.querySelector('select');
  if (!window.location.pathname.toLowerCase().includes('administrator')) tools.querySelector('.recon-archive-client')?.remove();
  else {
    loadClients(clientSelect);
    clientSelect.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (clientSelect.value) url.searchParams.set('client', clientSelect.value);
      else url.searchParams.delete('client');
      url.searchParams.set('recon_archive', '1');
      window.location.assign(url.toString());
    });
  }

  const list = modal.querySelector('.result-files-list');
  if (!list) return;
  const sourceRows = [...list.querySelectorAll('.result-file-row')];
  const tableWrap = document.createElement('div');
  tableWrap.className = 'recon-archive-table-wrap';
  const table = document.createElement('table');
  table.className = 'recon-archive-table';
  table.innerHTML = '<thead><tr><th>Filename</th><th>Received</th><th>Status</th><th>Claims</th><th>Size</th><th>Import Mode</th><th>Action</th></tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody');

  sourceRows.forEach((row) => {
    const meta = parseMeta(row);
    const download = row.querySelector('button');
    const tr = document.createElement('tr');
    tr.dataset.search = `${meta.filename} ${meta.date} ${meta.status} ${meta.claims} ${meta.size} ${meta.importMode}`.toLowerCase();
    tr.innerHTML = `<td><strong></strong></td><td></td><td><span class="recon-archive-status"></span></td><td></td><td></td><td></td><td class="recon-archive-actions"></td>`;
    tr.children[0].querySelector('strong').textContent = meta.filename;
    tr.children[1].textContent = meta.date;
    tr.children[2].querySelector('span').textContent = meta.status;
    tr.children[3].textContent = meta.claims.replace(/\s*claims?$/i, '');
    tr.children[4].textContent = meta.size;
    tr.children[5].textContent = meta.importMode;
    const actions = tr.querySelector('.recon-archive-actions');
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'recon-archive-icon';
    eye.title = 'View file';
    eye.setAttribute('aria-label', `View ${meta.filename}`);
    eye.innerHTML = EYE_SVG;
    eye.addEventListener('click', () => openPreview(meta.filename));
    actions.append(eye);
    if (download) {
      download.className = 'recon-archive-icon';
      download.title = 'Download file';
      download.setAttribute('aria-label', `Download ${meta.filename}`);
      download.innerHTML = DOWNLOAD_SVG;
      actions.append(download);
    }
    tbody.append(tr);
  });
  tableWrap.append(table);
  list.replaceWith(tableWrap);

  const search = tools.querySelector('.recon-archive-search input');
  search.addEventListener('input', () => {
    const value = search.value.trim().toLowerCase();
    [...tbody.rows].forEach((row) => { row.hidden = Boolean(value) && !row.dataset.search.includes(value); });
  });
}

export function installReconArchivePage() {
  const refresh = () => document.querySelectorAll('.result-detail-backdrop').forEach(enhanceArchive);
  refresh();
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const params = new URLSearchParams(window.location.search);
  if (params.get('recon_archive') === '1') {
    const reopen = () => {
      const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim() === 'Uploaded RECON files');
      if (!button) return false;
      const url = new URL(window.location.href);
      url.searchParams.delete('recon_archive');
      window.history.replaceState({}, '', url.toString());
      button.click();
      return true;
    };
    if (!reopen()) {
      const timer = window.setInterval(() => { if (reopen()) window.clearInterval(timer); }, 250);
      window.setTimeout(() => window.clearInterval(timer), 8000);
    }
  }
  return () => observer.disconnect();
}
