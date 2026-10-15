import React, { useEffect, useState } from "react";
import { encodeDemoValue } from "../utils/demoEncoder";
import "./ClientClaimComparison.css";

const COLUMNS = [
  ["waiting_days", "Waiting days"],
  ["claim", "Claim"],
  ["internal_number", "Internal claim"],
  ["billed_835", "Billed 835"],
  ["paid_mir", "Paid MIR"],
  ["recon_amount", "Recon"],
  ["mismatch_amount", "Mismatch"],
  ["payer_status", "Payer status"],
  ["hold_reason", "Why waiting"],
  ["latest_note", "Latest note / action"],
  ["status", "Status"],
];
const safeClaim = value => value ? encodeDemoValue(String(value), true) : "—";
const dollars = value => value == null || value === "" || !Number.isFinite(Number(value))
  ? "—" : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
const categoryKey = filter => ({ All: "all", Denied: "denied",
  "Less paid": "less", "Paid in full": "paid" })[filter] || "all";
const makeParams = ({periodQuery, payerFilter, sort, direction, page, pageSize}) => {
  const params = new URLSearchParams(periodQuery);
  params.set("payer_status", categoryKey(payerFilter));
  params.set("sort", sort);
  params.set("direction", direction);
  if (page != null) params.set("page", String(page));
  if (pageSize != null) params.set("page_size", String(pageSize));
  return params;
};

