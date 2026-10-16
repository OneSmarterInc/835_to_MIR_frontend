import React, { useEffect, useState } from "react";
import { encodeDemoFileContent } from "../utils/demoEncoder";

type Kind = "835" | "mir" | "837" | "recon";
type SourceRecord = { record_id: number; file_id: string; filename: string; received_at: string; sequence: number };
type Source = { kind: Kind; linked: boolean; records: SourceRecord[] };
type Preview = { content: string; download_name: string; source: SourceRecord };
const labels: Record<Kind, string> = { "835": "835", mir: "MIR", "837": "837", recon: "Recon" };

export default function ClientClaimSources({ claimId, sources = [] }: { claimId: number; sources?: Source[] }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [recordId, setRecordId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const source = sources.find(item => item.kind === kind);

  useEffect(() => {
    if (!kind || !recordId) return;
    const controller = new AbortController();
    setLoading(true); setPreview(null); setError("");
    fetch(`/edi835/api/client-portal/claim/${claimId}/source/${kind}/?record_id=${encodeURIComponent(recordId)}`, {
      credentials: "include", signal: controller.signal,
    }).then(async response => {
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Unable to load this claim slice.");
      if (typeof body.content !== "string" || !body.content || typeof body.download_name !== "string") {
        throw new Error("The server returned an incomplete claim slice.");
      }
      if (!controller.signal.aborted) setPreview(body);
    }).catch(issue => {
      if (!controller.signal.aborted) setError(issue.message || "Unable to load this claim slice.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [claimId, kind, recordId, retry]);

  const selectSource = (item: Source) => {
    setPreview(null); setError(""); setLoading(false);
    if (kind === item.kind) { setKind(null); setRecordId(""); return; }
    setKind(item.kind);
    // Unlinked sources always require an explicit file choice, even if only one matches.
    setRecordId(item.linked && item.records.length === 1 ? String(item.records[0].record_id) : "");
  };
  const download = () => {
    if (!preview || !kind) return;
    const blob = new Blob([preview.content], {
      type: kind === "835" || kind === "837" ? "application/EDI-X12" : "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    try {
      link.href = url;
      link.download = preview.download_name;
      document.body.appendChild(link); link.click();
    } finally {
      link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  };

  if (!sources.some(item => item.records.length)) return null;
  return <section className="cu-tech cu-claim-sources" aria-label="Claim file slices">
    <div className="cu-source-buttons" aria-label="Available claim formats">
      {sources.filter(item => item.records.length).map(item => <button key={item.kind} type="button"
        className="cu-source-button" aria-expanded={kind === item.kind} aria-controls="claim-source-viewer"
        onClick={() => selectSource(item)}>{labels[item.kind]}</button>)}
    </div>
    {source && <div id="claim-source-viewer" className="cu-source-viewer" aria-busy={loading}>
      <div className="cu-source-viewer-heading">
        <div><h2>{labels[source.kind]} claim slice</h2>
          <p>{source.linked ? "Source for this 835 occurrence" : "Matching claim records — choose the source file"}</p>
        </div>
        <button type="button" className="cu-source-button" onClick={download} disabled={!preview || loading}>
          Download .{source.kind}
        </button>
      </div>
      {(!source.linked || source.records.length > 1) && <div className="cu-source-choice">
        <label htmlFor="claim-source-file">Source file</label>
        <select id="claim-source-file" value={recordId} onChange={event => {
          setPreview(null); setError(""); setLoading(false); setRecordId(event.target.value);
        }}>
          <option value="">Select a file occurrence</option>
          {source.records.map(record => <option key={record.record_id} value={record.record_id}>
            {record.filename} · {new Date(record.received_at).toLocaleString()} · claim #{record.sequence} · {record.file_id.slice(0, 8)}
          </option>)}
        </select>
        {!source.linked && <p className="cu-help">These files contain this claim number. Their association with this hold has not been recorded.</p>}
      </div>}
      {loading && <p role="status">Loading claim slice…</p>}
      {error && <div className="cu-source-error"><p className="cu-error" role="alert">{error}</p>
        <button type="button" className="cu-link" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
      {preview && <>
        <p className="cu-source-filename">{preview.source.filename}</p>
        <p className="cu-help">Only this claim is included. The download preserves the original identifiers and file format.</p>
        <pre tabIndex={0} aria-label={`${labels[source.kind]} sliced claim content`}>
          {encodeDemoFileContent(preview.content, source.kind.toUpperCase(), true)}
        </pre>
      </>}
    </div>}
  </section>;
}
