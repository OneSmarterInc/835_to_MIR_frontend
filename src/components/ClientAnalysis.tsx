import React, { useEffect, useMemo, useRef, useState } from "react";
import AnalysisComparisonTable from "./AnalysisComparisonTable";
import AnalysisClaimDetail from "./AnalysisClaimDetail";
import { analyzeClaims, analysisCsv, type AnalysisFile, type AnalysisSortKey } from "../utils/claimAnalysis";
import "./ClientAnalysis.css";

const endpoint = "/edi835/api/client-portal/analysis/";
const maxBytes = 10 * 1024 * 1024;

export default function ClientAnalysis() {
  const [files, setFiles] = useState<AnalysisFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [pending, setPending] = useState<Partial<Record<"837" | "835", File>>>({});
  const [notice, setNotice] = useState("");
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    if (selectedClaim === null && returnFocus.current) {
      const button = [...document.querySelectorAll<HTMLButtonElement>("button[data-analysis-claim]")]
        .find(item => item.dataset.analysisClaim === returnFocus.current);
      button?.focus(); returnFocus.current = null;
    }
  }, [selectedClaim]);
  const submitted = useMemo(() => files.filter(file => file.kind === "837"), [files]);
  const received = useMemo(() => files.filter(file => file.kind === "835"), [files]);
  const [busy, setBusy] = useState<"837" | "835" | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("837-only");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<AnalysisSortKey>("claim");
  const [direction, setDirection] = useState("asc");
  const active = useRef<AbortController | null>(null);
  const file837 = useRef<HTMLInputElement>(null), file835 = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadFailed(false); setError("");
    async function load() {
      try {
        const loaded: AnalysisFile[] = [];
        let cursor: string | null = null;
        do {
          const response = await fetch(cursor ? `${endpoint}?after=${encodeURIComponent(cursor)}` : endpoint,
            { credentials: "include", signal: controller.signal });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success || !Array.isArray(result.files)) throw new Error(result.error || "Unable to load saved Analysis files.");
          loaded.push(...result.files); cursor = result.next_cursor;
        } while (cursor && !controller.signal.aborted);
        if (!controller.signal.aborted) {
          setFiles(loaded); setCategory(loaded.some(file => file.kind === "835") ? "both" : "837-only");
        }
      } catch (issue) {
        if (!controller.signal.aborted) {
          setLoadFailed(true); setError(issue instanceof Error ? issue.message : "Unable to load saved Analysis files.");
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [loadVersion]);
  useEffect(() => () => active.current?.abort(), []);

  async function upload(file: File | undefined, kind: "837" | "835") {
    if (!file || busy || loading || loadFailed || (kind === "835" && !submitted.length)) return;
    const controller = new AbortController(); active.current = controller;
    setPending(current => ({ ...current, [kind]: file }));
    setError(""); setNotice(""); setBusy(kind);
    try {
      if (!file.size || file.size > maxBytes) throw new Error("Choose a non-empty file up to 10 MB.");
      const tokenResponse = await fetch(`${endpoint}?csrf_only=1`, { credentials: "include", signal: controller.signal });
      const token = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !token.success) throw new Error(token.error || "Unable to start upload. Please sign in again.");
      const body = new FormData(); body.append("file", file); body.append("kind", kind);
      const response = await fetch(endpoint, { method: "POST", body, credentials: "include",
        headers: { "X-CSRFToken": token.csrf_token }, signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success || result.saved !== true) throw new Error(result.error || "The file could not be saved. Please retry.");
      if (controller.signal.aborted) return;
      setFiles(current => [...current.filter(item => item.id !== result.file.id), result.file]);
      setPending(current => ({ ...current, [kind]: undefined }));
      const input = kind === "837" ? file837.current : file835.current;
      if (input) input.value = "";
      setNotice(`${file.name} ${result.reused ? "is already saved" : "saved"}. Ready for another upload.`);
      setCategory(kind === "835" ? "both" : "837-only");
      setPage(1); setSearch(""); setSearchInput("");
    } catch (issue) {
      if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Upload failed. Please retry.");
    } finally { if (!controller.signal.aborted) setBusy(null); }
  }

  const rows = useMemo(() => analyzeClaims(submitted, received), [submitted, received]);
  const filtered = useMemo(() => {
    const term = search.toUpperCase();
    const result = rows.filter(row => row.category === category && (!term || row.claim.includes(term)
      || row.occurrences.some(item => item.internal_number.toUpperCase().includes(term) || item.filename.toUpperCase().includes(term))));
    const value = (row: typeof result[number]): string | bigint | null => {
      if (sort === "billed_837" || sort === "billed_835" || sort === "difference" || sort === "allowed_difference"
          || sort === "payment" || sort === "patient_responsibility" || sort === "allowed") {
        const amount = row[sort]; return amount == null ? null : BigInt(amount.replace(".", ""));
      }
      if (sort === "filename") return row.occurrences[0].filename;
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

  const detail = rows.find(row => row.key === selectedClaim);
  if (detail) return <div className="cu-analysis"><AnalysisClaimDetail row={detail} onBack={() => {
    returnFocus.current = detail.key; setSelectedClaim(null);
  }} /></div>;

  return <div className="cu-analysis">
    <section className="cu-card cu-analysis-upload" aria-label="Upload claim files">
      <div className="cu-analysis-steps"><h2>Compare claim files</h2><span>1 · Upload 837 <span aria-hidden="true">→</span> 2 · Upload 835</span></div>
      <div className="cu-analysis-inputs">
        {(["837", "835"] as const).map(kind => {
          const saved = kind === "837" ? submitted : received;
          const selected = pending[kind];
          const disabled = loading || loadFailed || !!busy || (kind === "835" && !submitted.length);
          const ref = kind === "837" ? file837 : file835;
          return <div key={kind} className="cu-analysis-file">
            <div><label htmlFor={`analysis-${kind}`}>{kind === "837" ? "837 · Submitted claims" : "835 · Payer response"}</label>
              <p title={selected?.name}>{selected?.name || `Choose an ${kind} file`}</p>
              <small role="status">{busy === kind ? `Validating and saving ${kind}…` : selected ? "Not confirmed saved · Retry or choose another file" : `${saved.length.toLocaleString()} ${saved.length === 1 ? "file" : "files"} saved · Up to 10 MB per file`}</small>
            </div>
            <input id={`analysis-${kind}`} ref={ref} type="file" accept=".837,.835,.edi,.x12,.txt" className="cu-analysis-file-input"
              disabled={disabled} onChange={event => { void upload(event.target.files?.[0], kind); }} />
            <button className="cu-btn cu-analysis-upload-button" type="button"
              disabled={disabled} onClick={() => ref.current?.click()}>Upload {kind}</button>
            {selected && !busy && <button className="cu-btn" type="button" disabled={disabled} onClick={() => void upload(selected, kind)}>Retry {kind}</button>}
          </div>;
        })}
      </div>
      <p className="cu-help">Validation checks X12 envelopes, transaction counts and claim amounts. Saved uploads remain available here; each upload adds to this analysis.</p>
      {loading && <p role="status">Loading saved Analysis files…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p className="cu-error" role="alert">{error}</p>}
      {loadFailed && <button className="cu-btn" onClick={() => setLoadVersion(value => value + 1)}>Retry loading</button>}
    </section>
    <div className="cu-comparison-category"><span>Claim presence</span>
      <div className="cu-filters" role="group" aria-label="Claim presence">
        {[["both", "In both"], ["837-only", "In 837 only"]].map(([value, label]) => <button type="button" key={value}
          className={category === value ? "active" : ""} aria-pressed={category === value}
          onClick={() => { setCategory(value); setPage(1); }}>{label}<span className="cu-analysis-count">{count(value)}</span></button>)}
      </div>
    </div>
    <section className="cu-card cu-comparison" aria-label="Uploaded claim comparison">
      <div className="cu-section-title cu-comparison-heading"><div><h2>Billed and allowed comparison</h2>
        <p className="cu-help">Compare 837 billed charges (CLM02) with 835 billed charges (CLP03) and allowed amount (CLP04 + CLP05). Each comparison shows its own status and absolute difference.</p></div>
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
      <AnalysisComparisonTable rows={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
        onOpenClaim={setSelectedClaim} disabled={!!busy}
        sort={sort} direction={direction} onSort={key => {
          setSort(key); setDirection(sort === key && direction === "asc" ? "desc" : "asc"); setPage(1);
        }} emptyMessage={loading ? "Loading saved Analysis files…" : loadFailed ? "Saved Analysis files could not be loaded." : !submitted.length ? busy ? "Validating uploaded claims…" : "Upload an 837 file to see its claims." :
          category === "both" && !received.length ? "Upload an 835 file to compare claim amounts." : "No claims match these filters."} />
      <div className="cu-comparison-footer"><p className="cu-help">One row per claim. Open a claim to see its source files and individual amounts. Missing amounts stay unknown.</p>
        <div className="cu-comparison-pager"><label>Claims per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label><span>Page {currentPage} of {pages}</span>
          <button className="cu-btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <button className="cu-btn" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div></div>
    </section>
  </div>;
}
