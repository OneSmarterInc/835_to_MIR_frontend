import React, { useEffect, useState } from "react";
import { AGE_OPTIONS, claimAgeBand, ClaimAgeSummary } from "./ClientClaimComparison";
import { encodeDemoValue } from "../utils/demoEncoder";
import "./Client835837Status.css";

type Row = { key: string; claim: string; internal_number: string; waiting_days: number;
  billed_837: string; billed_835: string | null; difference: string | null;
  status: string; source_837: string; source_835: string; record_835_id: number | null };
type Result = { rows: Row[]; count: number; page: number; pages: number; ambiguous_claims: number;
  age_summary: { total: number; unknown: number; counts: Record<string, number> } };
const columns: [keyof Row, string][] = [["waiting_days", "Waiting days"], ["claim", "Claim"],
  ["internal_number", "Internal claim"], ["billed_837", "Billed 837"], ["billed_835", "Billed 835"],
  ["difference", "Billed difference"], ["status", "835/837 status"], ["source_837", "837 source"]];
const money = (value: string | null) => value == null ? "—" : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
const safe = (value: string) => value ? encodeDemoValue(value, true) : "—";

export default function Client835837Status({ periodQuery, refresh, onOpen }: {
  periodQuery: string; refresh: number; onOpen: (id: number) => void;
}) {
  const [category, setCategory] = useState("both");
  const [age, setAge] = useState("all");
  const [sort, setSort] = useState<keyof Row>("waiting_days");
  const [direction, setDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setPage(1); setData(null); }, [periodQuery]);
  const params = () => {
    const query = new URLSearchParams(periodQuery);
    query.set("category", category); query.set("age_band", age);
    query.set("sort", sort); query.set("direction", direction);
    return query;
  };
  useEffect(() => {
    if (!periodQuery) { setData(null); setLoading(false); return; }
    const controller = new AbortController();
    const query = params(); query.set("page", String(page)); query.set("page_size", String(pageSize));
    setLoading(true); setData(null); setError(""); setExportError("");
    fetch("/edi835/api/client-portal/comparison-835-837/?" + query, { credentials: "include", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Unable to load 835/837 status.");
        if (!controller.signal.aborted) setData(result);
      }).catch(issue => { if (!controller.signal.aborted) setError(issue.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [periodQuery, category, age, sort, direction, page, pageSize, refresh, retry]);
  const exportCsv = async () => {
    setExporting(true); setExportError("");
    try {
      const query = params(); query.set("format", "csv");
      const response = await fetch("/edi835/api/client-portal/comparison-835-837/?" + query, { credentials: "include" });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/csv")) {
        throw new Error("CSV export failed. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      try {
        link.href = url; link.download = `filex-835-837_${category}_${age}.csv`;
        document.body.appendChild(link); link.click();
      } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500); }
    } catch (issue) { setExportError(issue instanceof Error ? issue.message : "CSV export failed."); }
    finally { setExporting(false); }
  };
  return <>
    <div className="cu-comparison-category">
      <span>Claim presence</span><div className="cu-filters" role="group" aria-label="Claim presence">
        {[["both", "In both"], ["837-only", "In 837 only"]].map(([value, label]) =>
          <button type="button" key={value} className={category === value ? "active" : ""}
            aria-pressed={category === value} disabled={exporting} onClick={() => { setCategory(value); setPage(1); }}>
            {label}</button>)}
      </div>
    </div>
    <ClaimAgeSummary summary={!loading && !error ? data?.age_summary : null} loading={loading} />
    <section className="cu-card cu-comparison" aria-label="835 and 837 claim comparison">
      <div className="cu-section-title cu-comparison-heading">
        <div><h2>835/837 billed comparison</h2>
          <p className="cu-help">{category === "both" ? "Claims present in both files with different billed amounts." : "837 claims with no matching 835 record."}
            {" "}Dates select 837 arrivals; matching 835s are checked across all dates. Waiting days start at 837 receipt.</p></div>
        <div className="cu-comparison-header-actions">
          <span role="status">{loading ? "Updating…" : data ? data.count.toLocaleString() + " claims" : "—"}</span>
          <button type="button" className="cu-btn cu-export-btn" disabled={loading || exporting || !data}
            onClick={exportCsv}>{exporting ? "Preparing CSV…" : "Download CSV"}</button>
        </div>
      </div>
      {!!data?.ambiguous_claims && <p className="cu-help" role="status">{data.ambiguous_claims} {data.ambiguous_claims === 1 ? "claim group has" : "claim groups have"} duplicate or ambiguous matches in this period and {data.ambiguous_claims === 1 ? "is" : "are"} excluded from these results.</p>}
      <div className="cu-age-toolbar">
        <label className="cu-age-filter">Waiting days <select value={age} disabled={exporting}
          onChange={event => { setAge(event.target.value); setPage(1); }}>
          {AGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <div className="cu-age-legend" aria-label="Days badge colors">
          {AGE_OPTIONS.slice(1).map(([value, label]) => <span key={value}><i className={"cu-age-swatch cu-row-age-" + value} aria-hidden="true" />{label}</span>)}
        </div>
        <small>10, 20 and 30 days start the next band. Differences compare billed charges, not payments.</small>
      </div>
      {error && <div><p className="cu-error" role="alert">{error}</p><button className="cu-btn" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      {exportError && <p className="cu-error" role="alert">{exportError}</p>}
      <div className="cu-table-scroll cu-comparison-scroll" aria-busy={loading}>
        <table className="cu-table cu-comparison-table cu-835837-table">
          <thead><tr>{columns.map(([key, label]) => <th key={key} aria-sort={key === sort ? direction === "asc" ? "ascending" : "descending" : "none"}>
            <button type="button" disabled={loading || exporting} onClick={() => {
              setSort(key); setDirection(key === sort && direction === "desc" ? "asc" : "desc"); setPage(1);
            }}><span>{label}</span><span aria-hidden="true">{key === sort ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button>
          </th>)}</tr></thead>
          <tbody>{data?.rows.map(row => <tr key={row.key} className={"cu-row-age-" + claimAgeBand(row.waiting_days)}>
            <td><span className="cu-age-pill" title="Days since 837 receipt">{row.waiting_days === 0 ? "Today" : row.waiting_days + " days"}</span></td>
            <td>{row.record_835_id ? <button className="cu-link" onClick={() => onOpen(row.record_835_id!)}>{safe(row.claim)}</button> : safe(row.claim)}</td>
            <td>{safe(row.internal_number)}</td>
            <td className="cu-num">{money(row.billed_837)}</td><td className="cu-num">{money(row.billed_835)}</td>
            <td className="cu-num">{money(row.difference)}</td>
            <td><span className="cu-issue-error" title={row.source_835 ? "835 source: " + row.source_835 : "No 835 found across available history"}>{row.status}</span></td>
            <td className="cu-835837-source" title={row.source_837}>{row.source_837}</td>
          </tr>)}
          {!data?.rows.length && <tr><td colSpan={columns.length} className="cu-empty-comparison">
            {loading ? "Loading 835/837 comparisons…" : error ? "Unable to display claims." : "No claims match the selected period and filters."}
          </td></tr>}</tbody>
        </table>
      </div>
      <div className="cu-comparison-footer"><p className="cu-help">Missing 835 amounts are shown as unknown, never as $0. Billed difference is the absolute difference between 837 and 835 charges.</p>
        <div className="cu-comparison-pager"><label>Rows <select value={pageSize} disabled={loading || exporting} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label>
          <span>Page {data?.page || page} of {data?.pages || 1}</span>
          <button className="cu-btn" disabled={loading || exporting || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
          <button className="cu-btn" disabled={loading || exporting || !data || page >= data.pages} onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      </div>
    </section>
  </>;
}
