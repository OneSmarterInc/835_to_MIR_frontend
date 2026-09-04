import React, { useEffect, useState } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import { download837Claim, fetch837ClaimDetail, process837Upload, search837Claims } from '../services/api';
import './ClaimSearchView.css';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

function Claim837Modal({ claimId, onClose }) {
  const [claim, setClaim] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    let current = true;
    fetch837ClaimDetail(claimId).then(data => current && setClaim(data)).catch(err => current && setError(err.message));
    return () => { current = false; };
  }, [claimId]);
  const exportClaim = async () => {
    setExporting(true); setError('');
    try { await download837Claim(claimId, claim?.claim_number || claimId); }
    catch (err) { setError(err.message); }
    finally { setExporting(false); }
  };
  return <div className="claim837-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="claim837-modal" role="dialog" aria-modal="true" aria-label="837 claim summary">
      <header><div><div className="eyebrow">837 CLAIM SUMMARY</div><h2>{claim?.claim_number || 'Loading claim…'}</h2></div><button type="button" className="claim837-close" onClick={onClose} aria-label="Close">&times;</button></header>
      {error && <div className="claim837-message error">{error}</div>}
      {!claim && !error ? <div className="claim837-loading">Loading claim details…</div> : claim && <>
        <div className="claim837-summary">
          <div><span>Highmark claim number</span><b>{claim.highmark_claim_number || '—'}</b></div>
          <div><span>Internal claim number</span><b>{claim.internal_claim_number || '—'}</b></div>
          <div><span>Patient</span><b>{claim.patient_name || '—'}</b><small>{claim.member_id || 'No member ID'}</small></div>
          <div><span>Total charge</span><b>{money(claim.total_charge_amount)}</b><small>{claim.service_count} service line(s)</small></div>
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
        </div>
        <h3>837 service lines</h3>
        <div className="claim837-table-wrap"><table><thead><tr><th>#</th><th>Procedure</th><th>Modifiers</th><th>Service date</th><th>Units</th><th>Charge</th><th>Diagnosis pointers</th></tr></thead><tbody>
          {claim.services.length ? claim.services.map(line => <tr key={line.sequence}><td>{line.sequence}</td><td>{line.procedure_code || line.revenue_code || '—'}</td><td>{line.modifiers?.join(', ') || '—'}</td><td>{line.service_from_date || '—'}{line.service_to_date && line.service_to_date !== line.service_from_date ? ` – ${line.service_to_date}` : ''}</td><td>{line.units}</td><td>{money(line.charge_amount)}</td><td>{line.diagnosis_pointers?.join(', ') || '—'}</td></tr>) : <tr><td colSpan="7" className="empty">No service lines were found.</td></tr>}
        </tbody></table></div>
        <footer><button type="button" className="btn" onClick={onClose}>Close</button><button type="button" className="btn primary" disabled={exporting} onClick={exportClaim}>{exporting ? 'Exporting…' : 'Export 837'}</button></footer>
      </>}
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
  const [notice, setNotice] = useState('');
  const [claimId, setClaimId] = useState(null);

  useEffect(() => { setQuery(''); setRows([]); setError(''); setNotice(''); }, [activeClientId]);
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

  const processUpload = async () => {
    if (!activeClientId || !uploads.length) return;
    setProcessing(true); setError(''); setNotice('');
    try {
      const data = await process837Upload(activeClientId, uploads);
      const claims = (data.files || []).reduce((sum, file) => sum + Number(file.claim_count || 0), 0);
      const failure = data.failed_count ? ` ${data.failed_count} file(s) failed.` : '';
      setNotice(`${data.processed_count} file(s) processed, ${data.duplicate_count} already present, ${claims} claims indexed.${failure}`);
      setUploads([]); document.getElementById('search-837-upload').value = '';
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  return <section className="view on claim-search-view">
    <div className="eyebrow">837 CLAIM INDEX</div><h1>Search</h1><p className="sub">Find persisted 837 claims by the complete claim number, Highmark claim number, or internal claim number.</p>
    <div className="claim-search-client"><label>Client</label><ClientSelectDropdown clients={clients} value={activeClientId} onChange={onSelectClient} fullWidth /></div>
    <div className="claim-search-upload"><div><label>Upload and process 837 files</label><input id="search-837-upload" type="file" multiple onChange={event => setUploads(Array.from(event.target.files || []))} /><small>{uploads.length ? `${uploads.length} file(s) selected` : 'Select one or more 837 files, including files without extensions.'}</small></div><button type="button" className="btn primary" disabled={!activeClientId || !uploads.length || processing} onClick={processUpload}>{processing ? 'Processing 837…' : 'Upload & Process 837'}</button></div>
    {notice && <div className="claim837-message success">{notice}</div>}{error && <div className="claim837-message error">{error}</div>}
    <div className="claim-search-input"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={!activeClientId} placeholder="Search claim, Highmark, or internal claim number" autoComplete="off" />{loading && <span>Searching…</span>}</div>
    <div className="claim-search-results"><div className="claim-search-count">{query.trim() ? `${rows.length} matching claim${rows.length === 1 ? '' : 's'}` : 'Enter a claim number to search'}</div><div className="claim837-table-wrap"><table><thead><tr><th>Claim number</th><th>Highmark claim number</th><th>Internal claim number</th><th>Patient</th><th>Member ID</th><th>837 file</th><th>Services</th><th>Total charge</th></tr></thead><tbody>
      {!rows.length ? <tr><td colSpan="8" className="empty">{query.trim() && !loading ? 'No matching 837 claims found.' : 'Search results will appear here.'}</td></tr> : rows.map(row => <tr key={row.id}><td><button className="claim837-link" type="button" onClick={() => setClaimId(row.id)}>{row.claim_number}</button></td><td>{row.highmark_claim_number || '—'}</td><td>{row.internal_claim_number || '—'}</td><td>{row.patient_name || '—'}</td><td>{row.member_id || '—'}</td><td>{row.file_name}</td><td>{row.service_count}</td><td>{money(row.total_charge_amount)}</td></tr>)}
    </tbody></table></div></div>
    {claimId && <Claim837Modal claimId={claimId} onClose={() => setClaimId(null)} />}
  </section>;
}
