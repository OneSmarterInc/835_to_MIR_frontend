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
type Field = { key: string; label: string; type?: 'text' | 'number' | 'select' | 'multi' | 'check' | 'textarea' | 'storage';
  options?: { value: string; label: string }[]; value?: string | string[] | boolean; optional?: boolean; min?: number; max?: number };
type FormSpec = { title: string; action: string; fixed?: Row; fields: Field[]; partner?: Row; operation?: string; note?: string };
type Values = Record<string, string | string[] | boolean>;
const tabs = [['operations', 'Operations'], ['partners', 'Partners'], ['quarantine', 'Quarantine'],
  ['retention', 'Retention & holds'], ['access', 'Access & targets']] as const;
const endpoint = '/admin-panel/api/intake-control/';
const text = (v: unknown) => v == null || v === '' ? '—' : String(v);
const time = (v: unknown) => v ? new Date(String(v)).toLocaleString() : '—';
const options = (values: string[]) => values.map(value => ({ value, label: value }));
const storageUnits = { B: 1, KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3, TB: 1000 ** 4 };
type StorageUnit = keyof typeof storageUnits;
function storageValue(bytes: number) {
  const unit = (Object.keys(storageUnits) as StorageUnit[]).reverse().find(u => bytes >= storageUnits[u]) || 'B';
  return { amount: String(bytes / storageUnits[unit]), unit };
}
const storageText = (bytes: unknown) => { const value = storageValue(Number(bytes)); return `${value.amount} ${value.unit}`; };
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
  const [values, setValues] = useState<Values>(() => Object.fromEntries(spec.fields.map(f => [f.key,
    f.type === 'storage' ? storageValue(Number(f.value)).amount : f.value ?? (f.type === 'check' ? false : f.type === 'multi' ? [] : '')])));
  const [units, setUnits] = useState<Record<string, StorageUnit>>(() => Object.fromEntries(spec.fields.filter(f => f.type === 'storage').map(f => [f.key, storageValue(Number(f.value)).unit])));
  const [validationError, setValidationError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [routes, setRoutes] = useState<Record<string, string>[]>([]);
  const [routeFiles, setRouteFiles] = useState<Partial<Record<'835' | '837', File>>>({});
  const [extractionMessage, setExtractionMessage] = useState('');
  const extraction = useRef<AbortController | null>(null);
  useEffect(() => () => extraction.current?.abort(), []);
  async function extractFiles(files: Partial<Record<'835' | '837', File>>) {
    setRouteFiles(files);
    extraction.current?.abort();
    const controller = new AbortController(); extraction.current = controller;
    setValidationError(''); setExtractionMessage(''); setRoutes([]); setExtracting(false);
    setValues(current => ({ ...current, ...Object.fromEntries(spec.fields.filter(f => f.key !== 'client_id').map(f => [f.key, ''])) }));
    if (!Object.keys(files).length) return;
    if (Object.values(files).some(file => !file.size || file.size > 10 * 1024 * 1024)) {
      setValidationError('Each 835 or 837 file must be nonempty and no larger than 10 MiB.'); return;
    }
    setExtracting(true);
    try {
      const body = new FormData(); body.append('action', 'route_preview'); body.append('partner_id', String(spec.partner?.id));
      Object.entries(files).forEach(([workflow, file]) => body.append(`file_${workflow}`, file));
      const response = await fetch(endpoint, { method: 'POST', credentials: 'include', cache: 'no-store', body, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not read the file envelope.');
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.routes) || !result.routes.length) throw new Error('No supported route was found.');
      setRoutes(result.routes);
      if (result.routes.length === 1) {
        setValues(current => ({ ...current, ...result.routes[0] }));
        setExtractionMessage('Fields filled from the file. Review the client and values, then save.');
      } else setExtractionMessage(`${result.routes.length} routes found. Review every route below and select the client they belong to. Save approves all listed routes together.`);
    } catch (issue) {
      if (!controller.signal.aborted) setValidationError(issue instanceof Error ? issue.message : 'Could not read the file envelope.');
    } finally { if (!controller.signal.aborted) setExtracting(false); }
  }
  const [reason, setReason] = useState('');
  const first = useRef<HTMLHeadingElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (extracting || (Object.keys(routeFiles).length > 0 && routes.length === 0)) return;
    setValidationError('');
    const missing = spec.fields.find(f => f.type === 'multi' && !f.optional && !(values[f.key] as string[]).length);
    if (missing) { setValidationError(`Select at least one option for ${missing.label.toLowerCase()}.`); return; }
    const data: Row = Object.fromEntries(Object.entries(values).map(([key, value]) =>
      [key, integerKeys.has(key) ? value === '' ? null : Number(value) : value]));
    for (const field of spec.fields.filter(f => f.type === 'storage')) {
      const bytes = Number(values[field.key]) * storageUnits[units[field.key]];
      if (!Number.isFinite(bytes) || bytes < 1 || bytes > 10 ** 15) {
        setValidationError('Storage limit must be between 1 byte and 1,000 TB.'); return;
      }
      data[field.key] = Math.round(bytes);
    }
    if (spec.operation) {
      if (spec.operation === 'ROUTE' && routes.length > 1) {
        await onSave({ action: 'partner', partner_id: spec.partner?.id, operation: 'ROUTES',
          data: { client_id: values.client_id, routes }, reason });
        return;
      }
      if (spec.operation === 'PERMISSIONS') {
        data.permissions = (data.permissions as string[]).map(value => { const [workflow, action] = value.split(':'); return { workflow, action, channel: 'PARTNER' }; });
      }
      await onSave({ action: 'partner', partner_id: spec.partner?.id, operation: spec.operation, data: { ...spec.fixed, ...data }, reason });
    } else await onSave({ action: spec.action, ...spec.fixed, ...data, reason });
  }
  return <section className="ic-form-panel" aria-label={spec.title}>
    <div className="ic-heading"><h3 ref={first} tabIndex={-1}>{spec.title}</h3><button type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
    {spec.note && <p className="ic-muted">{spec.note}</p>}
    {spec.operation === 'ROUTE' && <div className="ic-route-import">
      <div className="ic-route-files">{(['835', '837'] as const).map(workflow => <div key={workflow}>
        <label><span>{workflow} file</span><input type="file" aria-label={`${workflow} file`} disabled={busy || extracting || !((spec.partner?.workflows as string[] | undefined) ?? []).includes(workflow)} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void extractFiles({ ...routeFiles, [workflow]: file });
        }} /></label>
        {routeFiles[workflow] && <div className="ic-route-file-name"><span>{routeFiles[workflow]?.name}</span><button type="button" disabled={busy || extracting} onClick={() => {
          const files = { ...routeFiles }; delete files[workflow]; void extractFiles(files);
        }}>Remove {workflow}</button></div>}
      </div>)}</div>
      <p className="ic-muted">Choose a full 835 file, a full 837 file, or both (up to 10 MiB each). Only envelope details are inspected; these files are not added to processing. Both files must belong to the client selected below. You can also enter a single route manually.</p>
      {extracting && <p role="status">Reading envelope…</p>}
      {extractionMessage && <p role="status">{extractionMessage}</p>}
      {routes.length > 1 && <div className="ic-table-wrap"><table aria-label="Envelope routes to approve"><thead><tr>
        <th>Workflow</th><th>ISA sender → receiver</th><th>GS sender → receiver</th><th>Versions (ISA / GS / ST)</th>
      </tr></thead><tbody>{routes.map((route, index) => <tr key={index}><td>{route.workflow}</td>
        <td>{route.isa_sender_qualifier}:{route.isa_sender} → {route.isa_receiver_qualifier}:{route.isa_receiver}</td>
        <td>{route.gs_sender} → {route.gs_receiver}</td><td>{route.isa_version} / {route.gs_version} / {route.st_version || '—'}</td>
      </tr>)}</tbody></table></div>}
    </div>}
    {validationError && <p role="alert" className="ic-error">{validationError}</p>}
    <form onSubmit={submit}><fieldset disabled={busy || extracting} className="ic-fieldset"><div className="ic-fields">
      {spec.fields.filter(f => routes.length <= 1 || f.key === 'client_id').map(f => f.type === 'multi' ? <fieldset key={f.key} className="ic-choices ic-wide"><legend>{f.label}</legend><div className="ic-choice-grid">
        {f.options?.map(o => <label key={o.value} className="ic-choice"><input type="checkbox" checked={(values[f.key] as string[]).includes(o.value)} onChange={e => {
          const checked = e.target.checked;
          setValues(current => ({ ...current, [f.key]: checked ? [...(current[f.key] as string[]), o.value] : (current[f.key] as string[]).filter(v => v !== o.value) }));
        }} /><span>{o.label}</span></label>)}
      </div></fieldset> : f.type === 'storage' ? <fieldset key={f.key} className="ic-storage-field"><legend>{f.label}</legend><div className="ic-storage-input">
        <input aria-label={f.label} type="number" required min={1 / storageUnits[units[f.key]]} max={10 ** 15 / storageUnits[units[f.key]]} step="any" value={String(values[f.key])} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />
        <select aria-label={`${f.label} unit`} value={units[f.key]} onChange={e => setUnits({ ...units, [f.key]: e.target.value as StorageUnit })}>{Object.keys(storageUnits).map(unit => <option key={unit}>{unit}</option>)}</select>
      </div><small>1 GB = 1,000 MB · 1 TB = 1,000 GB</small></fieldset> : <label key={f.key} className={f.type === 'textarea' ? 'ic-wide' : ''}><span>{f.label}</span>
        {f.type === 'select' ? <select required={!f.optional}
          value={values[f.key] as string} onChange={e => setValues({ ...values, [f.key]: e.target.value })}>
          <option value="">Select…</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.type === 'check' ? <input type="checkbox" checked={Boolean(values[f.key])} onChange={e => setValues({ ...values, [f.key]: e.target.checked })} />
        : f.type === 'textarea' ? <textarea rows={5} required={!f.optional} maxLength={16384} value={String(values[f.key])} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />
        : <input type={f.type || 'text'} min={f.min ?? 1} max={f.max} step={f.type === 'number' ? 1 : undefined} required={!f.optional}
          maxLength={f.key === 'name' ? 100 : 200} value={String(values[f.key])} onChange={e => setValues({ ...values, [f.key]: e.target.value })} />}
      </label>)}
      <label className="ic-wide"><span>Reason</span><input required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Business reason or change ticket; omit patient information" /></label>
    </div><button className="ic-primary" type="submit" disabled={Object.keys(routeFiles).length > 0 && routes.length === 0}>{busy ? 'Saving…' : routes.length > 1 ? `Approve ${routes.length} routes` : 'Save change'}</button></fieldset></form>
  </section>;
}

