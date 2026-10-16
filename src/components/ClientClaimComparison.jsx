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
  ["issue_label", "835/MIR status"],
  ["latest_note_action", "Latest note / action"],
  ["payer_status", "Payer status"],
];
const safeClaim = value => value ? encodeDemoValue(String(value), true) : "—";
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dollars = value => value == null || value === "" || !Number.isFinite(Number(value))
  ? "—" : currency.format(value);

export function ComparisonStatus({ row, recon = false }) {
  const prefix = recon ? "recon_issue" : "issue";
  // Older API responses did not compare 835 paid. Never reuse their match label.
  const available = recon ? Boolean(row.recon_issue_label) : Object.hasOwn(row, "paid_835");
  const label = available ? row[prefix + "_label"] : "Status unavailable";
  const detail = available ? row[prefix + "_detail"] : "Updated comparison data is not available yet.";
  const tone = available ? row[prefix + "_tone"] : "neutral";
  return <details className="cu-comparison-detail">
    <summary className={"cu-issue-brief cu-issue-" + (tone || "neutral")} title={detail}>
      {label || "Status unavailable"}
    </summary>
    <span className="cu-comparison-facts">{detail}</span>
  </details>;
}
const categoryKey = filter => ({ All: "all", Denied: "denied",
  "Less paid": "less", "Paid in full": "paid" })[filter] || "all";
export const claimAgeBand = days => days == null || days === "" || !Number.isFinite(Number(days)) || Number(days) < 0
  ? "unknown" : Number(days) < 10 ? "0-10" : Number(days) < 20 ? "10-20" : Number(days) < 30 ? "20-30" : "30-plus";
export const AGE_OPTIONS = [["all", "All"], ["0-10", "0–10 days"], ["10-20", "10–20 days"],
  ["20-30", "20–30 days"], ["30-plus", "30+ days"]];
