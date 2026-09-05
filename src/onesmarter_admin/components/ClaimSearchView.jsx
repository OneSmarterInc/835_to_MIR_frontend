import React, { useEffect, useMemo, useState } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import { fetch837ClaimDetail, fetch837Files, process837Upload, push837ClaimToSftp, search837Claims } from '../services/api';
import './ClaimSearchView.css';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const dateTime = value => value ? new Date(value).toLocaleString() : '—';
const DEFAULT_837_FILENAME_FORMAT = 'YYYYMMDDhhmmss.837';
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

async function downloadClaimWithFilename(claimId, filename) {
  const token = localStorage.getItem('onesmarter_admin_token');
  const headers = {};
  if (token) headers.Authorization = `Token ${token}`;
  headers['X-Admin-Screen'] = 'search';
  const params = new URLSearchParams({ filename });
  const res = await fetch(`/edi835/api/837/claims/${encodeURIComponent(claimId)}/export/?${params}`, {
    credentials: 'include', headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Unable to export this 837 claim.');
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = res.headers.get('X-OneSmarter-Filename') || filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function Claim837Modal({ claimId, namingFormat, onClose }) {
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [notice, setNotice] = useState('');
  const resolvedPreview = useMemo(() => resolve837FilenameFormat(namingFormat), [namingFormat]);
  useEffect(() => {
    let current = true;
    fetch837ClaimDetail(claimId).then(data => current && setClaim(data)).catch(err => current && setError(err.message));
    return () => { current = false; };
  }, [claimId]);
  const exportClaim = async () => {
    setExporting(true); setError('');
    try { await downloadClaimWithFilename(claimId, resolvedPreview); }
    catch (err) { setError(err.message); }
    finally { setExporting(false); }
  };
  const pushClaim = async () => {
    setPushing(true); setError(''); setNotice('');
    try { const data = await push837ClaimToSftp(claimId, namingFormat); setNotice(data.message); }
    catch (err) { setError(err.message); }
    finally { setPushing(false); }
  };
  return <div className="claim837-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="claim837-modal" role="dialog" aria-modal="true" aria-label="837 claim summary">
      <header><div><div className="eyebrow">837 CLAIM SUMMARY</div><h2>{claim ? [claim.highmark_claim_number, claim.internal_claim_number].filter(Boolean).join(' · ') || 'Claim details' : 'Loading claim…'}</h2></div><button type="button" className="claim837-close" onClick={onClose} aria-label="Close">&times;</button></header>
      {error && <div className="claim837-message error">{error}</div>}
      {notice && <div className="claim837-message success">{notice}</div>}
      {!claim && !error ? <div className="claim837-loading">Loading claim details…</div> : claim && <>
        <div className="claim837-summary">
          <div><span>Highmark claim number</span><b>{claim.highmark_claim_number || '—'}</b></div>
          <div><span>Internal claim number</span><b>{claim.internal_claim_number || '—'}</b></div>
          <div><span>Patient</span><b>{claim.patient_name || '—'}</b><small>{claim.member_id || 'No member ID'}</small></div>
          <div><span>Total charge</span><b>{money(claim.total_charge_amount)}</b><small>{claim.service_count} service line(s)</small></div>
        </div>
        <div className="claim837-lifecycle">
          {['835', 'mir', 'recon'].map(type => { const item = claim.lifecycle?.[type] || {}; return <div key={type} className={item.exists ? 'present' : 'absent'}><span className="claim837-presence-icon" aria-hidden="true">{item.exists ? '✓' : '—'}</span><div><span>{type.toUpperCase()}</span><b>{item.exists ? `Found in ${type.toUpperCase()}` : `Not found in ${type.toUpperCase()}`}</b><small>{item.exists ? `${item.file_name || 'File recorded'} · arrived ${dateTime(item.arrived_at)}${type === '835' && item.source ? ` · ${item.source}` : ''}` : type === '835' ? 'No linked source 835 record' : 'No matching claim record'}</small></div></div>; })}
        </div>
        <div className="claim837-facts">
          <div><span>Patient control number</span><b>{claim.patient_control_number || '—'}</b></div>
          <div><span>Subscriber</span><b>{claim.subscriber_name || '—'}</b></div>
          <div><span>Billing provider</span><b>{claim.billing_provider || '—'}</b></div>
          <div><span>Rendering provider</span><b>{claim.rendering_provider || '—'}</b></div>
          <div><span>Referring provider</span><b>{claim.referring_provider || '—'}</b></div>
          <div><span>Payer</span><b>{claim.payer || '—'}</b></div>
          <div><span>Diagnosis</span><b>{claim.diagnosis_codes?.join(', ') || '—'}</b></div>
          <div><span>Place of service</span><b>{claim.place_of_service || '—'}</b></div>
          <div><span>Claim frequency</span><b>{claim.claim_frequency_code || '—'}</b></div>
          <div><span>Original claim number</span><b>{claim.original_claim_number || '—'}</b></div>
          <div><span>Source file</span><b>{claim.file_name || '—'}</b></div>
          <div><span>Naming format</span><b>{namingFormat}</b><small>Slice push adds _{claim.claim_number} before .837</small></div>
        </div>
        <h3>837 service lines</h3>
        <div className="claim837-table-wrap"><table><thead><tr><th>#</th><th>Procedure</th><th>Modifiers</th><th>Service date</th><th>Units</th><th>Charge</th><th>Diagnosis pointers</th></tr></thead><tbody>
          {claim.services.length ? claim.services.map(line => <tr key={line.sequence}><td>{line.sequence}</td><td>{line.procedure_code || line.revenue_code || '—'}</td><td>{line.modifiers?.join(', ') || '—'}</td><td>{line.service_from_date || '—'}{line.service_to_date && line.service_to_date !== line.service_from_date ? ` – ${line.service_to_date}` : ''}</td><td>{line.units}</td><td>{money(line.charge_amount)}</td><td>{line.diagnosis_pointers?.join(', ') || '—'}</td></tr>) : <tr><td colSpan="7" className="empty">No service lines were found.</td></tr>}
        </tbody></table></div>
        <footer><button type="button" className="btn" onClick={onClose}>Close</button><div className="claim837-footer-actions"><button type="button" className="btn" disabled={exporting || pushing} onClick={exportClaim}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 17v3h14v-3"/></svg>{exporting ? 'Downloading…' : 'Download'}</button><button type="button" className="btn primary" disabled={pushing || exporting} onClick={pushClaim}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-5 5m5-5 5 5M5 17v3h14v-3"/></svg>{pushing ? 'Pushing…' : 'Push to SFTP'}</button></div></footer>
      </>}
    </div>
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

export default function ClaimSearchView({ clients, activeClientId, onSelectClient }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploads, setUploads] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [active837Filename, setActive837Filename] = useState(DEFAULT_837_FILENAME_FORMAT);
  const [notice, setNotice] = useState('');
  const [claimId, setClaimId] = useState(null);
  const [fileQuery, setFileQuery] = useState('');
  const [filePage, setFilePage] = useState(1);
  const [fileData, setFileData] = useState({ results: [], count: 0, pages: 0, has_previous: false, has_next: false });
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [fileRefresh, setFileRefresh] = useState(0);

  useEffect(() => {
    setQuery(''); setRows([]); setError(''); setNotice(''); setFileQuery(''); setFilePage(1);
    const savedFormat = activeClientId ? localStorage.getItem(namingStorageKey(activeClientId)) : '';
    setActive837Filename(savedFormat || DEFAULT_837_FILENAME_FORMAT);
  }, [activeClientId]);
  useEffect(() => {
    if (!activeClientId || !query.trim()) { setRows([]); setLoading(false); return undefined; }
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try { const data = await search837Claims(activeClientId, query.trim()); setRows(data.results || []); }
      catch (err) { setError(err.message); setRows([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [activeClientId, query]);
  useEffect(() => {
    if (!activeClientId) { setFileData({ results: [], count: 0, pages: 0, has_previous: false, has_next: false }); return undefined; }
    const timer = setTimeout(async () => {
      setFileLoading(true); setFileError('');
      try {
        const data = await fetch837Files(activeClientId, fileQuery.trim(), filePage, 20);
        setFileData(data);
        const serverFormat = String(data.filename_format || '').trim();
        if (serverFormat) {
          setActive837Filename(serverFormat);
          localStorage.setItem(namingStorageKey(activeClientId), serverFormat);
        }
      }
      catch (err) { setFileError(err.message); }
      finally { setFileLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [activeClientId, fileQuery, filePage, fileRefresh]);

  const processUpload = async () => {
    if (!activeClientId || !uploads.length) return;
    setProcessing(true); setError(''); setNotice('');
    try {
      const data = await process837Upload(activeClientId, uploads);
      const claims = (data.files || []).reduce((sum, file) => sum + Number(file.claim_count || 0), 0);
      const failure = data.failed_count ? ` ${data.failed_count} file(s) failed.` : '';
      setNotice(`${data.processed_count} file(s) processed, ${data.duplicate_count} already present, ${claims} claims indexed.${failure}`);
      setFilePage(1); setFileRefresh(value => value + 1);
      setUploads([]); document.getElementById('search-837-upload').value = '';
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  const renameSftp837Files = async filename => {
    if (!activeClientId || renaming) return;
    setRenaming(true); setError(''); setNotice('');
    try {
      const token = localStorage.getItem('onesmarter_admin_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Token ${token}`;
      headers['X-Admin-Screen'] = 'search';
      const res = await fetch('/edi835/api/837/sftp-rename/', {
        method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ client_id: activeClientId, filename_format: filename }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Unable to rename the 837 files on SFTP.');
      const savedFormat = String(data.filename_format || filename || DEFAULT_837_FILENAME_FORMAT).trim();
      setActive837Filename(savedFormat);
      localStorage.setItem(namingStorageKey(activeClientId), savedFormat);
      setRenameOpen(false);
      setNotice(data.message || `${data.renamed_count || data.transferred_count || 0} 837 file(s) renamed on SFTP.`);
    } catch (err) { setError(err.message); }
    finally { setRenaming(false); }
  };

  return <section className="view on claim-search-view">
    <div className="claim-search-heading-row">
      <div><h1>837 Claim Search</h1></div>
      <div className="claim-search-client"><label>Client</label><ClientSelectDropdown clients={clients} value={activeClientId} onChange={onSelectClient} fullWidth /></div>
    </div>
    <div className="claim-search-upload"><div><label>837 files</label><input id="search-837-upload" type="file" multiple onChange={event => setUploads(Array.from(event.target.files || []))} />{uploads.length > 0 && <small>{uploads.length} file(s) selected</small>}</div><button type="button" className="btn primary" disabled={!activeClientId || !uploads.length || processing} onClick={processUpload}>{processing ? 'Processing 837…' : 'Upload & Process'}</button></div>
    {notice && <div className="claim837-message success">{notice}</div>}{error && <div className="claim837-message error">{error}</div>}
    <div className="claim-search-actions">
      <button type="button" className="btn secondary claim-search-rename" disabled={!activeClientId || renaming} onClick={() => setRenameOpen(true)}>{renaming ? 'Renaming 837…' : 'Rename SFTP 837 Files'}</button>
      <div className="claim-search-input"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={!activeClientId} placeholder="Search claim, Highmark, or internal claim number" autoComplete="off" />{loading && <span>Searching…</span>}</div>
      <div className="claim-search-current-name" title="Filename format used for 837 SFTP pushes"><span>Naming format</span><b>{active837Filename}</b></div>
      <div className="claim-search-match-count">{query.trim() ? `${rows.length} match${rows.length === 1 ? '' : 'es'}` : 'Search claims'}</div>
    </div>
    <div className="claim-search-results"><div className="claim837-table-wrap"><table><thead><tr><th>Highmark claim number</th><th>Internal claim number</th><th>Patient</th><th>Member ID</th><th>837 file</th><th>Services</th><th>Total charge</th></tr></thead><tbody>
      {!rows.length ? <tr><td colSpan="7" className="empty">{query.trim() && !loading ? 'No matching 837 claims found.' : 'Search results will appear here.'}</td></tr> : rows.map(row => <tr key={row.id}><td><button className="claim837-link" type="button" onClick={() => setClaimId(row.id)}>{row.highmark_claim_number || '—'}</button></td><td>{row.internal_claim_number || '—'}</td><td>{row.patient_name || '—'}</td><td>{row.member_id || '—'}</td><td>{row.file_name}</td><td>{row.service_count}</td><td>{money(row.total_charge_amount)}</td></tr>)}
    </tbody></table></div></div>
    <section className="claim-files-section">
      <div className="claim-files-heading"><div><div className="eyebrow">837 FILE HISTORY</div><h2>837 Files</h2><p>{fileData.count} file{fileData.count === 1 ? '' : 's'} for the selected client</p></div><button type="button" className="btn" disabled={!activeClientId || fileLoading} onClick={() => setFileRefresh(value => value + 1)}>Refresh</button></div>
      <div className="claim-search-input"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={fileQuery} onChange={event => { setFileQuery(event.target.value); setFilePage(1); }} disabled={!activeClientId} placeholder="Search 837 filename, processing status, inbound source, or outbound status" autoComplete="off" />{fileLoading && <span>Loading…</span>}</div>
      {fileError && <div className="claim837-message error">{fileError}</div>}
      <div className="claim-search-results"><div className="claim837-table-wrap"><table className="claim-files-table"><thead><tr><th>837 file</th><th>Processing status</th><th>Inbound</th><th>Inbound status</th><th>Outbound status</th><th>Claims</th><th>Services</th><th>Total charge</th><th>Processed</th></tr></thead><tbody>
        {!fileData.results.length ? <tr><td colSpan="9" className="empty">{fileLoading ? 'Loading 837 files…' : 'No 837 files found.'}</td></tr> : fileData.results.map(file => <tr key={file.id}><td className="file-name-cell">{file.file_name}</td><td><span className={`file-status status-${file.status.toLowerCase()}`}>{file.status}</span></td><td>{file.inbound_source}</td><td><span className="file-status status-received">{file.inbound_status}</span></td><td><span className={`file-status ${file.outbound_ready ? 'status-pushed' : 'status-not-pushed'}`}>{file.outbound_status}</span></td><td>{file.claim_count}</td><td>{file.service_count}</td><td>{money(file.total_charge_amount)}</td><td>{dateTime(file.processed_at || file.uploaded_at)}</td></tr>)}
      </tbody></table></div></div>
      <div className="claim-files-pagination"><span>Page {fileData.pages ? filePage : 0} of {fileData.pages}</span><div><button type="button" className="btn" disabled={!fileData.has_previous || fileLoading} onClick={() => setFilePage(page => Math.max(1, page - 1))}>Previous</button><button type="button" className="btn" disabled={!fileData.has_next || fileLoading} onClick={() => setFilePage(page => page + 1)}>Next</button></div></div>
    </section>
    {claimId && <Claim837Modal claimId={claimId} namingFormat={active837Filename} onClose={() => setClaimId(null)} />}
    {renameOpen && <Rename837Modal initialFilename={active837Filename} renaming={renaming} onClose={() => !renaming && setRenameOpen(false)} onConfirm={renameSftp837Files} />}
  </section>;
}