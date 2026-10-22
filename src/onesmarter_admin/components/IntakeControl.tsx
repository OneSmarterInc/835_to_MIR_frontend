import { useEffect, useRef, useState } from 'react';
import TransferDetail from '../../components/TransferDetail';
import './IntakeControl.css';

type Row = Record<string, unknown>;
type Data = { rows?: Row[]; page?: number; pages?: number; total?: number; counts?: Record<string, number>;
  as_of?: string; oldest_queue_seconds?: number; expired_leases?: number; quarantine_open?: number;
  delivery_unconfirmed?: number; expiring_credentials?: number; active_holds?: number;
  disk?: { total_bytes: number; free_bytes: number }; targets?: Row; policy?: Row;
  eligible_sample_count?: number; scope?: string; last_worker_heartbeat?: string };
type Bootstrap = { clients: { id: string; name: string; client_code: string }[]; staff: { id: string; email: string }[]; can_approve: boolean };
type Field = { key: string; label: string; type?: 'text' | 'number' | 'select' | 'multi' | 'check' | 'textarea';
  options?: { value: string; label: string }[]; value?: string | string[] | boolean; optional?: boolean; min?: number; max?: number };
type FormSpec = { title: string; action: string; fixed?: Row; fields: Field[]; partner?: Row; operation?: string; note?: string };
type Values = Record<string, string | string[] | boolean>;
const tabs = [['operations', 'Operations'], ['partners', 'Partners'], ['quarantine', 'Quarantine'],
  ['retention', 'Retention & holds'], ['access', 'Access & targets']] as const;
const endpoint = '/admin-panel/api/intake-control/';
const text = (v: unknown) => v == null || v === '' ? '—' : String(v);
const time = (v: unknown) => v ? new Date(String(v)).toLocaleString() : '—';
const options = (values: string[]) => values.map(value => ({ value, label: value }));
const integerKeys = new Set(['days', 'source_days', 'output_days', 'quarantine_days', 'audit_days', 'backup_days',
  'queue_age_seconds', 'rpo_seconds', 'rto_seconds', 'requests_per_minute', 'concurrent_jobs', 'storage_limit_bytes']);

