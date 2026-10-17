import React from "react";
import type { AnalysisFile } from "../utils/claimAnalysis";

function downloadRejections(file: AnalysisFile) {
  const lines = ["Claim occurrence,Reason", ...(file.rejections || []).map(issue =>
    `${issue.sequence},"${issue.reason.replaceAll('"', '""')}"`)];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${file.filename}-rejections.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function AnalysisUploadResults({ files, kind }: { files: AnalysisFile[]; kind: "837" | "835" }) {
  const accepted = files.reduce((sum, file) => sum + (file.accepted_count ?? file.claims.length), 0);
  const rejected = files.reduce((sum, file) => sum + (file.rejected_count ?? 0), 0);
  if (!files.length) return null;
  return <div className="cu-analysis-claim-results" aria-label={`${kind} claim results`}>
    <p role="status" aria-live="polite">Claims accepted <strong>{accepted.toLocaleString()}</strong>
      <span>Claims rejected <strong>{rejected.toLocaleString()}</strong></span></p>
    {rejected > 0 && <details className="cu-analysis-rejections">
      <summary>Review rejected claims</summary>
      <div className="cu-analysis-rejection-list">{files.filter(file => file.rejected_count).map(file => <section key={file.id}>
        <strong>{file.filename}</strong>
        <p>{file.accepted_count ?? file.claims.length} accepted · {file.rejected_count} rejected</p>
        <button type="button" className="cu-link" onClick={() => downloadRejections(file)}>Download rejection report</button>
        <ul>{file.rejections?.slice(0, 20).map(issue => <li key={issue.sequence}>{issue.reason}</li>)}</ul>
        {(file.rejections?.length ?? 0) > 20 && <small>Showing the first 20 issues. Download the report for all issues.</small>}
      </section>)}</div>
    </details>}
  </div>;
}