const makeParams = ({periodQuery, payerFilter, ageFilter, sort, direction, page, pageSize}) => {
  const params = new URLSearchParams(periodQuery);
  params.set("payer_status", categoryKey(payerFilter));
  params.set("age_band", ageFilter);
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
  const [ageFilter, setAgeFilter] = useState("all");
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
    const params = makeParams({periodQuery, payerFilter, ageFilter, sort, direction, page, pageSize});
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
  }, [periodQuery, payerFilter, ageFilter, sort, direction, page, pageSize, refresh]);

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
      const params = makeParams({periodQuery, payerFilter, ageFilter, sort, direction});
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
  // Comparison summary is hidden: const stats = data?.summary || {};
  const num = n => Number(n || 0).toLocaleString("en-US");
  const rows = data?.rows || [];
  const ageSummary = !loading && !error ? data?.age_summary : null;
  const maxAgeCount = Math.max(1, ...Object.values(ageSummary?.counts || {}));
  return <>
    <section className="cu-card cu-aging-summary" aria-label="Claims waiting by days" aria-busy={loading}>
      <div className="cu-section-title">
        <h2>Claims waiting by days</h2>
        <span>{loading ? "Updating…" : ageSummary ? num(ageSummary.total) + " claims in selected view" : "Age summary unavailable"}</span>
      </div>
      <div className="cu-aging-grid">
        {AGE_OPTIONS.slice(1).map(([band, label]) => <div className={"cu-aging-row cu-row-age-" + band} key={band}>
          <span className={band === "30-plus" ? "cu-old" : ""}>{label}</span>
          <div className="cu-track"><i style={{ width: ((ageSummary?.counts[band] || 0) / maxAgeCount * 100) + "%" }} /></div>
          <b>{ageSummary ? num(ageSummary.counts[band]) + " claims" : "—"}</b>
        </div>)}
      </div>
      <p className="cu-help">Uses the same waiting days and filters as the table below, across all pages.
        {ageSummary?.unknown > 0 && ` ${num(ageSummary.unknown)} claims have unknown age and are excluded from the bands.`}
      </p>
    </section>
    <section className="cu-card cu-comparison" aria-label="835, MIR and Recon claim comparison">
    <div className="cu-section-title cu-comparison-heading">
      <div><h2>Claims, payments and reconciliation</h2>
        <p className="cu-help">835/MIR status compares billed to billed and paid to paid. Recon separately compares MIR paid to Recon paid. Expand a status for amounts and details.
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
    {/* Comparison summary cards hidden at the client's request.
    <div className="cu-comparison-summary" aria-label="Comparison results">
      <div className="cu-summary-mismatch">
        <small>Billed gap · 835 vs MIR</small>
        <strong>{loading ? "…" : data ? dollars(stats.billed_gap_amount) : "—"}</strong>
        <span>Absolute difference between billed totals in the selected filters</span>
      </div>
      <div className="cu-summary-mismatch">
        <small>Matched-amount mismatch</small>
        <strong>{loading ? "…" : data ? dollars(stats.confirmed_mismatch_amount) : "—"}</strong>
        <span>835/MIR billed + 835/MIR paid + MIR/Recon paid differences; complete, unique records only</span>
      </div>
      <div><small>Mismatch</small><strong>{loading ? "…" : data ? num(stats.mismatch) : "—"}</strong>
        <span>Includes missing-stream claims</span></div>
      <div><small>Clear</small><strong>{loading ? "…" : data ? num(stats.clear) : "—"}</strong>
        <span>All three comparisons agree; unique, complete records</span></div>
      <div><small>Missing data</small><strong>{loading ? "…" : data ? num(stats.missing_streams) : "—"}</strong>
        <span>Not treated as $0</span></div>
    </div>
    */}
    <div className="cu-age-toolbar">
      <label className="cu-age-filter">Waiting days
        <select value={ageFilter} disabled={exporting} onChange={event => {
          setAgeFilter(event.target.value); setPage(1); setData(null); setExportError("");
        }}>
          {AGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="cu-age-legend" aria-label="Days badge colors">
        {AGE_OPTIONS.slice(1).map(([value, label]) => <span key={value}>
          <i className={"cu-age-swatch cu-row-age-" + value} aria-hidden="true" />{label}
        </span>)}
      </div>
      <small>10, 20 and 30 days start the next band. Unknown age appears in All.</small>
    </div>
    {error && <p role="alert" className="cu-error">Could not load comparison: {error}</p>}
    {exportError && <p role="alert" className="cu-error">Could not download CSV: {exportError}</p>}
    <div className={"cu-table-scroll cu-comparison-scroll" + (loading ? " cu-comparison-updating" : "")} aria-busy={loading}>
      <table className="cu-table cu-comparison-table">
        <colgroup>{[10, 11, 9, 10, 9, 9, 9, 16, 9, 8].map((width, index) =>
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
          className={"cu-row-age-" + claimAgeBand(row.waiting_days)}>
          <td className="cu-waiting-cell">
            {row.waiting_days == null ? <span className="cu-age-none" title="No dated source event is available">—</span> :
              <span className="cu-age-pill"
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
          <td className="cu-num cu-recon-cell">
            {dollars(row.recon_amount)}
            <ComparisonStatus row={row} recon />
          </td>
          <td className={"cu-num " + (row.mismatch_amount && Number(row.mismatch_amount) !== 0 ? "cu-variance" : "")}>
            {dollars(row.mismatch_amount)}
          </td>
          <td className="cu-issue-cell">
            <ComparisonStatus row={row} />
          </td>
          <td className="cu-note-cell">
            {row.latest_note_action ?
              <span className={"cu-note-brief" + (row.action_status === "Pending review" ? " cu-note-pending" : "")}
                title={row.latest_note_action}>
                {row.latest_note_action}
              </span> : <span className="cu-muted">—</span>}
          </td>
          <td className="cu-payer-cell">
            <span className={"cu-payer-brief " + (
              row.payer_status === "Paid in full" ? "cu-payer-paid" :
              row.payer_status === "Denied" || row.payer_status === "No payment" ? "cu-payer-denied" :
              row.payer_status === "Paid less than billed" ? "cu-payer-partial" : ""
            )} title={row.payer_status || "No payer status"}>
              {row.payer_status || "—"}
            </span>
          </td>
        </tr>)}
        {!rows.length && <tr><td colSpan={COLUMNS.length} className="cu-empty-comparison">
          {loading ? "Loading period comparisons…" : error ? "Unable to display records." :
           "No claim records match the selected period and filters."}
        </td></tr>}
        </tbody>
      </table>
    </div>
    <div className="cu-comparison-footer">
      <p className="cu-help">Missing, incomplete or duplicate sources cannot confirm a match. Their affected comparisons are excluded from the dollar variance. This variance sums comparison differences; it is not an amount owed.</p>
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
  </section></>;
}
