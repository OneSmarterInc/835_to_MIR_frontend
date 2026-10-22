import { useEffect, useState } from 'react';
import { apiUrl } from '../utils/uploadRequest';

type Detail = {
  receipt_id: string; lifecycle_state: string; filename: string; workflow: string;
  source_url?: string; retry_eligible: boolean; retry_blocked_reason?: string;
  safe_error_code: string; validation_outcome: string; converter_version: string;
  outputs: { id: string; download_url?: string; byte_count: number; delivery_state: string }[];
  attempts: { id: string; sequence: number; state: string; retry_reason: string }[];
  retries: { id: string; reason: string; created_at: string }[];
  recovery_reviews?: { id: number; decision: string; evidence_reference: string; created_at: string }[];
};

export default function TransferDetail({ receiptId, onRetried }: { receiptId: string; onRetried: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const url = `/api/v1/transfers/${encodeURIComponent(receiptId)}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Transfer unavailable.');
        if (!controller.signal.aborted) { setData(result); setError(''); }
      } catch (issue) {
        if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : 'Transfer unavailable.');
      }
    }
    void load();
    return () => controller.abort();
  }, [url, refresh]);
  async function retry(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !data?.retry_eligible) return;
    setBusy(true); setError('');
    try {
      // The application's CSRF fetch wrapper supplies the session token.
      const response = await fetch(`${url}/retry`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Retry unavailable.');
      setData(null); setReason(''); setRefresh(value => value + 1); onRetried();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Retry was not confirmed. Check status before retrying.');
      // Do not replay the POST; refresh the authoritative receipt after uncertainty.
      setData(null); setRefresh(value => value + 1);
    } finally { setBusy(false); }
  }
  const current = data?.receipt_id === receiptId ? data : null;
  return <section aria-label="Transfer details" style={{ padding: '10px', border: '1px solid #ccd5df', margin: '6px 0' }}>
    {error && <p role="alert">{error}</p>}
    {!current ? <p role="status">{error ? 'Unable to load transfer.' : 'Loading transfer…'}</p> : <>
      <p><strong>{current.filename}</strong> · {current.lifecycle_state} · Validation: {current.validation_outcome}</p>
      {current.safe_error_code && <p>Code: {current.safe_error_code}</p>}
      {current.source_url && <a href={apiUrl(current.source_url)}>Download source</a>}
      {current.outputs.map(output => <p key={output.id}>
        {output.download_url && <a href={apiUrl(output.download_url)}>Download MIR</a>} · {output.byte_count.toLocaleString()} bytes · Delivery: {output.delivery_state}
      </p>)}
      <p>Converter version: {current.converter_version ? current.converter_version.slice(0, 12) : 'Pending'}</p>
      {current.attempts.length > 0 && <ul>{current.attempts.map(attempt => <li key={attempt.id}>
        Attempt {attempt.sequence} · {attempt.state}{attempt.retry_reason && ` · ${attempt.retry_reason}`}
      </li>)}</ul>}
      {current.retries?.length > 0 && <details><summary>Retry audit</summary><ul>{current.retries.map(item =>
        <li key={item.id}>{new Date(item.created_at).toLocaleString()} · {item.reason}</li>)}</ul></details>}
      {!!current.recovery_reviews?.length && <details><summary>Recovery review history</summary><ul>{current.recovery_reviews.map(item =>
        <li key={item.id}>{new Date(item.created_at).toLocaleString()} · {item.decision.replaceAll('_', ' ')} · {item.evidence_reference}</li>)}</ul></details>}
      {current.retry_eligible ? <form onSubmit={retry} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Retry reason <input value={reason} onChange={event => setReason(event.target.value)} required minLength={3} maxLength={500}
          disabled={busy} placeholder="Describe the resolved issue; omit patient details" style={{ minWidth: '280px' }} /></label>
        <button type="submit" disabled={busy || reason.trim().length < 3}>{busy ? 'Requesting…' : 'Retry transfer'}</button>
      </form> : current.lifecycle_state === 'FAILED' && <p>{current.retry_blocked_reason}</p>}
    </>}
    <button type="button" disabled={busy} onClick={() => { setData(null); setError(''); setRefresh(value => value + 1); }}>Check status</button>
  </section>;
}