async function api(params: URLSearchParams, signal?: AbortSignal, body?: Row) {
  const response = await fetch(`${endpoint}?${params}`, { credentials: 'include', cache: 'no-store', signal,
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Intake control is unavailable.');
  return result;
}

function ActionForm({ spec, onSave, onClose, busy }: { spec: FormSpec; onSave: (body: Row) => Promise<void>; onClose: () => void; busy: boolean }) {
  const [values, setValues] = useState<Values>(() => Object.fromEntries(spec.fields.map(f => [f.key, f.value ?? (f.type === 'check' ? false : f.type === 'multi' ? [] : '')])));
  const [reason, setReason] = useState('');
  const first = useRef<HTMLHeadingElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const data: Row = Object.fromEntries(Object.entries(values).map(([key, value]) =>
      [key, integerKeys.has(key) ? value === '' ? null : Number(value) : value]));
    if (spec.operation) {
      if (spec.operation === 'PERMISSIONS') {
        data.permissions = (data.permissions as string[]).map(value => { const [workflow, action] = value.split(':'); return { workflow, action, channel: 'PARTNER' }; });
      }
      await onSave({ action: 'partner', partner_id: spec.partner?.id, operation: spec.operation, data: { ...spec.fixed, ...data }, reason });
    } else await onSave({ action: spec.action, ...spec.fixed, ...data, reason });
  }
  return <section className="ic-form-panel" aria-label={spec.title}>
    <div className="ic-heading"><h3 ref={first} tabIndex={-1}>{spec.title}</h3><button type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
    {spec.note && <p className="ic-muted">{spec.note}</p>}
    <form onSubmit={submit}><fieldset disabled={busy} className="ic-fieldset"><div className="ic-fields">
      {spec.fields.map(f => <label key={f.key} className={f.type === 'textarea' ? 'ic-wide' : ''}><span>{f.label}</span>
        {f.type === 'select' || f.type === 'multi' ? <select multiple={f.type === 'multi'} required={!f.optional}
          value={values[f.key] as string | string[]} onChange={e => setValues({ ...values, [f.key]: f.type === 'multi' ? [...e.target.selectedOptions].map(o => o.value) : e.target.value })}>
          {f.type !== 'multi' && <option value="">Select…</option>}{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.type === 'check' ? <input type="checkbox" checked={Boolean(values[f.key])} onChange={e => setValues({ ...values, [f.key]: e.target.checked })} />
        : f.type === 'textarea' ? <textarea rows={5} required={!f.optional} maxLength={16384} value={String(values[f.key])} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />
        : <input type={f.type || 'text'} min={f.min ?? 1} max={f.max} step={f.type === 'number' ? 1 : undefined} required={!f.optional}
          maxLength={f.key === 'name' ? 100 : 200} value={String(values[f.key])} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />}
      </label>)}
      <label className="ic-wide"><span>Reason</span><input required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Business reason or change ticket; omit patient information" /></label>
    </div><button className="ic-primary" type="submit">{busy ? 'Saving…' : 'Save change'}</button></fieldset></form>
  </section>;
}

export default function IntakeControl({ readOnly = false }: { readOnly?: boolean }) {
  const [tab, setTab] = useState(() => { const value = new URLSearchParams(location.search).get('intakeTab'); return !readOnly && tabs.some(t => t[0] === value) ? value! : 'operations'; });
  const [bootstrap, setBootstrap] = useState<Bootstrap>({ clients: [], staff: [], can_approve: false });
  const [clientId, setClientId] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: Data } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState('');
  const [token, setToken] = useState('');
  const key = `${tab}:${clientId}:${state}:${page}:${revision}`;
  const data = loaded?.key === key ? loaded.data : null;
  useEffect(() => {
    if (readOnly) return;
    const controller = new AbortController();
    api(new URLSearchParams({ tab: 'bootstrap' }), controller.signal).then(setBootstrap).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [readOnly]);
  useEffect(() => {
    const controller = new AbortController();
    if (tab === 'retention' && !clientId) return () => controller.abort();
    const params = new URLSearchParams({ tab, page: String(page) });
    if (clientId) params.set('client_id', clientId);
    if (state) params.set('state', state);
    api(params, controller.signal).then(result => { if (!controller.signal.aborted) { setLoaded({ key, data: result }); setError(''); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [key, tab, clientId, state, page]);
  useEffect(() => {
    if (tab !== 'operations' || busy || form) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') setRevision(v => v + 1); }, 30000);
    return () => window.clearInterval(id);
  }, [tab, busy, form]);
  function navigate(next: string) {
    setTab(next); setPage(1); setState(''); setForm(null); setSelected(''); setDetail(''); setError(''); setMessage(''); setToken('');
    const url = new URL(location.href); url.searchParams.set('intakeTab', next); history.replaceState(history.state, '', url);
  }
  async function save(body: Row) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(new URLSearchParams(), undefined, body);
      setToken(result.token || ''); setMessage(result.message || 'Change saved and audited.'); setForm(null); setRevision(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save was not confirmed. Refresh before retrying.'); }
    finally { setBusy(false); }
  }
  const clients = bootstrap.clients.map(c => ({ value: c.id, label: `${c.name} (${c.client_code})` }));
  const clientName = (id: unknown) => bootstrap.clients.find(c => c.id === id)?.name || text(id);
  const open = (spec: FormSpec) => { setError(''); setMessage(''); setToken(''); setForm(spec); };
  const partner = data?.rows?.find(p => p.id === selected);
  const partnerForm = (title: string, operation: string, fields: Field[], fixed?: Row, note?: string) => {
    if (partner) open({ title, action: 'partner', partner, operation, fields, fixed, note });
  };
  const reasonAction = (title: string, action: string, fixed: Row, note?: string) => open({ title, action, fixed, fields: [], note });
  const numberFields = (names: [string, string][], value?: Row) => names.map(([key, label]): Field => ({ key, label, type: 'number', min: key === 'rpo_seconds' ? 0 : 1, optional: true, value: value?.[key] == null ? '' : String(value[key]) }));

  return <section className="intake-control" aria-label="Intake Control">
    <header className="ic-heading"><div><small>ADMINISTRATION</small><h1>{readOnly ? 'Operations' : 'Intake Control'}</h1><p>Monitor intake and manage approved partner, access and retention controls.</p></div>
      <button disabled={busy} onClick={() => { setError(''); setRevision(v => v + 1); }}>Refresh</button></header>
    {!readOnly && <nav className="ic-tabs" aria-label="Intake sections">{tabs.map(([value, label]) => <button key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => navigate(value)} disabled={busy}>{label}</button>)}</nav>}
    {error && <p className="ic-error" role="alert">{error}</p>}{message && <p className="ic-success" role="status">{message}</p>}
    {token && <section className="ic-secret"><strong>New token — displayed once</strong><p>Store it in the approved secret manager. It will not appear in history.</p><code>{token}</code><button onClick={() => setToken('')}>Dismiss token</button></section>}
    {form && <ActionForm key={`${form.title}:${selected}`} spec={form} onSave={save} onClose={() => setForm(null)} busy={busy} />}
    <div className="ic-toolbar">
      {!readOnly && (tab === 'operations' || tab === 'retention') && <label>Client <select value={clientId} onChange={e => { setClientId(e.target.value); setPage(1); setForm(null); setDetail(''); }}><option value="">{tab === 'retention' ? 'Select a client' : 'All clients'}</option>{clients.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>}
      {(tab === 'operations' || tab === 'quarantine') && <label>Status <select value={state} onChange={e => { setState(e.target.value); setPage(1); }}><option value="">All</option>{(tab === 'operations' ? ['FAILED', 'REJECTED', 'QUEUED', 'PROCESSING', 'VALIDATING'] : ['OPEN', 'REVIEWED', 'REVALIDATING']).map(s => <option key={s}>{s}</option>)}</select></label>}
      {tab === 'partners' && <button className="ic-primary" onClick={() => open({ title: 'Create partner', action: 'create_partner', fields: [
        { key: 'name', label: 'Partner name' }, { key: 'client_id', label: 'Primary client', type: 'select', options: clients },
        { key: 'workflows', label: 'Workflows', type: 'multi', options: options(['835', '837']) }, { key: 'auth_mode', label: 'Authentication', type: 'select', options: options(['MTLS', 'TOKEN']), value: 'MTLS' }], note: 'New partners require explicit permissions and approved envelope routes before submission.' })}>Create partner</button>}
      {tab === 'retention' && clientId && bootstrap.can_approve && <>
        <button onClick={() => open({ title: 'Approve retention policy', action: 'retention', fixed: { client_id: clientId }, fields: [
          ...numberFields([['source_days', 'Private source retention (days)'], ['output_days', 'Confirmed output retention (days)'], ['quarantine_days', 'Reviewed quarantine retention (days)'], ['audit_days', 'Audit retention requirement (days)'], ['backup_days', 'Backup retention requirement (days)']], data?.policy),
          { key: 'evidence_reference', label: 'Approval / policy reference' }], note: 'Blank means retain. Saving does not delete files. Audit and backup periods must also be enforced by their infrastructure owners.' })}>Edit policy</button>
        <button onClick={() => open({ title: 'Create legal hold', action: 'hold', fixed: { client_id: clientId }, fields: [{ key: 'receipt_id', label: 'Receipt ID (blank = entire client)', optional: true }, { key: 'evidence_reference', label: 'Legal hold reference' }] })}>Add hold</button>
      </>}
      {tab === 'access' && bootstrap.can_approve && <>
        <button onClick={() => open({ title: 'Grant intake access', action: 'grant', fields: [
          { key: 'user_id', label: 'Staff member', type: 'select', options: bootstrap.staff.map(u => ({ value: u.id, label: u.email })) },
          { key: 'client_id', label: 'Client', type: 'select', options: clients }, { key: 'days', label: 'Expires in days', type: 'number', max: 365 },
          { key: 'can_download', label: 'Allow source / output downloads', type: 'check' }, { key: 'can_retry', label: 'Allow eligible retries', type: 'check' }], note: 'Grants include receipt metadata access. Superadmins also require grants; administrator status alone does not grant intake PHI access.' })}>Grant access</button>
        <button onClick={() => open({ title: 'Approve operating targets', action: 'targets', fields: [
          ...numberFields([['queue_age_seconds', 'Maximum queue age (seconds)'], ['rpo_seconds', 'Recovery point target (seconds)'], ['rto_seconds', 'Recovery time target (seconds)']], data?.targets),
          { key: 'evidence_reference', label: 'Approval / measurement reference' }], note: 'Record approved targets only. Setting a target does not certify measured production acceptance.' })}>Set targets</button>
      </>}
    </div>
    {tab === 'retention' && !clientId ? <p className="ic-empty">Select a client to review its policy and legal holds.</p> : !data ? <p className="ic-empty" role="status">{error ? 'Unable to load this view.' : 'Loading current data…'}</p> : <>
      {tab === 'operations' && <>
        <div className="ic-metrics">{[['Queued', data.counts?.QUEUED || 0], ['Processing', (data.counts?.PROCESSING || 0) + (data.counts?.VALIDATING || 0)], ['Failed', data.counts?.FAILED || 0], ['Completed', data.counts?.COMPLETED || 0], ['Duplicates', data.counts?.DUPLICATE || 0], ['Quarantine open', data.quarantine_open || 0]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></div>)}</div>
        <div className="ic-health"><span>Oldest queued: <b>{data.oldest_queue_seconds}s</b></span><span>Expired leases: <b>{data.expired_leases}</b></span><span>Unconfirmed delivery: <b>{data.delivery_unconfirmed}</b></span><span>Credentials due / expired: <b>{data.expiring_credentials}</b></span><span>Storage free: <b>{data.disk ? `${(data.disk.free_bytes / 2 ** 30).toFixed(1)} GiB` : 'Unavailable'}</b></span></div>
        <p className="ic-muted">Updated {time(data.as_of)} · Last intake worker activity {time(data.last_worker_heartbeat)} · Queue target {text(data.targets?.queue_age_seconds)} seconds</p>
      </>}
      {tab === 'retention' && <div className="ic-notice"><p>{data.scope}</p><p>Policy: {data.policy ? `Approved reference ${text(data.policy.evidence_reference)}` : 'Not configured — retain files.'} · Eligible private artifacts in preview: {data.eligible_sample_count} (up to 100)</p></div>}
      {tab === 'access' && <p className="ic-notice">Queue target: {text(data.targets?.queue_age_seconds)}s · RPO: {text(data.targets?.rpo_seconds)}s · RTO: {text(data.targets?.rto_seconds)}s · Approval: {text(data.targets?.evidence_reference)}</p>}
      <div className="ic-table-wrap"><table><thead><tr>{(tab === 'partners' ? ['Partner', 'Clients', 'Authentication', 'State', 'Actions'] : tab === 'retention' ? ['Hold', 'Receipt scope', 'Reference', 'Created', 'Actions'] : tab === 'access' ? ['Staff', 'Client', 'Permissions', 'Expires', 'Actions'] : ['Receipt', 'Client', 'State', 'Safe code', 'Received', 'Actions']).map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {!data.rows?.length && <tr><td colSpan={6} className="ic-empty">No records in this view.</td></tr>}
        {data.rows?.map(row => <tr key={String(row.id)}>
          {tab === 'partners' ? <><td><strong>{text(row.name)}</strong></td><td>{(row.client_ids as string[]).map(clientName).join(', ')}</td><td>{text(row.auth_mode)}</td><td>{row.active ? 'Active' : 'Suspended'}</td><td><button onClick={() => { setSelected(String(row.id)); setForm(null); }}>Manage</button></td></>
          : tab === 'retention' ? <><td>#{text(row.id)}</td><td>{row.receipt_id ? text(row.receipt_id) : 'All client artifacts'}</td><td>{text(row.reference)}</td><td>{time(row.created_at)}</td><td>{row.released_at ? `Released ${time(row.released_at)}` : bootstrap.can_approve && <button onClick={() => reasonAction('Release legal hold', 'release_hold', { id: row.id })}>Release hold</button>}</td></>
          : tab === 'access' ? <><td>{text(row.user__email)}</td><td>{clientName(row.client_id)}</td><td>Read{row.can_download ? ', download' : ''}{row.can_retry ? ', retry' : ''}</td><td>{time(row.expires_at)}</td><td>{row.revoked_at ? 'Revoked' : bootstrap.can_approve && <button onClick={() => reasonAction('Revoke intake grant', 'revoke_grant', { id: row.id })}>Revoke</button>}</td></>
          : <><td><code>{text(row.receipt_id || row.id)}</code></td><td>{clientName(row.receipt__client_id || row.client_id)}</td><td><span className="ic-badge">{text(row.state)}</span></td><td>{text(row.safe_code || row.safe_error_code)}</td><td>{time(row.created_at || row.received_at)}</td><td className="ic-actions">
            {!readOnly && <button onClick={() => setDetail(String(row.receipt_id || row.id))}>Receipt details</button>}
            {!readOnly && tab === 'operations' && row.state === 'FAILED' && <button onClick={() => open({ title: 'Record recovery review', action: 'recovery_review', fixed: { receipt_id: row.id }, fields: [{ key: 'decision', label: 'Finding', type: 'select', options: options(['INVESTIGATING', 'DELIVERY_CONFIRMED', 'NO_DELIVERY_CONFIRMED']) }, { key: 'evidence_reference', label: 'Reconciliation evidence / ticket' }], note: 'Records evidence only. It does not resend output or override completion. Use receipt details for a safe eligible retry.' })}>Review recovery</button>}
            {tab === 'quarantine' && <><button onClick={() => reasonAction('Record quarantine review', 'quarantine_review', { receipt_id: row.receipt_id })}>Mark reviewed</button><button onClick={() => reasonAction('Revalidate quarantined file', 'quarantine_revalidate', { receipt_id: row.receipt_id }, 'Runs normal validation again. Requires a client retry grant and a safe eligible workflow; invalid content is never accepted by override.')}>Revalidate</button></>}
          </td></>}
        </tr>)}
      </tbody></table></div>
      <div className="ic-pagination"><span>{data.total || 0} records · Page {data.page || 1} of {data.pages || 1}</span><button disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>Previous</button><button disabled={page >= (data.pages || 1) || busy} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}
    {detail && <section><div className="ic-heading"><h3>Receipt details — explicit client access required</h3><button onClick={() => setDetail('')}>Close details</button></div><TransferDetail receiptId={detail} onRetried={() => setRevision(v => v + 1)} /></section>}
    {partner && tab === 'partners' && <section className="ic-partner"><div className="ic-heading"><h2>{text(partner.name)}</h2><button onClick={() => { setSelected(''); setToken(''); }}>Close partner</button></div>
      <div className="ic-toolbar">
        <button onClick={() => partnerForm(partner.active ? 'Suspend partner' : 'Activate partner', partner.active ? 'SUSPEND' : 'ACTIVATE', [])}>{partner.active ? 'Suspend' : 'Activate'}</button>
        <button onClick={() => partnerForm('Approved client scopes', 'CLIENTS', [{ key: 'client_ids', label: 'Permitted clients', type: 'multi', options: clients, value: partner.client_ids as string[] }], undefined, 'Multi-client submissions must supply an explicit client_id matching an approved envelope route. Removing a client revokes new reads and queued processing for that client.')}>Client scopes</button>
        <button onClick={() => partnerForm('Partner quotas', 'QUOTAS', ['requests_per_minute', 'concurrent_jobs', 'storage_limit_bytes'].map(key => ({ key, label: ({ requests_per_minute: 'Requests per minute', concurrent_jobs: 'Concurrent processing jobs', storage_limit_bytes: 'Retained private bytes limit' } as Record<string, string>)[key], type: 'number', value: String(partner[key]) })))}>Quotas</button>
        <button onClick={() => partnerForm('Partner permissions', 'PERMISSIONS', [{ key: 'permissions', label: 'Workflow permissions', type: 'multi', optional: true,
          options: (partner.workflows as string[]).flatMap(w => ['SUBMIT', 'READ', 'DOWNLOAD'].map(a => ({ value: `${w}:${a}`, label: `${w} · ${a}` }))), value: (partner.permissions as Row[]).map(p => `${p.workflow}:${p.action}`) }])}>Permissions</button>
        <button onClick={() => partnerForm('Authentication policy', 'POLICY', [{ key: 'auth_mode', label: 'Authentication', type: 'select', options: options(['TOKEN', 'MTLS']), value: String(partner.auth_mode) }, { key: 'routing_required', label: 'Require approved envelope routing', type: 'check', value: true }])}>Authentication</button>
        <button onClick={() => partnerForm('Register client certificate', 'CERTIFICATE', [{ key: 'certificate', label: 'Public leaf certificate (PEM)', type: 'textarea' }, { key: 'reference', label: 'Credential reference', optional: true }, { key: 'replaces', label: 'Replacement for credential ID', optional: true }], undefined, 'Paste the public client-auth certificate only. Private keys stay with the partner. Existing credentials remain active until retired or revoked.')}>Add certificate</button>
        <button onClick={() => partnerForm('Issue token', 'TOKEN', [{ key: 'days', label: 'Validity in days', type: 'number', max: 90 }, { key: 'reference', label: 'Credential reference', optional: true }, { key: 'replaces', label: 'Replacement for credential ID', optional: true }])}>Issue token</button>
        <button onClick={() => partnerForm('Approve envelope route', 'ROUTE', [{ key: 'client_id', label: 'Client', type: 'select', options: clients.filter(c => (partner.client_ids as string[]).includes(c.value)) }, { key: 'workflow', label: 'Workflow', type: 'select', options: options(partner.workflows as string[]) },
          ...[['isa_sender_qualifier', 'ISA sender qualifier'], ['isa_sender', 'ISA sender ID'], ['isa_receiver_qualifier', 'ISA receiver qualifier'], ['isa_receiver', 'ISA receiver ID'], ['isa_version', 'ISA version'], ['gs_sender', 'GS sender'], ['gs_receiver', 'GS receiver'], ['gs_version', 'GS version'], ['st_version', 'ST version (blank when absent)']].map(([key, label]) => ({ key, label, optional: key === 'st_version' }))])}>Add route</button>
      </div><p className="ic-muted">Retained private storage: {(Number(partner.stored_bytes) / 2 ** 20).toFixed(2)} MiB · Limits: {text(partner.requests_per_minute)} requests/min, {text(partner.concurrent_jobs)} concurrent jobs.</p>
      <h3>Credentials</h3><div className="ic-table-wrap"><table><thead><tr><th>Credential</th><th>Type</th><th>Reference</th><th>Expires</th><th>State / actions</th></tr></thead><tbody>{(partner.credentials as Row[]).map(c => <tr key={String(c.id)}><td><code>{text(c.id)}</code></td><td>{text(c.kind)}</td><td>{text(c.reference)}</td><td>{time(c.expires_at)}</td><td>{c.active ? <><button onClick={() => partnerForm('Retire credential', 'RETIRE', [], { credential_id: c.id })}>Retire</button><button onClick={() => partnerForm('Revoke credential', 'REVOKE', [], { credential_id: c.id })}>Revoke</button></> : c.revoked_at ? 'Revoked' : 'Retired'}</td></tr>)}</tbody></table></div>
      <h3>Envelope routes</h3><div className="ic-table-wrap"><table><thead><tr><th>Client</th><th>Workflow</th><th>ISA sender → receiver</th><th>GS sender → receiver</th><th>Versions (ISA / GS / ST)</th><th>State</th></tr></thead><tbody>{(partner.routes as Row[]).map(r => <tr key={String(r.id)}><td>{clientName(r.client_id)}</td><td>{text(r.workflow)}</td><td>{text(r.isa_sender_qualifier)}:{text(r.isa_sender)} → {text(r.isa_receiver_qualifier)}:{text(r.isa_receiver)}</td><td>{text(r.gs_sender)} → {text(r.gs_receiver)}</td><td>{text(r.isa_version)} / {text(r.gs_version)} / {text(r.st_version)}</td><td>{r.active ? <button onClick={() => partnerForm('Retire envelope route', 'RETIRE_ROUTE', [], { route_id: r.id })}>Retire</button> : 'Retired'}</td></tr>)}</tbody></table></div>
    </section>}
  </section>;
}
