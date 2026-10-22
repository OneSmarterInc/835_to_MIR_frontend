import React, { useEffect, useState } from 'react';
import { apiUrl } from '../utils/uploadRequest';

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

type HistoryRow = { id: string; workflow: string; channel: string; state: string; received_at: string };

export function IntakeHistory({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState(0);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !clientId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/edi835/api/intake/?client_id=${encodeURIComponent(clientId)}&page=${page}`, {
          credentials: 'include', cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Receipt history unavailable.');
        if (!controller.signal.aborted) { setRows(result.receipts); setPages(result.pages); setError(''); }
      } catch (issue) {
        if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : 'Receipt history unavailable.');
      } finally { if (!controller.signal.aborted) setLoadedPage(page); }
    }
    void load();
    return () => controller.abort();
  }, [open, clientId, page]);
  return <details style={{ fontSize: '12px', marginTop: '8px' }} onToggle={event => {
    setOpen(event.currentTarget.open); setLoadedPage(0);
  }}><summary>Intake history · portal, SFTP and API</summary>
    {open && (loadedPage !== page ? <p role="status">Loading receipts…</p> : error ? <p role="alert">{error}</p> : <>
      {!rows.length && <p>No receipts for this client.</p>}
      <ul>{rows.map(row => <React.Fragment key={row.id}><li>{row.workflow} · {row.channel.toLowerCase()} · {new Date(row.received_at).toLocaleString()}</li>
        <ReceiptStatus receipt={{ receipt_id: row.id, lifecycle_state: row.state, status_url: `/edi835/api/intake/?receipt_id=${row.id}` }} /></React.Fragment>)}</ul>
      <span>Page {page} of {pages} </span>
      <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>{' '}
      <button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</button>
    </>)}
  </details>;
}
