import React, { useEffect, useState } from 'react';
import ClientSelectDropdown from './ClientSelectDropdown';
import { fetch837Files } from '../services/api';
import { EASTERN_TIME_ZONE, formatInZone } from '../../utils/timezone';
import { withCsrf } from '../../utils/api';
import './ClaimSearchView.css';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const dateTime = value => value ? formatInZone(new Date(value), EASTERN_TIME_ZONE, true) : '—';

export default function Uploaded837FilesView({ clients, activeClientId, onSelectClient, onBack }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ results: [], count: 0, pages: 0, has_previous: false, has_next: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pushingPending, setPushingPending] = useState(false);

  useEffect(() => {
    setQuery('');
    setPage(1);
    setError('');
    setNotice('');
  }, [activeClientId]);

  useEffect(() => {
    if (!activeClientId) {
      setData({ results: [], count: 0, pages: 0, has_previous: false, has_next: false });
      return undefined;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const next = await fetch837Files(activeClientId, query.trim(), page, 20);
        setData(next);
      } catch (err) {
        setError(err.message || 'Unable to load 837 files.');
      } finally {
        setLoading(false);
      }
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [activeClientId, query, page, refresh]);

  const pushAllPending837 = async () => {
    if (!activeClientId || pushingPending) return;
    setPushingPending(true);
    setError('');
    setNotice('');
    try {
      // 2026-09-25 - Yash: Task 6b - Wrap raw POST fetch with withCsrf
      const headers = { 'Content-Type': 'application/json', 'X-Admin-Screen': 'search' };
      const queueRes = await fetch('/edi835/api/837/files/', withCsrf({
        method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ client_id: activeClientId }),
      }));
      const queued = await queueRes.json().catch(() => ({}));
      if (!queueRes.ok || !queued.success) throw new Error(queued.error || 'Unable to queue pending 837 files for SFTP delivery.');
      if (!queued.job_id || queued.state === 'COMPLETED') {
        setNotice(queued.message || 'All processed 837 files are already pushed to SFTP.');
        setRefresh(value => value + 1);
        return;
      }

      setNotice(queued.message || `Queued ${queued.pending_count || 0} pending 837 file(s) for sequential SFTP delivery.`);
      let completedJob = null;
      for (let attempt = 0; attempt < 600; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusRes = await fetch(`/edi835/api/start-batch-conversion/?job_id=${encodeURIComponent(queued.job_id)}`, {
          method: 'GET', credentials: 'include', headers: { 'X-Admin-Screen': 'search' },
        });
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok || !statusData.success) throw new Error(statusData.error || 'Unable to read 837 SFTP push status.');
        const job = statusData.job || {};
        if (job.state === 'COMPLETED' || job.state === 'FAILED') {
          completedJob = job;
          break;
        }
      }
      if (!completedJob) throw new Error('837 SFTP delivery is still running. Refresh to check the latest status.');
      const result = completedJob.result || {};
      if (completedJob.state === 'FAILED' || result.success === false) {
        throw new Error(result.error || (result.errors || []).join('; ') || '837 SFTP delivery failed.');
      }
      const sent = Number(result.processed_count || (result.sent_files || []).length || 0);
      const remainingErrors = Array.isArray(result.errors) ? result.errors.length : 0;
      setNotice(
        remainingErrors
          ? `Pushed ${sent} 837 file(s). ${remainingErrors} file(s) could not be pushed and remain queued for retry.`
          : `Pushed ${sent} pending 837 file(s) to SFTP one by one.`
      );
      setRefresh(value => value + 1);
    } catch (err) {
      setError(err.message || '837 SFTP delivery failed.');
      setRefresh(value => value + 1);
    } finally {
      setPushingPending(false);
    }
  };

  return <section className="view on claim-search-view">
    <div className="claim-search-heading-row">
      <div className="claim-search-heading-copy">
        <button type="button" className="btn" onClick={onBack} style={{ marginBottom: '10px', background: '#fff', color: 'var(--ink)' }}>← Back to Universal Claim Search</button>
        <div className="claim-search-eyebrow">837 file history</div>
        <h1>837 Uploaded Files</h1>
        <p>Review inbound and outbound 837 processing history for the selected client.</p>
      </div>
      <div className="claim-search-client"><label>Client</label><ClientSelectDropdown clients={clients} value={activeClientId} onChange={onSelectClient} fullWidth /></div>
    </div>

    {notice && <div className="claim837-message success">{notice}</div>}
    {error && <div className="claim837-message error">{error}</div>}

    <section className="claim-files-section" style={{ marginTop: 0 }}>
      <div className="claim-files-heading">
        <div>
          <div className="eyebrow">837 FILE HISTORY</div>
          <h2>837 Files</h2>
          <p>{data.count} file{data.count === 1 ? '' : 's'} for the selected client{Number(data.pending_outbound_count || 0) > 0 ? ` · ${data.pending_outbound_count} waiting for SFTP` : ''}</p>
        </div>
        <button type="button" className="btn" disabled={!activeClientId || loading || pushingPending} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
      </div>

      <div className="claim-search-input">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} disabled={!activeClientId} placeholder="Search inbound/outbound 837 filename, processing status, inbound source, or outbound status" autoComplete="off" />
        {loading && <span>Loading…</span>}
      </div>

      <div className="claim-search-results" style={{ marginTop: '12px' }}><div className="claim837-table-wrap"><table className="claim-files-table"><thead><tr><th>Inbound 837 file</th><th>Outbound 837 file</th><th>Processing status</th><th>Inbound</th><th>Inbound status</th><th>Outbound status</th><th>Claims</th><th>Services</th><th>Total charge</th><th>Processed</th></tr></thead><tbody>
        {!data.results.length ? <tr><td colSpan="10" className="empty">{loading ? 'Loading 837 files…' : 'No 837 files found.'}</td></tr> : data.results.map(file => <tr key={file.id}>
          <td className="file-name-cell">{file.original_file_name || file.file_name || '—'}</td>
          <td className="file-name-cell">{file.outbound_file_name || '—'}</td>
          <td><span className={`file-status status-${String(file.status || '').toLowerCase()}`}>{file.status || '—'}</span></td>
          <td>{file.inbound_source || '—'}</td>
          <td><span className="file-status status-received">{file.inbound_status || '—'}</span></td>
          <td>{file.outbound_ready ? <span className="file-status status-pushed">{file.outbound_status}</span> : <button type="button" className="file-status status-not-pushed" disabled={pushingPending} title={`Push all ${data.pending_outbound_count || 'pending'} processed 837 files to SFTP one by one`} style={{ border: 0, cursor: pushingPending ? 'wait' : 'pointer', font: 'inherit' }} onClick={pushAllPending837}>{pushingPending ? 'PUSHING…' : file.outbound_status}</button>}</td>
          <td>{file.claim_count}</td><td>{file.service_count}</td><td>{money(file.total_charge_amount)}</td><td>{dateTime(file.processed_at || file.uploaded_at)}</td>
        </tr>)}
      </tbody></table></div></div>

      <div className="claim-files-pagination"><span>Page {data.pages ? page : 0} of {data.pages}</span><div><button type="button" className="btn" disabled={!data.has_previous || loading || pushingPending} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><button type="button" className="btn" disabled={!data.has_next || loading || pushingPending} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
  </section>;
}
