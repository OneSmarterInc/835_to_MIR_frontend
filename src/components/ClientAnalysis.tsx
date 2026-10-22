import React, { useEffect, useRef, useState } from "react";
import AnalysisComparisonTable from "./AnalysisComparisonTable";
import AnalysisClaimDetail from "./AnalysisClaimDetail";
import AnalysisUploadResults from "./AnalysisUploadResults";
import type { AnalysisRow, AnalysisSortKey } from "../utils/claimAnalysis";
import { analysisEndpoint as endpoint, readAnalysis, downloadAnalysis, type AnalysisPage, type AnalysisUploadSummary } from "../utils/analysisApi";
import "./ClientAnalysis.css";

const maxBytes = 10 * 1024 * 1024;
type UploadProgress = { queued: number; processing: number; saved: number; failed: number; filename: string };

export default function ClientAnalysis({ claimNumber = null, onClaimChange }: {
  claimNumber?: string | null; onClaimChange?: (claim: string | null) => void;
} = {}) {
  const [data, setData] = useState<AnalysisPage>({ rows: [], total: 0, page: 1, pages: 1,
    category: "837-only", counts: { both: 0, matched: 0, "837-only": 0 }, file_counts: { "837": 0, "835": 0 } });
  const [detail, setDetail] = useState<AnalysisRow | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fetching, setLoading] = useState(true);
  const [settledQuery, setSettledQuery] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [pending, setPending] = useState<Partial<Record<"837" | "835", File[]>>>({});
  const [notices, setNotices] = useState<Partial<Record<"837" | "835", string>>>({});
  const [progress, setProgress] = useState<Partial<Record<"837" | "835", UploadProgress>>>({});
  const [runFiles, setRunFiles] = useState<Partial<Record<"837" | "835", AnalysisUploadSummary[]>>>({});
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
  const [busyKinds, setBusyKinds] = useState<Partial<Record<"837" | "835", boolean>>>({});
  const busy = !!busyKinds["837"] || !!busyKinds["835"];
  const [error, setError] = useState("");
  const [category, setCategory] = useState("auto");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<AnalysisSortKey>("claim");
  const [direction, setDirection] = useState("asc");
  // Invalidate visible results during render, before the fetch effect runs.
  const queryKey = JSON.stringify([loadVersion, category, search, page, pageSize, sort, direction]);
  const loading = fetching || settledQuery !== queryKey;
  const active = useRef<Partial<Record<"837" | "835", AbortController>>>({});
  const file837 = useRef<HTMLInputElement>(null), file835 = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadFailed(false); setError("");
    async function load() {
      try {
        const result = await readAnalysis<AnalysisPage>(new URLSearchParams({ view: "comparison", category,
          search, page: String(page), page_size: String(pageSize), sort, direction }), controller.signal);
        if (!controller.signal.aborted) setData(result);
      } catch (issue) {
        if (!controller.signal.aborted) {
          setLoadFailed(true); setError(issue instanceof Error ? issue.message : "Unable to load saved Analysis files.");
        }
      } finally {
        if (!controller.signal.aborted) { setSettledQuery(queryKey); setLoading(false); }
      }
    }
    void load();
    return () => controller.abort();
  }, [loadVersion, category, search, page, pageSize, sort, direction, queryKey]);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null); setDetailError("");
    if (!selectedClaim) { setDetailLoading(false); return () => controller.abort(); }
    setDetailLoading(true);
    void readAnalysis<{ row: AnalysisRow }>(new URLSearchParams({ view: "claim", claim: selectedClaim }), controller.signal)
      .then(result => { if (!controller.signal.aborted) setDetail(result.row); })
      .catch(issue => { if (!controller.signal.aborted) setDetailError(issue instanceof Error ? issue.message : "Unable to load claim."); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedClaim, loadVersion]);
  useEffect(() => {
    const controllers = active.current;
    return () => { Object.values(controllers).forEach(controller => controller?.abort()); };
  }, []);

  async function upload(selected: File[] | undefined, kind: "837" | "835") {
    if (!selected?.length || active.current[kind] || loading || loadFailed) return;
    const controller = new AbortController(); active.current[kind] = controller;
    setPending(current => ({ ...current, [kind]: selected }));
    setUploadErrors(current => ({ ...current, [kind]: [] }));
    setRunFiles(current => ({ ...current, [kind]: [] }));
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
          const response = await fetch(`${endpoint}?compact=1`, { method: "POST", body, credentials: "include",
            headers: { "X-CSRFToken": csrfToken! }, signal: controller.signal });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success || result.saved !== true) throw new Error(result.error || "The file could not be saved. Please retry.");
          if (controller.signal.aborted) break;
          setRunFiles(current => ({ ...current,
            [kind]: [...(current[kind] || []).filter(item => item.id !== result.file.id), result.file],
          }));
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
          setLoadVersion(value => value + 1);
        }
      }
    } finally {
      delete active.current[kind];
      if (!controller.signal.aborted) setBusyKinds(current => ({ ...current, [kind]: false }));
    }
  }

  const { rows, total, pages, page: currentPage, file_counts: fileCounts } = data;
  const displayedCategory = category === "auto" ? data.category : category;
  const count = (value: string) => data.counts[value as keyof AnalysisPage["counts"]] ?? 0;
  async function download() {
    setExporting(true); setError("");
    try {
      await downloadAnalysis(new URLSearchParams({ view: "excel", search, sort, direction }),
        "Claims-Reconciliation.xlsx");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to download Excel."); }
    finally { setExporting(false); }
  }

  if (detail && detail.claim === selectedClaim) return <div className="cu-analysis"><AnalysisClaimDetail row={detail} onBack={() => {
    returnFocus.current = detail.key; setSelectedClaim(null);
  }} /></div>;
  if (selectedClaim) return <section className="cu-card">
    <button type="button" className="cu-back-link" onClick={() => setSelectedClaim(null)}>← Back to Analysis</button>
    {detailLoading ? <p role="status">Loading claim…</p> : <p role="alert">{detailError || "This claim is not available in your Analysis files."}</p>}
    {detailError && <button type="button" className="cu-btn" onClick={() => setLoadVersion(value => value + 1)}>Retry loading</button>}
  </section>;

  return <div className="cu-analysis">
    <section className="cu-card cu-analysis-upload" aria-label="Upload claim files">
      <div className="cu-analysis-steps"><h2>Compare claim files</h2><span>Up to 10 MB per file</span></div>
      <div className="cu-analysis-inputs">
        {(["837", "835"] as const).map(kind => {
          const saved = fileCounts[kind];
          const selected = pending[kind] || [];
          const disabled = loading || loadFailed || !!busyKinds[kind];
          const ref = kind === "837" ? file837 : file835;
          const status = progress[kind];
          return <div key={kind} className="cu-analysis-file">
            <div><label htmlFor={`analysis-${kind}`}>{kind === "837" ? "837 · Submitted claims" : "835 · Payer response"}</label>
              <p title={selected.map(file => file.name).join(", ")}>{selected.length ? selected.map(file => file.name).join(", ") : `Choose an ${kind} file`}</p>
              <small role="status">{busyKinds[kind] ? `Validating and saving ${kind}…` : selected.length ? "Not confirmed saved · Retry or choose another file" : `Total saved: ${saved.toLocaleString()} ${saved === 1 ? "file" : "files"}`}</small>
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
            {!!runFiles[kind]?.length && <AnalysisUploadResults files={runFiles[kind]!} kind={kind} />}
            {!!uploadErrors[kind]?.length && <div className="cu-error cu-analysis-upload-errors" role="alert">{uploadErrors[kind]?.map((message, index) => <p key={index}>{message}</p>)}</div>}
          </div>;
        })}
      </div>
      {error && <p className="cu-error" role="alert">{error}</p>}
      {loadFailed && <button className="cu-btn" onClick={() => setLoadVersion(value => value + 1)}>Retry loading</button>}
    </section>
    <section className="cu-card cu-comparison" aria-label="Uploaded claim comparison" aria-busy={loading}>
      <div className="cu-section-title cu-comparison-heading"><div><h2>Billed and allowed comparison</h2>
        <details className="cu-analysis-explainer"><summary>Comparison details</summary>
          <p>Compare 837 billed charges (CLM02) with the totals of all distinct 835 records for the claim: billed charges (CLP03) and allowed amount (payment + patient responsibility). Negative amounts reduce the totals. When CLP05 is omitted, patient responsibility comes from PR adjustments, or zero when none are present. Matched amount shows claims where both comparisons match. Differences and unresolved comparisons appear under Mismatch amount.</p>
          <p>Valid claims are saved; rejected claims are available for review. Invalid X12 envelopes prevent processing. Each upload adds to this analysis.</p>
        </details></div>
        <div className="cu-comparison-header-actions"><span role="status">{loading ? "Loading claims…" : loadFailed ? "Results unavailable" : `${total.toLocaleString()} claims`}</span>
          <button className="cu-btn" title="Download all three claim statuses with the current search" disabled={!Object.values(data.counts).some(value => value > 0) || !!busy || loading || exporting || loadFailed} onClick={download}>{exporting ? "Downloading…" : "Download Excel"}</button></div>
      </div>
      <div className="cu-analysis-toolbar">
        <div className="cu-analysis-status-filter"><span>Claim status</span>
          <div className="cu-filters" role="group" aria-label="Claim status">
            {[["both", "Mismatch amount"], ["matched", "Matched amount"], ["837-only", "Missing in 835"]].map(([value, label]) => <button type="button" key={value}
              className={displayedCategory === value ? "active" : ""} aria-pressed={displayedCategory === value}
              onClick={() => { setCategory(value); setPage(1); }}>{label}<span className="cu-analysis-count">{count(value)}</span></button>)}
          </div>
        </div>
        <form className="cu-835837-search cu-analysis-search" role="search" aria-label="Search uploaded claims"
          onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
          <label htmlFor="analysis-search">Search</label><input id="analysis-search" type="search" maxLength={100}
            autoComplete="off" placeholder="Claim, internal ID or filename" value={searchInput} onChange={event => setSearchInput(event.target.value)} />
          <button className="cu-btn" type="submit">Search</button>
          {(search || searchInput) && <button className="cu-btn" type="button" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>Clear</button>}
        </form>
      </div>
      <AnalysisComparisonTable rows={loading || loadFailed ? [] : rows} loading={loading} loadingRows={rows.length || Math.min(pageSize, 10)}
        onOpenClaim={setSelectedClaim} disabled={!!busy || loading || loadFailed}
        sort={sort} direction={direction} onSort={key => {
          setSort(key); setDirection(sort === key && direction === "asc" ? "desc" : "asc"); setPage(1);
        }} emptyMessage={loading ? "Loading Analysis results…" : loadFailed ? "Analysis results could not be loaded." : !fileCounts["837"] ? busy ? "Validating uploaded claims…" : fileCounts["835"] ? "835 data saved. Upload an 837 file to compare claims." : "Upload a file to begin." :
          displayedCategory !== "837-only" && !fileCounts["835"] ? "Upload an 835 file to compare claim amounts." : displayedCategory === "matched" ? "No claims match both billed and allowed amounts with these filters." : displayedCategory === "both" ? "No mismatches or unresolved comparisons match these filters. Claims matching both comparisons are excluded." : "No claims missing in 835 match these filters."} />
      <div className="cu-comparison-footer"><p className="cu-help">Open a claim for source files and amounts. — means unavailable.</p>
        <div className="cu-comparison-pager"><label>Claims per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {[10, 25, 50].map(value => <option key={value}>{value}</option>)}</select></label><span>{loading ? "Loading page…" : loadFailed ? "Page unavailable" : `Page ${currentPage} of ${pages}`}</span>
          <button className="cu-btn" disabled={loading || loadFailed || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <button className="cu-btn" disabled={loading || loadFailed || currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </div></div>
    </section>
  </div>;
}
