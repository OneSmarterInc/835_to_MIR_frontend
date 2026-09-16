import React, { useEffect, useMemo, useState } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import Uploaded837FilesView from './Uploaded837FilesView';
import { fetch837ClaimDetail, fetch837Files, process837Upload, push837ClaimToSftp } from '../services/api';
import { searchUniversalClaims } from '../services/claimSearchApi';
import { EASTERN_TIME_ZONE, formatInZone } from '../../utils/timezone';
import './ClaimSearchView.css';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const dateTime = value => value ? formatInZone(new Date(value), EASTERN_TIME_ZONE, true) : '—';
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

async function downloadClaimWithFilename(claimId, filename) {
  const headers = { 'X-Admin-Screen': 'search' };
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

function ClaimOperationalDetails({ operational }) {
  const data = operational || { status: 'CLEAR', history: [], findings: [], occurrence_count: 0 };
  return <section className="claim-operational">
    <div className="claim-operational-heading"><div><div className="eyebrow">CLAIM HISTORY</div><h3>Operational history</h3></div><div className="claim-operational-badges"><span className={`claim-operation-badge ${data.duplicate ? 'warning' : 'clear'}`}>Duplicate: {data.duplicate ? 'Yes' : 'No'}</span><span className={`claim-operation-badge ${data.held ? 'held' : 'clear'}`}>Hold: {data.held ? 'Yes' : 'No'}</span><span className="claim-operation-badge">{data.occurrence_count || 0} occurrence(s)</span></div></div>
    {data.findings?.length > 0 && <div className="claim-operational-findings">{data.findings.map((finding, index) => <div key={index}><b>{finding.rule_code || finding.code || finding.error_code || finding.decision || 'Finding'}</b><span>{finding.message || finding.description || finding.reason || 'Stored processing finding'}</span></div>)}</div>}
    <div className="claim837-table-wrap claim-history-table"><table><thead><tr><th>Source</th><th>File</th><th>Internal claim number</th><th>Status</th><th>Received</th></tr></thead><tbody>
      {data.history?.length ? data.history.map((event, index) => <tr key={`${event.source}-${event.file_name}-${index}`}><td><b>{String(event.source || '').toUpperCase()}</b></td><td>{event.file_name || '—'}</td><td>{event.internal_claim_number || '—'}</td><td>{event.status || '—'}</td><td>{dateTime(event.arrived_at)}</td></tr>) : <tr><td colSpan="5" className="empty">No stored claim history was found.</td></tr>}
    </tbody></table></div>
  </section>;
}

function Claim837Modal({ claimId, namingFormat, summary, onClose }) {
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
  return <div className="claim837-backdrop claim837-summary-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
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
          {['835', 'mir', 'recon', '837'].map(type => { const item = claim.lifecycle?.[type] || {}; return <div key={type} className={item.exists ? 'present' : 'absent'}><span className="claim837-presence-icon" aria-hidden="true">{item.exists ? '✓' : '—'}</span><div><span>{type.toUpperCase()}</span><b>{item.exists ? `Found in ${type.toUpperCase()}` : `Not found in ${type.toUpperCase()}`}</b><small>{item.exists ? `${item.file_name || 'File recorded'}${item.internal_claim_number ? ` · internal ${item.internal_claim_number}` : ''} · arrived ${dateTime(item.arrived_at)}${type === '835' && item.source ? ` · ${item.source}` : ''}` : type === '835' ? 'No linked source 835 record' : 'No matching claim record'}</small></div></div>; })}
        </div>
        <ClaimOperationalDetails operational={summary?.operational} />
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

function UniversalClaimModal({ row, onClose }) {
  return <div className="claim837-backdrop claim837-summary-backdrop" role="presentation">
    <div className="claim837-modal" role="dialog" aria-modal="true" aria-label="Universal claim summary">
      <header><div><div className="eyebrow">UNIVERSAL CLAIM SUMMARY</div><h2>{[row.highmark_claim_number, row.internal_claim_number].filter(Boolean).join(' · ')}</h2></div><button type="button" className="claim837-close" onClick={onClose} aria-label="Close">&times;</button></header>
      <div className="claim837-summary">
        <div><span>Highmark claim number</span><b>{row.highmark_claim_number || '—'}</b></div>
        <div><span>Internal claim number</span><b>{row.internal_claim_number || '—'}</b></div>
        <div><span>Member ID</span><b>{row.member_id || '—'}</b></div>
        <div><span>Total charge</span><b>{money(row.total_charge_amount)}</b><small>{row.service_count || 0} service line(s)</small></div>
      </div>
      <div className="claim837-lifecycle">
        {['835', 'mir', 'recon', '837'].map(type => { const item = row.lifecycle?.[type] || {}; return <div key={type} className={item.exists ? 'present' : 'absent'}><span className="claim837-presence-icon" aria-hidden="true">{item.exists ? '✓' : '—'}</span><div><span>{type.toUpperCase()}</span><b>{item.exists ? `Found in ${type.toUpperCase()}` : `Not found in ${type.toUpperCase()}`}</b><small>{item.exists ? `${item.file_name || 'File recorded'}${item.internal_claim_number ? ` · internal ${item.internal_claim_number}` : ''} · arrived ${dateTime(item.arrived_at)}` : 'No matching claim record'}</small></div></div>; })}
      </div>
      <ClaimOperationalDetails operational={row.operational} />
      <footer><button type="button" className="btn" onClick={onClose}>Close</button></footer>
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
  const [claimId, setClaimId] = useState(null);
  const [claimSummary, setClaimSummary] = useState(null);
  const [sourceClaim, setSourceClaim] = useState(null);
  const [claimPage, setClaimPage] = useState(1);
  const [claimRefresh, setClaimRefresh] = useState(0);
  const [claimMeta, setClaimMeta] = useState({ count: 0, pages: 0, has_previous: false, has_next: false });
  const [show837Files, setShow837Files] = useState(() => new URLSearchParams(window.location.search).get('search_view') === '837-files');

  useEffect(() => {
    setQuery(''); setSearchField('all'); setRows([]); setError(''); setNotice(''); setClaimPage(1);
    setClaimMeta({ count: 0, pages: 0, has_previous: false, has_next: false });
    const savedFormat = activeClientId ? localStorage.getItem(namingStorageKey(activeClientId)) : '';
    setActive837Filename(savedFormat || DEFAULT_837_FILENAME_FORMAT);
  }, [activeClientId]);

  useEffect(() => {
    if (!activeClientId) return undefined;
    let current = true;
    fetch837Files(activeClientId, '', 1, 10)
      .then(data => {
        if (!current) return;
        const serverFormat = String(data.filename_format || '').trim();
        if (serverFormat) {
          setActive837Filename(serverFormat);
          localStorage.setItem(namingStorageKey(activeClientId), serverFormat);
        }
      })
      .catch(() => {});
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
          setClaimMeta({
            count: Number(data.count || 0),
            pages: Number(data.pages || 0),
            has_previous: Boolean(data.has_previous),
            has_next: Boolean(data.has_next),
          });
          if (Number(data.page || claimPage) !== claimPage) setClaimPage(Number(data.page || 1));
        }
      }
      catch (err) {
        if (err.name !== 'AbortError' && !controller.signal.aborted) {
          setError(err.message); setRows([]); setClaimMeta({ count: 0, pages: 0, has_previous: false, has_next: false });
        }
      }
      finally { if (!controller.signal.aborted) setLoading(false); }
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
      const headers = { 'Content-Type': 'application/json', 'X-Admin-Screen': 'search' };
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

  const open837Files = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('search_view', '837-files');
    window.history.pushState({ ...(window.history.state || {}), oneSmarterNav: true }, '', url.toString());
    setShow837Files(true);
  };

  const close837Files = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('search_view') === '837-files') {
      window.history.back();
      return;
    }
    setShow837Files(false);
  };

  if (show837Files) {
    return <Uploaded837FilesView clients={clients} activeClientId={activeClientId} onSelectClient={onSelectClient} onBack={close837Files} />;
  }

  const pageStart = claimMeta.count ? ((claimPage - 1) * CLAIM_PAGE_SIZE) + 1 : 0;
  const pageEnd = claimMeta.count ? Math.min(claimPage * CLAIM_PAGE_SIZE, claimMeta.count) : 0;

  return <section className="view on claim-search-view">
    <div className="claim-search-heading-row">
      <div className="claim-search-heading-copy"><div className="claim-search-eyebrow">Claims workspace</div><h1>Universal Claim Search</h1><p>Locate and review claim records across 835, MIR, RECON, and 837 files for the selected client.</p></div>
      <div className="claim-search-client"><label>Client</label><ClientSelectDropdown clients={clients} value={activeClientId} onChange={onSelectClient} fullWidth /></div>
    </div>
    <div className="claim-search-upload"><div><label>837 files</label><input id="search-837-upload" type="file" multiple onChange={event => setUploads(Array.from(event.target.files || []))} />{uploads.length > 0 && <small>{uploads.length} file(s) selected</small>}</div><button type="button" className="btn primary" disabled={!activeClientId || !uploads.length || processing} onClick={processUpload}>{processing ? 'Processing 837…' : 'Upload & Process'}</button></div>
    {notice && <div className="claim837-message success">{notice}</div>}{error && <div className="claim837-message error">{error}</div>}
    <div className="claim-search-actions">
      <button type="button" className="btn secondary claim-search-rename" disabled={!activeClientId || renaming} onClick={() => setRenameOpen(true)}>{renaming ? 'Renaming 837…' : 'Rename SFTP 837 Files'}</button>
      <div className="claim-search-input"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={query} onChange={event => { setQuery(event.target.value); setClaimPage(1); }} disabled={!activeClientId} placeholder="Search Highmark claim, internal claim, member, patient, or source file" autoComplete="off" />{loading && <span>Searching…</span>}</div>
      <label className="claim-search-field"><span>Search in</span><select value={searchField} disabled={!activeClientId} onChange={event => { setSearchField(event.target.value); setClaimPage(1); }}><option value="all">All columns</option><option value="highmark">Highmark claim number</option><option value="internal">Internal claim number</option><option value="patient">Patient</option><option value="835">835 filename</option><option value="mir">MIR filename</option><option value="recon">RECON filename</option><option value="837">837 filename</option></select></label>
      <button type="button" className="btn" disabled={!activeClientId} onClick={open837Files} style={{ background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff', fontWeight: 700 }}>837 Uploaded Files</button>
      <div className="claim-search-match-count">{loading ? 'Loading claims' : `${claimMeta.count.toLocaleString()} ${query.trim() ? 'matches' : 'claims'}`}</div>
    </div>
    <div className="claim-search-results"><div className="claim837-table-wrap"><table className="universal-claim-table"><thead><tr><th>Highmark claim number</th><th>Internal claim number</th><th>Patient</th><th>835</th><th>MIR</th><th>RECON</th><th>837</th></tr></thead><tbody>
      {!rows.length ? <tr><td colSpan="7" className="empty">{loading ? 'Loading claims…' : query.trim() ? 'No matching claims found in 835, MIR, RECON, or 837.' : 'No claims found for the selected client.'}</td></tr> : rows.map(row => { const openRow = () => { if (row.has_837 === false) setSourceClaim(row); else { setClaimSummary(row); setClaimId(row.id); } }; return <tr key={row.id} className="universal-claim-row" onClick={openRow}><td><button className="claim837-link" type="button" onClick={(event) => { event.stopPropagation(); openRow(); }}>{row.highmark_claim_number || '—'}</button></td><td>{row.internal_claim_number || '—'}</td><td>{row.patient_name || '—'}<small>{row.member_id || ''}</small></td>{['835', 'mir', 'recon', '837'].map(type => { const source = row.lifecycle?.[type] || {}; return <td key={type} className="universal-source-cell">{source.exists ? <><b className="universal-source-file" title={source.file_name}>{source.file_name || 'File recorded'}</b><small>{dateTime(source.arrived_at)}</small></> : <span className="universal-source-empty">—</span>}</td>; })}</tr>; })}
    </tbody></table></div></div>
    <div className="claim-files-pagination">
      <span>{claimMeta.count ? `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${claimMeta.count.toLocaleString()} claims` : '0 claims'} · Page {claimMeta.pages ? claimPage : 0} of {claimMeta.pages}</span>
      <div><button type="button" className="btn" disabled={!claimMeta.has_previous || loading} onClick={() => setClaimPage(page => Math.max(1, page - 1))}>Previous</button><button type="button" className="btn" disabled={!claimMeta.has_next || loading} onClick={() => setClaimPage(page => page + 1)}>Next</button></div>
    </div>
    {claimId && <Claim837Modal claimId={claimId} namingFormat={active837Filename} summary={claimSummary} onClose={() => { setClaimId(null); setClaimSummary(null); }} />}
    {sourceClaim && <UniversalClaimModal row={sourceClaim} onClose={() => setSourceClaim(null)} />}
    {renameOpen && <Rename837Modal initialFilename={active837Filename} renaming={renaming} onClose={() => !renaming && setRenameOpen(false)} onConfirm={renameSftp837Files} />}
  </section>;
}