export default function ClientClaimComparison({ periodQuery, refresh, onOpen, payerFilter = "All", onFinancialTotals }) {
  const [sort, setSort] = useState("waiting_days");
  const [direction, setDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => { setPage(1); setData(null); setExportError(""); }, [periodQuery, payerFilter]);
  useEffect(() => {
    if (onFinancialTotals) onFinancialTotals(data?.financial_totals || null);
  }, [data, onFinancialTotals]);
  useEffect(() => {
    if (!periodQuery) { setData(null); setLoading(false); return undefined; }
    const controller = new AbortController();
    const params = makeParams({periodQuery, payerFilter, sort, direction, page, pageSize});
    // Retain the current page during sorting to prevent column widths, row
    // height and scroll positions from jumping while the new order loads.
    // Date/payer filter changes still clear stale records above.
    setLoading(true); setError("");
    fetch("/edi835/api/client-portal/comparison/?" + params, {
      credentials: "include", signal: controller.signal,
    }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Comparison could not be loaded");
      return body;
    }).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(reason => { if (reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [periodQuery, payerFilter, sort, direction, page, pageSize, refresh]);

  const changeSort = key => {
    if (loading || exporting) return;
    if (key === sort) setDirection(previous => previous === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection(key === "waiting_days" ? "desc" : "asc"); }
    setPage(1);
  };
  const exportFilteredCsv = async () => {
    if (!periodQuery || exporting || loading || !data) return;
    setExporting(true);
    setExportError("");
    try {
      const params = makeParams({periodQuery, payerFilter, sort, direction});
      params.set("format", "csv");
      const response = await fetch("/edi835/api/client-portal/comparison/?" + params.toString(), {
        credentials: "include", headers: { Accept: "text/csv" },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "The CSV export failed.");
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/csv")) throw new Error("Unexpected export response.");
      const blob = await response.blob();
      const fileName = (response.headers.get("Content-Disposition") || "")
        .match(/filename="([^"]+\.csv)"/i)?.[1] ||
        ("filex-claim-comparison-" + payerFilter.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".csv");
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
    } catch (issue) {
      setExportError(issue.message || "CSV could not be downloaded.");
    } finally {
      setExporting(false);
    }
  };
  const stats = data?.summary || {};
  const num = n => Number(n || 0).toLocaleString("en-US");
  const rows = data?.rows || [];
  return <section className="cu-card cu-comparison" aria-label="835, MIR and Recon claim comparison">
    <div className="cu-section-title cu-comparison-heading">
      <div><h2>Claims, payments and reconciliation</h2>
        <p className="cu-help">One table for claim age, payer amounts, notes and reconciliation status. MIR billed remains in the financial totals and discrepancy calculations.
          {payerFilter !== "All" && " Payer category: " + payerFilter + "."}
          {" "}Each stream uses its own date within the selected period.</p></div>
      <div className="cu-comparison-header-actions">
        <span className="cu-compare-count" role="status">{loading ? "Updating…" : num(data?.count)} claims</span>
        <button type="button" className="cu-btn cu-export-btn"
          onClick={exportFilteredCsv} disabled={!periodQuery || loading || exporting || !data}
          title="Download every visible comparison and held claim column for all rows matching the current filters, in the selected sort order">
          {exporting ? "Preparing CSV…" : "Download CSV"}
        </button>
      </div>
    </div>
    <div className="cu-comparison-summary" aria-label="Comparison results">
      <div className="cu-summary-mismatch">
        <small>Billed gap · 835 vs MIR</small>
        <strong>{loading ? "…" : data ? dollars(stats.billed_gap_amount) : "—"}</strong>
        <span>Absolute difference between billed totals in the selected filters</span>
      </div>
      <div className="cu-summary-mismatch">
        <small>Matched-amount mismatch</small>
        <strong>{loading ? "…" : data ? dollars(stats.confirmed_mismatch_amount) : "—"}</strong>
        <span>Sum of absolute differences where both records exist</span>
      </div>
      <div><small>Mismatch</small><strong>{loading ? "…" : data ? num(stats.mismatch) : "—"}</strong>
        <span>Includes missing-stream claims</span></div>
      <div><small>Clear</small><strong>{loading ? "…" : data ? num(stats.clear) : "—"}</strong>
        <span>Both comparisons agree</span></div>
      <div><small>Missing data</small><strong>{loading ? "…" : data ? num(stats.missing_streams) : "—"}</strong>
        <span>Not treated as $0</span></div>
    </div>
    {error && <p role="alert" className="cu-error">Could not load comparison: {error}</p>}
    {exportError && <p role="alert" className="cu-error">Could not download CSV: {exportError}</p>}
    <div className={"cu-table-scroll cu-comparison-scroll" + (loading ? " cu-comparison-updating" : "")} aria-busy={loading}>
      <table className="cu-table cu-comparison-table">
        <colgroup>{[10, 11, 8, 9, 8, 9, 9, 9, 11, 9, 7].map((width, index) =>
          <col key={COLUMNS[index][0]} style={{ width: width + "%" }} />
        )}</colgroup>
        <thead><tr>{COLUMNS.map(([key, label]) => <th key={key}
          aria-sort={sort === key ? (direction === "asc" ? "ascending" : "descending") : "none"}>
          <button type="button" disabled={loading || exporting} onClick={() => changeSort(key)}
            title={"Sort by " + label + (sort === key ? ", reverse order" : "")}>
            <span>{label}</span>
            <span className="cu-sort-arrows" aria-hidden="true">{sort === key ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
          </button>
        </th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.key} title={row.reason}
          className={row.is_held ? (row.waiting_days >= 3 ? "cu-claim-hold-overdue" : "cu-claim-hold-recent") : ""}>
          <td className="cu-waiting-cell">
            {row.waiting_days == null ? <span className="cu-age-none" title="No dated source event is available">—</span> :
              <span className={"cu-age-pill " + (row.waiting_days >= 3 ? "cu-age-critical" :
                row.waiting_days >= 1 ? "cu-age-warning" : "cu-age-today")}
                title={(row.is_held ? "Claim held · " : "Claim age · ") +
                  (row.waiting_basis === "835 received" ? "days since 835 receipt" :
                    "days since latest available activity")}>
                {row.waiting_days === 0 ? "Today" :
                  row.waiting_days + (row.waiting_days === 1 ? " day" : " days")}
              </span>}
          </td>
          <td>{row.record_id ? <button className="cu-link" onClick={() => onOpen(row.record_id)}>{safeClaim(row.claim)}</button> : safeClaim(row.claim)}</td>
          <td>{safeClaim(row.internal_number)}</td>
          <td className="cu-num">{dollars(row.billed_835)}</td>
          <td className="cu-num">{dollars(row.paid_mir)}</td>
          <td className="cu-num">{dollars(row.recon_amount)}</td>
          <td className={"cu-num " + (row.mismatch_amount && Number(row.mismatch_amount) !== 0 ? "cu-variance" : "")}>
            {dollars(row.mismatch_amount)}
          </td>
          <td>{row.payer_status || "—"}</td>
          <td className="cu-hold-reason">{row.hold_reason || "—"}</td>
          <td className="cu-note-cell">
            {row.action_status ? <span className="cu-note-label">{row.action_status}</span> : null}
            {row.latest_note ? <span className="cu-note-preview" title={row.latest_note}>{row.latest_note}</span> : (!row.action_status ? "—" : null)}
          </td>
          <td><span className={"cu-compare-badge " + (row.status === "Clear" ? "clear" : "mismatch")}>
            {row.status}</span>{row.status === "Mismatch" && <small className="cu-compare-reason">{row.reason}</small>}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan={COLUMNS.length} className="cu-empty-comparison">
          {loading ? "Loading period comparisons…" : error ? "Unable to display records." :
           "No 835, MIR or Recon claim records in the selected period."}
        </td></tr>}
        </tbody>
      </table>
    </div>
    <div className="cu-comparison-footer">
      <p className="cu-help">A missing MIR/Recon record is marked Mismatch, but its unknown financial difference is excluded from the confirmed dollar variance.</p>
      <div className="cu-comparison-pager">
        <label>Rows <select value={pageSize} disabled={loading} onChange={event => {
          setPageSize(Number(event.target.value)); setPage(1);
        }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
        <span>Page {data?.page || page} of {data?.pages || 1}</span>
        <button type="button" className="cu-btn" disabled={loading || page <= 1}
          onClick={() => setPage(p => p - 1)}>Previous</button>
        <button type="button" className="cu-btn" disabled={loading || !data || page >= data.pages}
          onClick={() => setPage(p => p + 1)}>Next</button>
      </div>
    </div>
  </section>;
}
