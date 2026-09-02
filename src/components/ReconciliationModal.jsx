import React, { useEffect, useMemo, useState } from "react";
import { portalFetch } from "../utils/api";
import "./ReconciliationModal.css";

const money = (value) => Number(value || 0).toLocaleString(undefined, {
  style: "currency", currency: "USD",
});

const statusLabel = (value) => ({
  CLEAR: "Matched", NOT_IN_RECON: "Not in RECON", SIGNATURE_MISMATCH: "Signature mismatch",
  PARTIALLY_PAID: "Partially paid", OVERPAID: "Overpaid", UNPAID: "Unpaid",
  AMOUNT_MISMATCH: "Amount mismatch",
}[value] || value || "Needs review");

const ruleLabels = {
  MIR901: ["1", "MIR901 = RECON MIR907", "Direct amount match"],
  MIR907: ["2", "MIR901 + MIR904 = RECON MIR907", "Includes the BlueCard access fee"],
  MIR908: ["2.1", "MIR901 + MIR904 + MIR905 = RECON MIR907", "Includes BlueCard and AEA fees"],
  MPL920: ["2.2a", "… + MPL920 = RECON MIR907", "Includes the PCA fee under the interim policy"],
  NO_MATCH: ["2.3", "No combination reconciles", "Audit discrepancy; review required"],
};

async function apiJson(url, signal) {
  const token = localStorage.getItem("onesmarter_admin_token");
  const headers = token ? { Authorization: `Token ${token}` } : {};
  const response = await portalFetch(url, { signal, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export default function ReconciliationModal({ clientId = "", isAdmin = false, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(""); setShowAll(false);
    const params = new URLSearchParams();
    if (isAdmin && clientId) params.set("client_id", clientId);
    if (isAdmin && !clientId) params.set("scope", "global");
    apiJson(`/edi835/api/reconciliation/dashboard/?${params}`, controller.signal)
      .then(setData)
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [clientId, isAdmin]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reviewRecords = useMemo(() => (data?.records || []).filter(
    (row) => row.status !== "CLEAR" || row.affected_by_interim_policy
  ), [data]);
  const visibleRecords = showAll ? (data?.records || []) : reviewRecords;
  const counts = data?.waterfall?.match_step_counts || {};
  const maximum = Math.max(1, ...Object.values(counts).map(Number));

  const downloadExport = async () => {
    setExporting(true); setError("");
    try {
      const token = localStorage.getItem("onesmarter_admin_token");
      const params = new URLSearchParams();
      if (isAdmin && clientId) params.set("client_id", clientId);
      if (isAdmin && !clientId) params.set("scope", "global");
      const response = await portalFetch(`/edi835/api/reconciliation/export/?${params}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Export failed (${response.status}).`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `reconciliation-${data?.source?.client_name || "results"}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); } finally { setExporting(false); }
  };

  return <div className="recon-popup-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="recon-popup" role="dialog" aria-modal="true" aria-labelledby="recon-popup-title">
      <header className="recon-popup-header">
        <div><div className="recon-eyebrow">Database reconciliation</div><h2 id="recon-popup-title">Reconciliation</h2></div>
        <button type="button" className="modal-cross-btn" onClick={onClose} aria-label="Close reconciliation">×</button>
      </header>
      <div className="recon-popup-body">
        {!data && !error && <div className="recon-state">Loading reconciliation from the database…</div>}
        {error && <div className="recon-message error">{error}</div>}
        {data && <>
          <div className="recon-context">
            <div><div className="recon-eyebrow">{data.cycle?.processed_at ? `Latest RECON processed ${new Date(data.cycle.processed_at).toLocaleString()}` : "Current persisted data"}</div><h1>{data.source?.client_name || "Reconciliation"}</h1><p>{data.cycle?.filename || "No processed RECON file"} · all persisted MIR records in the selected scope</p></div>
            <span className="recon-database-badge">Live database</span>
          </div>
          {data.message && <div className="recon-message">{data.message}</div>}
          <div className="recon-cash">
            <h3>Cash position for this file</h3>
            <CashRow label="Approved for BCBS payment" value={data.cash?.approved} />
            <CashRow label="Withdrawn by BCBS per RECON" value={data.cash?.withdrawn} />
            <CashRow label="BlueCard access fees (MIR904)" value={data.cash?.mir904} />
            <CashRow label="Administrative expense allowance (MIR905)" value={data.cash?.mir905} />
            <CashRow label="PCA fee (MPL920)" value={data.cash?.mpl920} />
            <CashRow label="Unexplained" value={data.cash?.unexplained} total />
          </div>
          <div className="recon-tallies">
            <Tally value={data.tallies?.records} label="MIR records" />
            <Tally value={data.tallies?.matched_cleanly} label="Matched cleanly" />
            <Tally value={data.tallies?.matched_with_caveat} label="Matched with caveat" />
            <Tally value={data.tallies?.discrepancies} label="Discrepancies" />
          </div>
          <h3 className="recon-section-title">How each record matched</h3>
          <div className="recon-waterfall">{Object.entries(ruleLabels).map(([key, copy]) => {
            const count = Number(counts[key] || 0);
            return <div className={`recon-rung ${key === "NO_MATCH" ? "bad" : key === "MPL920" ? "caveat" : ""}`} key={key}>
              <span className="recon-step">{copy[0]}</span><div><b>{copy[1]}</b><small>{copy[2]}</small></div>
              <span className="recon-bar"><i style={{ width: `${(count / maximum) * 100}%` }} /></span><strong>{count.toLocaleString()}</strong>
            </div>;
          })}</div>
          <h3 className="recon-section-title">{showAll ? "All records" : "Needs a person"}</h3>
          <div className="recon-table-wrap"><table><thead><tr><th>Claim</th><th>MIR901</th><th>MIR904</th><th>MIR905</th><th>MPL920</th><th>RECON MIR907</th><th>Outcome</th></tr></thead>
            <tbody>{visibleRecords.length ? visibleRecords.map((row) => <tr key={row.claim_id}><td>{row.claim_id}</td><td>{money(row.mir901)}</td><td>{money(row.mir904)}</td><td>{money(row.mir905)}</td><td>{money(row.mpl920)}</td><td>{money(row.recon_mir907)}</td><td><span className={`recon-tag ${row.status === "CLEAR" ? "ok" : "bad"}`}>{row.match_step ? `Matched at ${row.match_step}` : statusLabel(row.status)}</span>{row.status !== "CLEAR" && <small>Difference: {money(row.difference)}</small>}</td></tr>) : <tr><td colSpan="7" className="recon-empty">No records require manual review.</td></tr>}</tbody>
          </table></div>
          <div className="recon-actions"><button type="button" className="btn primary" onClick={downloadExport} disabled={exporting}>{exporting ? "Exporting…" : "Export this file"}</button><button type="button" className="btn secondary" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show exceptions only" : `Show all ${Number(data.tallies?.records || 0).toLocaleString()} records`}</button></div>
          {data.policy?.interim && <div className="recon-policy"><b>Interim matching policy.</b> MIR907 and MIR908 are computed from the stored fee fields, and MPL920 is included as the final configured step. Records affected by this policy are called out above.</div>}
        </>}
      </div>
    </section>
  </div>;
}

function CashRow({ label, value, total = false }) {
  return <div className={`recon-cash-row${total ? " total" : ""}`}><span>{label}</span><strong>{money(value)}</strong></div>;
}

function Tally({ value, label }) {
  return <div><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span></div>;
}
