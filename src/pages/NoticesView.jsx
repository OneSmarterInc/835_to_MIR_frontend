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

function NoticeModal({ onClose, onCreated }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!file || !file.name.toLowerCase().endsWith(".msg")) throw new Error("Select an Outlook .msg email file.");
      const body = new FormData();
      body.append("email_file", file);
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

  const storedInternalNumbers = String(selected.internal_claim_number || "").split(",").map((value) => value.trim()).filter(Boolean);
  const visibleInternalPattern = new RegExp(`${escapePattern(String(claimNumber))}([A-Za-z][A-Za-z0-9_-]{1,30})`, "gi");
  const inferredInternalNumbers = [];
  let inferredMatch;
  while ((inferredMatch = visibleInternalPattern.exec(content)) !== null) {
    const value = inferredMatch[0];
    if (!inferredInternalNumbers.some((item) => item.toUpperCase() === value.toUpperCase())) inferredInternalNumbers.push(value);
  }
  const internalNumbers = [...new Set([...storedInternalNumbers, ...inferredInternalNumbers])];
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
  if (!analysis) return <article className="mpl-claim-response"><strong>{claimNumber}</strong><p>Evidence analysis is still being prepared for this claim.</p></article>;

  const findings = analysis.findings || [];
  const timeline = analysis.timeline || [];
  const duplicateFinding = findings.find((item) => String(item.code || "").toUpperCase().includes("DUPLICATE"));
  const holdFinding = findings.find((item) => {
    const value = `${item.code || ""} ${item.description || ""}`.toUpperCase();
    return value.includes("HOLD") || value.includes("HELD");
  });
  const history = timeline.length
    ? timeline.map((item) => `${item.event || item.status || "File event"} in ${item.file || "an archived file"} on ${dateLabel(item.date)}`).join("; ")
    : "No archived file history was found.";
  const response = [
    analysis.summary,
    `History: ${history}`,
    `Duplicate: ${duplicateFinding ? duplicateFinding.description || statusLabel(duplicateFinding.code) : "no stored duplicate indicator found"}.`,
    `Hold: ${holdFinding ? holdFinding.description || statusLabel(holdFinding.code) : "no stored hold indicator found"}.`,
  ].filter(Boolean).join(" ");

  return <article className="mpl-claim-response">
    <strong>{claimNumber}</strong>
    <p>{response}</p>
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