function TokenNotice({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  async function copyToken() {
    if (copyState === 'copying') return;
    setCopyState('copying');
    try {
      await window.navigator.clipboard.writeText(token);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }
  return <section className="ic-secret" aria-label="New token">
    <strong>New token — displayed once</strong>
    <p>Store it in the approved secret manager. It will not appear in history.</p>
    <code>{token}</code>
    <div className="ic-actions">
      <button type="button" className="ic-primary" onClick={() => void copyToken()} disabled={copyState === 'copying'}>
        {copyState === 'copying' ? 'Copying…' : copyState === 'copied' ? 'Copied!' : 'Copy token'}
      </button>
      <button type="button" onClick={onDismiss}>Dismiss token</button>
    </div>
    <p role="status" className="ic-muted">
      {copyState === 'copied' ? 'Token copied to clipboard.' : copyState === 'failed'
        ? 'Could not copy automatically. Select the token above and copy it manually.' : ''}
    </p>
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
  const partnerHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected) {
      partnerHeading.current?.focus({ preventScroll: true });
      partnerHeading.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selected]);
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
    {partner && tab === 'partners' && <section className="ic-partner ic-partner-selected" aria-label="Selected partner"><div className="ic-heading"><h2 ref={partnerHeading} tabIndex={-1}>{text(partner.name)}</h2><button onClick={() => { setSelected(''); setToken(''); setForm(null); }}>Close partner</button></div>
      <div className="ic-toolbar">
        <button onClick={() => partnerForm(partner.active ? 'Suspend partner' : 'Activate partner', partner.active ? 'SUSPEND' : 'ACTIVATE', [])}>{partner.active ? 'Suspend' : 'Activate'}</button>
        <button onClick={() => partnerForm('Approved client scopes', 'CLIENTS', [{ key: 'client_ids', label: 'Permitted clients', type: 'multi', options: clients, value: partner.client_ids as string[] }], undefined, 'Multi-client submissions must supply an explicit client_id matching an approved envelope route. Removing a client revokes new reads and queued processing for that client.')}>Client scopes</button>
        <button onClick={() => partnerForm('Partner quotas', 'QUOTAS', [{ key: 'requests_per_minute', label: 'Requests per minute', type: 'number', max: 10000, value: String(partner.requests_per_minute) }, { key: 'concurrent_jobs', label: 'Concurrent processing jobs', type: 'number', max: 100, value: String(partner.concurrent_jobs) }, { key: 'storage_limit_bytes', label: 'Partner storage limit', type: 'storage', value: String(partner.storage_limit_bytes) }])}>Quotas</button>
        <button onClick={() => partnerForm('Partner permissions', 'PERMISSIONS', [{ key: 'permissions', label: 'Workflow permissions', type: 'multi', optional: true,
          options: (partner.workflows as string[]).flatMap(w => ['SUBMIT', 'READ', 'DOWNLOAD'].map(a => ({ value: `${w}:${a}`, label: `${w} · ${a}` }))), value: (partner.permissions as Row[]).map(p => `${p.workflow}:${p.action}`) }])}>Permissions</button>
        <button onClick={() => partnerForm('Authentication policy', 'POLICY', [{ key: 'auth_mode', label: 'Authentication', type: 'select', options: options(['TOKEN', 'MTLS']), value: String(partner.auth_mode) }, { key: 'routing_required', label: 'Require approved envelope routing', type: 'check', value: Boolean(partner.routing_required) }])}>Authentication</button>
        <button onClick={() => partnerForm('Register client certificate', 'CERTIFICATE', [{ key: 'certificate', label: 'Public leaf certificate (PEM)', type: 'textarea' }, { key: 'reference', label: 'Credential reference', optional: true }, { key: 'replaces', label: 'Replacement for credential ID', optional: true }], undefined, 'Paste the public client-auth certificate only. Private keys stay with the partner. Existing credentials remain active until retired or revoked.')}>Add certificate</button>
        <button onClick={() => partnerForm('Issue token', 'TOKEN', [{ key: 'days', label: 'Validity in days', type: 'number', max: 90 }, { key: 'reference', label: 'Credential reference', optional: true }, { key: 'replaces', label: 'Replacement for credential ID', optional: true }])}>Issue token</button>
        <button onClick={() => partnerForm('Approve envelope route', 'ROUTE', [{ key: 'client_id', label: 'Client', type: 'select', options: clients.filter(c => (partner.client_ids as string[]).includes(c.value)), value: (partner.client_ids as string[]).length === 1 ? (partner.client_ids as string[])[0] : '' }, { key: 'workflow', label: 'Workflow', type: 'select', options: options(partner.workflows as string[]) },
          ...[['isa_sender_qualifier', 'ISA sender qualifier'], ['isa_sender', 'ISA sender ID'], ['isa_receiver_qualifier', 'ISA receiver qualifier'], ['isa_receiver', 'ISA receiver ID'], ['isa_version', 'ISA version'], ['gs_sender', 'GS sender'], ['gs_receiver', 'GS receiver'], ['gs_version', 'GS version'], ['st_version', 'ST version (blank when absent)']].map(([key, label]) => ({ key, label, optional: key === 'st_version' }))])}>Add route</button>
      </div>
      <dl className="ic-partner-settings" aria-label="Saved partner settings">
        <div><dt>State</dt><dd>{partner.active ? 'Active' : 'Suspended'}</dd></div>
        <div><dt>Approved clients</dt><dd>{(partner.client_ids as string[]).map(clientName).join(', ') || 'None'}</dd></div>
        <div><dt>Authentication</dt><dd>{text(partner.auth_mode)}</dd></div>
        <div><dt>Envelope routing</dt><dd>{partner.routing_required || partner.auth_mode === 'MTLS' ? 'Required' : 'Optional'}</dd></div>
        <div><dt>Requests per minute</dt><dd>{text(partner.requests_per_minute)}</dd></div>
        <div><dt>Concurrent jobs</dt><dd>{text(partner.concurrent_jobs)}</dd></div>
        <div><dt>Storage limit</dt><dd>{storageText(partner.storage_limit_bytes)}</dd></div>
        <div><dt>Retained storage</dt><dd>{storageText(partner.stored_bytes)}</dd></div>
        {(partner.workflows as string[]).map(workflow => <div key={workflow}><dt>{workflow} permissions</dt><dd>{(partner.permissions as Row[]).filter(p => p.workflow === workflow).map(p => text(p.action)).join(', ') || 'No permissions'}</dd></div>)}
      </dl><p className="ic-muted">Saved settings. Edits take effect after you save the change.</p>
    </section>}
    {error && <p className="ic-error" role="alert">{error}</p>}{message && <p className="ic-success" role="status">{message}</p>}
    {token && <TokenNotice key={token} token={token} onDismiss={() => setToken('')} />}
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
    {form && <ActionForm key={`${form.title}:${selected}`} spec={form} onSave={save} onClose={() => setForm(null)} busy={busy} />}
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
    {partner && tab === 'partners' && <section className="ic-partner" aria-label="Partner credentials and routes">
      <h3>Credentials</h3><div className="ic-table-wrap"><table><thead><tr><th>Credential</th><th>Type</th><th>Reference</th><th>Expires</th><th>State / actions</th></tr></thead><tbody>{(partner.credentials as Row[]).map(c => <tr key={String(c.id)}><td><code>{text(c.id)}</code></td><td>{text(c.kind)}</td><td>{text(c.reference)}</td><td>{time(c.expires_at)}</td><td>{c.active ? <><button onClick={() => partnerForm('Retire credential', 'RETIRE', [], { credential_id: c.id })}>Retire</button><button onClick={() => partnerForm('Revoke credential', 'REVOKE', [], { credential_id: c.id })}>Revoke</button></> : c.revoked_at ? 'Revoked' : 'Retired'}</td></tr>)}</tbody></table></div>
      <h3>Envelope routes</h3><div className="ic-table-wrap"><table><thead><tr><th>Client</th><th>Workflow</th><th>ISA sender → receiver</th><th>GS sender → receiver</th><th>Versions (ISA / GS / ST)</th><th>State</th></tr></thead><tbody>{(partner.routes as Row[]).map(r => <tr key={String(r.id)}><td>{clientName(r.client_id)}</td><td>{text(r.workflow)}</td><td>{text(r.isa_sender_qualifier)}:{text(r.isa_sender)} → {text(r.isa_receiver_qualifier)}:{text(r.isa_receiver)}</td><td>{text(r.gs_sender)} → {text(r.gs_receiver)}</td><td>{text(r.isa_version)} / {text(r.gs_version)} / {text(r.st_version)}</td><td>{r.active ? <button onClick={() => partnerForm('Retire envelope route', 'RETIRE_ROUTE', [], { route_id: r.id })}>Retire</button> : 'Retired'}</td></tr>)}</tbody></table></div>
    </section>}
  </section>;
}
