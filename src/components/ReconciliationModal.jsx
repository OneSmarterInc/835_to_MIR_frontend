import React, { useEffect, useState } from "react";
import { portalFetch } from "../utils/api";
import { claimParts } from "../utils/claimNumber";
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
const outcomeOptions = ["NOT_IN_MIR", "NOT_IN_RECON", "SIGNATURE_MISMATCH", "PARTIALLY_PAID", "OVERPAID", "UNPAID", "AMOUNT_MISMATCH"];

async function apiJson(url, signal) {
  const token = localStorage.getItem("onesmarter_admin_token");
  const headers = token ? { Authorization: `Token ${token}` } : {};
  const response = await portalFetch(url, { signal, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export default function ReconciliationModal({ clientId = "", isAdmin = false, onClose, onOpenClaim }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sort, setSort] = useState({ key: "highmark_claim_number", direction: "asc" });

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const params = new URLSearchParams();
    if (isAdmin && clientId) params.set("client_id", clientId);
    if (isAdmin && !clientId) params.set("scope", "global");
    params.set("review_page", String(reviewPage));
    params.set("review_page_size", "25");
    if (activeSearch) params.set("review_search", activeSearch);
    if (outcomeFilter) params.set("review_status", outcomeFilter);
    if (actionFilter) params.set("review_action", actionFilter);
    params.set("review_sort", sort.key);
    params.set("review_direction", sort.direction);
    apiJson(`/edi835/api/reconciliation/dashboard/?${params}`, controller.signal)
      .then(setData)
      .catch((err) => { if (err.name !== "AbortError") setError(err.message); });
    return () => controller.abort();
  }, [clientId, isAdmin, reviewPage, activeSearch, outcomeFilter, actionFilter, sort]);

  useEffect(() => { setReviewPage(1); }, [clientId, isAdmin, activeSearch, outcomeFilter, actionFilter, sort]);
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reviewRecords = data?.records || [];
  const counts = data?.comparison_counts || {};
  const maximum = Math.max(1, ...Object.values(counts).map(Number));
  const changeSort = (key) => setSort((current) => ({
    key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  }));
  const sortArrow = (key) => sort.key === key ? (sort.direction === "asc" ? "▲" : "▼") : "⇅";

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

  const updateAction = async (claimId, actionStatus) => {
    setError("");
    const previousStatus = data.records.find((row) => row.claim_id === claimId)?.action_status || "YET_TO_START";
    setData((current) => ({ ...current, records: current.records.map((row) => row.claim_id === claimId ? { ...row, action_status: actionStatus } : row) }));
    try {
      const token = localStorage.getItem("onesmarter_admin_token");
      const body = { claim_id: claimId, action_status: actionStatus };
      if (isAdmin && clientId) body.client_id = clientId;
      if (isAdmin && !clientId) body.scope = "global";
      const response = await portalFetch("/edi835/api/reconciliation/actions/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Token ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.error || `Action update failed (${response.status}).`);
    } catch (err) {
      setError(err.message);
      setData((current) => ({ ...current, records: current.records.map((row) => row.claim_id === claimId ? { ...row, action_status: previousStatus } : row) }));
    }
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
            <div><div className="recon-eyebrow">{data.cycle?.processed_at ? `Latest RECON processed ${new Date(data.cycle.processed_at).toLocaleString()}` : "Current persisted data"}</div><h1>{data.source?.client_name || "Reconciliation"}</h1></div>
            <span className="recon-database-badge">Live database</span>
          </div>
          {data.message && <div className="recon-message">{data.message}</div>}
          <div className="recon-cash">
            <h3>Cash position for this cycle</h3>
            <CashRow label="Total Amount in MIR" value={data.cash?.total_amount_in_mir} />
            <CashRow label="Total Amount in RECON" value={data.cash?.total_amount_in_recon} />
            <CashRow label="Overpaid" value={data.cash?.overpaid} />
            <CashRow label="Underpaid" value={data.cash?.underpaid} />
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
          <div className="recon-review-controls"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search claim, amount, outcome, or action" aria-label="Search reconciliation review entries" /><select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)} aria-label="Filter by outcome"><option value="">All outcomes</option>{outcomeOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select><select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="Filter by action"><option value="">All actions</option><option value="YET_TO_START">Yet to Start</option><option value="IN_PROCESS">In Process</option><option value="HOLD">Hold</option><option value="REJECTED">Rejected</option><option value="APPROVED">Approved</option></select></div>
          <div className="recon-table-wrap"><table className="recon-review-table"><thead><tr><ReviewHeader label="Highmark Claim Number" field="highmark_claim_number" sort={sort} arrow={sortArrow} onSort={changeSort} /><ReviewHeader label="Internal Claim Number" field="internal_claim_number" sort={sort} arrow={sortArrow} onSort={changeSort} /><ReviewHeader label="Total Amount in MIR" field="mir901" sort={sort} arrow={sortArrow} onSort={changeSort} /><ReviewHeader label="Total Amount in RECON" field="recon_mir907" sort={sort} arrow={sortArrow} onSort={changeSort} /><ReviewHeader label="Outcome" field="status" sort={sort} arrow={sortArrow} onSort={changeSort} /><ReviewHeader label="Difference" field="difference" sort={sort} arrow={sortArrow} onSort={changeSort} /><ReviewHeader label="Action" field="action_status" sort={sort} arrow={sortArrow} onSort={changeSort} /></tr></thead>
            <tbody>{reviewRecords.length ? reviewRecords.map((row) => { const parts = claimParts(row); return <tr key={row.claim_id}><td>{parts.highmarkClaimNumber || "—"}</td><td>{row.mir_claim_id && onOpenClaim ? <button type="button" className="recon-claim-link" onClick={() => onOpenClaim({ mir_claim_id: row.mir_claim_id })}>{parts.internalClaimNumber || "—"}</button> : (parts.internalClaimNumber || "—")}</td><td>{money(row.mir901)}</td><td>{money(row.recon_mir907)}</td><td><span className="recon-tag bad">{statusLabel(row.status)}</span></td><td>{money(row.difference)}</td><td><select className="recon-action-select" value={row.action_status || "YET_TO_START"} onChange={(event) => updateAction(row.claim_id, event.target.value)} aria-label={`Action for claim ${row.claim_id}`}><option value="YET_TO_START">Yet to Start</option><option value="IN_PROCESS">In Process</option><option value="HOLD">Hold</option><option value="REJECTED">Rejected</option><option value="APPROVED">Approved</option></select></td></tr>; }) : <tr><td colSpan="7" className="recon-empty">No non-clear records require review.</td></tr>}</tbody>
          </table></div>
          {data.review_pagination && <div className="recon-pagination"><span>{Number(data.review_pagination.total || 0).toLocaleString()} non-clear entries · Page {data.review_pagination.page} of {data.review_pagination.total_pages}</span><div><button type="button" className="btn secondary" disabled={data.review_pagination.page <= 1} onClick={() => setReviewPage((page) => Math.max(1, page - 1))}>Previous</button><button type="button" className="btn secondary" disabled={data.review_pagination.page >= data.review_pagination.total_pages} onClick={() => setReviewPage((page) => page + 1)}>Next</button></div></div>}
          <div className="recon-actions"><button type="button" className="btn primary" onClick={downloadExport} disabled={exporting}>{exporting ? "Exporting…" : "Export this cycle"}</button></div>
          {data.policy?.interim && <div className="recon-policy"><b>Interim matching policy.</b> MIR907 and MIR908 are computed from the stored fee fields, and MPL920 is included as the final configured step. Records affected by this policy are called out above.</div>}
        </>}
      </div>
    </section>
  </div>;
}

function ReviewHeader({ label, field, sort, arrow, onSort }) {
  const active = sort.key === field;
  return <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" className={`recon-sort-button${active ? " active" : ""}`} onClick={() => onSort(field)}><span>{label}</span><span aria-hidden="true">{arrow(field)}</span></button></th>;
}

function CashRow({ label, value, total = false }) {
  return <div className={`recon-cash-row${total ? " total" : ""}`}><span>{label}</span><strong>{money(value)}</strong></div>;
}

function Tally({ value, label, detail = "" }) {
  return <div><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>;
}
