import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { portalFetch, safeFetchJson } from "../utils/api";
import EyeIcon from "../components/EyeIcon";
import "./NoticesView.css";

const ACTIVE = new Set(["RECEIVED", "PARSING_EMAIL", "MATCHING_CLAIMS", "COLLECTING_EVIDENCE", "RUNNING_VALIDATIONS", "ANALYZING"]);
const statusLabel = (value) => String(value || "").replaceAll("_", " ");
const dateLabel = (value) => { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(); };
const reportedIssuesFor = (notice, claimNumber) => notice.source_matches?.find((item) => item.claim_number === claimNumber)?.reported_issues || [];

async function downloadMsgFile(url, fallbackName = "email.msg") {
  const response = await portalFetch(url);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Unable to download the original email (${response.status}).`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const quoted = disposition.match(/filename="([^"]+)"/i);
  const filename = encoded
    ? decodeURIComponent(encoded[1])
    : quoted?.[1] || fallbackName;
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function MsgDownloadLink({ notice, className }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!notice?.source_file_url) return null;
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      await downloadMsgFile(notice.source_file_url, notice.source_filename || "email.msg");
    } catch (downloadError) {
      setError(downloadError.message || "Unable to download the original email.");
    } finally {
      setBusy(false);
    }
  };
  return <span className="mpl-msg-download">
    <button type="button" className={className} disabled={busy} onClick={download}>
      {busy ? "Downloading…" : "Download .msg"}
    </button>
    {error && <small role="alert">{error}</small>}
  </span>;
}

function NoticeModal({ onClose, onCreated, clientId = "" }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!file || !file.name.toLowerCase().endsWith(".msg")) throw new Error("Select an Outlook .msg email file.");
      const body = new FormData();
      body.append("email_file", file);
      if (clientId) body.append("client_id", clientId);
      const { res, data } = await safeFetchJson("/edi835/api/mpl-notices/", { method: "POST", body });
      if (!res.ok || !data.success) throw new Error(data.error || "Unable to upload this email.");
      onCreated(data.notice);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="mpl-modal-backdrop">
    <form className="mpl-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="mpl-email-title">
      <div className="mpl-modal-head"><div><span>MPL EMAIL UPLOAD</span><h2 id="mpl-email-title">Upload returned MIR email</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="mpl-modal-body">
        <p className="mpl-help">Upload the original Outlook <strong>.msg</strong> file. Its subject, sender, received date, reporting period, claim numbers, message body, and quoted thread will be extracted automatically.</p>
        {error && <div className="mpl-error">{error}</div>}
        <label><span>OUTLOOK EMAIL FILE</span><input required type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        {file && <p className="mpl-help">Selected: <strong>{file.name}</strong></p>}
      </div>
      <div className="mpl-modal-actions"><button type="button" className="mpl-btn secondary" onClick={onClose}>Cancel</button><button className="mpl-btn primary" disabled={busy || !file}>{busy ? "Uploading…" : "Upload & Analyze"}</button></div>
    </form>
  </div>;
}

function viewerLines(rawContent, fileType) {
  const content = String(rawContent || "").replace(/\r\n?/g, "\n");
  const type = String(fileType || "").toUpperCase();

  if (type === "MIR") {
    const physicalRows = content.split("\n").filter((line) => line.length);
    if (physicalRows.length > 1) return physicalRows;
    // Older stored MIR output can be concatenated without newline characters.
    // Each claim record starts with HI followed by its numeric Highmark key.
    const inferredRows = content.split(/(?=HI\d{15,})/).filter(Boolean);
    return inferredRows.length ? inferredRows : [content];
  }

  if (!["835", "837"].includes(type)) return content.split("\n");

  const delimiter = content.startsWith("ISA") && content.length > 105 ? content[105] : "~";
  const claimTag = type === "835" ? "CLP" : "CLM";
  const segments = content.split(delimiter).map((segment) => segment.trim()).filter(Boolean);
  const lines = [];
  let envelope = [];
  let claim = [];

  const flushClaim = () => {
    if (claim.length) {
      lines.push(claim.join(delimiter) + delimiter);
      claim = [];
    }
  };
  const flushEnvelope = () => {
    if (envelope.length) {
      lines.push(envelope.join(delimiter) + delimiter);
      envelope = [];
    }
  };

  segments.forEach((segment) => {
    const tag = segment.split("*", 1)[0].toUpperCase();
    if (tag === claimTag) {
      flushClaim();
      flushEnvelope();
      claim = [segment];
      return;
    }
    if (claim.length) claim.push(segment);
    else envelope.push(segment);
  });
  flushClaim();
  flushEnvelope();
  return lines;
}

const countOccurrences = (content, value) => {
  const term = String(value || "").trim();
  if (!term) return 0;
  return String(content || "").toUpperCase().split(term.toUpperCase()).length - 1;
};

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizedInternalClaimNumbers = (storedValue, claimNumber, content) => {
  const highmark = String(claimNumber || "").trim();
  const candidates = String(storedValue || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (highmark) {
    const adjacentPattern = new RegExp(`${escapePattern(highmark)}([A-Za-z][A-Za-z0-9_-]{1,30})`, "gi");
    let match;
    while ((match = adjacentPattern.exec(String(content || ""))) !== null) candidates.push(match[1]);
  }

  const normalized = [];
  candidates.forEach((candidate) => {
    let value = String(candidate || "").trim();
    if (!value) return;
    if (highmark && value.toUpperCase().startsWith(highmark.toUpperCase())) {
      value = value.slice(highmark.length).trim();
    }
    if (!value || value.toUpperCase() === highmark.toUpperCase() || /^\d{15,}$/.test(value)) return;
    if (!normalized.some((item) => item.toUpperCase() === value.toUpperCase())) normalized.push(value);
  });
  return normalized;
};

function SourceFileViewer({ claimNumber, sources, onClose }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [content, setContent] = useState("");
  const [claimRows, setClaimRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const firstMatchRef = useRef(null);
  const selected = sources[selectedIndex];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setContent("");
    setClaimRows([]);
    portalFetch(`${selected.download_url}?view=1`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the archived file.");
        const data = await response.json();
        if (!data.success) throw new Error(data.error || "Unable to load the archived file.");
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setContent(String(data.content || ""));
          setClaimRows(Array.isArray(data.claim_rows) ? data.claim_rows : []);
        }
      })
      .catch((reason) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!loading && content && firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({ block: "center", inline: "center" });
    }
  }, [content, loading, selectedIndex]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const internalNumbers = normalizedInternalClaimNumbers(
    selected.internal_claim_number,
    claimNumber,
    content,
  );
  const displayedInternalNumber = internalNumbers.join(", ");
  const highmarkCount = countOccurrences(content, claimNumber);
  const internalCount = internalNumbers.reduce((total, number) => total + countOccurrences(content, number), 0);
  const terms = [...new Set([claimNumber, ...internalNumbers].filter(Boolean))].sort((left, right) => right.length - left.length);
  const pattern = terms.length ? new RegExp(`(${terms.map(escapePattern).join("|")})`, "gi") : null;
  const displayRows = (claimRows.length ? claimRows : viewerLines(content, selected.type))
    .flatMap((row) => String(row || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[~∼˜]/g, "\n")
      .split("\n"))
    .map((row) => row.trim())
    .filter((row) => row.length);
  let firstMatchAssigned = false;
  const renderLine = (line, lineIndex) => {
    if (!pattern) return <div className="mpl-source-code-line" key={lineIndex}>{line || " "}</div>;
    const parts = line.split(pattern);
    return <div className="mpl-source-code-line" key={lineIndex}>{parts.map((part, partIndex) => {
      const isMatch = terms.some((term) => term.toUpperCase() === part.toUpperCase());
      if (!isMatch) return <React.Fragment key={partIndex}>{part}</React.Fragment>;
      const isHighmark = part.toUpperCase() === String(claimNumber).toUpperCase();
      const takeRef = !firstMatchAssigned;
      if (takeRef) firstMatchAssigned = true;
      return <mark ref={takeRef ? firstMatchRef : undefined} className={isHighmark ? "highmark" : "internal"} key={partIndex}>{part}</mark>;
    })}</div>;
  };

  return createPortal(<div className="mpl-file-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mpl-file-viewer" role="dialog" aria-modal="true" aria-labelledby="mpl-file-viewer-title">
      <header>
        <div><span>MATCHED SOURCE EVIDENCE</span><h3 id="mpl-file-viewer-title">{selected.type} file for Highmark claim {claimNumber}</h3></div>
        <button type="button" onClick={onClose} aria-label="Close file viewer">×</button>
      </header>
      <div className="mpl-file-viewer-toolbar">
        <label><span>FILE</span><select value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>{sources.map((source, index) => <option value={index} key={`${source.type}-${source.filename}-${index}`}>{source.filename}</option>)}</select></label>
        <dl>
          <div><dt>Internal claim number</dt><dd>{displayedInternalNumber || "Not found"}</dd></div>
          <div><dt>File received</dt><dd>{dateLabel(selected.date)}</dd></div>
          <div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div>
        </dl>
        <a className="mpl-btn primary" href={selected.download_url}>Download file</a>
      </div>
      <div className="mpl-file-match-summary">
        <span><b>{highmarkCount}</b> Highmark claim occurrence{highmarkCount === 1 ? "" : "s"}</span>
        <span><b>{internalCount}</b> internal claim occurrence{internalCount === 1 ? "" : "s"}</span>
        <small>Yellow = Highmark claim · Blue = internal claim</small>
      </div>
      <div className={`mpl-file-content ${["835", "MIR", "RECON", "837"].includes(String(selected.type).toUpperCase()) ? "one-claim-per-line" : ""}`}>
        <div className="mpl-file-content-heading"><strong>File content</strong><small>{selected.filename}</small></div>
        {loading ? <p className="mpl-empty">Loading archived file…</p> : error ? <p className="mpl-file-view-error">{error}</p> : <div className="mpl-source-code" role="region" aria-label="Matched source file content">{displayRows.map(renderLine)}</div>}
      </div>
    </section>
  </div>, document.body);
}

function ClaimAnalysis({ claim }) {
  const analysis = claim.analysis;
  const claimNumber = claim.claim_number || claim.internal_claim_number;
  if (!analysis) return <article className="mpl-claim-response"><strong>{claimNumber}</strong><p>AI analysis is still being prepared for this claim.</p></article>;

  const isAiResponse = analysis.model_id && analysis.model_id !== "deterministic-fallback";
  return <article className="mpl-claim-response">
    <div className="mpl-claim-response-heading">
      <strong>{claimNumber}</strong>
      <small>{isAiResponse ? `AI · ${analysis.model_id}` : "AI response unavailable · reanalyze after the local model is enabled"}</small>
    </div>
    <p>{analysis.summary}</p>
  </article>;
}

function WorkflowStatusSelect({ value = "YET_TO_START", disabled, onChange }) {
  const [saving, setSaving] = useState(false);
  const change = async (event) => {
    const next = event.target.value;
    setSaving(true);
    try { await onChange(next); } finally { setSaving(false); }
  };
  return <select className={`mpl-workflow-select ${String(value).toLowerCase()}`} value={value} disabled={disabled || saving} onChange={change} aria-label="Claim workflow status">
    <option value="YET_TO_START">Yet to start</option>
    <option value="HOLD">Hold</option>
    <option value="IN_PROGRESS">In progress</option>
    <option value="RESOLVED">Resolved</option>
  </select>;
}

function NoticeCard({ notice, loadDetail, onReanalyze, onSelectClaim, onWorkflowStatus, isAdmin, cardExpanded, onOpen, onClose }) {
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [sourcePreview, setSourcePreview] = useState(null);
  const detail = notice.email_body !== undefined;
  const isActive = ACTIVE.has(notice.status);
  const analysisReady = !isActive && Boolean(notice.ai_response || notice.status === "COMPLETED" || notice.status === "REVIEW_REQUIRED");
  const sourceMatches = notice.source_matches || [];
  const matchedClaims = sourceMatches.filter((match) => match.sources?.length);
  const totalSources = matchedClaims.reduce((total, match) => total + match.sources.length, 0);
  useEffect(() => {
    if (!cardExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [cardExpanded, onClose]);

  const toggleCard = () => {
    // The full-page route owns detail loading. Keeping it here as well caused
    // two identical API requests whenever an email row was opened.
    onOpen(notice.id);
  };
  const toggleEmail = async () => {
    if (!detail) await loadDetail(notice.id);
    setEmailExpanded((value) => !value);
  };

  return <>
    <tr className={`mpl-notice-row ${cardExpanded ? "is-open" : ""}`} onClick={toggleCard}>
      <td><span className="mpl-email-type">{notice.notice_type === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGEMENT" : "RETURN EMAIL"}</span></td>
      <td><button type="button" className="mpl-subject-button" onClick={(event) => { event.stopPropagation(); toggleCard(); }} aria-expanded={cardExpanded}>{notice.subject}</button></td>
      <td className="mpl-sender-cell">{notice.sender || "Sender unavailable"}</td>
      <td>{dateLabel(notice.received_at || notice.created_at)}</td>
      <td><strong>{notice.program || "—"}</strong></td>
      <td className="mpl-period-cell">{notice.period_start || "—"} – {notice.period_end || "—"}</td>
      <td><span className={`mpl-status ${(notice.workflow_status || notice.status)?.toLowerCase()}`}>{statusLabel(notice.workflow_status || notice.status)}</span></td>
    </tr>
    {cardExpanded && createPortal(<div className="mpl-detail-modal-backdrop" role="presentation">
      <section className="mpl-detail-modal" role="dialog" aria-modal="true" aria-labelledby={`mpl-notice-${notice.id}-title`}>
        <header className="mpl-detail-modal-header">
          <div><span className="mpl-email-type">{notice.notice_type === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGEMENT" : "MPL RETURN EMAIL"}</span><h2 id={`mpl-notice-${notice.id}-title`}>{notice.subject}</h2><p>{notice.sender || "Sender unavailable"} · {dateLabel(notice.received_at || notice.created_at)}</p></div>
          <button type="button" onClick={onClose} aria-label="Close email details">×</button>
        </header>
        <div className="mpl-detail-modal-scroll"><div className="mpl-notice-detail">
      <div className="mpl-email-toolbar">
        <div className="mpl-email-meta">
          <span>PROGRAM <strong>{notice.program || "—"}</strong></span>
          <span>PERIOD <strong>{notice.period_start || "—"} – {notice.period_end || "—"}</strong></span>
        </div>
        <div className="mpl-email-actions">
          <button type="button" className="mpl-thread-toggle" onClick={toggleEmail}><span aria-hidden="true">✉</span> {emailExpanded ? "Hide email" : "Email"}</button>
          <MsgDownloadLink notice={notice} className="mpl-file-link" />
        </div>
      </div>
      {emailExpanded && detail && <pre className="mpl-full-email">{notice.email_body}</pre>}

      {detailLoading && <div className="mpl-processing"><span></span>Loading email details…</div>}
      {detailError && <div className="mpl-error">{detailError}</div>}
      {isActive && <div className="mpl-processing"><span></span>{statusLabel(notice.status)}…</div>}

      {analysisReady && <section className="mpl-disclosure">
        <button type="button" className="mpl-section-toggle" aria-expanded={aiExpanded} onClick={() => setAiExpanded((value) => !value)}>
          <span><strong>Claim-wise AI response</strong><small>One consolidated evidence-based response for each claim</small></span>
          <b>{aiExpanded ? "Collapse" : "Expand"} <i aria-hidden="true">{aiExpanded ? "−" : "+"}</i></b>
        </button>
        {aiExpanded && <div className="mpl-disclosure-content mpl-claim-responses">
          {notice.ai_response && notice.ai_response_source && notice.ai_response_source !== "deterministic-fallback"
            ? <article className="mpl-claim-response mpl-notice-ai-response">
                <div className="mpl-claim-response-heading">
                  <strong>All claims in this email</strong>
                  <small>{`Qwen · ${notice.ai_response_source}`}</small>
                </div>
                <p>{notice.ai_response}</p>
              </article>
            : <div className="mpl-error">
                Qwen response is unavailable. Confirm the Qwen model service is running, then select Analyze Again.
              </div>}
        </div>}
      </section>}

      {analysisReady && !!sourceMatches.length && <section className="mpl-disclosure">
        <button type="button" className="mpl-section-toggle" aria-expanded={sourcesExpanded} onClick={() => setSourcesExpanded((value) => !value)}>
          <span><strong>Matched source files</strong><small>{matchedClaims.length} claim{matchedClaims.length === 1 ? "" : "s"} · {totalSources} verified 835, MIR, reconciliation, or 837 match{totalSources === 1 ? "" : "es"}</small></span>
          <b>{sourcesExpanded ? "Collapse" : "Expand"} <i aria-hidden="true">{sourcesExpanded ? "−" : "+"}</i></b>
        </button>
        {sourcesExpanded && <div className="mpl-disclosure-content mpl-source-matrix-wrap">
          <table className="mpl-table mpl-source-matrix">
            <thead>
              <tr><th rowSpan="2">HIGHMARK CLAIM NUMBER</th><th colSpan="2">835</th><th colSpan="2">MIR</th><th colSpan="2">RECON</th><th colSpan="2">837</th>{isAdmin && <th rowSpan="2">WORKFLOW STATUS</th>}</tr>
              <tr>{["835", "MIR", "RECON", "837"].flatMap((type) => [<th key={`${type}-number`}>INTERNAL CLAIM NUMBER</th>, <th key={`${type}-action`} className="mpl-matrix-action-heading">ACTION</th>])}</tr>
            </thead>
            <tbody>{sourceMatches.map((match) => <tr key={match.claim_number}>
              <td className="mono mpl-matrix-claim">{match.claim_number}</td>
              {["835", "MIR", "RECON", "837"].flatMap((type) => {
                const files = (match.sources || []).filter((source) => source.type.toUpperCase() === type);
                const numbers = [...new Set(files.map((source) => source.internal_claim_number).filter(Boolean))];
                return [
                  <td key={`${match.claim_number}-${type}-number`} className="mono mpl-matrix-number">{numbers.length ? numbers.map((number) => <span key={number}>{number}</span>) : <span className="mpl-no-match">—</span>}</td>,
                  <td key={`${match.claim_number}-${type}-action`} className="mpl-matrix-action">{files.length ? <button type="button" className="mpl-eye-button" title={`View ${type} source file`} aria-label={`View ${type} source file for claim ${match.claim_number}`} onClick={() => setSourcePreview({ claimNumber: match.claim_number, sources: files })}><EyeIcon /></button> : <span className="mpl-no-match">—</span>}</td>,
                ];
              })}
              {isAdmin && <td className="mpl-workflow-cell"><WorkflowStatusSelect value={notice.claim_workflow_statuses?.[match.claim_number] || "YET_TO_START"} onChange={(status) => onWorkflowStatus(notice.id, match.claim_number, status)} /></td>}
            </tr>)}</tbody>
          </table>
        </div>}
      </section>}

      {sourcePreview && <SourceFileViewer claimNumber={sourcePreview.claimNumber} sources={sourcePreview.sources} onClose={() => setSourcePreview(null)} />}

      {notice.status === "FAILED" && notice.last_error && <div className="mpl-error mpl-failure-note">Analysis could not be completed. Please try again or contact support.</div>}
      {detail && notice.status === "WAITING_FOR_CLAIM_SELECTION" && <div className="mpl-claim-picker"><h3>Select the affected claim</h3><p>More than one stored claim uses the identifier from this email. Choose the correct claim before analysis continues.</p>{notice.claims?.map((claim) => <button key={claim.link_id} onClick={() => onSelectClaim(notice.id, claim.claim_id)}><strong>{claim.claim_number || claim.internal_claim_number}</strong><span>{claim.service_from_date || "No service date"} · ${claim.total_charge}</span></button>)}</div>}
      {["FAILED", "REVIEW_REQUIRED"].includes(notice.status) && <div className="mpl-card-actions"><button className="mpl-btn primary" onClick={() => onReanalyze(notice.id)}>Analyze Again</button></div>}
    </div></div></section></div>, document.body)}
  </>;
}

function MatchedFilesMatrix({ notice, isAdmin, onWorkflowStatus }) {
  const [sourcePreview, setSourcePreview] = useState(null);
  const sourceMatches = notice.source_matches || [];
  const matchedClaims = sourceMatches.filter((match) => match.sources?.length);
  const totalSources = matchedClaims.reduce((total, match) => total + match.sources.length, 0);
  if (!sourceMatches.length) return null;
  return <section className="mpl-files-section">
    <div className="mpl-report-heading mpl-files-heading">
      <div><span>MATCHED SOURCE FILES</span><h2>Claim-to-file matrix</h2></div>
      <p>{matchedClaims.length} claims · {totalSources} verified 835, MIR, reconciliation, or 837 matches</p>
    </div>
    <div className="mpl-source-matrix-wrap">
      <table className="mpl-table mpl-source-matrix">
        <thead>
          <tr><th rowSpan="2">HIGHMARK CLAIM NUMBER</th><th colSpan="2">835</th><th colSpan="2">MIR</th><th colSpan="2">RECON</th><th colSpan="2">837</th>{isAdmin && <th rowSpan="2">WORKFLOW STATUS</th>}</tr>
          <tr>{["835", "MIR", "RECON", "837"].flatMap((type) => [<th key={`${type}-number`}>INTERNAL CLAIM NUMBER</th>, <th key={`${type}-action`} className="mpl-matrix-action-heading">ACTION</th>])}</tr>
        </thead>
        <tbody>{sourceMatches.map((match) => <tr key={match.claim_number}>
          <td className="mono mpl-matrix-claim">{match.claim_number}</td>
          {["835", "MIR", "RECON", "837"].flatMap((type) => {
            const files = (match.sources || []).filter((source) => source.type.toUpperCase() === type);
            const numbers = [...new Set(files.map((source) => source.internal_claim_number).filter(Boolean))];
            return [
              <td key={`${match.claim_number}-${type}-number`} className="mono mpl-matrix-number">{numbers.length ? numbers.map((number) => <span key={number}>{number}</span>) : <span className="mpl-no-match">—</span>}</td>,
              <td key={`${match.claim_number}-${type}-action`} className="mpl-matrix-action">{files.length ? <button type="button" className="mpl-eye-button" title={`View ${type} source file`} aria-label={`View ${type} source file for claim ${match.claim_number}`} onClick={() => setSourcePreview({ claimNumber: match.claim_number, sources: files })}><EyeIcon /></button> : <span className="mpl-no-match">—</span>}</td>,
            ];
          })}
          {isAdmin && <td className="mpl-workflow-cell"><WorkflowStatusSelect value={notice.claim_workflow_statuses?.[match.claim_number] || "YET_TO_START"} onChange={(status) => onWorkflowStatus(notice.id, match.claim_number, status)} /></td>}
        </tr>)}</tbody>
      </table>
    </div>
    {sourcePreview && <SourceFileViewer claimNumber={sourcePreview.claimNumber} sources={sourcePreview.sources} onClose={() => setSourcePreview(null)} />}
  </section>;
}

const duplicateStatusLabel = status => ({
  ADJUSTMENT: "Adjustment",
  DUPLICATE_FOUND: "Duplicate found",
  NOT_FOUND: "Not found",
})[status] || "Not found";

function EvidenceDetails({ items }) {
  if (!items?.length) return null;
  return <div className="mpl-evidence-table-wrap"><table className="mpl-evidence-table">
    <thead><tr><th>When</th><th>File</th><th>Rule / status</th><th>Why</th></tr></thead>
    <tbody>{items.map((item, index) => <tr key={index}>
      <td>{dateLabel(item.date)}</td>
      <td title={item.filename || ""}>{item.filename || "—"}</td>
      <td><strong>{item.code || statusLabel(item.severity || item.status) || "—"}</strong>{item.severity && item.code ? <small>{statusLabel(item.severity)}</small> : null}</td>
      <td>{item.description || item.event || item.source || "Recorded evidence"}</td>
    </tr>)}</tbody>
  </table></div>;
}

function ClaimReportCard({ report, sourceMatch, isAdmin, noticeId, onWorkflowStatus }) {
  const [files, setFiles] = useState(null);
  const issues = report.issues || [];
  const history = report.history || [];
  return <article className="mpl-report-card">
    <header className="mpl-report-card-head">
      <div><span>HIGHMARK CLAIM</span><h3>{report.claim_number}</h3><p>Internal: {report.internal_claim_numbers?.join(", ") || "Not found"}</p></div>
      {isAdmin && <WorkflowStatusSelect value={report.workflow_status || "YET_TO_START"} onChange={(status) => onWorkflowStatus(noticeId, report.claim_number, status)} />}
    </header>
    <div className="mpl-report-facts">
      <div><span>ISSUES</span><strong>{issues.length}</strong></div><div><span>HISTORY EVENTS</span><strong>{history.length}</strong></div>
      <div className={report.duplicate?.status === "DUPLICATE_FOUND" ? "attention" : report.duplicate?.status === "ADJUSTMENT" ? "adjustment" : "clear"}><span>CLAIM STATUS</span><strong>{duplicateStatusLabel(report.duplicate?.status)}</strong></div>
      <div className={report.hold?.found ? "attention" : "clear"}><span>HOLD</span><strong>{report.hold?.found ? "Found" : "None found"}</strong></div>
    </div>
    <section className="mpl-report-section">
      <div className="mpl-report-section-title"><h4>Issues</h4><span>Reported and verified findings</span></div>
      {issues.length ? <div className="mpl-compact-table-wrap"><table className="mpl-compact-table mpl-issue-table"><thead><tr><th>Issue</th><th>Convention description</th><th>How to resolve</th><th>Claim evidence</th></tr></thead><tbody>{issues.map((issue, index) => <tr key={`${issue.issue_id}-${index}`}><td><span className={`mpl-issue-tag ${String(issue.severity || "").toLowerCase()}`}>{issue.issue_id}</span></td><td><strong>{issue.title || "Convention issue"}</strong><span>{issue.description}</span></td><td>{issue.resolution || "Approved resolution is not mapped."}</td><td><span>{issue.reported_description || issue.source}</span><small>{issue.source}{issue.definition_source ? ` · Definition: ${issue.definition_source}` : ""}</small></td></tr>)}</tbody></table></div> : <p className="mpl-report-empty">No issue was associated with this claim.</p>}
    </section>
    <section className="mpl-report-section">
      <div className="mpl-report-section-title"><div><h4>Claim history</h4><span>Every matched archived file and processing event</span></div>{!!sourceMatch?.sources?.length && <button className="mpl-text-button" type="button" onClick={() => setFiles(sourceMatch.sources)}>View source files</button>}</div>
      {history.length ? <div className="mpl-compact-table-wrap"><table className="mpl-compact-table mpl-history-table"><thead><tr><th>Date</th><th>Type</th><th>File</th><th>Internal claim</th><th>Status / event</th></tr></thead><tbody>{history.map((item, index) => <tr key={index}><td>{dateLabel(item.date)}</td><td><span className="mpl-file-type">{item.file_type || "—"}</span></td><td>{item.filename}</td><td className="mono">{item.internal_claim_number || "—"}</td><td><strong>{statusLabel(item.status)}</strong><small>{item.event}</small></td></tr>)}</tbody></table></div> : <p className="mpl-report-empty">No archived file history was found for this claim.</p>}
    </section>
    <div className="mpl-report-two-column">
      <section className={`mpl-evidence-summary ${report.duplicate?.status === "DUPLICATE_FOUND" ? "attention" : report.duplicate?.status === "ADJUSTMENT" ? "adjustment" : ""}`}><span>DUPLICATE REVIEW</span><strong className="mpl-review-status">{duplicateStatusLabel(report.duplicate?.status)}</strong><p>{report.duplicate?.summary}</p><EvidenceDetails items={report.duplicate?.details} /></section>
      <section className={`mpl-evidence-summary ${report.hold?.found ? "attention" : ""}`}><span>HOLD REVIEW</span><strong className="mpl-review-status">{report.hold?.found ? "Hold found" : "Not found"}</strong><p>{report.hold?.summary}</p><EvidenceDetails items={report.hold?.details} /></section>
    </div>
    {!!report.recommended_actions?.length && <section className="mpl-report-section"><div className="mpl-report-section-title"><h4>Recommended resolution</h4><span>Python rules-based guidance</span></div><ol className="mpl-resolution-list">{report.recommended_actions.map((action, index) => <li key={index}>{typeof action === "string" ? action : action.explanation || action.text || action.reason}</li>)}</ol></section>}
    {files && <SourceFileViewer claimNumber={report.claim_number} sources={files} onClose={() => setFiles(null)} />}
  </article>;
}

function NoticeDetailPage({ notice, loading, error, onBack, onReanalyze, onWorkflowStatus, isAdmin }) {
  const [emailExpanded, setEmailExpanded] = useState(false);
  const reports = notice?.claim_reports || [];
  const sourceMatches = notice?.source_matches || [];
  if (!notice) return <section className="mpl-detail-page"><button className="mpl-back-button" onClick={onBack}>← Back to MPL Notices</button>{loading && <div className="mpl-processing"><span></span>Loading email details…</div>}{error && <div className="mpl-error">{error}</div>}</section>;
  return <section className="mpl-detail-page">
    <header className="mpl-detail-page-header"><button type="button" className="mpl-back-button" onClick={onBack}>← Back to MPL Notices</button><div className="mpl-detail-title-row"><div><span>{notice.notice_type === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGEMENT" : "MPL RETURN EMAIL"}</span><h1>{notice.subject}</h1><p>{notice.sender || "Sender unavailable"} · {dateLabel(notice.received_at || notice.created_at)}</p></div><span className={`mpl-status ${(notice.workflow_status || notice.status)?.toLowerCase()}`}>{statusLabel(notice.workflow_status || notice.status)}</span></div><div className="mpl-detail-meta"><span>PROGRAM <b>{notice.program || "—"}</b></span><span>PERIOD <b>{notice.period_start || "—"} – {notice.period_end || "—"}</b></span><span>CLAIMS <b>{reports.length}</b></span><span>ANALYSIS <b>Python rules</b></span></div></header>
    {loading && <div className="mpl-processing"><span></span>{statusLabel(notice.status)}…</div>}{error && <div className="mpl-error">{error}</div>}
    <div className="mpl-detail-page-actions"><button type="button" className="mpl-text-button" onClick={() => setEmailExpanded((value) => !value)}>{emailExpanded ? "Hide email" : "View email"}</button><MsgDownloadLink notice={notice} className="mpl-text-button" />{["FAILED", "REVIEW_REQUIRED"].includes(notice.status) && <button className="mpl-btn primary" onClick={() => onReanalyze(notice.id)}>Analyze Again</button>}</div>
    {emailExpanded && <pre className="mpl-full-email mpl-detail-email">{notice.email_body}</pre>}
    <div className="mpl-report-heading"><div><span>CLAIM-WISE RESPONSE</span><h2>Claim analysis and complete history</h2></div><p>Built from stored 837, 835, MIR, reconciliation, duplicate, and hold evidence.</p></div>
    {reports.length ? <div className="mpl-report-list">{reports.map((report) => <ClaimReportCard key={report.claim_number} report={report} sourceMatch={sourceMatches.find((item) => item.claim_number === report.claim_number)} isAdmin={isAdmin} noticeId={notice.id} onWorkflowStatus={onWorkflowStatus} />)}</div> : <div className="mpl-report-empty-card">No claim report is available yet.</div>}
    <MatchedFilesMatrix notice={notice} isAdmin={isAdmin} onWorkflowStatus={onWorkflowStatus} />
  </section>;
}

export default function NoticesView({ clients = [], activeClientId = "", onSelectClient = null, isAdmin = false }) {
  const [notices, setNotices] = useState([]);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "received", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openNoticeId, setOpenNoticeId] = useState(() => new URLSearchParams(window.location.search).get("notice") || null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const refresh = useCallback(async () => { try { const clientQuery = activeClientId ? `?client_id=${encodeURIComponent(activeClientId)}` : ""; const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${clientQuery}`); if (!res.ok || !data.success) throw new Error(data.error || "Unable to load MPL notices."); setNotices((current) => data.notices.map((item) => current.find((old) => old.id === item.id && old.status === item.status && old.email_body !== undefined) || item)); setError(""); } catch (err) { setError(err.message); } }, [activeClientId]);
  const loadDetail = useCallback(async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/`); if (!res.ok || !data.success) throw new Error(data.error || "Unable to open notice."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const hasActiveNotice = notices.some((item) => ACTIVE.has(item.status));
  const openActiveNoticeId = openNoticeId && notices.some((item) => item.id === openNoticeId && ACTIVE.has(item.status))
    ? openNoticeId
    : null;
  useEffect(() => {
    if (!hasActiveNotice) return undefined;
    const poll = () => {
      // An open detail response also carries its latest status, so do not
      // fetch the list and detail simultaneously on every polling cycle.
      if (openActiveNoticeId) loadDetail(openActiveNoticeId).catch(() => {});
      else refresh();
    };
    const timer = setInterval(poll, 8000);
    return () => clearInterval(timer);
  }, [hasActiveNotice, openActiveNoticeId, loadDetail, refresh]);
  const openNoticePage = useCallback((id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("notice", id);
    window.history.pushState({}, "", url.toString());
    setOpenNoticeId(id);
  }, []);
  const closeNoticePage = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.pushState({}, "", url.toString());
    setOpenNoticeId(null);
    setDetailError("");
  }, []);
  useEffect(() => {
    const syncNoticeRoute = () => setOpenNoticeId(new URLSearchParams(window.location.search).get("notice") || null);
    window.addEventListener("popstate", syncNoticeRoute);
    return () => window.removeEventListener("popstate", syncNoticeRoute);
  }, []);
  useEffect(() => {
    if (!openNoticeId) return;
    const selected = notices.find((item) => item.id === openNoticeId);
    if (selected?.email_body !== undefined) return;
    setDetailLoading(true);
    setDetailError("");
    loadDetail(openNoticeId)
      .catch((reason) => setDetailError(reason.message || "Unable to load this email."))
      .finally(() => setDetailLoading(false));
  }, [openNoticeId, notices, loadDetail]);
  const reanalyze = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/analyze/`, { method: "POST" }); if (!res.ok || !data.success) return setError(data.error || "Unable to reanalyze."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const updateWorkflowStatus = async (id, claimNumber, workflowStatus) => {
    const previous = notices.find((item) => item.id === id);
    const nextStatuses = { ...(previous?.claim_workflow_statuses || {}), [claimNumber]: workflowStatus };
    const claimNumbers = previous?.extracted_claim_numbers || Object.keys(nextStatuses);
    const values = claimNumbers.map((number) => nextStatuses[number] || "YET_TO_START");
    const rolledUp = values.length && values.every((value) => value === "RESOLVED")
      ? "RESOLVED"
      : values.every((value) => value === "YET_TO_START") ? "YET_TO_START" : "IN_PROGRESS";
    setNotices((items) => items.map((item) => item.id === id ? {
      ...item,
      claim_workflow_statuses: nextStatuses,
      workflow_status: rolledUp,
      claim_reports: (item.claim_reports || []).map((report) => report.claim_number === claimNumber ? { ...report, workflow_status: workflowStatus } : report),
    } : item));

    const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/claims/workflow-status/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_number: claimNumber, workflow_status: workflowStatus }),
    });
    if (!res.ok || !data.success) {
      if (previous) setNotices((items) => items.map((item) => item.id === id ? previous : item));
      const message = data.error || "Unable to update claim workflow status.";
      setError(message);
      throw new Error(message);
    }
    setNotices((items) => items.map((item) => item.id === id ? {
      ...item, workflow_status: data.notice_workflow_status || rolledUp,
    } : item));
    setError("");
  };

  const selectClaim = async (id, claimId) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/select-claim/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim_id: claimId }) }); if (!res.ok || !data.success) return setError(data.error || "Unable to select claim."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };

  const loweredQuery = query.trim().toLowerCase();
  const filteredNotices = notices.filter((notice) => {
    const received = notice.received_at || notice.created_at || "";
    const period = `${notice.period_start || ""} ${notice.period_end || ""}`;
    const type = notice.notice_type === "ACKNOWLEDGEMENT" ? "acknowledgement" : "mpl return email";
    const searchable = [
      type, notice.subject, notice.sender, received, dateLabel(received), notice.program, period, notice.status, notice.workflow_status,
      ...(notice.extracted_claim_numbers || []),
      ...(notice.source_matches || []).flatMap((match) => [
        match.claim_number,
        ...(match.reported_issues || []).flatMap((issue) => [...(issue.codes || []), issue.category, issue.description]),
        ...(match.sources || []).flatMap((source) => [source.type, source.filename, source.status]),
      ]),
    ].filter(Boolean).join(" ").toLowerCase();
    return !loweredQuery || searchable.includes(loweredQuery);
  });
  const sortValue = (notice, key) => {
    if (key === "type") return notice.notice_type === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGEMENT" : "MPL RETURN EMAIL";
    if (key === "received") return notice.received_at || notice.created_at || "";
    if (key === "period") return `${notice.period_start || ""} ${notice.period_end || ""}`;
    if (key === "status") return String(notice.workflow_status || notice.status || "");
    return String(notice[key] || "");
  };
  const sortedNotices = [...filteredNotices].sort((left, right) => {
    const result = sortValue(left, sort.key).localeCompare(sortValue(right, sort.key), undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  });
  const changeSort = (key) => {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
    setPage(1);
  };
  const SortHeader = ({ column, children }) => {
    const active = sort.key === column;
    return <th aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" className={`mpl-sort-header ${active ? "active" : ""}`} onClick={() => changeSort(column)}>{children}<span aria-hidden="true">{active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>;
  };
  const pageCount = Math.max(1, Math.ceil(filteredNotices.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleNotices = sortedNotices.slice(pageStart, pageStart + pageSize);
  const openNotice = openNoticeId ? notices.find((notice) => notice.id === openNoticeId) : null;
  const renderedNotices = openNotice && !visibleNotices.some((notice) => notice.id === openNotice.id)
    ? [...visibleNotices, openNotice]
    : visibleNotices;

  if (openNoticeId) {
    return <NoticeDetailPage
      notice={openNotice}
      loading={detailLoading || Boolean(openNotice && ACTIVE.has(openNotice.status))}
      error={detailError}
      onBack={closeNoticePage}
      onReanalyze={reanalyze}
      onWorkflowStatus={updateWorkflowStatus}
      isAdmin={isAdmin}
    />;
  }

  return <section className="view on mpl-view" id="v-notices">
    <WorkspaceHeader eyebrow="Returned from MPL" title="MPL Notices" description="Upload the original Outlook MPL email, investigate its claims against verified application data, and review evidence-bound recommendations."><div className="mpl-header-actions">{onSelectClient && <label className="mpl-admin-client"><span>CLIENT</span><select value={activeClientId} onChange={(event) => onSelectClient(event.target.value)}><option value="">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}<button className="mpl-btn light" onClick={() => setModal(true)}>+ Upload Email</button></div></WorkspaceHeader>
    {error && <div className="mpl-error">{error}</div>}
    {!notices.length && !error && <div className="mpl-zero"><h2>No MPL emails uploaded</h2><p>Upload the first returned MIR .msg file to begin claim investigation.</p><button className="mpl-btn primary" onClick={() => setModal(true)}>Upload Email</button></div>}
    {!!notices.length && <div className="mpl-notice-register">
      <div className="mpl-register-toolbar">
        <label className="mpl-universal-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search emails, senders, claims, programs, statuses, or filenames…" aria-label="Search all MPL notices" /></label>
        <div className="mpl-register-count"><strong>{filteredNotices.length}</strong> of {notices.length} emails</div>
        <label className="mpl-page-size">Rows <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
      </div>
      <div className="mpl-table-wrap">
        <table className="mpl-table mpl-notice-table">
          <thead><tr>
            <SortHeader column="type">TYPE</SortHeader>
            <SortHeader column="subject">SUBJECT</SortHeader>
            <SortHeader column="sender">SENDER</SortHeader>
            <SortHeader column="received">RECEIVED</SortHeader>
            <SortHeader column="program">PROGRAM</SortHeader>
            <SortHeader column="period">PERIOD</SortHeader>
            <SortHeader column="status">STATUS</SortHeader>
          </tr></thead>
          <tbody>{renderedNotices.length ? renderedNotices.map((notice) => <NoticeCard key={notice.id} notice={notice} loadDetail={loadDetail} onReanalyze={reanalyze} onSelectClaim={selectClaim} onWorkflowStatus={updateWorkflowStatus} isAdmin={isAdmin} cardExpanded={openNoticeId === notice.id} onOpen={openNoticePage} onClose={() => setOpenNoticeId(null)} />) : <tr><td colSpan="7" className="mpl-no-results">No MPL emails match the current search and filters.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mpl-pagination">
        <span>{filteredNotices.length ? `${pageStart + 1}–${Math.min(pageStart + pageSize, filteredNotices.length)} of ${filteredNotices.length}` : "0 results"}</span>
        <div><button type="button" disabled={currentPage === 1} onClick={() => setPage(1)}>«</button><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><strong>Page {currentPage} of {pageCount}</strong><button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>›</button><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(pageCount)}>»</button></div>
      </div>
    </div>}
    {modal && <NoticeModal clientId={activeClientId} onClose={() => setModal(false)} onCreated={(notice) => { setNotices((items) => [notice, ...items]); setModal(false); setPage(1); }} />}
  </section>;
}
