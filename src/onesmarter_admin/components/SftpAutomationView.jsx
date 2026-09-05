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
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const today = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
const blankTrigger = (timezone = EASTERN_TIME_ZONE) => ({ run_time: '09:00', timezone, enabled: true, schedule_type: 'DAILY', interval_value: 1, weekdays: [0, 1, 2, 3, 4], month_days: [1], start_date: today(), end_date: '', one_time_date: '', misfire_policy: 'RUN_ASAP', overlap_policy: 'SKIP', retry_count: 0, retry_delay_minutes: 5 });
const keyFor = (type, direction) => `${type}:${direction}`;
const statusClass = status => status === 'SUCCESS' ? 'ok' : status === 'FAILED' || status === 'SKIPPED' ? 'bad' : 'work';
const scheduleLabel = row => {
  if (!row) return 'Not scheduled';
  if (row.schedule_type === 'ONCE') return `Once on ${row.one_time_date} · ${row.run_time}`;
  if (row.schedule_type === 'WEEKLY') return `${(row.weekdays || []).map(day => WEEKDAYS[day]).join(', ')} · every ${row.interval_value} week(s) · ${row.run_time}`;
  if (row.schedule_type === 'MONTHLY') return `Day ${(row.month_days || []).join(', ')} · every ${row.interval_value} month(s) · ${row.run_time}`;
  return `Every ${row.interval_value} day(s) · ${row.run_time}`;
};

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
  const [runPage, setRunPage] = useState(1);
  const [runPagination, setRunPagination] = useState({ page: 1, total: 0, total_pages: 1, has_previous: false, has_next: false });
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState(null);
  const [preview, setPreview] = useState([]);
  const [previewError, setPreviewError] = useState('');
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
      const data = await apiJson(`/edi835/api/admin/sftp-automation/?${new URLSearchParams({ client_id: clientId, page: String(runPage), page_size: '25' })}`);
      setSchedules(data.schedules || []); setRuns(data.runs || []);
      setRunPagination(data.run_pagination || { page: 1, total: 0, total_pages: 1, has_previous: false, has_next: false });
      if (initializedClient.current !== String(clientId)) {
        const next = {};
        TYPES.forEach(fileType => OPERATIONS[fileType].forEach(item => {
          const saved = (data.schedules || []).find(row => row.automation_type === fileType && row.direction === item.direction);
          next[keyFor(fileType, item.direction)] = saved ? { ...blankTrigger(canonicalTimeZone(saved.timezone)), ...saved, end_date: saved.end_date || '', one_time_date: saved.one_time_date || '' } : blankTrigger(canonicalTimeZone(client?.timezone || EASTERN_TIME_ZONE));
        }));
        initializedClient.current = String(clientId); setForms(next);
      }
    } catch (error) { if (!quiet) setMessage({ kind: 'bad', text: error.message }); }
    finally { if (!quiet) setLoading(false); }
  }, [clientId, client?.timezone, runPage]);
  useEffect(() => { load(); }, [load]);

  const chooseClient = value => { initializedClient.current = ''; setRunPage(1); setClientId(value); onSelectClient?.(value); setMessage(null); };
  const chooseType = value => { setType(value); setDirection(OPERATIONS[value][0].direction); setMessage(null); };
  const form = forms[operationKey] || blankTrigger(canonicalTimeZone(client?.timezone || EASTERN_TIME_ZONE));
  const saved = schedules.find(row => row.automation_type === type && row.direction === operation.direction);
  const update = (field, value) => setForms(current => ({ ...current, [operationKey]: { ...form, [field]: value } }));
  const toggleNumber = (field, value) => update(field, form[field]?.includes(value) ? form[field].filter(item => item !== value) : [...(form[field] || []), value].sort((a, b) => a - b));

  useEffect(() => {
    if (!clientId || !forms[operationKey]) { setPreview([]); return undefined; }
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiJson('/edi835/api/admin/sftp-automation/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, automation_type: type, direction: operation.direction, ...form, timezone: canonicalTimeZone(form.timezone), preview_only: true }) });
        setPreview(data.next_runs || []); setPreviewError('');
      } catch (error) { setPreview([]); setPreviewError(error.message); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [clientId, form, forms, operation.direction, operationKey, type]);
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
      return <button key={item.direction} type="button" onClick={() => { setType(fileType); setDirection(item.direction); }}><b>{item.label}</b><span>{row ? `${scheduleLabel(row)} · ${row.enabled ? 'Enabled' : 'Disabled'}` : 'Not scheduled'}</span></button>;
    })}</div>;
  };

  return <section className="view on sftp-auto-view table-screen">
    <div className="sftp-auto-title"><div><h1>SFTP Automation</h1></div><div className="sftp-auto-client"><label>Client</label><ClientSelectDropdown clients={clients} value={clientId} onChange={chooseClient} fullWidth /></div></div>
    <OffboardedClientBanner client={client} detail="Automation schedules are locked. Existing run history remains available." />
    <div className="sftp-auto-shell">
      <nav className="sftp-auto-nav" aria-label="Automation file types">{TYPES.map(value => <button key={value} className={type === value ? 'on' : ''} onClick={() => chooseType(value)}><span className="sftp-auto-nav-dot" />{value}</button>)}</nav>
      <main className="sftp-auto-panel">
        <header><div><h2>{type} schedules</h2></div><span className={`sftp-auto-state ${saved?.enabled ? 'configured' : ''}`}>{saved ? saved.enabled ? 'ENABLED' : 'DISABLED' : 'NOT SCHEDULED'}</span></header>
        {OPERATIONS[type].length > 1 && <div className="sftp-auto-tabs">{OPERATIONS[type].map(item => <button key={item.direction} className={operation.direction === item.direction ? 'on' : ''} onClick={() => setDirection(item.direction)}>{item.label}</button>)}</div>}
        <div className="sftp-auto-form">
          <label><span>Schedule type</span><select value={form.schedule_type} disabled={offboarded} onChange={event => update('schedule_type', event.target.value)}><option value="ONCE">One time</option><option value="DAILY">Every N days</option><option value="WEEKLY">Selected weekdays</option><option value="MONTHLY">Monthly</option></select></label>
          {form.schedule_type !== 'ONCE' && <label><span>{form.schedule_type === 'DAILY' ? 'Repeat every (days)' : form.schedule_type === 'WEEKLY' ? 'Repeat every (weeks)' : 'Repeat every (months)'}</span><input type="number" min="1" max="365" value={form.interval_value} disabled={offboarded} onChange={event => update('interval_value', Number(event.target.value))} /></label>}
          {form.schedule_type === 'ONCE' && <label><span>Run date</span><input type="date" value={form.one_time_date} disabled={offboarded} onChange={event => update('one_time_date', event.target.value)} /></label>}
          {form.schedule_type === 'WEEKLY' && <div className="sftp-auto-choice-block"><span>Run on these days</span><div className="sftp-auto-day-row">{WEEKDAYS.map((day, index) => <button type="button" key={day} className={form.weekdays?.includes(index) ? 'on' : ''} onClick={() => toggleNumber('weekdays', index)} disabled={offboarded}><i>{form.weekdays?.includes(index) ? '✓' : ''}</i>{day}</button>)}</div></div>}
          {form.schedule_type === 'MONTHLY' && <div className="sftp-auto-choice-block"><span>Days of the month</span><div className="sftp-auto-month-grid">{Array.from({ length: 31 }, (_, index) => index + 1).map(day => <button type="button" key={day} className={form.month_days?.includes(day) ? 'on' : ''} onClick={() => toggleNumber('month_days', day)} disabled={offboarded}>{day}</button>)}</div></div>}
          {form.schedule_type !== 'ONCE' && <label><span>Start date</span><input type="date" value={form.start_date} disabled={offboarded} onChange={event => update('start_date', event.target.value)} /></label>}
          {form.schedule_type !== 'ONCE' && <label><span>End date (optional)</span><input type="date" value={form.end_date} min={form.start_date} disabled={offboarded} onChange={event => update('end_date', event.target.value)} /></label>}
          <label><span>Run time</span><input type="time" value={form.run_time} disabled={offboarded} onChange={event => update('run_time', event.target.value)} /></label>
          <label><span>Timezone</span><select value={form.timezone} disabled={offboarded} onChange={event => update('timezone', event.target.value)}>{zones.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label>
          <details className="sftp-auto-advanced"><summary>Execution options</summary><div><label><span>If a run is missed</span><select value={form.misfire_policy} onChange={event => update('misfire_policy', event.target.value)}><option value="RUN_ASAP">Run as soon as possible</option><option value="SKIP">Skip missed run</option></select></label><label><span>If previous run is active</span><select value={form.overlap_policy} onChange={event => update('overlap_policy', event.target.value)}><option value="SKIP">Skip new run</option><option value="QUEUE">Queue one run</option></select></label><label><span>Retry attempts</span><input type="number" min="0" max="5" value={form.retry_count} onChange={event => update('retry_count', Number(event.target.value))} /></label><label><span>Retry delay (minutes)</span><input type="number" min="1" max="1440" value={form.retry_delay_minutes} onChange={event => update('retry_delay_minutes', Number(event.target.value))} /></label></div></details>
          <label className="sftp-auto-toggle"><input type="checkbox" checked={form.enabled !== false} disabled={offboarded} onChange={event => update('enabled', event.target.checked)} /><span><b>Enable this schedule</b><small>The worker will execute it according to the trigger above.</small></span></label>
          <div className="sftp-auto-preview"><span>Next five scheduled runs</span>{previewError ? <small className="sftp-auto-preview-error">{previewError}</small> : preview.length ? <ol>{preview.map(value => <li key={value}><TimeDisplay value={value} /></li>)}</ol> : <small>No future runs</small>}</div>
          <button type="button" className="btn-gray sftp-auto-save" disabled={!clientId || offboarded || saving === operationKey} onClick={save}>{saving === operationKey ? 'Saving…' : `Save ${operation.label} Schedule`}</button>
        </div>
        {message && <div className={`sftp-auto-message ${message.kind}`}>{message.text}</div>}
      </main>
    </div>

    <div className="sftp-auto-section-head"><div><h2>Scheduled Automation</h2></div></div>
    <div className="card sftp-auto-table-wrap"><table className="datatable sftp-auto-matrix"><thead><tr><th>File type</th><th>Incoming</th><th>Outgoing / Processing</th></tr></thead><tbody>{TYPES.map(fileType => <tr key={fileType}><th>{fileType}</th><td>{matrixCell(fileType, 'INCOMING')}</td><td>{matrixCell(fileType, 'OUTGOING')}</td></tr>)}</tbody></table></div>

    <div className="sftp-auto-section-head"><div><h2>Automation History</h2><p>Files taken, files delivered, timing and final status for past runs.</p></div><button type="button" className="btn-gray" onClick={() => load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <div className="card sftp-auto-table-wrap"><table className="datatable sftp-auto-runs"><thead><tr><th>Automation</th><th>Direction</th><th>Files taken</th><th>Files sent</th><th>Scheduled / completed (Eastern)</th><th>Status</th></tr></thead><tbody>{runs.length ? runs.map(run => <tr key={run.id}><td><b>{run.automation_type}</b><small>{run.client_name}</small></td><td><span className="sftp-auto-direction">{run.direction || 'INCOMING'}</span></td><td><FileList files={run.input_files} empty="No files taken" /></td><td><FileList files={run.sent_files?.length ? run.sent_files : run.mir_output_files} empty="No files sent" /></td><td><TimeDisplay value={run.scheduled_for} includeSeconds easternOnly /><small>{run.finished_at ? <>Completed: <TimeDisplay value={run.finished_at} includeSeconds easternOnly /></> : run.started_at ? 'In progress' : 'Waiting'}</small></td><td><span className={`tag ${statusClass(run.status)}`}>{run.status}</span>{run.error_message && <small className="sftp-auto-error">{run.error_message}</small>}</td></tr>) : <tr><td colSpan="6" className="sftp-auto-none">No automation runs recorded for this client.</td></tr>}</tbody></table></div>
    <div className="sftp-auto-pagination"><span>{runPagination.total ? `Showing ${(runPagination.page - 1) * 25 + 1}–${Math.min(runPagination.page * 25, runPagination.total)} of ${runPagination.total} runs` : 'No runs'}</span><div><button type="button" disabled={!runPagination.has_previous || loading} onClick={() => setRunPage(page => Math.max(1, page - 1))}>Previous</button><b>Page {runPagination.page} of {runPagination.total_pages || 1}</b><button type="button" disabled={!runPagination.has_next || loading} onClick={() => setRunPage(page => page + 1)}>Next</button></div></div>
  </section>;
}
