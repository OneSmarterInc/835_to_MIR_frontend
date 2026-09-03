import React, { useEffect, useState } from "react";
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
  MIR_EQ_RECON: ["1", "MIR = RECON", "The MIR and RECON amounts are equal"],
  MIR_GT_RECON: ["2", "MIR > RECON", "The amount in MIR is greater than the amount in RECON"],
  MIR_LT_RECON: ["3", "MIR < RECON", "The amount in MIR is less than the amount in RECON"],
  NOT_IN_RECON: ["4", "Not in RECON", "The claim exists in MIR but has not appeared in RECON"],
  AGED_NOT_IN_RECON: ["5", "In MIR for more than 8 days, not in RECON", "The MIR claim is at least eight days old and still has no RECON record"],
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
  const [exporting, setExporting] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const params = new URLSearchParams();
    if (isAdmin && clientId) params.set("client_id", clientId);
    if (isAdmin && !clientId) params.set("scope", "global");
    params.set("review_page", String(reviewPage));
    params.set("review_page_size", "25");
    apiJson(`/edi835/api/reconciliation/dashboard/?${params}`, controller.signal)
      .then(setData)
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [clientId, isAdmin, reviewPage]);

  useEffect(() => { setReviewPage(1); }, [clientId, isAdmin]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reviewRecords = data?.records || [];
  const counts = data?.comparison_counts || {};
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
            <h3>Cash position for this cycle</h3>
            <CashRow label="Total Amount in MIR" value={data.cash?.approved} />
            <CashRow label="Total Amount in RECON" value={data.cash?.withdrawn} />
            <CashRow label="Overpaid" value={data.cash?.overpaid} />
            <CashRow label="Underpaid" value={data.cash?.underpaid} total />
          </div>
          <div className="recon-tallies">
            <Tally value={data.tallies?.recon_claims} label="Total claims in RECON" />
            <Tally value={data.tallies?.mir_claims} label="Total claims in MIR" />
            <Tally value={data.tallies?.matched_claims} label="Matched claims" />
            <Tally value={data.tallies?.discrepancies} label="Discrepancy" />
          </div>
          <h3 className="recon-section-title">How each record matched</h3>
          <div className="recon-waterfall">{Object.entries(ruleLabels).map(([key, copy]) => {
            const count = Number(counts[key] || 0);
            return <div className={`recon-rung ${key === "MIR_GT_RECON" || key === "NOT_IN_RECON" || key === "AGED_NOT_IN_RECON" ? "bad" : key === "MIR_LT_RECON" ? "caveat" : ""}`} key={key}>
              <span className="recon-step">{copy[0]}</span><div><b>{copy[1]}</b><small>{copy[2]}</small></div>
              <span className="recon-bar"><i style={{ width: `${(count / maximum) * 100}%` }} /></span><strong>{count.toLocaleString()}</strong>
            </div>;
          })}</div>
          <h3 className="recon-section-title">Needs a person</h3>
          <div className="recon-table-wrap"><table className="recon-review-table"><thead><tr><th>Claim</th><th>MIR901</th><th>MIR904</th><th>MIR905</th><th>MPL920</th><th>RECON MIR907</th><th>Outcome</th><th>Difference</th></tr></thead>
            <tbody>{reviewRecords.length ? reviewRecords.map((row) => <tr key={row.claim_id}><td>{row.claim_id}</td><td>{money(row.mir901)}</td><td>{money(row.mir904)}</td><td>{money(row.mir905)}</td><td>{money(row.mpl920)}</td><td>{money(row.recon_mir907)}</td><td><span className="recon-tag bad">{statusLabel(row.status)}</span></td><td>{money(row.difference)}</td></tr>) : <tr><td colSpan="8" className="recon-empty">No non-clear records require review.</td></tr>}</tbody>
          </table></div>
          {data.review_pagination && <div className="recon-pagination"><span>{Number(data.review_pagination.total || 0).toLocaleString()} non-clear entries · Page {data.review_pagination.page} of {data.review_pagination.total_pages}</span><div><button type="button" className="btn secondary" disabled={data.review_pagination.page <= 1} onClick={() => setReviewPage((page) => Math.max(1, page - 1))}>Previous</button><button type="button" className="btn secondary" disabled={data.review_pagination.page >= data.review_pagination.total_pages} onClick={() => setReviewPage((page) => page + 1)}>Next</button></div></div>}
          <div className="recon-actions"><button type="button" className="btn primary" onClick={downloadExport} disabled={exporting}>{exporting ? "Exporting…" : "Export this cycle"}</button></div>
          {data.policy?.interim && <div className="recon-policy"><b>Interim matching policy.</b> MIR907 and MIR908 are computed from the stored fee fields, and MPL920 is included as the final configured step. Records affected by this policy are called out above.</div>}
        </>}
      </div>
    </section>
  </div>;
}

function CashRow({ label, value, total = false }) {
  return <div className={`recon-cash-row${total ? " total" : ""}`}><span>{label}</span><strong>{money(value)}</strong></div>;
}

function Tally({ value, label, detail = "" }) {
  return <div><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>;
}
