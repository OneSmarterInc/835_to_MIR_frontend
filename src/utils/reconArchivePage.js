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

function isAdministrator() {
  const path = window.location.pathname.toLowerCase();
  return path.includes('administrator') || path.includes('adminstrator');
}

function formatEastern(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZoneName: 'short',
  }).format(date);
  return text.replace(/\bEDT\b/g, 'EST');
}

async function loadClients(select) {
  if (!select || select.dataset.loaded === '1') return;
  select.dataset.loaded = '1';
  try {
    const response = await fetch('/admin-panel/api/clients/', {
      headers: authHeaders(), credentials: 'include',
    });
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
    select.closest('.recon-archive-header-client')?.remove();
  }
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

async function openPreview(fileId, filename) {
  const existing = document.querySelector('.recon-file-preview-page');
  existing?.remove();

  const page = document.createElement('section');
  page.className = 'recon-file-preview-page';
  page.innerHTML = `<header><div><span>RECON FILE VIEWER</span><h2></h2></div><button type="button" class="recon-archive-back">← Back to Uploaded RECON files</button></header><div class="recon-file-preview-toolbar"><input type="search" placeholder="Search file…" aria-label="Search RECON file"><button type="button" class="recon-file-nav" aria-label="Previous match">↑</button><span>0 / 0</span><button type="button" class="recon-file-nav" aria-label="Next match">↓</button></div><div class="recon-file-preview-body"><pre>Loading file…</pre></div>`;
  page.querySelector('h2').textContent = filename || 'RECON file';
  document.body.append(page);

  page.querySelector('.recon-archive-back').addEventListener('click', () => page.remove());
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
    refs[index]?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  };

  input.addEventListener('input', () => { index = 0; refresh(); });
  buttons[0].addEventListener('click', () => { if (!refs.length) return; index = (index - 1 + refs.length) % refs.length; refresh(); });
  buttons[1].addEventListener('click', () => { if (!refs.length) return; index = (index + 1) % refs.length; refresh(); });

  try {
    const response = await fetch(`/edi835/api/recon/files/${encodeURIComponent(fileId)}/download/`, {
      headers: authHeaders(), credentials: 'include',
    });
    if (!response.ok) throw new Error(`Unable to open file (${response.status}).`);
    text = await response.text();
    preview.textContent = text || '(Empty file)';
  } catch (error) {
    preview.textContent = `Error: ${error.message}`;
  }
}

async function downloadFile(file) {
  const response = await fetch(`/edi835/api/recon/files/${encodeURIComponent(file.id)}/download/`, {
    headers: authHeaders(), credentials: 'include',
  });
  if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.original_filename || 'recon-file';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ensureArchiveShell(backdrop, modal) {
  if (backdrop.dataset.reconArchiveShellEnhanced === '1') return;
  backdrop.dataset.reconArchiveShellEnhanced = '1';
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

  if (isAdministrator() && titleBar && close && !titleBar.querySelector('.recon-archive-header-client')) {
    const clientBox = document.createElement('div');
    clientBox.className = 'recon-archive-header-client';
    clientBox.innerHTML = '<label>Client</label><select aria-label="Select client"></select>';
    titleBar.insertBefore(clientBox, close);
    const clientSelect = clientBox.querySelector('select');
    loadClients(clientSelect);
    clientSelect.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (clientSelect.value) url.searchParams.set('client', clientSelect.value);
      else url.searchParams.delete('client');
      url.searchParams.set('recon_archive', '1');
      window.location.assign(url.toString());
    });
  }
}

function createArchiveUi(modal) {
  let tools = modal.querySelector('.recon-archive-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'recon-archive-tools';
    tools.innerHTML = `<label class="recon-archive-search"><span>Search</span><input type="search" placeholder="Search filename, status, or import mode…" aria-label="Search uploaded RECON files"></label>`;
    modal.querySelector('.result-detail-title')?.after(tools);
  }

  let wrap = modal.querySelector('.recon-archive-table-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'recon-archive-table-wrap';
    wrap.innerHTML = `<table class="recon-archive-table"><thead><tr><th>Date / Time</th><th>Filename</th><th>Status</th><th>Claims</th><th>Bytes</th><th>Import Mode</th><th>Action</th></tr></thead><tbody></tbody></table><div class="recon-archive-pagination"><label>Rows per page: <select aria-label="Rows per page"><option value="10">10</option><option value="25" selected>25</option><option value="50">50</option><option value="100">100</option></select></label><div><button type="button" class="recon-archive-page-button" data-direction="previous">Previous</button><span class="recon-archive-page-status">Page 1 of 1</span><button type="button" class="recon-archive-page-button" data-direction="next">Next</button></div></div>`;
    modal.append(wrap);
  }

  modal.querySelectorAll('.result-files-list,.result-empty').forEach((node) => { node.style.display = 'none'; });
  return { tools, wrap };
}

