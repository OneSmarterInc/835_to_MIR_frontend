import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TimeDisplay from '../../components/TimeDisplay';
import ClientSelectDropdown from './ClientSelectDropdown';
import OffboardedClientBanner from './OffboardedClientBanner';
import { canonicalTimeZone, EASTERN_TIME_ZONE, scheduleTimeZoneOptions, timeZoneDisplayName } from '../../utils/timezone';
import './SftpAutomationView.css';

const OPERATIONS = {
  '837': [
    { direction: 'INCOMING', label: 'Incoming', help: 'Fetch, validate, index and archive 837 files from inbound SFTP.' },
    { direction: 'OUTGOING', label: 'Outgoing', help: 'Send queued 837 files to the configured outbound SFTP folder.' },
  ],
  '835': [
    { direction: 'INCOMING', label: 'Incoming', help: 'Fetch, validate and archive 835 files. Invalid files remain on SFTP for review.' },
    { direction: 'PROCESSING', label: 'Processing', help: 'Convert validated 835 files into MIR and queue the MIR output for delivery.' },
  ],
  MIR: [{ direction: 'OUTGOING', label: 'Outgoing', help: 'Deliver queued MIR files and remove local outbound copies after confirmation.' }],
  RECON: [{ direction: 'INCOMING', label: 'Incoming', help: 'Fetch, process and archive RECON files from inbound SFTP.' }],
};
const TYPES = ['837', '835', 'MIR', 'RECON'];
const keyFor = (type, direction) => `${type}:${direction}`;
const statusClass = status => status === 'SUCCESS' ? 'ok' : status === 'FAILED' || status === 'SKIPPED' ? 'bad' : 'work';

function headers(extra = {}) {
  const token = localStorage.getItem('onesmarter_admin_token');
  return token ? { ...extra, Authorization: `Token ${token}`, 'X-Admin-Screen': 'sftp-automation' } : { ...extra, 'X-Admin-Screen': 'sftp-automation' };
}
async function apiJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: headers(options.headers) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function FileList({ files, empty = '—' }) {
  return files?.length ? <div className="sftp-auto-files">{files.map((file, index) => <span key={`${file}-${index}`}>{file}</span>)}</div> : <span className="sftp-auto-empty">{empty}</span>;
}

