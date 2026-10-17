import React, { useEffect, useState } from "react";
import { downloadAnalysis, readAnalysis, type AnalysisUploadSummary } from "../utils/analysisApi";

type Rejections = { rejections: { sequence: number; reason: string }[]; total: number };

function RejectionReport({ file, open }: { file: AnalysisUploadSummary; open: boolean }) {
  const [report, setReport] = useState<Rejections | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || report) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    void readAnalysis<Rejections>(new URLSearchParams({ view: "rejections", upload: file.id }), controller.signal)
      .then(result => { if (!controller.signal.aborted) { setReport(result); setLoading(false); } })
      .catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Unable to load rejected claims."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, file.id, report, retry]);
  async function download() {
    setDownloading(true); setError("");
    try {
      await downloadAnalysis(new URLSearchParams({ view: "rejection-export", upload: file.id }), `${file.filename}-rejections.csv`);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to download the report."); }
    finally { setDownloading(false); }
  }
  return <section>
    <strong>{file.filename}</strong>
    <p>{file.accepted_count} accepted · {file.rejected_count} rejected</p>
    <button type="button" className="cu-link" disabled={downloading} onClick={download}>{downloading ? "Downloading…" : "Download rejection report"}</button>
    {loading && <p role="status">Loading rejected claims…</p>}
    {error && <p role="alert">{error} <button type="button" className="cu-link" onClick={() => { if (report) void download(); else setRetry(value => value + 1); }}>Retry</button></p>}
    <ul>{report?.rejections.map(issue => <li key={issue.sequence}>{issue.reason}</li>)}</ul>
    {(report?.total ?? 0) > 20 && <small>Showing the first 20 issues. Download the report for all issues.</small>}
  </section>;
}

export default function AnalysisUploadResults({ files, kind }: { files: AnalysisUploadSummary[]; kind: "837" | "835" }) {
  const [open, setOpen] = useState(false);
  const accepted = files.reduce((sum, file) => sum + file.accepted_count, 0);
  const rejected = files.reduce((sum, file) => sum + file.rejected_count, 0);
  if (!files.length) return null;
  return <div className="cu-analysis-claim-results" aria-label={`${kind} claim results`}>
    <p role="status" aria-live="polite">Claims accepted <strong>{accepted.toLocaleString()}</strong>
      <span>Claims rejected <strong>{rejected.toLocaleString()}</strong></span></p>
    {rejected > 0 && <details className="cu-analysis-rejections" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Review rejected claims</summary>
      <div className="cu-analysis-rejection-list">{files.filter(file => file.rejected_count).map(file =>
        <RejectionReport key={file.id} file={file} open={open} />)}</div>
    </details>}
  </div>;
}
