import React, { useEffect, useMemo, useRef, useState } from "react";
import ClaimOccurrenceTable, { type SortKey } from "./ClaimOccurrenceTable";
import { analyzeClaims, analysisCsv, type AnalysisFile } from "../utils/claimAnalysis";
import "./ClientAnalysis.css";

const endpoint = "/edi835/api/client-portal/analysis/";
const maxBytes = 10 * 1024 * 1024;

export default function ClientAnalysis() {
  const [submitted, setSubmitted] = useState<AnalysisFile | null>(null);
  const [received, setReceived] = useState<AnalysisFile | null>(null);
  const [busy, setBusy] = useState<"837" | "835" | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("837-only");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SortKey>("claim");
  const [direction, setDirection] = useState("asc");
  const active = useRef<AbortController | null>(null);
  const file837 = useRef<HTMLInputElement>(null), file835 = useRef<HTMLInputElement>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function upload(file: File | undefined, kind: "837" | "835") {
    if (!file || (kind === "835" && !submitted)) return;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setError(""); setBusy(kind); setReceived(null); setPage(1);
    setCategory("837-only");
    if (kind === "837") { setSubmitted(null); setSearch(""); setSearchInput(""); }
    try {
      if (!file.size || file.size > maxBytes) throw new Error("Choose a non-empty file up to 10 MB.");
      const tokenResponse = await fetch(endpoint, { credentials: "include", signal: controller.signal });
      const token = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !token.success) throw new Error(token.error || "Unable to start upload. Please sign in again.");
      const body = new FormData(); body.append("file", file); body.append("kind", kind);
      const response = await fetch(endpoint, { method: "POST", body, credentials: "include",
        headers: { "X-CSRFToken": token.csrf_token }, signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "The file could not be validated. Please try again.");
      if (controller.signal.aborted) return;
      if (kind === "837") setSubmitted(result.file);
      else { setReceived(result.file); setCategory("both"); }
    } catch (issue) {
      if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Upload failed.");
    } finally { if (!controller.signal.aborted) setBusy(null); }
  }

  const rows = useMemo(() => analyzeClaims(submitted, received), [submitted, received]);
  const filtered = useMemo(() => {
    const term = search.toUpperCase();
    const result = rows.filter(row => row.category === category && (!term || row.claim.includes(term)
      || row.occurrences.some(item => item.internal_number.toUpperCase().includes(term) || item.filename.toUpperCase().includes(term))));
    const value = (row: typeof result[number]): string | bigint | null => {
      if (sort === "billed_837" || sort === "billed_835" || sort === "difference") {
        const amount = row[sort]; return amount == null ? null : BigInt(amount.replace(".", ""));
      }
      if (sort === "source_type" || sort === "filename" || sort === "received_at") return row.occurrences[0][sort];
      return String(row[sort] ?? "");
    };
    return result.sort((a, b) => {
      const av = value(a), bv = value(b);
      if (av === null || bv === null) return av === bv ? a.claim.localeCompare(b.claim) : av === null ? 1 : -1;
      return ((av < bv ? -1 : av > bv ? 1 : a.claim.localeCompare(b.claim)) * (direction === "asc" ? 1 : -1));
    });
  }, [rows, category, search, sort, direction]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const count = (value: string) => rows.filter(row => row.category === value).length;
  function download() {
    const url = URL.createObjectURL(new Blob([analysisCsv(filtered)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    try {
      link.href = url; link.download = `filex-analysis_${category}.csv`; document.body.appendChild(link); link.click();
    } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500); }
  }

  return <div className="cu-analysis">
    <section className="cu-card cu-analysis-upload" aria-label="Upload claim files">
      <div className="cu-analysis-steps"><h2>Compare claim files</h2><span>1 · Upload 837 <span aria-hidden="true">→</span> 2 · Upload 835</span></div>
      <div className="cu-analysis-inputs">
        {(["837", "835"] as const).map(kind => {
          const file = kind === "837" ? submitted : received;
          const ref = kind === "837" ? file837 : file835;
          return <div key={kind} className="cu-analysis-file">
            <div><label htmlFor={`analysis-${kind}`}>{kind === "837" ? "837 · Submitted claims" : "835 · Payer response"}</label>
              <p title={file?.filename}>{file?.filename || (kind === "837" ? "Choose an 837 file to begin" : "Upload after the 837 is ready")}</p>
              <small role="status">{busy === kind ? `Validating ${kind}…` : file ? `${file.claims.length.toLocaleString()} claim occurrences · Validated` : "X12 file · Up to 10 MB"}</small>
            </div>
            <input id={`analysis-${kind}`} ref={ref} type="file" accept=".837,.835,.edi,.x12,.txt" className="cu-analysis-file-input"
              disabled={kind === "835" && (!submitted || !!busy)} onChange={event => {
                const selected = event.target.files?.[0]; event.target.value = ""; void upload(selected, kind);
              }} />
            <button className="cu-btn cu-analysis-upload-button" type="button"
              disabled={kind === "835" && (!submitted || !!busy)} onClick={() => ref.current?.click()}>
              {file ? `Replace ${kind}` : `Upload ${kind}`}</button>
          </div>;
        })}
      </div>
      <p className="cu-help">Validation checks X12 envelopes, transaction counts and billed amounts. Each new 837 starts a new comparison.</p>
      {error && <p className="cu-error" role="alert">{error}</p>}
    </section>
    <div className="cu-comparison-category"><span>Claim presence</span>
      <div className="cu-filters" role="group" aria-label="Claim presence">
        {[["both", "In both"], ["837-only", "In 837 only"]].map(([value, label]) => <button type="button" key={value}
          className={category === value ? "active" : ""} aria-pressed={category === value}
          onClick={() => { setCategory(value); setPage(1); }}>{label}<span className="cu-analysis-count">{count(value)}</span></button>)}
      </div>
    </div>
    <section className="cu-card cu-comparison" aria-label="Uploaded claim comparison">
      <div className="cu-section-title cu-comparison-heading"><div><h2>835/837 billed comparison</h2>
        <p className="cu-help">Compare billed charges from the uploaded files. Confirmed exact matches, including the sign, are excluded. Multiple occurrences stay grouped for review.</p></div>
        <div className="cu-comparison-header-actions"><span role="status">{filtered.length.toLocaleString()} claims</span>
          <button className="cu-btn" disabled={!filtered.length || !!busy} onClick={download}>Download CSV</button></div>
      </div>
      <form className="cu-835837-search cu-analysis-search" role="search" aria-label="Search uploaded claims"
        onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
        <label htmlFor="analysis-search">Search</label><input id="analysis-search" type="search" maxLength={100}
          autoComplete="off" placeholder="Claim, internal ID or filename" value={searchInput} onChange={event => setSearchInput(event.target.value)} />
        <button className="cu-btn" type="submit">Search</button>
        {(search || searchInput) && <button className="cu-btn" type="button" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>Clear</button>}
      </form>
      <ClaimOccurrenceTable rows={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)} showAge={false} showFileId={false}
        dateLabel="Uploaded (UTC)" sort={sort} direction={direction} onSort={key => {
          setSort(key); setDirection(sort === key && direction === "asc" ? "desc" : "asc"); setPage(1);
        }} emptyMessage={!submitted ? busy ? "Validating uploaded claims…" : "Upload an 837 file to see its claims." :
          category === "both" && !received ? "Upload an 835 file to compare billed charges." : "No claims match these filters. Confirmed exact matches are excluded."} />
      <div className="cu-comparison-footer"><p className="cu-help">Each row shows one file occurrence. Differences are shown only for one-to-one matches.</p>
        <div className="cu-comparison-pager"><label>Claims per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label><span>Page {currentPage} of {pages}</span>
          <button className="cu-btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <button className="cu-btn" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div></div>
    </section>
  </div>;
}