function NoticeCard({ notice, loadDetail, onReanalyze, onSelectClaim, onWorkflowStatus, cardExpanded, onOpen, onClose }) {
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

  const toggleCard = async () => {
    if (cardExpanded) {
      onClose();
      return;
    }
    setEmailExpanded(false);
    setAiExpanded(false);
    setSourcesExpanded(false);
    setDetailError("");
    onOpen(notice.id);
    if (!detail) {
      setDetailLoading(true);
      setDetailError("");
      loadDetail(notice.id)
        .catch((error) => setDetailError(error.message || "Unable to load this email."))
        .finally(() => setDetailLoading(false));
    }
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
          {notice.source_file_url && <a className="mpl-file-link" href={notice.source_file_url}>Download .msg</a>}
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
          {!!notice.claims?.length
            ? notice.claims.map((claim) => <ClaimAnalysis key={claim.link_id} claim={claim} />)
            : sourceMatches.map((match) => {
                const issues = match.reported_issues || [];
                const history = match.sources || [];
                const response = [
                  issues.length ? issues.map((issue) => issue.description || (issue.codes || []).join(", ")).filter(Boolean).join("; ") : "No issue was confidently associated from the email.",
                  history.length ? `History: ${history.map((source) => `${source.type} ${source.filename} received ${dateLabel(source.date)} (${statusLabel(source.status)})`).join("; ")}.` : "No archived file history was found.",
                  "Duplicate: no stored duplicate indicator found.",
                  "Hold: no stored hold indicator found.",
                ].join(" ");
                return <article className="mpl-claim-response" key={match.claim_number}><strong>{match.claim_number}</strong><p>{response}</p></article>;
              })}
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
              <tr><th rowSpan="2">HIGHMARK CLAIM NUMBER</th><th colSpan="2">835</th><th colSpan="2">MIR</th><th colSpan="2">RECON</th><th colSpan="2">837</th><th rowSpan="2">WORKFLOW STATUS</th></tr>
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
              {(() => { const linked = (notice.claims || []).find((claim) => String(claim.claim_number) === String(match.claim_number) || String(claim.highmark_claim_number) === String(match.claim_number)); return <td className="mpl-workflow-cell"><WorkflowStatusSelect value={linked?.workflow_status} disabled={!linked} onChange={(status) => onWorkflowStatus(notice.id, linked.claim_id, status)} /></td>; })()}
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

export default function NoticesView() {
  const [notices, setNotices] = useState([]);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "received", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openNoticeId, setOpenNoticeId] = useState(null);

  const refresh = useCallback(async () => { try { const { res, data } = await safeFetchJson("/edi835/api/mpl-notices/"); if (!res.ok || !data.success) throw new Error(data.error || "Unable to load MPL notices."); setNotices((current) => data.notices.map((item) => current.find((old) => old.id === item.id && old.status === item.status && old.email_body !== undefined) || item)); setError(""); } catch (err) { setError(err.message); } }, []);
  const loadDetail = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/`); if (!res.ok || !data.success) throw new Error(data.error || "Unable to open notice."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!notices.some((item) => ACTIVE.has(item.status))) return undefined; const timer = setInterval(() => { refresh(); notices.filter((item) => ACTIVE.has(item.status)).forEach((item) => loadDetail(item.id).catch(() => {})); }, 3000); return () => clearInterval(timer); }, [notices, refresh]);
  const reanalyze = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/analyze/`, { method: "POST" }); if (!res.ok || !data.success) return setError(data.error || "Unable to reanalyze."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const updateWorkflowStatus = async (id, claimId, workflowStatus) => {
    const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/claims/${claimId}/workflow-status/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_status: workflowStatus }),
    });
    if (!res.ok || !data.success) {
      const message = data.error || "Unable to update claim workflow status.";
      setError(message);
      throw new Error(message);
    }
    setError("");
    setNotices((items) => items.map((item) => item.id === id ? data.notice : item));
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

  return <section className="view on mpl-view" id="v-notices">
    <WorkspaceHeader eyebrow="Returned from MPL" title="MPL Notices" description="Upload the original Outlook MPL email, investigate its claims against verified application data, and review evidence-bound recommendations."><button className="mpl-btn light" onClick={() => setModal(true)}>+ Upload Email</button></WorkspaceHeader>
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
          <tbody>{renderedNotices.length ? renderedNotices.map((notice) => <NoticeCard key={notice.id} notice={notice} loadDetail={loadDetail} onReanalyze={reanalyze} onSelectClaim={selectClaim} onWorkflowStatus={updateWorkflowStatus} cardExpanded={openNoticeId === notice.id} onOpen={setOpenNoticeId} onClose={() => setOpenNoticeId(null)} />) : <tr><td colSpan="7" className="mpl-no-results">No MPL emails match the current search and filters.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mpl-pagination">
        <span>{filteredNotices.length ? `${pageStart + 1}–${Math.min(pageStart + pageSize, filteredNotices.length)} of ${filteredNotices.length}` : "0 results"}</span>
        <div><button type="button" disabled={currentPage === 1} onClick={() => setPage(1)}>«</button><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><strong>Page {currentPage} of {pageCount}</strong><button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>›</button><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(pageCount)}>»</button></div>
      </div>
    </div>}
    {modal && <NoticeModal onClose={() => setModal(false)} onCreated={(notice) => { setNotices((items) => [notice, ...items]); setModal(false); setPage(1); }} />}
  </section>;
}