export default function SftpAutomationView({ clients = [], activeClientId = '', onSelectClient }) {
  const [clientId, setClientId] = useState(activeClientId || '');
  const [type, setType] = useState('837');
  const [direction, setDirection] = useState('INCOMING');
  const [schedules, setSchedules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState(null);
  const initializedClient = useRef('');
  const client = clients.find(item => String(item.id) === String(clientId));
  const offboarded = String(client?.stage || '').toLowerCase() === 'offboarded';
  const operation = OPERATIONS[type].find(item => item.direction === direction) || OPERATIONS[type][0];
  const operationKey = keyFor(type, operation.direction);
  const zones = useMemo(() => {
    const values = scheduleTimeZoneOptions();
    const zone = canonicalTimeZone(client?.timezone);
    if (zone && !values.some(item => item.value === zone)) values.push({ value: zone, label: `${timeZoneDisplayName(zone)} (${zone})` });
    return values;
  }, [client?.timezone]);

  useEffect(() => {
    if (activeClientId) setClientId(activeClientId);
    else if (!clientId && clients.length) setClientId(String(clients[0].id));
  }, [activeClientId, clientId, clients]);

  const load = useCallback(async (quiet = false) => {
    if (!clientId) return;
    if (!quiet) setLoading(true);
    try {
      const data = await apiJson(`/edi835/api/admin/sftp-automation/?${new URLSearchParams({ client_id: clientId, limit: '200' })}`);
      setSchedules(data.schedules || []); setRuns(data.runs || []);
      if (initializedClient.current !== String(clientId)) {
        const next = {};
        TYPES.forEach(fileType => OPERATIONS[fileType].forEach(item => {
          const saved = (data.schedules || []).find(row => row.automation_type === fileType && row.direction === item.direction);
          next[keyFor(fileType, item.direction)] = { run_time: saved?.run_time || '09:00', timezone: canonicalTimeZone(saved?.timezone || client?.timezone || EASTERN_TIME_ZONE), enabled: saved?.enabled !== false };
        }));
        initializedClient.current = String(clientId); setForms(next);
      }
    } catch (error) { if (!quiet) setMessage({ kind: 'bad', text: error.message }); }
    finally { if (!quiet) setLoading(false); }
  }, [clientId, client?.timezone]);
  useEffect(() => { load(); }, [load]);

  const chooseClient = value => { initializedClient.current = ''; setClientId(value); onSelectClient?.(value); setMessage(null); };
  const chooseType = value => { setType(value); setDirection(OPERATIONS[value][0].direction); setMessage(null); };
  const form = forms[operationKey] || { run_time: '09:00', timezone: EASTERN_TIME_ZONE, enabled: true };
  const saved = schedules.find(row => row.automation_type === type && row.direction === operation.direction);
  const update = (field, value) => setForms(current => ({ ...current, [operationKey]: { ...form, [field]: value } }));
  const save = async () => {
    if (!clientId || saving) return;
    setSaving(operationKey); setMessage(null);
    try {
      const data = await apiJson('/edi835/api/admin/sftp-automation/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, automation_type: type, direction: operation.direction, ...form, timezone: canonicalTimeZone(form.timezone) }) });
      setSchedules(current => [...current.filter(row => !(row.automation_type === type && row.direction === operation.direction)), data.schedule]);
      setMessage({ kind: 'ok', text: `${type} ${operation.label.toLowerCase()} schedule saved.` });
      await load(true);
    } catch (error) { setMessage({ kind: 'bad', text: error.message }); }
    finally { setSaving(''); }
  };

  const matrixCell = (fileType, desired) => {
    const candidates = OPERATIONS[fileType].filter(item => desired === 'INCOMING' ? item.direction === 'INCOMING' : item.direction !== 'INCOMING');
    if (!candidates.length) return <span className="sftp-auto-dash">—</span>;
    return <div className="sftp-auto-matrix-stack">{candidates.map(item => {
      const row = schedules.find(schedule => schedule.automation_type === fileType && schedule.direction === item.direction);
      return <button key={item.direction} type="button" onClick={() => { setType(fileType); setDirection(item.direction); }}><b>{item.label}</b><span>{row ? `${row.run_time} · ${row.enabled ? 'Enabled' : 'Disabled'}` : 'Not scheduled'}</span></button>;
    })}</div>;
  };

  return <section className="view on sftp-auto-view table-screen">
    <div className="sftp-auto-title"><div><div className="eyebrow">SCHEDULED FILE TRANSFER</div><h1>SFTP Automation</h1><p>Set independent daily schedules for every supported inbound, processing and outbound operation.</p></div><div className="sftp-auto-client"><label>Client</label><ClientSelectDropdown clients={clients} value={clientId} onChange={chooseClient} fullWidth /></div></div>
    <OffboardedClientBanner client={client} detail="Automation schedules are locked. Existing run history remains available." />
    <div className="sftp-auto-shell">
      <nav className="sftp-auto-nav" aria-label="Automation file types">{TYPES.map(value => <button key={value} className={type === value ? 'on' : ''} onClick={() => chooseType(value)}><span className="sftp-auto-nav-dot" />{value}</button>)}</nav>
      <main className="sftp-auto-panel">
        <header><div><div className="eyebrow">{type} AUTOMATION</div><h2>{type} schedules</h2><p>{operation.help}</p></div><span className={`sftp-auto-state ${saved?.enabled ? 'configured' : ''}`}>{saved ? saved.enabled ? 'ENABLED' : 'DISABLED' : 'NOT SCHEDULED'}</span></header>
        {OPERATIONS[type].length > 1 && <div className="sftp-auto-tabs">{OPERATIONS[type].map(item => <button key={item.direction} className={operation.direction === item.direction ? 'on' : ''} onClick={() => setDirection(item.direction)}>{item.label}</button>)}</div>}
        <div className="sftp-auto-form">
          <label><span>Run time</span><input type="time" value={form.run_time} disabled={offboarded} onChange={event => update('run_time', event.target.value)} /></label>
          <label><span>Timezone</span><select value={form.timezone} disabled={offboarded} onChange={event => update('timezone', event.target.value)}>{zones.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label>
          <label className="sftp-auto-toggle"><input type="checkbox" checked={form.enabled !== false} disabled={offboarded} onChange={event => update('enabled', event.target.checked)} /><span><b>Enable this schedule</b><small>The worker will execute it daily at the selected local time.</small></span></label>
          <div className="sftp-auto-next"><span>Next scheduled run</span><b>{saved?.next_run_at && saved.enabled ? <TimeDisplay value={saved.next_run_at} /> : 'Not scheduled'}</b></div>
          <button type="button" className="btn-gray sftp-auto-save" disabled={!clientId || offboarded || saving === operationKey} onClick={save}>{saving === operationKey ? 'Saving…' : `Save ${operation.label} Schedule`}</button>
        </div>
        {message && <div className={`sftp-auto-message ${message.kind}`}>{message.text}</div>}
      </main>
    </div>

    <div className="sftp-auto-section-head"><div><h2>Scheduled Automation</h2><p>Current daily schedule for the selected client.</p></div></div>
    <div className="card sftp-auto-table-wrap"><table className="datatable sftp-auto-matrix"><thead><tr><th>File type</th><th>Incoming</th><th>Outgoing / Processing</th></tr></thead><tbody>{TYPES.map(fileType => <tr key={fileType}><th>{fileType}</th><td>{matrixCell(fileType, 'INCOMING')}</td><td>{matrixCell(fileType, 'OUTGOING')}</td></tr>)}</tbody></table></div>

    <div className="sftp-auto-section-head"><div><h2>Automation History</h2><p>Files taken, files delivered, timing and final status for past runs.</p></div><button type="button" className="btn-gray" onClick={() => load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <div className="card sftp-auto-table-wrap"><table className="datatable sftp-auto-runs"><thead><tr><th>Automation</th><th>Direction</th><th>Files taken</th><th>Files sent</th><th>Scheduled / completed</th><th>Status</th></tr></thead><tbody>{runs.length ? runs.map(run => <tr key={run.id}><td><b>{run.automation_type}</b><small>{run.client_name}</small></td><td><span className="sftp-auto-direction">{run.direction || 'INCOMING'}</span></td><td><FileList files={run.input_files} empty="No files taken" /></td><td><FileList files={run.sent_files?.length ? run.sent_files : run.mir_output_files} empty="No files sent" /></td><td><TimeDisplay value={run.scheduled_for} includeSeconds /><small>{run.finished_at ? <>Completed: <TimeDisplay value={run.finished_at} includeSeconds /></> : run.started_at ? 'In progress' : 'Waiting'}</small></td><td><span className={`tag ${statusClass(run.status)}`}>{run.status}</span>{run.error_message && <small className="sftp-auto-error">{run.error_message}</small>}</td></tr>) : <tr><td colSpan="6" className="sftp-auto-none">No automation runs recorded for this client.</td></tr>}</tbody></table></div>
  </section>;
}
