import React, { useEffect, useState } from "react";
import { portalFetch } from "../utils/api";
import { encodeDemoValue } from "../utils/demoEncoder";
import "./ClaimsDashboard.css";

const TYPES = ["835", "MIR", "837", "RECON"];
const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
};
const protect = value => value == null || value === "" ? "—" : encodeDemoValue(String(value), true);
const protectReason = value => value ? encodeDemoValue(String(value), false) : "—";
const blank = () => ({ "835": { files: [], count: 0 }, MIR: { files: [], count: 0 },
  "837": { files: [], count: 0 }, RECON: { files: [], count: 0 } });

export default function ClaimsDashboard({ isAdmin = false, activeClientId = "", onOpenFileModal }) {
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
    <div className="claims-grid">
      {TYPES.map(kind => <section className="claims-group" key={kind}>
        <div className="claims-group-title"><h2>{kind} Files</h2><strong>{groups[kind]?.count || 0}</strong></div>
        <div className="claims-file-list">
          {(groups[kind]?.files || []).map(file => <button className="claims-file" type="button"
            key={file.id} onClick={() => openFile(kind, file)}>
            <span className="claims-filename">{file.name}</span>
            <small>{file.claim_count} claims · {file.status}</small>
            {file.held_count > 0 && <small className="claims-held">{file.held_count} held</small>}
          </button>)}
          {!loading && !(groups[kind]?.files || []).length && <p>No files on this date.</p>}
          {groups[kind]?.truncated && <p>Only the first 500 files are shown for this day.</p>}
        </div>
      </section>)}
    </div>
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
