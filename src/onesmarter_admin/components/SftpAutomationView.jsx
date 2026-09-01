import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import TimeDisplay from '../../components/TimeDisplay';
import ClientSelectDropdown from './ClientSelectDropdown';
import { canonicalTimeZone, EASTERN_TIME_ZONE, scheduleTimeLabel, scheduleTimeZoneOptions, timeZoneDisplayName } from '../../utils/timezone';
import './SftpAutomationView.css';
import OffboardedClientBanner from './OffboardedClientBanner';

function authHeaders(extra = {}) {
  const token = localStorage.getItem('onesmarter_admin_token');
  return token ? { ...extra, Authorization: `Token ${token}` } : extra;
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function FileList({ files, empty = '—' }) {
  if (!files?.length) return <span className="sftp-auto-empty">{empty}</span>;
  return <div className="sftp-auto-files">{files.map((file, index) => <span key={`${file}-${index}`}>{file}</span>)}</div>;
}

export default function SftpAutomationView({ clients = [], activeClientId = '', onSelectClient }) {
  const automationTypes = useMemo(() => [
    { value: '835', label: '835 to MIR', description: 'Fetch 835 files, build MIR, and deliver MIR outbound.' },
    { value: '837', label: '837 Reference', description: 'Fetch and ingest 837 reference files only.' },
    { value: 'RECON', label: 'RECON', description: 'Fetch and process RECON files from the dedicated RECON folder.' },
  ], []);
  const [selectedClientId, setSelectedClientId] = useState(activeClientId || '');
  const [schedules, setSchedules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingType, setSavingType] = useState(null);
  const [message, setMessage] = useState(null);
  const formClientIdRef = useRef(null);
  const selectedClient = clients.find((item) => String(item.id) === String(selectedClientId));
  const zones = useMemo(() => {
    const options = scheduleTimeZoneOptions();
    const clientZone = canonicalTimeZone(selectedClient?.timezone);
    if (clientZone && !options.some((option) => option.value === clientZone)) {
      options.push({ value: clientZone, label: `${timeZoneDisplayName(clientZone)} (${clientZone})` });
    }
    return options;
  }, [selectedClient?.timezone]);

  useEffect(() => {
    if (activeClientId) setSelectedClientId(activeClientId);
    else if (!selectedClientId && clients.length) setSelectedClientId(String(clients[0].id));
  }, [activeClientId, clients, selectedClientId]);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (selectedClientId) params.set('client_id', selectedClientId);
      const data = await apiJson(`/edi835/api/admin/sftp-automation/?${params}`);
      setSchedules(data.schedules || []);
      setRuns(data.runs || []);
      if (!quiet) {
        const client = clients.find((item) => String(item.id) === String(selectedClientId));
        const defaults = {};
        automationTypes.forEach((type) => {
          const schedule = (data.schedules || []).find((item) => String(item.client_id) === String(selectedClientId) && item.automation_type === type.value);
          defaults[type.value] = {
            run_time: schedule?.run_time || '09:00',
            timezone: canonicalTimeZone(schedule?.timezone || client?.timezone || EASTERN_TIME_ZONE),
            enabled: schedule?.enabled !== false,
          };
        });
        if (formClientIdRef.current !== String(selectedClientId)) {
          formClientIdRef.current = String(selectedClientId);
          setForms(defaults);
        }
      }
    } catch (error) {
      if (!quiet) setMessage({ kind: 'bad', text: error.message });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [automationTypes, clients, selectedClientId]);

  useEffect(() => {
    loadData();
    const interval = window.setInterval(() => loadData(true), 5000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  const selectClient = (value) => {
    formClientIdRef.current = null;
    setForms({});
    setSelectedClientId(value);
    onSelectClient?.(value);
    setMessage(null);
  };
  const isOffboarded = String(selectedClient?.stage || '').toLowerCase() === 'offboarded';

  const updateForm = (type, field, value) => setForms((current) => ({
    ...current, [type]: { ...(current[type] || {}), [field]: value },
  }));

  const saveSchedule = async (automationType) => {
    if (!selectedClientId) {
      setMessage({ kind: 'bad', text: 'Select a client first.' });
      return;
    }
    if (savingType) return;
    setSavingType(automationType);
    setMessage(null);
    try {
      const form = forms[automationType] || {};
      const data = await apiJson('/edi835/api/admin/sftp-automation/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: selectedClientId, automation_type: automationType, ...form, timezone: canonicalTimeZone(form.timezone) }),
      });
      setMessage({ kind: 'ok', text: `${automationType} automation schedule saved.` });
      setSchedules((current) => [...current.filter((item) => !(item.client_id === data.schedule.client_id && item.automation_type === automationType)), data.schedule]);
      await loadData(true);
    } catch (error) {
      setMessage({ kind: 'bad', text: error.message });
    } finally {
      setSavingType(null);
    }
  };

  return <section className="view on sftp-auto-view">
    <div className="eyebrow">Scheduled Operations</div>
    <h1>SFTP Automation</h1>
    <p className="sub">Schedule 835, 837, and RECON ingestion independently while preserving the combined client-side Test pipeline.</p>

    <div className="sftp-auto-client-bar">
      <label htmlFor="sftp-auto-client">Associate with Client:</label>
      <div className="sftp-auto-client-select"><ClientSelectDropdown id="sftp-auto-client" clients={clients} value={selectedClientId} onChange={selectClient} fullWidth /></div>
    </div>
    <OffboardedClientBanner client={selectedClient} detail="Automation schedules and future SFTP runs are permanently locked. Existing run history remains available." />

    <div className="sftp-auto-config-list">
      {automationTypes.map((type) => {
        const form = forms[type.value] || { run_time: '09:00', timezone: EASTERN_TIME_ZONE, enabled: true };
        const schedule = schedules.find((item) => String(item.client_id) === String(selectedClientId) && item.automation_type === type.value);
        return <div className="card sftp-auto-config" key={type.value}>
          <div><div className="eyebrow">Daily {type.value} Schedule</div><h2>{type.label}</h2><p className="sub">{type.description}</p></div>
          <div className="sftp-auto-fields">
            <label>Run time<input type="time" value={form.run_time} onChange={(event) => updateForm(type.value, 'run_time', event.target.value)} disabled={isOffboarded} /></label>
            <label>Timezone<select value={form.timezone} onChange={(event) => updateForm(type.value, 'timezone', event.target.value)} disabled={isOffboarded}>{zones.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label>
            <label className="sftp-auto-toggle"><input type="checkbox" checked={form.enabled !== false} onChange={(event) => updateForm(type.value, 'enabled', event.target.checked)} disabled={isOffboarded} />Automation enabled</label>
            <button type="button" className="btn-gray" disabled={savingType === type.value || !selectedClientId || isOffboarded} onClick={() => saveSchedule(type.value)}>{savingType === type.value ? 'Saving…' : `Save ${type.value} Schedule`}</button>
          </div>
          <div className="sftp-auto-set-time"><b>Set time:</b> {schedule ? scheduleTimeLabel(schedule.run_time, schedule.timezone) : 'Not scheduled'}{schedule?.next_run_at && schedule.enabled && <span><b>Next run:</b><TimeDisplay value={schedule.next_run_at} /></span>}</div>
        </div>;
      })}
      {message && <div className={`sftp-auto-message ${message.kind}`}>{message.text}</div>}
    </div>

    <div className="sftp-auto-runs-heading"><div><h2 className="sec">Automation Run Summary</h2><p className="sub">Every scheduled invocation and its complete file-flow summary.</p></div><button type="button" className="btn-gray" onClick={() => loadData()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <div className="card sftp-auto-table-wrap"><table className="datatable sftp-auto-runs"><thead><tr><th>Scheduled / Duration (EST)</th><th>Client / Type</th><th>835 Inputs</th><th>837 / RECON Inputs</th><th>MIR Outputs</th><th>Counts</th><th>Status / Error</th></tr></thead><tbody>
      {runs.length ? runs.map((run) => <tr key={run.id}><td><TimeDisplay value={run.scheduled_for} includeSeconds easternOnly />{run.started_at && <small>Started: <TimeDisplay value={run.started_at} includeSeconds easternOnly /></small>}{run.finished_at && <small>Finished: <TimeDisplay value={run.finished_at} includeSeconds easternOnly /></small>}</td><td><b>{run.client_name}</b><small>{run.client_code || '—'} · {run.automation_type}</small></td><td><FileList files={run.input_835_files} empty="No new 835 files" /></td><td><FileList files={run.input_recon_files} empty="No new 837/RECON files" /></td><td><FileList files={run.mir_output_files} empty="No MIR generated" /></td><td><b>{run.processed_835_count}</b> 835 processed<small>{run.recon_file_count} reference/recon imported</small></td><td><span className={`tag ${run.status === 'SUCCESS' ? 'ok' : run.status === 'FAILED' ? 'bad' : 'work'}`}>{run.status}</span>{run.error_message && <small className="sftp-auto-error">{run.error_message}</small>}</td></tr>) : <tr><td colSpan="7" className="sftp-auto-none">No scheduled runs recorded for this client.</td></tr>}
    </tbody></table></div>
  </section>;
}