function enhanceArchive(backdrop) {
  const modal = backdrop.querySelector('.result-files-modal');
  const heading = modal?.querySelector('#uploaded-recon-title');
  if (!modal || !heading) return;

  ensureArchiveShell(backdrop, modal);
  const { tools, wrap } = createArchiveUi(modal);
  if (wrap.dataset.bound === '1') return;
  wrap.dataset.bound = '1';

  const tbody = wrap.querySelector('tbody');
  const search = tools.querySelector('input');
  const pageSize = wrap.querySelector('select');
  const previous = wrap.querySelector('[data-direction="previous"]');
  const next = wrap.querySelector('[data-direction="next"]');
  const status = wrap.querySelector('.recon-archive-page-status');
  let page = 1;
  let searchTimer = null;
  let controller = null;

  const load = async () => {
    controller?.abort();
    controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(Number(pageSize.value) || 25),
    });
    const clientId = currentClientId();
    if (clientId) params.set('client_id', clientId);
    else if (isAdministrator()) params.set('scope', 'global');
    if (search.value.trim()) params.set('search', search.value.trim());

    tbody.innerHTML = '<tr><td colspan="7">Loading uploaded RECON files…</td></tr>';
    try {
      const response = await fetch(`/edi835/api/recon/files/?${params}`, {
        headers: authHeaders(), credentials: 'include', signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || `Unable to load RECON files (${response.status}).`);

      page = Number(data.page || 1);
      tbody.textContent = '';
      (data.files || []).forEach((file) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td></td><td><strong></strong></td><td><span class="recon-archive-status"></span></td><td class="num"></td><td class="num"></td><td></td><td class="recon-archive-actions"></td>';
        tr.children[0].textContent = formatEastern(file.uploaded_at);
        tr.children[1].querySelector('strong').textContent = file.original_filename || 'RECON file';
        tr.children[2].querySelector('span').textContent = file.status || '—';
        tr.children[3].textContent = Number(file.claim_count || 0).toLocaleString();
        tr.children[4].textContent = Number(file.file_size || 0).toLocaleString();
        tr.children[5].textContent = String(file.import_mode || 'MANUAL').toUpperCase();
        const actions = tr.querySelector('.recon-archive-actions');

        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'recon-archive-icon';
        eye.title = 'View file';
        eye.setAttribute('aria-label', `View ${file.original_filename || 'RECON file'}`);
        eye.innerHTML = EYE_SVG;
        eye.addEventListener('click', () => openPreview(file.id, file.original_filename));
        actions.append(eye);

        const download = document.createElement('button');
        download.type = 'button';
        download.className = 'recon-archive-icon';
        download.title = 'Download file';
        download.setAttribute('aria-label', `Download ${file.original_filename || 'RECON file'}`);
        download.innerHTML = DOWNLOAD_SVG;
        download.addEventListener('click', async () => {
          download.disabled = true;
          try { await downloadFile(file); }
          catch (error) { console.error(error); }
          finally { download.disabled = false; }
        });
        actions.append(download);
        tbody.append(tr);
      });

      if (!(data.files || []).length) {
        tbody.innerHTML = '<tr><td colspan="7">No RECON files match this search.</td></tr>';
      }
      const pages = Number(data.total_pages || 1);
      status.textContent = `Page ${page} of ${pages} · ${Number(data.total || 0).toLocaleString()} files`;
      previous.disabled = page <= 1;
      next.disabled = page >= pages;
    } catch (error) {
      if (error.name === 'AbortError') return;
      tbody.innerHTML = `<tr><td colspan="7"></td></tr>`;
      tbody.querySelector('td').textContent = error.message || 'Unable to load RECON files.';
    }
  };

  search.addEventListener('input', () => {
    page = 1;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(load, 250);
  });
  pageSize.addEventListener('change', () => { page = 1; load(); });
  previous.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
  next.addEventListener('click', () => { page += 1; load(); });
  load();
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
