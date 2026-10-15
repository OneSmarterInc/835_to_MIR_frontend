import React, { useEffect, useState } from "react";
import "./ClientClaimComparison.css";

const COLUMNS = [
  ["claim", "Claim"],
  ["date", "Latest activity"],
  ["billed_835", "Billed 835"],
  ["billed_mir", "Billed MIR"],
  ["paid_mir", "Paid MIR"],
  ["recon_amount", "Paid Recon"],
  ["mismatch_amount", "Mismatch amount"],
  ["status", "Status"],
];
const dollars = value => value == null || value === "" || !Number.isFinite(Number(value))
  ? "—" : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
const when = (value, zone) => value ? new Date(value).toLocaleDateString("en-US", {
  year: "numeric", month: "short", day: "numeric",
  timeZone: zone || "America/New_York",
}) : "—";

export default function ClientClaimComparison({ periodQuery, refresh, onOpen }) {
  const [sort, setSort] = useState("date");
  const [direction, setDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(1); setData(null); }, [periodQuery]);
  useEffect(() => {
    if (!periodQuery) { setData(null); setLoading(false); return undefined; }
    const controller = new AbortController();
    const params = new URLSearchParams(periodQuery);
    params.set("sort", sort);
    params.set("direction", direction);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
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
  }, [periodQuery, sort, direction, page, pageSize, refresh]);

  const changeSort = key => {
    if (key === sort) setDirection(previous => previous === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection(key === "date" ? "desc" : "asc"); }
    setPage(1);
    setData(null);
  };
  const stats = data?.summary || {};
  const num = n => Number(n || 0).toLocaleString("en-US");
  const rows = loading ? [] : data?.rows || [];
  return <section className="cu-card cu-comparison" aria-label="835, MIR and Recon claim comparison">
    <div className="cu-section-title cu-comparison-heading">
      <div><h2>835 · MIR · Recon comparison</h2>
        <p className="cu-help">835 billed ↔ MIR billed; MIR paid ↔ Recon paid. Values use each stream's date in the selected filter.</p></div>
      <span>{loading ? "Comparing…" : num(data?.count)} claims</span>
    </div>
    <div className="cu-comparison-summary" aria-label="Comparison results">
      <div className="cu-summary-mismatch">
        <small>Confirmed mismatch amount</small>
        <strong>{loading ? "…" : dollars(stats.confirmed_mismatch_amount)}</strong>
        <span>Sum of absolute differences where both records exist</span>
      </div>
      <div><small>Mismatch</small><strong>{loading ? "…" : num(stats.mismatch)}</strong>
        <span>Includes missing-stream claims</span></div>
      <div><small>Clear</small><strong>{loading ? "…" : num(stats.clear)}</strong>
        <span>Both comparisons agree</span></div>
      <div><small>Missing source</small><strong>{loading ? "…" : num(stats.missing_streams)}</strong>
        <span>Not treated as $0</span></div>
    </div>
    {error && <p role="alert" className="cu-error">Could not load comparison: {error}</p>}
    <div className="cu-table-scroll">
      <table className="cu-table cu-comparison-table">
        <thead><tr>{COLUMNS.map(([key, label]) => <th key={key}
          aria-sort={sort === key ? (direction === "asc" ? "ascending" : "descending") : "none"}>
          <button type="button" onClick={() => changeSort(key)}
            title={"Sort by " + label + (sort === key ? ", reverse order" : "")}>
            <span>{label}</span>
            <span className="cu-sort-arrows" aria-hidden="true">{sort === key ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
          </button>
        </th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.key} title={row.reason}>
          <td>{row.claim_id ? <button className="cu-link" onClick={() => onOpen(row.claim_id)}>{row.claim}</button> : row.claim}</td>
          <td>{when(row.date, data?.period?.timezone)}</td>
          <td className="cu-num">{dollars(row.billed_835)}</td>
          <td className="cu-num">{dollars(row.billed_mir)}</td>
          <td className="cu-num">{dollars(row.paid_mir)}</td>
          <td className="cu-num">{dollars(row.recon_amount)}</td>
          <td className={"cu-num " + (row.mismatch_amount && Number(row.mismatch_amount) !== 0 ? "cu-variance" : "")}>
            {dollars(row.mismatch_amount)}
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
