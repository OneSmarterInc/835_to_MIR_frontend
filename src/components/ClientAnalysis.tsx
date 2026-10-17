import React, { useEffect, useMemo, useRef, useState } from "react";
import AnalysisComparisonTable from "./AnalysisComparisonTable";
import AnalysisClaimDetail from "./AnalysisClaimDetail";
import AnalysisUploadResults from "./AnalysisUploadResults";
import { analyzeClaims, analysisCsv, type AnalysisFile, type AnalysisSortKey, isAnalysisMismatch } from "../utils/claimAnalysis";
import "./ClientAnalysis.css";

const endpoint = "/edi835/api/client-portal/analysis/";
const maxBytes = 10 * 1024 * 1024;
type UploadProgress = { queued: number; processing: number; saved: number; failed: number; filename: string };

export default function ClientAnalysis({ claimNumber = null, onClaimChange }: {
  claimNumber?: string | null; onClaimChange?: (claim: string | null) => void;
} = {}) {
  const [files, setFiles] = useState<AnalysisFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [pending, setPending] = useState<Partial<Record<"837" | "835", File[]>>>({});
  const [notices, setNotices] = useState<Partial<Record<"837" | "835", string>>>({});
  const [progress, setProgress] = useState<Partial<Record<"837" | "835", UploadProgress>>>({});
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<"837" | "835", string[]>>>({});
  const [localClaim, setLocalClaim] = useState<string | null>(null);
  const selectedClaim = onClaimChange ? claimNumber : localClaim;
  const setSelectedClaim = onClaimChange || setLocalClaim;
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
  const [busyKinds, setBusyKinds] = useState<Partial<Record<"837" | "835", boolean>>>({});
  const busy = !!busyKinds["837"] || !!busyKinds["835"];
  const [error, setError] = useState("");
  const [category, setCategory] = useState("837-only");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<AnalysisSortKey>("claim");
  const [direction, setDirection] = useState("asc");
  const active = useRef<Partial<Record<"837" | "835", AbortController>>>({});
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
  useEffect(() => {
    const controllers = active.current;
    return () => { Object.values(controllers).forEach(controller => controller?.abort()); };
  }, []);

  async function upload(selected: File[] | undefined, kind: "837" | "835") {
    if (!selected?.length || active.current[kind] || loading || loadFailed) return;
    const controller = new AbortController(); active.current[kind] = controller;
    setPending(current => ({ ...current, [kind]: selected }));
    setUploadErrors(current => ({ ...current, [kind]: [] }));
    setNotices(current => ({ ...current, [kind]: "" }));
    setBusyKinds(current => ({ ...current, [kind]: true }));
    setProgress(current => ({ ...current, [kind]: { queued: selected.length, processing: 0, saved: 0, failed: 0, filename: "" } }));
    const failures: string[] = [];
    let savedCount = 0, reusedCount = 0;
    try {
      // Each source has its own bounded queue. A failure never discards other
      // selected files, and the other source can upload independently.
      let csrfToken: string | null = null;
      for (const [index, file] of selected.entries()) {
        if (controller.signal.aborted) break;
        setProgress(current => ({ ...current, [kind]: { queued: selected.length - index - 1, processing: 1, saved: savedCount, failed: failures.length, filename: file.name } }));
        try {
          if (!file.size || file.size > maxBytes) throw new Error("Choose a non-empty file up to 10 MB.");
          if (!csrfToken) {
            const tokenResponse = await fetch(`${endpoint}?csrf_only=1`, { credentials: "include", signal: controller.signal });
            const token = await tokenResponse.json().catch(() => ({}));
            if (!tokenResponse.ok || !token.success) throw new Error(token.error || "Unable to start upload. Please sign in again.");
            csrfToken = token.csrf_token;
          }
          const body = new FormData(); body.append("file", file); body.append("kind", kind);
          const response = await fetch(endpoint, { method: "POST", body, credentials: "include",
            headers: { "X-CSRFToken": csrfToken! }, signal: controller.signal });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success || result.saved !== true) throw new Error(result.error || "The file could not be saved. Please retry.");
          if (controller.signal.aborted) break;
          setFiles(current => [...current.filter(item => item.id !== result.file.id), result.file]);
          setPending(current => ({ ...current, [kind]: current[kind]?.filter(item => item !== file) }));
          savedCount++; if (result.reused) reusedCount++;
        } catch (issue) {
          if (!controller.signal.aborted) {
            failures.push(`${file.name}: ${issue instanceof Error ? issue.message : "Upload failed. Please retry."}`);
            setUploadErrors(current => ({ ...current, [kind]: [...failures] }));
          }
        } finally {
          if (!controller.signal.aborted) setProgress(current => ({ ...current,
            [kind]: { queued: selected.length - index - 1, processing: 0, saved: savedCount, failed: failures.length, filename: "" },
          }));
        }
      }
      if (!controller.signal.aborted) {
        setUploadErrors(current => ({ ...current, [kind]: failures }));
        if (!failures.length) {
          const input = kind === "837" ? file837.current : file835.current;
          if (input) input.value = "";
        }
        if (savedCount) {
          setNotices(current => ({ ...current, [kind]: `${savedCount} ${savedCount === 1 ? "file" : "files"} saved${reusedCount ? ` (${reusedCount} already saved)` : ""}. ${failures.length ? "Retry the remaining files." : "Ready for another upload."}` }));
          setCategory(kind === "835" || received.length ? "both" : "837-only");
          setPage(1); setSearch(""); setSearchInput("");
        }
      }
    } finally {
      delete active.current[kind];
      if (!controller.signal.aborted) setBusyKinds(current => ({ ...current, [kind]: false }));
    }
  }

  const rows = useMemo(() => analyzeClaims(submitted, received), [submitted, received]);
  const filtered = useMemo(() => {
    const term = search.toUpperCase();
    const result = rows.filter(row => (category === "both" ? isAnalysisMismatch(row) : row.category === "837-only") && (!term || row.claim.includes(term)
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
  const count = (value: string) => rows.filter(row => value === "both" ? isAnalysisMismatch(row) : row.category === "837-only").length;
  function download() {
    const url = URL.createObjectURL(new Blob([analysisCsv(filtered)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    try {
      link.href = url; link.download = `filex-analysis_${category === "both" ? "mismatch-amount" : "missing-in-835"}.csv`; document.body.appendChild(link); link.click();
    } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500); }
  }

  const detail = rows.find(row => row.key === selectedClaim);
  if (detail) return <div className="cu-analysis"><AnalysisClaimDetail row={detail} onBack={() => {
    returnFocus.current = detail.key; setSelectedClaim(null);
  }} /></div>;
  if (selectedClaim) return <section className="cu-card">
    <button type="button" className="cu-back-link" onClick={() => setSelectedClaim(null)}>← Back to Analysis</button>
    {loading ? <p role="status">Loading claim…</p> : <p role="alert">{loadFailed ? error : "This claim is not available in your Analysis files."}</p>}
    {loadFailed && <button type="button" className="cu-btn" onClick={() => setLoadVersion(value => value + 1)}>Retry loading</button>}
  </section>;

  return <div className="cu-analysis">
    <section className="cu-card cu-analysis-upload" aria-label="Upload claim files">
      <div className="cu-analysis-steps"><h2>Compare claim files</h2></div>
      <div className="cu-analysis-inputs">
        {(["837", "835"] as const).map(kind => {
          const saved = kind === "837" ? submitted : received;
          const selected = pending[kind] || [];
          const disabled = loading || loadFailed || !!busyKinds[kind];
          const ref = kind === "837" ? file837 : file835;
          const status = progress[kind];
          return <div key={kind} className="cu-analysis-file">
            <div><label htmlFor={`analysis-${kind}`}>{kind === "837" ? "837 · Submitted claims" : "835 · Payer response"}</label>
              <p title={selected.map(file => file.name).join(", ")}>{selected.length ? selected.map(file => file.name).join(", ") : `Choose an ${kind} file`}</p>
              <small role="status">{busyKinds[kind] ? `Validating and saving ${kind}…` : selected.length ? "Not confirmed saved · Retry or choose another file" : `Total saved: ${saved.length.toLocaleString()} ${saved.length === 1 ? "file" : "files"} · Up to 10 MB per file`}</small>
            </div>
            {/* X12 sources may be extensionless; the server validates their contents. */}
            <input id={`analysis-${kind}`} ref={ref} type="file" multiple className="cu-analysis-file-input"
              disabled={disabled} onChange={event => { void upload(Array.from(event.target.files || []), kind); }} />
            <button className="cu-btn cu-analysis-upload-button" type="button"
              disabled={disabled} onClick={() => ref.current?.click()}>Upload {kind}</button>
            {selected.length > 0 && !busyKinds[kind] && <button className="cu-btn" type="button" disabled={disabled} onClick={() => void upload(selected, kind)}>Retry {kind}</button>}
            {status && <div className="cu-analysis-progress" role="status" aria-live="polite" aria-atomic="true" aria-label={`${kind} upload status`}>
              <div className="cu-analysis-progress-counts">
                <span data-stage="queued">Queued <b>{status.queued}</b></span>
                <span data-stage="processing">Processing <b>{status.processing}</b></span>
                <span data-stage="saved">Saved <b>{status.saved}</b></span>
                <span data-stage="failed" className={status.failed ? "has-failures" : ""}>Failed <b>{status.failed}</b></span>
              </div>
              {status.filename && <small className="cu-analysis-processing-file">Processing: {status.filename}</small>}
            </div>}
            {notices[kind] && <p className="cu-analysis-upload-notice" role="status">{notices[kind]}</p>}
            <AnalysisUploadResults files={saved} kind={kind} />
            {!!uploadErrors[kind]?.length && <div className="cu-error cu-analysis-upload-errors" role="alert">{uploadErrors[kind]?.map((message, index) => <p key={index}>{message}</p>)}</div>}
          </div>;
        })}
      </div>
      <p className="cu-help">Valid claims are saved; claims with validation issues are listed for review. Invalid X12 envelopes prevent the file from being processed. Each upload adds to this analysis.</p>
      {loading && <p role="status">Loading saved Analysis files…</p>}
      {error && <p className="cu-error" role="alert">{error}</p>}
      {loadFailed && <button className="cu-btn" onClick={() => setLoadVersion(value => value + 1)}>Retry loading</button>}
    </section>
    <div className="cu-comparison-category"><span>Claim status</span>
      <div className="cu-filters" role="group" aria-label="Claim status">
        {[["both", "Mismatch amount"], ["837-only", "Missing in 835"]].map(([value, label]) => <button type="button" key={value}
          className={category === value ? "active" : ""} aria-pressed={category === value}
          onClick={() => { setCategory(value); setPage(1); }}>{label}<span className="cu-analysis-count">{count(value)}</span></button>)}
      </div>
    </div>
    <section className="cu-card cu-comparison" aria-label="Uploaded claim comparison">
      <div className="cu-section-title cu-comparison-heading"><div><h2>Billed and allowed comparison</h2>
        <p className="cu-help">Compare 837 billed charges (CLM02) with 835 billed charges (CLP03) and allowed amount (payment + patient responsibility). When CLP05 is omitted, patient responsibility comes from PR adjustments, or zero when none are present. Claims matching both comparisons are excluded.</p></div>
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
        }} emptyMessage={loading ? "Loading saved Analysis files…" : loadFailed ? "Saved Analysis files could not be loaded." : !submitted.length ? busy ? "Validating uploaded claims…" : received.length ? "835 data saved. Upload an 837 file to compare claims." : "Upload a file to begin." :
          category === "both" && !received.length ? "Upload an 835 file to compare claim amounts." : category === "both" ? "No mismatches or unresolved comparisons match these filters. Claims matching both comparisons are excluded." : "No claims missing in 835 match these filters."} />
      <div className="cu-comparison-footer"><p className="cu-help">One row per claim. Open a claim to see its source files and individual amounts. Missing amounts stay unknown.</p>
        <div className="cu-comparison-pager"><label>Claims per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label><span>Page {currentPage} of {pages}</span>
          <button className="cu-btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <button className="cu-btn" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div></div>
    </section>
  </div>;
}
