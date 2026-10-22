import React, { useEffect, useState } from 'react';
import { apiUrl } from '../utils/uploadRequest';
import TransferDetail from './TransferDetail';

export type Receipt = { receipt_id: string; lifecycle_state: string; status_url: string;
  canonical_receipt_id?: string | null; canonical_state?: string | null };

function ReceiptStatus({ receipt }: { receipt: Receipt }) {
  const [status, setStatus] = useState<Receipt>(receipt);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const allowed = /^\/edi835\/api\/(intake\/|client-portal\/analysis\/\?view=receipt&)/.test(receipt.status_url);
  async function read() {
    if (!allowed || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(receipt.status_url, { credentials: 'include', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Receipt unavailable.');
      setStatus(result);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Receipt unavailable.'); }
    finally { setLoading(false); }
  }
  return <li style={{ overflowWrap: 'anywhere' }}>
    {allowed && <a href={apiUrl(receipt.status_url)} onClick={event => { event.preventDefault(); void read(); }}
      aria-label={`Check receipt ${receipt.receipt_id}`}>Receipt {receipt.receipt_id}</a>}
    {' · '}<span role="status">{loading ? 'Checking…' : status.lifecycle_state.replaceAll('_', ' ').toLowerCase()}</span>
    {status.canonical_receipt_id && <span> · Original receipt {status.canonical_receipt_id} ({status.canonical_state?.toLowerCase()})</span>}
    {error && <span role="alert"> · {error}</span>}
  </li>;
}

export default function IntakeReceipts({ receipts }: { receipts: Receipt[] }) {
  if (!receipts.length) return null;
  return <details style={{ fontSize: '12px', marginTop: '6px' }}><summary>Upload receipts ({receipts.length})</summary>
    <ul style={{ margin: '6px 0', paddingLeft: '20px' }}>{receipts.map(receipt => <ReceiptStatus key={receipt.receipt_id} receipt={receipt} />)}</ul>
  </details>;
}

type HistoryRow = { receipt_id: string; workflow: string; channel: string; state: string; received_at: string; filename: string };

export function IntakeHistory({ clientId }: { clientId: string }) {
  return <ClientIntakeHistory key={clientId} clientId={clientId} />;
}

function ClientIntakeHistory({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loadedKey, setLoadedKey] = useState('');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ status: '', channel: '', date_from: '', date_to: '' });
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const params = new URLSearchParams({ client_id: clientId, page: String(page), page_size: '25', ...filters });
  const query = params.toString();
  const requestKey = `${query}:${revision}`;
  useEffect(() => {
    if (!open || !clientId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/v1/transfers?${query}`, {
          credentials: 'include', cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Receipt history unavailable.');
        if (!controller.signal.aborted) { setRows(result.transfers); setPages(result.pages); setError(''); }
      } catch (issue) {
        if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : 'Receipt history unavailable.');
      } finally { if (!controller.signal.aborted) setLoadedKey(requestKey); }
    }
    void load();
    return () => controller.abort();
  }, [open, clientId, query, requestKey]);
  function filter(name: keyof typeof filters, value: string) {
    setFilters(current => ({ ...current, [name]: value })); setPage(1); setSelected('');
  }
  async function recover(event: React.FormEvent) {
    event.preventDefault();
    if (recovering) return;
    setRecovering(true); setRecoveryError('');
    try {
      const response = await fetch('/api/v1/transfers/recover', { credentials: 'include', cache: 'no-store',
        headers: { 'Idempotency-Key': recoveryKey } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Receipt unavailable.');
      if (result.client_id !== clientId) throw new Error('This submission belongs to another client. Select that client to view it.');
      setSelected(result.receipt_id);
    } catch (issue) { setRecoveryError(issue instanceof Error ? issue.message : 'Receipt unavailable.'); }
    finally { setRecovering(false); }
  }
  return <details style={{ fontSize: '12px', marginTop: '8px' }} onToggle={event => {
    if (event.target !== event.currentTarget) return;
    setOpen(event.currentTarget.open); setLoadedKey('');
  }}><summary>Intake history · portal, SFTP and API</summary>
    {open && <>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        <label>Status <select value={filters.status} onChange={event => filter('status', event.target.value)}>
          <option value="">All statuses</option>{['RECEIVED', 'VALIDATING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'DUPLICATE'].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Channel <select value={filters.channel} onChange={event => filter('channel', event.target.value)}>
          <option value="">All channels</option>{['STAFF', 'SFTP', 'PARTNER', 'ANALYSIS', 'SYSTEM'].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>From (UTC) <input type="date" value={filters.date_from} onChange={event => filter('date_from', event.target.value)} /></label>
        <label>To (UTC) <input type="date" value={filters.date_to} onChange={event => filter('date_to', event.target.value)} /></label>
        <button type="button" onClick={() => setRevision(value => value + 1)}>Check history</button>
      </div>
      <details><summary>Recover a submission</summary><form onSubmit={recover}>
        <label>Submission key <input value={recoveryKey} onChange={event => setRecoveryKey(event.target.value)} maxLength={200} required autoComplete="off" /></label>{' '}
        <button type="submit" disabled={recovering || !recoveryKey}>{recovering ? 'Finding…' : 'Find receipt'}</button>
        <p>Use the key from a versioned API upload made with your account.</p>
        {recoveryError && <p role="alert">{recoveryError}</p>}
      </form></details>
      {loadedKey !== requestKey ? <p role="status">Loading receipts…</p> : error ? <p role="alert">{error}</p> : <>
      {!rows.length && <p>No receipts for this client.</p>}
      <ul style={{ paddingLeft: '20px' }}>{rows.map(row => <li key={row.receipt_id} style={{ margin: '6px 0' }}>
        <button type="button" onClick={() => setSelected(row.receipt_id)} aria-expanded={selected === row.receipt_id}>{row.filename}</button>
        {' · '}{row.workflow} · {row.channel.toLowerCase()} · {row.state} · {new Date(row.received_at).toLocaleString()}
        <small style={{ display: 'block' }}>Receipt {row.receipt_id}</small>
      </li>)}</ul>
      <span>Page {page} of {pages} </span>
      <button type="button" disabled={page <= 1} onClick={() => { setPage(value => value - 1); setSelected(''); }}>Previous</button>{' '}
      <button type="button" disabled={page >= pages} onClick={() => { setPage(value => value + 1); setSelected(''); }}>Next</button>
      </>}
      {selected && <TransferDetail key={selected} receiptId={selected} onRetried={() => setRevision(value => value + 1)} />}
    </>}
  </details>;
}
