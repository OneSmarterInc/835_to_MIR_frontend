import React, { useEffect, useState } from "react";
import { portalFetch } from "../utils/api";
import { encodeDemoValue } from "../utils/demoEncoder";
import "./ClaimsDashboard.css";

const TYPES = ["835", "MIR", "837", "RECON"];
const WORKSPACES = [
  ["flow", "Flow"], ["batches", "Conversions"], ["checks", "Checks"],
  ["search", "Claim Search"], ["archive", "Archive"], ["result", "Reconciliation"],
  ["notices", "MPL Notices"], ["code-dictionary", "Code Dictionary"],
  ["conn", "Connections"], ["contacts", "Contact Us"], ["security", "Security Keys"],
];
const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
};
const protect = value => value == null || value === "" ? "—" : encodeDemoValue(String(value), true);
const protectReason = value => value ? encodeDemoValue(String(value), false) : "—";
const blank = () => ({ "835": { files: [], count: 0 }, MIR: { files: [], count: 0 },
  "837": { files: [], count: 0 }, RECON: { files: [], count: 0 } });

export default function ClaimsDashboard({ isAdmin = false, activeClientId = "", onOpenFileModal, activeWorkspace = "", onSelectWorkspace }) {
  const [date, setDate] = useState(today);
  const [groups, setGroups] = useState(blank);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [claimData, setClaimData] = useState(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [detailError, setDetailError] = useState("");

  const headers = () => {
    const token = localStorage.getItem("onesmarter_admin_token");
    return token ? { Authorization: `Token ${token}` } : {};
  };
  const getJson = async (url, signal) => {
    const response = await portalFetch(url, { credentials: "include", headers: headers(), signal });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Unable to load dashboard");
    return data;
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setGroups(blank()); setSelected(null);
    const params = new URLSearchParams({ date });
    if (isAdmin && activeClientId) params.set("client_id", activeClientId);
    getJson(`/edi835/api/claims-dashboard/?${params}`, controller.signal)
      .then(result => setGroups(result.groups || blank()))
      .catch(err => { if (err.name !== "AbortError") setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, activeClientId, isAdmin, refresh]);

  useEffect(() => {
    if (!selected) return undefined;
    const controller = new AbortController();
    setClaimLoading(true); setDetailError(""); setClaimData(null);
    getJson(`/edi835/api/claims-dashboard/${selected.kind}/${selected.file.id}/?page=${page}&page_size=50`, controller.signal)
      .then(setClaimData)
      .catch(err => { if (err.name !== "AbortError") setDetailError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setClaimLoading(false); });
    return () => controller.abort();
  }, [selected, page]);

  const openFile = (kind, file) => {
    setSelected({ kind, file }); setPage(1); setHeldOpen(false);
  };

  return <section className="claims-dashboard">
    <header className="claims-dashboard-header">
      <div><span className="eyebrow">CLAIMS WORKSPACE</span><h1>Claims Dashboard</h1>
        <p>Review 835, MIR, 837 and RECON files and their claims by date.</p></div>
      <div className="claims-date-controls"><label htmlFor="claims-date">File date</label>
        <input id="claims-date" type="date" value={date} onChange={event => setDate(event.target.value || today())} />
        <button type="button" onClick={() => setDate(today())}>Today</button>
        <button type="button" onClick={() => setRefresh(n => n + 1)}>Refresh</button></div>
    </header>
    {loading && <p>Loading files…</p>}
    {error && <p role="alert" className="claims-error">{error}</p>}
    <nav className="claims-workspace-nav" aria-label="Client workspaces">
      <button type="button" className={!activeWorkspace ? "selected" : ""}
        onClick={() => onSelectWorkspace?.("")}>Overview</button>
      {WORKSPACES.map(([key, label]) => <button key={key} type="button"
        className={activeWorkspace === key ? "selected" : ""}
        onClick={() => onSelectWorkspace?.(key)}>{label}</button>)}
    </nav>
    {!activeWorkspace && <>
      <div className="claims-kpi-grid">
        {TYPES.map(kind => <button type="button" key={kind} className="claims-kpi"
          onClick={() => document.getElementById("claims-activity")?.scrollIntoView({ behavior: "smooth" })}>
          <span>{kind} FILES</span>
          <strong>{groups[kind]?.count || 0}</strong>
          <small>{(groups[kind]?.files || []).reduce((sum, file) => sum + Number(file.claim_count || 0), 0).toLocaleString()} claims</small>
          {(groups[kind]?.files || []).some(file => file.held_count > 0) &&
            <small className="claims-held">{(groups[kind]?.files || []).reduce((sum, file) => sum + Number(file.held_count || 0), 0)} held</small>}
        </button>)}
      </div>
      <section className="claims-activity" id="claims-activity">
        <header><h2>File activity</h2><span>Files received or processed on {date}</span></header>
        <div className="claims-table-wrap"><table>
          <thead><tr><th>File type</th><th>File</th><th>Claims</th><th>Held</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>{TYPES.flatMap(kind => (groups[kind]?.files || []).map(file =>
            <tr key={kind + file.id}>
              <td><strong>{kind}</strong></td><td className="claims-filename">{file.name}</td>
              <td>{file.claim_count}</td><td>{file.held_count || "—"}</td><td>{file.status}</td>
              <td><button type="button" onClick={() => openFile(kind, file)}>View claims</button></td>
            </tr>))}
            {!loading && TYPES.every(kind => !(groups[kind]?.files || []).length) &&
              <tr><td colSpan="6">No files found for this date.</td></tr>}
          </tbody>
        </table></div>
        {TYPES.some(kind => groups[kind]?.truncated) && <p>Some file lists have more than 500 files. Refine the date to review a smaller set.</p>}
      </section>
    </>}
    {activeWorkspace && <section className="claims-embedded-workspace">
      <div className="claims-embedded-heading">
        <strong>{WORKSPACES.find(([key]) => key === activeWorkspace)?.[1]}</strong>
        <button type="button" onClick={() => onSelectWorkspace?.("")}>Back to Overview</button>
      </div>
    </section>}
    {selected && <div className="claims-modal-backdrop" onMouseDown={() => setSelected(null)}>
      <section className="claims-modal" role="dialog" aria-modal="true" aria-label={selected.kind + " claims"} onMouseDown={e => e.stopPropagation()}>
        <header className="claims-modal-head"><div><h2>{selected.kind} · {selected.file.name}</h2>
          <small>{claimData?.count ?? selected.file.claim_count} claims</small></div>
          <div className="claims-modal-actions">
            {selected.kind === "MIR" && (claimData?.held_claims?.length || selected.file.held_count) > 0 &&
              <button onClick={() => setHeldOpen(value => !value)} type="button">
                {heldOpen ? "View claims" : `Held Claims (${selected.file.held_count})`}</button>}
            {["835", "MIR"].includes(selected.kind) && onOpenFileModal &&
              <button type="button" onClick={() => onOpenFileModal(selected.kind === "MIR" ? (claimData?.source_835_id || selected.file.source_835_id || selected.file.id) : selected.file.id)}>View 835 / MIR file</button>}
            <button type="button" onClick={() => setSelected(null)} aria-label="Close">✕</button>
          </div></header>
        {detailError && <p role="alert" className="claims-error">{detailError}</p>}
        {claimLoading && <p>Loading claims…</p>}
        {!heldOpen ? <>
          <div className="claims-table-wrap"><table><thead><tr>
            <th>#</th><th>External / Highmark claim</th><th>Internal claim</th><th>Member</th>
            <th>Patient</th><th>Status</th><th>Services</th><th>Charge</th><th>Paid</th>
          </tr></thead><tbody>
            {(claimData?.claims || []).map(c => <tr key={c.claim_sequence}>
              <td>{c.claim_sequence}</td><td>{protect(c.highmark_claim_number)}</td>
              <td>{protect(c.internal_claim_number)}</td><td>{protect(c.member_id)}</td>
              <td>{protect(c.patient_name)}</td><td>{c.claim_status || "—"}</td><td>{c.service_count}</td>
              <td>{c.total_charge_amount || "—"}</td><td>{c.paid_amount || "—"}</td>
            </tr>)}
            {!claimLoading && !(claimData?.claims || []).length && <tr><td colSpan="9">No claim records found.</td></tr>}
          </tbody></table></div>
          <footer className="claims-pagination"><span>Page {claimData?.page || page} of {claimData?.pages || 1}</span>
            <button type="button" disabled={page <= 1 || claimLoading} onClick={() => setPage(n => n - 1)}>Previous</button>
            <button type="button" disabled={claimLoading || page >= (claimData?.pages || 1)} onClick={() => setPage(n => n + 1)}>Next</button>
          </footer>
        </> : <div className="claims-table-wrap"><table><thead><tr>
          <th>External / Highmark claim</th><th>Internal claim</th><th>Rule</th><th>Reason for hold</th>
        </tr></thead><tbody>
          {(claimData?.held_claims || []).map((hold, i) => <tr key={i}>
            <td>{protect(hold.highmark_claim_number)}</td><td>{protect(hold.internal_claim_number)}</td>
            <td>{hold.rule || "HOLD"}</td><td>{protectReason(hold.reason)}</td>
          </tr>)}
          {!(claimData?.held_claims || []).length && <tr><td colSpan="4">No detailed hold findings recorded.</td></tr>}
        </tbody></table></div>}
      </section>
    </div>}
  </section>;
}
