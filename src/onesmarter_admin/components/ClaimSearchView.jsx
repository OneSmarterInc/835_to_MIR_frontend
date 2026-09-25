import React, { useEffect, useMemo, useState } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import Uploaded837FilesView from './Uploaded837FilesView';
import ClaimSourceViewer from './ClaimSourceViewer';
import EyeIcon from '../../components/EyeIcon';
import { fetch837Files, process837Upload } from '../services/api';
import { searchUniversalClaims } from '../services/claimSearchApi';
import { portalFetch, withCsrf } from '../../utils/api';
import { formatEasternDate, formatEasternTime } from '../../utils/timezone';
import './ClaimSearchView.css';
import './ClaimSourceActions.css';
import './UniversalClaimOccurrenceTable.css';

const DEFAULT_837_FILENAME_FORMAT = 'YYYYMMDDhhmmss.837';
const CLAIM_PAGE_SIZE = 25;
const namingStorageKey = clientId => `onesmarter_837_filename_format_${clientId || 'default'}`;

const resolve837FilenameFormat = (value, now = new Date()) => {
  const pad = number => String(number).padStart(2, '0');
  const replacements = [
    ['YYYY', String(now.getFullYear())],
    ['MM', pad(now.getMonth() + 1)],
    ['DD', pad(now.getDate())],
    ['hh', pad(now.getHours())],
    ['mm', pad(now.getMinutes())],
    ['ss', pad(now.getSeconds())],
  ];
  let resolved = String(value || DEFAULT_837_FILENAME_FORMAT);
  replacements.forEach(([token, replacement]) => { resolved = resolved.split(token).join(replacement); });
  return resolved;
};

const sanitize837Filename = value => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const safe = trimmed.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe.toLowerCase().endsWith('.837') ? safe : `${safe}.837`;
};

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 17v3h14v-3" /></svg>;
}

function filenameFromResponse(response, fallbackName) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const quoted = disposition.match(/filename="([^"]+)"/i);
  return encoded ? decodeURIComponent(encoded[1]) : quoted?.[1] || fallbackName;
}

