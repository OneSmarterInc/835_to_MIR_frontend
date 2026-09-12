import React, { useCallback, useEffect, useState } from "react";
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

function RelatedFiles({ files = [] }) {
  if (!files.length) return <p className="mpl-empty">No related files were verified.</p>;
  return <div className="mpl-table-wrap"><table className="mpl-table"><thead><tr><th>TYPE</th><th>FILENAME</th><th>DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{files.map((file) => <tr key={`${file.type}-${file.id}`}><td>{file.type}</td><td className="mono">{file.filename}</td><td>{dateLabel(file.date)}</td><td><span className="mpl-state">{statusLabel(file.status)}</span></td><td><a className="mpl-file-link" href={file.download_url}>Download</a></td></tr>)}</tbody></table></div>;
}

function SourceFileViewer({ claimNumber, sources, onClose }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = sources[selectedIndex];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setContent("");
    portalFetch(selected.download_url)
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the archived file.");
        return response.text();
      })
      .then((text) => { if (!cancelled) setContent(text); })
      .catch((reason) => { if (!cancelled) setError(reason.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(<div className="mpl-file-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mpl-file-viewer" role="dialog" aria-modal="true" aria-labelledby="mpl-file-viewer-title">
      <header>
        <div><span>MATCHED SOURCE EVIDENCE</span><h3 id="mpl-file-viewer-title">{selected.type} file for Highmark claim {claimNumber}</h3></div>
        <button type="button" onClick={onClose} aria-label="Close file viewer">×</button>
      </header>
      <div className="mpl-file-viewer-toolbar">
        <label><span>FILE</span><select value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>{sources.map((source, index) => <option value={index} key={`${source.type}-${source.filename}-${index}`}>{source.filename}</option>)}</select></label>
        <dl>
          <div><dt>Internal claim number</dt><dd>{selected.internal_claim_number || "Not found in the 837 database"}</dd></div>
          <div><dt>File received</dt><dd>{dateLabel(selected.date)}</dd></div>
          <div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div>
        </dl>
        <a className="mpl-btn primary" href={selected.download_url}>Download file</a>
      </div>
      <div className="mpl-file-content">
        <div><strong>File content</strong><small>{selected.filename}</small></div>
        {loading ? <p className="mpl-empty">Loading archived file…</p> : error ? <p className="mpl-file-view-error">{error}</p> : <pre>{content || "This archived file has no stored text content."}</pre>}
      </div>
    </section>
  </div>, document.body);
}

function ClaimAnalysis({ claim, noticeId, onReview }) {
  const [savingDecision, setSavingDecision] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const analysis = claim.analysis;
  const claimNumber = claim.claim_number || claim.internal_claim_number;
  if (!analysis) return <div className="mpl-empty">Evidence analysis is waiting to run for <strong>{claimNumber}</strong>.</div>;

  const reviewStatus = analysis.review_status || "PENDING";
  const submitDecision = async (decision) => {
    setSavingDecision(decision);
    setDecisionError("");
    try {
      await onReview(noticeId, claim.claim_id, decision);
    } catch (error) {
      setDecisionError(error.message || "Unable to save this review decision.");
    } finally {
      setSavingDecision("");
    }
  };

  return <section className={`mpl-analysis ${reviewStatus.toLowerCase()}`}>
    <div className="mpl-analysis-heading">
      <div><span>AI-ASSISTED, EVIDENCE-BOUND REVIEW</span><h3>{claimNumber}</h3></div>
      <div className="mpl-confidence">{Math.round(analysis.confidence * 100)}% confidence<br/><small>Human review required</small></div>
    </div>

    <div className="mpl-claim-ai-output"><span>AI ANALYSIS</span><p>{analysis.summary}</p></div>

    <h4>Claim timeline</h4>
    <div className="mpl-timeline">{analysis.timeline.map((item, index) => <div key={`${item.event}-${index}`}><time>{dateLabel(item.date)}</time><strong>{item.event}</strong><span>{item.file} · {statusLabel(item.status)}</span></div>)}</div>

    <h4>Verified issues</h4>
    {analysis.findings.length ? <div className="mpl-table-wrap"><table className="mpl-table mpl-findings-table"><thead><tr><th>SEVERITY</th><th>ISSUE</th><th>EVIDENCE</th></tr></thead><tbody>{analysis.findings.map((finding, index) => <tr key={`${finding.code}-${index}`}><td><span className={`mpl-severity ${finding.severity}`}>{finding.severity}</span></td><td><strong>{statusLabel(finding.code)}</strong><small>{finding.description}</small></td><td>{finding.evidence}</td></tr>)}</tbody></table></div> : <p className="mpl-empty">No configured deterministic rule found a discrepancy.</p>}

    {!![...(analysis.unknown_codes || []), ...(analysis.unclear_items || []), ...(analysis.missing_evidence || [])].length && <><h4>Unclear or not understood</h4><ul className="mpl-uncertainty">{(analysis.unknown_codes || []).map((item) => <li key={`code-${item}`}><strong>Unknown code:</strong> {item}</li>)}{(analysis.unclear_items || []).map((item, index) => <li key={`unclear-${index}`}>{item}</li>)}{(analysis.missing_evidence || []).map((item, index) => <li key={`missing-${index}`}><strong>Missing evidence:</strong> {item}</li>)}</ul></>}

    <h4>Recommended resolution</h4>
    <ol className="mpl-actions">{analysis.recommended_actions.map((action, index) => <li key={index}>{typeof action === "string" ? action : action.explanation}</li>)}</ol>
    <p className="mpl-caution">Recommendations require claims/EDI review. They may improve acceptance but do not guarantee payer approval.</p>

    <h4>Related archived files</h4>
    <RelatedFiles files={analysis.related_files} />

    <div className={`mpl-review-decision ${reviewStatus.toLowerCase()}`}>
      <div>
        <small>HUMAN REVIEW DECISION</small>
        <strong>{reviewStatus === "APPROVED" ? "Analysis approved" : reviewStatus === "CHANGES_REQUIRED" ? "Changes requested" : "Review required"}</strong>
        <span>{reviewStatus === "APPROVED" ? "This analysis has been accepted for the operational workflow." : reviewStatus === "CHANGES_REQUIRED" ? "This analysis is flagged for correction and re-review." : "Confirm whether this analysis is acceptable or needs correction."}</span>
      </div>
      <div className="mpl-review-actions">
        <button type="button" className={`mpl-decision-btn approve ${reviewStatus === "APPROVED" ? "selected" : ""}`} disabled={!!savingDecision} onClick={() => submitDecision("APPROVED")}>{savingDecision === "APPROVED" ? "Saving…" : reviewStatus === "APPROVED" ? "✓ Approved" : "✓ Approve analysis"}</button>
        <button type="button" className={`mpl-decision-btn changes ${reviewStatus === "CHANGES_REQUIRED" ? "selected" : ""}`} disabled={!!savingDecision} onClick={() => submitDecision("CHANGES_REQUIRED")}>{savingDecision === "CHANGES_REQUIRED" ? "Saving…" : reviewStatus === "CHANGES_REQUIRED" ? "! Changes requested" : "Request changes"}</button>
      </div>
      {decisionError && <p className="mpl-decision-error">{decisionError}</p>}
    </div>
  </section>;
}

function NoticeCard({ notice, loadDetail, onReanalyze, onSelectClaim, onReview }) {
  const [cardExpanded, setCardExpanded] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [claimsExpanded, setClaimsExpanded] = useState(true);
  const [sourcesExpanded, setSourcesExpanded] = useState(true);
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
    const closeOnEscape = (event) => { if (event.key === "Escape") setCardExpanded(false); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [cardExpanded]);

  const toggleCard = async () => {
    if (!cardExpanded && !detail) await loadDetail(notice.id);
    setCardExpanded((value) => !value);
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
      <td><span className={`mpl-status ${notice.status?.toLowerCase()}`}>{statusLabel(notice.status)}</span></td>
    </tr>
    {cardExpanded && createPortal(<div className="mpl-detail-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCardExpanded(false); }}>
      <section className="mpl-detail-modal" role="dialog" aria-modal="true" aria-labelledby={`mpl-notice-${notice.id}-title`}>
        <header className="mpl-detail-modal-header">
          <div><span className="mpl-email-type">{notice.notice_type === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGEMENT" : "MPL RETURN EMAIL"}</span><h2 id={`mpl-notice-${notice.id}-title`}>{notice.subject}</h2><p>{notice.sender || "Sender unavailable"} · {dateLabel(notice.received_at || notice.created_at)}</p></div>
          <button type="button" onClick={() => setCardExpanded(false)} aria-label="Close email details">×</button>
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

      {isActive && <div className="mpl-processing"><span></span>{statusLabel(notice.status)}…</div>}

      {analysisReady && notice.ai_response && <section className="mpl-ai-response">
        <span>{notice.ai_response_source === "deterministic-fallback" ? "AUTOMATED FALLBACK" : `AI RESPONSE · ${notice.ai_response_source || "QWEN"}`}</span>
        <p>{notice.ai_response}</p>
        {!!sourceMatches.length && <div className="mpl-overall-claim-summary">
          <h4>Overall claim summary</h4>
          <div>{sourceMatches.map((match) => {
            const issues = match.reported_issues || [];
            const sourceTypes = [...new Set((match.sources || []).map((source) => source.type))];
            return <article key={match.claim_number}>
              <strong>{match.claim_number}</strong>
              <div>{issues.length ? issues.map((issue, index) => <p key={`${match.claim_number}-summary-${index}`}><b>{(issue.codes || []).join(", ") || statusLabel(issue.category || "REPORTED ISSUE")}</b>{issue.description ? <> · {issue.description}</> : null}</p>) : <p>No issue was confidently associated from the email.</p>}</div>
              <small>{sourceTypes.length ? sourceTypes.join(" · ") : "No matching archived source"}</small>
            </article>;
          })}</div>
        </div>}
        {!!notice.ai_suggestions?.length && <div className="mpl-ai-next-steps"><h4>Suggested next steps</h4><ol>{notice.ai_suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ol></div>}
      </section>}

      {analysisReady && !!notice.extracted_claim_numbers?.length && <section className="mpl-disclosure">
        <button type="button" className="mpl-section-toggle" aria-expanded={claimsExpanded} onClick={() => setClaimsExpanded((value) => !value)}>
          <span><strong>Claims considered in this analysis</strong><small>{notice.extracted_claim_numbers.length} extracted claim{notice.extracted_claim_numbers.length === 1 ? "" : "s"} · reported issues and evidence coverage</small></span>
          <b>{claimsExpanded ? "Collapse" : "Expand"} <i aria-hidden="true">{claimsExpanded ? "−" : "+"}</i></b>
        </button>
        {claimsExpanded && <div className="mpl-disclosure-content"><div className="mpl-ai-claim-review">{notice.extracted_claim_numbers.map((number) => {
          const match = sourceMatches.find((item) => item.claim_number === number);
          const issues = match?.reported_issues || [];
          const sources = match?.sources || [];
          return <div key={number}>
            <strong>{number}</strong>
            <div>{issues.length ? issues.map((issue, index) => <span key={`${number}-issue-${index}`}><b>{(issue.codes || []).join(", ") || statusLabel(issue.category || "REPORTED ISSUE")}</b>{issue.description && <> · {issue.description}</>}</span>) : <span>No issue confidently associated</span>}</div>
            <small>{sources.length ? [...new Set(sources.map((source) => source.type))].join(" · ") : "No matching archived source"}</small>
          </div>;
        })}</div></div>}
      </section>}

      {analysisReady && !!sourceMatches.length && <section className="mpl-disclosure">
        <button type="button" className="mpl-section-toggle" aria-expanded={sourcesExpanded} onClick={() => setSourcesExpanded((value) => !value)}>
          <span><strong>Matched source files</strong><small>{matchedClaims.length} claim{matchedClaims.length === 1 ? "" : "s"} · {totalSources} verified 835, MIR, reconciliation, or 837 match{totalSources === 1 ? "" : "es"}</small></span>
          <b>{sourcesExpanded ? "Collapse" : "Expand"} <i aria-hidden="true">{sourcesExpanded ? "−" : "+"}</i></b>
        </button>
        {sourcesExpanded && <div className="mpl-disclosure-content mpl-source-matrix-wrap">
          <table className="mpl-table mpl-source-matrix">
            <thead>
              <tr><th rowSpan="2">HIGHMARK CLAIM NUMBER</th><th colSpan="2">835</th><th colSpan="2">MIR</th><th colSpan="2">RECON</th><th colSpan="2">837</th></tr>
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
            </tr>)}</tbody>
          </table>
        </div>}
      </section>}

      {sourcePreview && <SourceFileViewer claimNumber={sourcePreview.claimNumber} sources={sourcePreview.sources} onClose={() => setSourcePreview(null)} />}

      {notice.status === "FAILED" && notice.last_error && <div className="mpl-error mpl-failure-note">Analysis could not be completed. Please try again or contact support.</div>}
      {detail && notice.status === "WAITING_FOR_CLAIM_SELECTION" && <div className="mpl-claim-picker"><h3>Select the affected claim</h3><p>More than one stored claim uses the identifier from this email. Choose the correct claim before analysis continues.</p>{notice.claims?.map((claim) => <button key={claim.link_id} onClick={() => onSelectClaim(notice.id, claim.claim_id)}><strong>{claim.claim_number || claim.internal_claim_number}</strong><span>{claim.service_from_date || "No service date"} · ${claim.total_charge}</span></button>)}</div>}
      {detail && notice.claims?.map((claim) => <ClaimAnalysis key={claim.link_id} claim={claim} noticeId={notice.id} onReview={onReview} />)}
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

  const refresh = useCallback(async () => { try { const { res, data } = await safeFetchJson("/edi835/api/mpl-notices/"); if (!res.ok || !data.success) throw new Error(data.error || "Unable to load MPL notices."); setNotices((current) => data.notices.map((item) => current.find((old) => old.id === item.id && old.status === item.status && old.email_body !== undefined) || item)); setError(""); } catch (err) { setError(err.message); } }, []);
  const loadDetail = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/`); if (!res.ok || !data.success) throw new Error(data.error || "Unable to open notice."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!notices.some((item) => ACTIVE.has(item.status))) return undefined; const timer = setInterval(() => { refresh(); notices.filter((item) => ACTIVE.has(item.status)).forEach((item) => loadDetail(item.id).catch(() => {})); }, 3000); return () => clearInterval(timer); }, [notices, refresh]);
  const reanalyze = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/analyze/`, { method: "POST" }); if (!res.ok || !data.success) return setError(data.error || "Unable to reanalyze."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const selectClaim = async (id, claimId) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/select-claim/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim_id: claimId }) }); if (!res.ok || !data.success) return setError(data.error || "Unable to select claim."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const review = async (id, claimId, reviewStatus) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/claims/${claimId}/review/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_status: reviewStatus }) }); if (!res.ok || !data.success) { const message = data.error || "Unable to save the review decision."; setError(message); throw new Error(message); } setError(""); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); return data.notice; };

  const loweredQuery = query.trim().toLowerCase();
  const filteredNotices = notices.filter((notice) => {
    const received = notice.received_at || notice.created_at || "";
    const period = `${notice.period_start || ""} ${notice.period_end || ""}`;
    const type = notice.notice_type === "ACKNOWLEDGEMENT" ? "acknowledgement" : "mpl return email";
    const searchable = [
      type, notice.subject, notice.sender, received, dateLabel(received), notice.program, period, notice.status,
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
          <tbody>{visibleNotices.length ? visibleNotices.map((notice) => <NoticeCard key={notice.id} notice={notice} loadDetail={loadDetail} onReanalyze={reanalyze} onSelectClaim={selectClaim} onReview={review} />) : <tr><td colSpan="7" className="mpl-no-results">No MPL emails match the current search and filters.</td></tr>}</tbody>
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
