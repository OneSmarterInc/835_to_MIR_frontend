import React, { useCallback, useEffect, useState } from "react";
import { AGE_OPTIONS, ClaimAgeSummary } from "./ClientClaimComparison";
import ClaimOccurrenceTable, { type Row, type SortKey } from "./ClaimOccurrenceTable";
import "./Client835837Status.css";

type Result = { rows: Row[]; count: number; page: number; pages: number; ambiguous_claims: number;
  occurrence_count: number; period?: { timezone: string };
  age_summary: { total: number; unknown: number; counts: Record<string, number> } };

// Accept the previous API shape while backend and frontend updates roll out.
function fileRows(row: Row): Row {
  if (row.occurrences) return row;
  return { ...row, ambiguous: false, occurrences: (["837", "835"] as const)
    .filter(kind => kind === "837" || row.record_835_id != null)
    .map(kind => ({ key: `${row.key}:${kind}`, record_id: kind === "835" ? row.record_835_id! : 0,
      source_type: kind, filename: kind === "837" ? row.source_837 : row.source_835,
      file_id: "", claim_sequence: 0, received_at: "", internal_number: row.internal_number,
      billed_837: kind === "837" ? row.billed_837 : null, billed_835: kind === "835" ? row.billed_835 : null })) };
}
export default function Client835837Status({ periodQuery, refresh, onOpen }: {
  periodQuery: string; refresh: number; onOpen: (id: number) => void;
}) {
  const [category, setCategory] = useState("both");
  const [age, setAge] = useState("all");
  const [sort, setSort] = useState<SortKey>("waiting_days");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
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
  const params = useCallback(() => {
    const query = new URLSearchParams(periodQuery);
    query.set("category", category); query.set("age_band", age);
    query.set("sort", sort); query.set("direction", direction);
    if (search) query.set("search", search);
    return query;
  }, [periodQuery, category, age, sort, direction, search]);
  useEffect(() => {
    if (!periodQuery) { setData(null); setLoading(false); return; }
    const controller = new AbortController();
    const query = params(); query.set("page", String(page)); query.set("page_size", String(pageSize));
    setLoading(true); setData(null); setError(""); setExportError("");
    fetch("/edi835/api/client-portal/comparison-835-837/?" + query, { credentials: "include", signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Unable to load 835/837 status.");
        if (!controller.signal.aborted) setData({ ...result, rows: result.rows.map(fileRows) });
      }).catch(issue => { if (!controller.signal.aborted) setError(issue.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [periodQuery, params, page, pageSize, refresh, retry]);
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
  const zone = data?.period?.timezone || "UTC";
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
          <p className="cu-help">{category === "both" ? "Billed differences and claims with multiple file occurrences. Confirmed exact matches, including the sign, are excluded." : "837 claims with no matching 835 record."}
            {" "}Each file occurrence has its own row. Dates select 837 arrivals; 835s are checked across all dates.</p></div>
        <div className="cu-comparison-header-actions">
          <span role="status">{loading ? "Updating…" : data ? `${data.count.toLocaleString()} claims${data.occurrence_count == null ? "" : ` · ${data.occurrence_count.toLocaleString()} file occurrences`}` : "—"}</span>
          <button type="button" className="cu-btn cu-export-btn" disabled={loading || exporting || !data}
            onClick={exportCsv}>{exporting ? "Preparing CSV…" : "Download CSV"}</button>
        </div>
      </div>
      {!!data?.ambiguous_claims && data.occurrence_count != null && <p className="cu-help cu-issue-warning" role="status">{data.ambiguous_claims} {data.ambiguous_claims === 1 ? "claim has" : "claims have"} multiple file occurrences, shown below for review. A billed difference is shown only for a confirmed one-to-one pair.</p>}
      <div className="cu-age-toolbar">
        <form className="cu-835837-search" role="search" aria-label="Search 835/837 claims" onSubmit={event => {
          event.preventDefault(); setSearch(searchInput.trim()); setPage(1);
        }}>
          <label htmlFor="cu-835837-search">Search</label>
          <input id="cu-835837-search" type="search" value={searchInput} maxLength={100}
            placeholder="Claim, internal ID or filename" autoComplete="off" disabled={exporting}
            onChange={event => setSearchInput(event.target.value)} />
          <button type="submit" className="cu-btn" disabled={exporting}>Search</button>
          {(searchInput || search) && <button type="button" className="cu-btn" disabled={exporting}
            onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}>Clear</button>}
        </form>
        <label className="cu-age-filter">Waiting days <select value={age} disabled={exporting}
          onChange={event => { setAge(event.target.value); setPage(1); }}>
          {AGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <div className="cu-age-legend" aria-label="Days badge colors">
          {AGE_OPTIONS.slice(1).map(([value, label]) => <span key={value}><i className={"cu-age-swatch cu-row-age-" + value} aria-hidden="true" />{label}</span>)}
        </div>
        <small>Age uses the oldest selected 837 for each claim. Search and paging keep its file rows together. Received dates: {zone}.</small>
      </div>
      {error && <div><p className="cu-error" role="alert">{error}</p><button className="cu-btn" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      {exportError && <p className="cu-error" role="alert">{exportError}</p>}
      <ClaimOccurrenceTable rows={data?.rows || []} zone={zone} loading={loading} exporting={exporting}
        error={error} sort={sort} direction={direction} onOpen={onOpen}
        onSort={key => { setSort(key); setDirection(key === sort && direction === "desc" ? "asc" : "desc"); setPage(1); }}
        emptyMessage={category === "both" ? "No billed differences or multiple-file claims match these filters. Confirmed exact matches are excluded." : "No claims match the selected period and filters."} />
      <div className="cu-comparison-footer"><p className="cu-help">Amounts belong to the file on that row. Multiple-file groups are not summed or arbitrarily paired. CSV includes every displayed file occurrence.</p>
        <div className="cu-comparison-pager"><label>Claims per page <select value={pageSize} disabled={loading || exporting} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label>
          <span>Page {data?.page || page} of {data?.pages || 1}</span>
          <button className="cu-btn" disabled={loading || exporting || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
          <button className="cu-btn" disabled={loading || exporting || !data || page >= data.pages} onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      </div>
    </section>
  </>;
}