async function downloadResponse(response, fallbackName) {
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filenameFromResponse(response, fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function claimSliceUrl(source, claimNumber, internalNumber) {
  const base = source.claim_slice_url || String(source.download_url || '').replace(/\/download\/?(?:\?.*)?$/i, '/claim-slice/');
  const params = new URLSearchParams({ claim_number: claimNumber });
  if (internalNumber) params.set('internal_claim_number', internalNumber);
  return `${base}?${params.toString()}`;
}

function OccurrenceDateTime({ value }) {
  if (!value) return <span className="universal-source-empty">—</span>;
  return <div className="occurrence-datetime">
    <strong>{formatEasternDate(value)}</strong>
    <span>{formatEasternTime(value, true)} <span className="est-label">EST</span></span>
  </div>;
}

function Rename837Modal({ initialFilename, renaming, onClose, onConfirm }) {
  const [filename, setFilename] = useState(initialFilename);
  const safeFilename = useMemo(() => sanitize837Filename(filename), [filename]);
  const preview = useMemo(() => resolve837FilenameFormat(safeFilename || DEFAULT_837_FILENAME_FORMAT), [safeFilename]);
  return <div className="claim837-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !renaming && onClose()}>
    <div className="claim837-rename-modal" role="dialog" aria-modal="true" aria-label="Rename SFTP 837 files">
      <header><div><div className="eyebrow">837 FILE NAMING</div><h2>Rename SFTP 837 Files</h2></div><button type="button" className="claim837-close" disabled={renaming} onClick={onClose} aria-label="Close">&times;</button></header>
      <div className="claim837-rename-body">
        <p className="claim837-rename-description">Use <b>YYYYMMDDhhmmss</b> as the timestamp format. You can add static text before or after it, for example <b>Highmark_YYYYMMDDhhmmss_ACK.837</b>. The timestamp is filled when the file is pushed to SFTP. If multiple inbound 837 files are found, numbered suffixes such as <b>_001</b> and <b>_002</b> are added. Sliced claim pushes use the same format and automatically add <b>_claim-number</b>.</p>
        <label htmlFor="claim837-filename">837 filename format</label>
        <input id="claim837-filename" type="text" value={filename} disabled={renaming} onChange={event => setFilename(event.target.value)} autoFocus />
        <small>Default: {DEFAULT_837_FILENAME_FORMAT} · Current preview: {preview}</small>
        {filename && safeFilename !== filename.trim() && <div className="claim837-filename-preview">Saved format: <b>{safeFilename}</b></div>}
      </div>
      <footer><button type="button" className="btn" disabled={renaming} onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={renaming || !safeFilename} onClick={() => onConfirm(safeFilename)}>{renaming ? 'Renaming 837…' : 'Apply Filename'}</button></footer>
    </div>
  </div>;
}

function SourceDownloadDialog({ source, claimNumber, internalNumber, onClose }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const download = async mode => {
    setBusy(mode); setError('');
    try {
      const url = mode === 'full'
        ? source.download_url
        : claimSliceUrl(source, claimNumber, internalNumber || source.internal_claim_number || '');
      const response = await portalFetch(url);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Unable to download the ${mode === 'full' ? 'full file' : 'sliced claim file'}.`);
      }
      await downloadResponse(response, mode === 'full' ? source.filename : `claim_${claimNumber}.txt`);
      onClose();
    } catch (reason) {
      setError(reason.message || 'Download failed.');
    } finally { setBusy(''); }
  };

  return <div className="claim-source-download-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <section className="claim-source-download-dialog" role="dialog" aria-modal="true" aria-labelledby="claim-source-download-title">
      <header><div><span>SOURCE FILE DOWNLOAD</span><h3 id="claim-source-download-title">{String(source.type || '').toUpperCase()} file options</h3></div><button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="Close">×</button></header>
      <div className="claim-source-download-body"><p><strong>{source.filename}</strong></p><small>Highmark claim {claimNumber}</small>{error && <div className="claim837-message error">{error}</div>}</div>
      <footer>
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => download('full')}>{busy === 'full' ? 'Downloading…' : 'Download full file'}</button>
        <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => download('slice')}>{busy === 'slice' ? 'Preparing…' : 'Download sliced claim file'}</button>
      </footer>
    </section>
  </div>;
}

function SourceActions({ type, source, claimNumber, internalNumber, onView, onDownload }) {
  if (!source?.exists || !source?.download_url) return <span className="universal-source-empty">—</span>;
  const label = String(type || '').toUpperCase();
  const resolvedInternal = label === '837' ? '' : (source.internal_claim_number || internalNumber || '');
  return <div className="universal-source-actions" title={source.file_name || `${label} source file`}>
    <button type="button" className="universal-source-action" onClick={() => onView({
      type: label,
      filename: source.file_name,
      download_url: source.download_url,
      claim_slice_url: source.claim_slice_url,
      internal_claim_number: resolvedInternal,
      date: source.arrived_at,
      status: source.status || '',
    })} aria-label={`View ${label} source file`} title={`View ${label} file`}><EyeIcon /></button>
    <button type="button" className="universal-source-action" onClick={() => onDownload({
      type: label,
      filename: source.file_name,
      download_url: source.download_url,
      claim_slice_url: source.claim_slice_url,
      internal_claim_number: resolvedInternal,
    })} aria-label={`Download ${label} source file`} title={`Download ${label} file`}><DownloadIcon /></button>
  </div>;
}

export default function ClaimSearchView({ clients, activeClientId, onSelectClient }) {
  const [query, setQuery] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploads, setUploads] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [active837Filename, setActive837Filename] = useState(DEFAULT_837_FILENAME_FORMAT);
  const [notice, setNotice] = useState('');
  const [claimPage, setClaimPage] = useState(1);
  const [claimRefresh, setClaimRefresh] = useState(0);
  const [claimMeta, setClaimMeta] = useState({ count: 0, pages: 0, has_previous: false, has_next: false });
  const [viewer, setViewer] = useState(null);
  const [downloadTarget, setDownloadTarget] = useState(null);
  const [show837Files, setShow837Files] = useState(() => new URLSearchParams(window.location.search).get('search_view') === '837-files');

  useEffect(() => {
    setQuery(''); setSearchField('all'); setRows([]); setError(''); setNotice(''); setClaimPage(1);
    setClaimMeta({ count: 0, pages: 0, has_previous: false, has_next: false });
    setViewer(null); setDownloadTarget(null);
    const savedFormat = activeClientId ? localStorage.getItem(namingStorageKey(activeClientId)) : '';
    setActive837Filename(savedFormat || DEFAULT_837_FILENAME_FORMAT);
  }, [activeClientId]);

  useEffect(() => {
    if (!activeClientId) return undefined;
    let current = true;
    fetch837Files(activeClientId, '', 1, 10).then(data => {
      if (!current) return;
      const serverFormat = String(data.filename_format || '').trim();
      if (serverFormat) {
        setActive837Filename(serverFormat);
        localStorage.setItem(namingStorageKey(activeClientId), serverFormat);
      }
    }).catch(() => {});
    return () => { current = false; };
  }, [activeClientId]);

  useEffect(() => {
    const sync = () => setShow837Files(new URLSearchParams(window.location.search).get('search_view') === '837-files');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    if (!activeClientId) {
      setRows([]); setClaimMeta({ count: 0, pages: 0, has_previous: false, has_next: false }); setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const data = await searchUniversalClaims(activeClientId, query.trim(), searchField, claimPage, CLAIM_PAGE_SIZE, controller.signal);
        if (!controller.signal.aborted) {
          setRows(data.results || []);
          setClaimMeta({ count: Number(data.count || 0), pages: Number(data.pages || 0), has_previous: Boolean(data.has_previous), has_next: Boolean(data.has_next) });
          if (Number(data.page || claimPage) !== claimPage) setClaimPage(Number(data.page || 1));
        }
      } catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setError(err.message); setRows([]); setClaimMeta({ count: 0, pages: 0, has_previous: false, has_next: false });
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query.trim() ? 350 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [activeClientId, query, searchField, claimPage, claimRefresh]);

  const processUpload = async () => {
    if (!activeClientId || !uploads.length) return;
    setProcessing(true); setError(''); setNotice('');
    try {
      const data = await process837Upload(activeClientId, uploads);
      const claims = (data.files || []).reduce((sum, file) => sum + Number(file.claim_count || 0), 0);
      const failure = data.failed_count ? ` ${data.failed_count} file(s) failed.` : '';
      setNotice(`${data.processed_count} file(s) processed, ${data.duplicate_count} already present, ${claims} claims indexed.${failure}`);
      setUploads([]); setClaimPage(1); setClaimRefresh(value => value + 1);
      const input = document.getElementById('search-837-upload');
      if (input) input.value = '';
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  const renameSftp837Files = async filename => {
    if (!activeClientId || renaming) return;
    setRenaming(true); setError(''); setNotice('');
    try {
      // 2026-09-25 - Yash: Task 6b - Wrap raw POST fetch with withCsrf
      const headers = { 'Content-Type': 'application/json', 'X-Admin-Screen': 'search' };
      const res = await fetch('/edi835/api/837/sftp-rename/', withCsrf({ method: 'POST', credentials: 'include', headers, body: JSON.stringify({ client_id: activeClientId, filename_format: filename }) }));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Unable to rename the 837 files on SFTP.');
      const savedFormat = String(data.filename_format || filename || DEFAULT_837_FILENAME_FORMAT).trim();
      setActive837Filename(savedFormat); localStorage.setItem(namingStorageKey(activeClientId), savedFormat); setRenameOpen(false);
      setNotice(data.message || `${data.renamed_count || data.transferred_count || 0} 837 file(s) renamed on SFTP.`);
    } catch (err) { setError(err.message); }
    finally { setRenaming(false); }
  };

  const open837Files = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('search_view', '837-files');
    window.history.pushState({ ...(window.history.state || {}), oneSmarterNav: true }, '', url.toString());
    setShow837Files(true);
  };
  const close837Files = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('search_view') === '837-files') { window.history.back(); return; }
    setShow837Files(false);
  };

  if (show837Files) return <Uploaded837FilesView clients={clients} activeClientId={activeClientId} onSelectClient={onSelectClient} onBack={close837Files} />;

  const pageStart = claimMeta.count ? ((claimPage - 1) * CLAIM_PAGE_SIZE) + 1 : 0;
  const pageEnd = claimMeta.count ? Math.min(claimPage * CLAIM_PAGE_SIZE, claimMeta.count) : 0;
  const sourceTypes = ['837', '835', 'mir', 'recon'];

  return <section className="view on claim-search-view">
    <div className="claim-search-heading-row">
      <div className="claim-search-heading-copy"><div className="claim-search-eyebrow">Claims workspace</div><h1>Universal Claim Search</h1><p>Locate and review claim records across 837, 835, MIR, and RECON files for the selected client.</p></div>
      <div className="claim-search-client"><label>Client</label><ClientSelectDropdown clients={clients} value={activeClientId} onChange={onSelectClient} fullWidth /></div>
    </div>
    <div className="claim-search-upload"><div><label>837 files</label><input id="search-837-upload" type="file" multiple onChange={event => setUploads(Array.from(event.target.files || []))} />{uploads.length > 0 && <small>{uploads.length} file(s) selected</small>}</div><button type="button" className="btn primary" disabled={!activeClientId || !uploads.length || processing} onClick={processUpload}>{processing ? 'Processing 837…' : 'Upload & Process'}</button></div>
    {notice && <div className="claim837-message success">{notice}</div>}{error && <div className="claim837-message error">{error}</div>}
    <div className="claim-search-actions">
      <button type="button" className="btn secondary claim-search-rename" disabled={!activeClientId || renaming} onClick={() => setRenameOpen(true)}>{renaming ? 'Renaming 837…' : 'Rename SFTP 837 Files'}</button>
      <div className="claim-search-input"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={query} onChange={event => { setQuery(event.target.value); setClaimPage(1); }} disabled={!activeClientId} placeholder="Search Highmark claim, internal claim, or source file" autoComplete="off" />{loading && <span>Searching…</span>}</div>
      <label className="claim-search-field"><span>Search in</span><select value={searchField} disabled={!activeClientId} onChange={event => { setSearchField(event.target.value); setClaimPage(1); }}><option value="all">All columns</option><option value="highmark">Highmark claim number</option><option value="internal">Internal claim number</option><option value="patient">Patient</option><option value="837">837 filename</option><option value="835">835 filename</option><option value="mir">MIR filename</option><option value="recon">RECON filename</option></select></label>
      <button type="button" className="btn" disabled={!activeClientId} onClick={open837Files} style={{ background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff', fontWeight: 700 }}>837 Uploaded Files</button>
      <div className="claim-search-match-count">{loading ? 'Loading claims' : `${claimMeta.count.toLocaleString()} ${query.trim() ? 'matches' : 'claims'}`}</div>
    </div>
    <div className="claim-search-results"><div className="claim837-table-wrap"><table className="universal-claim-table occurrence-table"><thead>
      <tr><th rowSpan="2" className="identity-header highmark">Highmark claim number</th><th rowSpan="2" className="identity-header internal">Internal claim number</th>{sourceTypes.map(type => <th key={type} colSpan="2" className="source-group-header">{type.toUpperCase()}</th>)}</tr>
      <tr className="source-subheader">{sourceTypes.map(type => <React.Fragment key={type}><th className="source-subheader-date">Date / Time</th><th className="source-subheader-actions">Actions</th></React.Fragment>)}</tr>
    </thead><tbody>
      {!rows.length ? <tr><td colSpan="10" className="empty">{loading ? 'Loading claims…' : query.trim() ? 'No matching claims found in 837, 835, MIR, or RECON.' : 'No claims found for the selected client.'}</td></tr> : rows.map(row => <tr key={row.id} className="universal-claim-row"><td><strong className="universal-claim-number">{row.highmark_claim_number || '—'}</strong></td><td>{row.internal_claim_number || '—'}</td>{sourceTypes.map(type => { const source = row.lifecycle?.[type] || {}; const internalNumber = type === '837' ? '' : row.internal_claim_number; return <React.Fragment key={type}><td className="universal-source-date-cell"><OccurrenceDateTime value={source.exists ? source.arrived_at : null} /></td><td className="universal-source-cell"><SourceActions type={type} source={source} claimNumber={row.highmark_claim_number} internalNumber={internalNumber} onView={selected => setViewer({ claimNumber: row.highmark_claim_number, source: selected })} onDownload={selected => setDownloadTarget({ claimNumber: row.highmark_claim_number, internalNumber, source: selected })} /></td></React.Fragment>; })}</tr>)}
    </tbody></table></div></div>
    <div className="universal-pagination">
      <div className="universal-pagination-summary">{claimMeta.count ? <><strong>{pageStart.toLocaleString()}–{pageEnd.toLocaleString()}</strong><span>of {claimMeta.count.toLocaleString()} claims</span></> : <strong>0 claims</strong>}<span className="universal-pagination-page">Page {claimMeta.pages ? claimPage : 0} of {claimMeta.pages}</span></div>
      <div className="universal-pagination-actions"><button type="button" className="btn" disabled={!claimMeta.has_previous || loading} onClick={() => setClaimPage(page => Math.max(1, page - 1))}>Previous</button><button type="button" className="btn" disabled={!claimMeta.has_next || loading} onClick={() => setClaimPage(page => page + 1)}>Next</button></div>
    </div>
    {viewer && <ClaimSourceViewer claimNumber={viewer.claimNumber} sources={[viewer.source]} onClose={() => setViewer(null)} />}
    {downloadTarget && <SourceDownloadDialog source={downloadTarget.source} claimNumber={downloadTarget.claimNumber} internalNumber={downloadTarget.internalNumber} onClose={() => setDownloadTarget(null)} />}
    {renameOpen && <Rename837Modal initialFilename={active837Filename} renaming={renaming} onClose={() => !renaming && setRenameOpen(false)} onConfirm={renameSftp837Files} />}
  </section>;
}
