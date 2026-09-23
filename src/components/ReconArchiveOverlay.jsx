import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ReconArchiveOverlay.css';
import { encodeDemoFileContent } from '../utils/demoEncoder.js';

const EyeIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>;
const DownloadIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>;

function authHeaders() {
  const token = localStorage.getItem('onesmarter_admin_token');
  const headers = {};
  if (token) headers.Authorization = `Token ${token}`;
  const nav = new URLSearchParams(window.location.search).get('nav');
  if (nav) headers['X-Admin-Screen'] = nav;
  return headers;
}

function currentView() {
  return new URLSearchParams(window.location.search).get('view') || '';
}

function isAdministrator() {
  const path = window.location.pathname.toLowerCase();
  return path.includes('administrator') || path.includes('adminstrator');
}

function changeView(view, { replace = false } = {}) {
  const url = new URL(window.location.href);
  if (view) url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({ ...(window.history.state || {}), oneSmarterNav: true }, '', url.toString());
  window.dispatchEvent(new Event('onesmarter:navigation'));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function filenameFromResponse(response, fallback) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const quoted = disposition.match(/filename="([^"]+)"/i);
  if (encoded) return decodeURIComponent(encoded[1]);
  return quoted?.[1] || fallback;
}

async function downloadFile(file) {
  const response = await fetch(`/edi835/api/recon/files/${file.id}/download/`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(`Unable to download file (${response.status}).`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filenameFromResponse(response, file.original_filename || 'recon-file');
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function findOccurrences(text, query) {
  const source = String(text || '');
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return [];
  const lower = source.toLocaleLowerCase();
  const indexes = [];
  let cursor = 0;
  while (cursor <= lower.length - needle.length) {
    const index = lower.indexOf(needle, cursor);
    if (index < 0) break;
    indexes.push(index);
    cursor = index + Math.max(needle.length, 1);
  }
  return indexes;
}

function ReconFilePreview({ file, onBack }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const matchRefs = useRef([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/edi835/api/recon/files/${file.id}/download/?view=1`, {
      credentials: 'include', headers: authHeaders(), signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || `Unable to open file (${response.status}).`);
        return encodeDemoFileContent(String(data.content || ''), 'RECON');
      })
      .then((value) => setText(value || '(Empty file)'))
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message || 'Unable to open file.'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [file.id]);

  const occurrences = useMemo(() => findOccurrences(text, query), [text, query]);

  useEffect(() => {
    setIndex(0);
    matchRefs.current = [];
  }, [query, text]);

  useEffect(() => {
    const term = query.trim();
    if (!term || !occurrences.length) return undefined;
    const next = Math.min(index, occurrences.length - 1);
    if (next !== index) {
      setIndex(next);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      matchRefs.current[next]?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [query, text, index, occurrences.length]);

  const rendered = useMemo(() => {
    const term = query.trim();
    if (!term || !text) return text;
    const lower = text.toLocaleLowerCase();
    const needle = term.toLocaleLowerCase();
    const output = [];
    let cursor = 0;
    let matchIndex = 0;
    while (cursor < text.length) {
      const at = lower.indexOf(needle, cursor);
      if (at < 0) { output.push(text.slice(cursor)); break; }
      if (at > cursor) output.push(text.slice(cursor, at));
      const current = matchIndex++;
      output.push(<mark key={`${at}-${current}`} ref={(node) => { matchRefs.current[current] = node; }} className={current === index ? 'recon-file-search active' : 'recon-file-search'}>{text.slice(at, at + term.length)}</mark>);
      cursor = at + term.length;
    }
    return output;
  }, [text, query, index]);

  const move = (direction) => {
    if (!occurrences.length) return;
    setIndex((current) => (current + direction + occurrences.length) % occurrences.length);
  };

  return <section className="recon-file-preview-page recon-react-preview">
    <header><div><span>RECON FILE VIEWER</span><h2>{file.original_filename}</h2></div><button type="button" className="recon-archive-back" onClick={onBack}>← Back to Uploaded RECON files</button></header>
    <div className="recon-file-preview-toolbar">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file…" aria-label="Search RECON file" />
      <button type="button" className="recon-file-nav" onClick={() => move(-1)} disabled={!occurrences.length} aria-label="Previous match">↑</button>
      <span>{query.trim() ? `${occurrences.length ? index + 1 : 0} / ${occurrences.length}` : '0 / 0'}</span>
      <button type="button" className="recon-file-nav" onClick={() => move(1)} disabled={!occurrences.length} aria-label="Next match">↓</button>
    </div>
    <div className="recon-file-preview-body"><pre>{loading ? 'Loading file…' : error ? `Error: ${error}` : rendered}</pre></div>
  </section>;
}

export default function ReconArchiveOverlay() {
  const [view, setView] = useState(currentView);
  const [files, setFiles] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const admin = isAdministrator();
  const clientId = new URLSearchParams(window.location.search).get('client') || '';
  const open = view === 'recon-archive' || view === 'recon-file';

  useEffect(() => {
    const sync = () => setView(currentView());
    window.addEventListener('popstate', sync);
    window.addEventListener('onesmarter:navigation', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('onesmarter:navigation', sync);
    };
  }, []);

  useEffect(() => {
    if (view === 'recon-file' && !selectedFile) {
      changeView('recon-archive', { replace: true });
    }
  }, [view, selectedFile]);

  useEffect(() => {
    if (!open || !admin || clients.length) return;
    fetch('/admin-panel/api/clients/', { credentials: 'include', headers: authHeaders() })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load clients.')))
      .then((data) => setClients(data.results || data.clients || (Array.isArray(data) ? data : [])))
      .catch(() => {});
  }, [open, admin, clients.length]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (query.trim()) params.set('search', query.trim());
      if (clientId) params.set('client_id', clientId);
      else if (admin) params.set('scope', 'global');
      setLoading(true);
      setError('');
      fetch(`/edi835/api/recon/files/?${params}`, { credentials: 'include', headers: authHeaders() })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load RECON files.');
          return data;
        })
        .then((data) => {
          setFiles(data.files || []);
          setTotal(Number(data.total ?? data.files?.length ?? 0));
          setTotalPages(Number(data.total_pages || 1));
          if (Number(data.page || page) !== page) setPage(Number(data.page || 1));
        })
        .catch((reason) => setError(reason.message))
        .finally(() => setLoading(false));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [open, page, pageSize, query, clientId, admin]);

  useEffect(() => {
    if (!open) setSelectedFile(null);
  }, [open]);

  if (!open) return null;

  if (selectedFile) {
    return createPortal(<ReconFilePreview file={selectedFile} onBack={() => { setSelectedFile(null); changeView('recon-archive', { replace: true }); }} />, document.body);
  }
  if (view === 'recon-file') return null;

  const selectClient = (value) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('client', value);
    else url.searchParams.delete('client');
    url.searchParams.set('view', 'recon-archive');
    window.history.pushState({ ...(window.history.state || {}), oneSmarterNav: true }, '', url.toString());
    window.dispatchEvent(new Event('onesmarter:navigation'));
    setPage(1);
  };

  return createPortal(<section className="recon-archive-react-page">
    <header className="recon-react-header">
      <div><span className="eyebrow">RECON ARCHIVE</span><h2>Uploaded RECON files</h2></div>
      {admin && <label className="recon-archive-header-client"><span>Client</span><select value={clientId} onChange={(event) => selectClient(event.target.value)}><option value="">-- None (Global System Default) --</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.client_code ? ` (${client.client_code})` : ''}</option>)}</select></label>}
      <button type="button" className="recon-archive-back" onClick={() => window.history.back()}>← Back to Reconciliation</button>
    </header>
    <div className="recon-archive-tools"><label className="recon-archive-search"><span>Search</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search filename, date, status, claims, size, import mode…" /></label></div>
    {error && <div className="recon-react-message error">{error}</div>}
    <div className="recon-archive-table-wrap">
      <table className="recon-archive-table"><thead><tr><th>Date / Time</th><th>Filename</th><th>Status</th><th>Claims</th><th>Bytes</th><th>Import Mode</th><th>Action</th></tr></thead><tbody>
        {loading ? <tr><td colSpan="7" className="recon-react-empty">Loading RECON files…</td></tr> : files.length ? files.map((file) => <tr key={file.id}>
          <td>{formatDate(file.uploaded_at || file.processed_at)}</td><td><strong>{file.original_filename}</strong></td><td><span className="recon-archive-status">{file.status || '—'}</span></td><td className="num">{Number(file.claim_count || 0).toLocaleString()}</td><td className="num">{Number(file.file_size || 0).toLocaleString()}</td><td>{file.import_mode || 'MANUAL'}</td><td><div className="recon-archive-actions"><button type="button" className="recon-archive-icon" title="View file" onClick={() => { setSelectedFile(file); changeView('recon-file'); }}><EyeIcon /></button><button type="button" className="recon-archive-icon" title="Download file" onClick={() => downloadFile(file).catch((reason) => setError(reason.message))}><DownloadIcon /></button></div></td>
        </tr>) : <tr><td colSpan="7" className="recon-react-empty">No RECON files match this view.</td></tr>}
      </tbody></table>
      <div className="recon-archive-pagination"><label>Rows per page: <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 results'}</span><div><button type="button" className="recon-archive-page-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span className="recon-archive-page-status">Page {page} of {totalPages}</span><button type="button" className="recon-archive-page-button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button></div></div>
    </div>
  </section>, document.body);
}
