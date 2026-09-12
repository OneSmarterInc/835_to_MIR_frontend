import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { safeFetchJson } from "../utils/api";
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

function ClaimAnalysis({ claim, noticeId, onReview }) {
  const [expanded, setExpanded] = useState(false);
  const [savingDecision, setSavingDecision] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const analysis = claim.analysis;
  const claimNumber = claim.claim_number || claim.internal_claim_number;
  if (!analysis) return <div className="mpl-claim-waiting"><strong>{claimNumber}</strong><span>Evidence analysis is waiting to run.</span></div>;

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

  return <section className={`mpl-claim-analysis ${reviewStatus.toLowerCase()}`}>
    <button type="button" className="mpl-claim-analysis-header" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span>
        <small>INDIVIDUAL CLAIM REVIEW</small>
        <strong>{claimNumber}</strong>
        <em>{analysis.primary_issue_code ? statusLabel(analysis.primary_issue_code) : `${analysis.findings.length} verified finding${analysis.findings.length === 1 ? "" : "s"}`}</em>
      </span>
      <span className="mpl-claim-header-side">
        <b>{Math.round(analysis.confidence * 100)}% <small>confidence</small></b>
        <i className={`mpl-review-state ${reviewStatus.toLowerCase()}`}>{statusLabel(reviewStatus)}</i>
        <span className="mpl-claim-expand">{expanded ? "Collapse" : "Review"} <b aria-hidden="true">{expanded ? "−" : "+"}</b></span>
      </span>
    </button>

    {expanded && <div className="mpl-claim-analysis-body">
      <div className="mpl-claim-ai-output">
        <span>AI ANALYSIS</span>
        <p>{analysis.summary}</p>
      </div>

      <div className="mpl-claim-metrics">
        <span><b>{analysis.findings.length}</b> verified findings</span>
        <span><b>{analysis.timeline.length}</b> timeline events</span>
        <span><b>{analysis.related_files.length}</b> related files</span>
        <span><b>{analysis.recommended_actions.length}</b> recommended actions</span>
      </div>

      <details className="mpl-claim-detail-panel">
        <summary>Verified issues <span>{analysis.findings.length}</span></summary>
        <div>{analysis.findings.length ? <div className="mpl-table-wrap"><table className="mpl-table mpl-findings-table"><thead><tr><th>SEVERITY</th><th>ISSUE</th><th>EVIDENCE</th></tr></thead><tbody>{analysis.findings.map((finding, index) => <tr key={`${finding.code}-${index}`}><td><span className={`mpl-severity ${finding.severity}`}>{finding.severity}</span></td><td><strong>{statusLabel(finding.code)}</strong><small>{finding.description}</small></td><td>{finding.evidence}</td></tr>)}</tbody></table></div> : <p className="mpl-empty">No configured deterministic rule found a discrepancy.</p>}</div>
      </details>

      <details className="mpl-claim-detail-panel">
        <summary>Recommended resolution <span>{analysis.recommended_actions.length}</span></summary>
        <div><ol className="mpl-actions">{analysis.recommended_actions.map((action, index) => <li key={index}>{typeof action === "string" ? action : action.explanation}</li>)}</ol><p className="mpl-caution">Recommendations require claims/EDI review and do not guarantee payer approval.</p></div>
      </details>

      {!![...(analysis.unknown_codes || []), ...(analysis.unclear_items || []), ...(analysis.missing_evidence || [])].length && <details className="mpl-claim-detail-panel mpl-needs-clarification">
        <summary>Unclear or not understood <span>{[...(analysis.unknown_codes || []), ...(analysis.unclear_items || []), ...(analysis.missing_evidence || [])].length}</span></summary>
        <div><ul className="mpl-uncertainty">{(analysis.unknown_codes || []).map((item) => <li key={`code-${item}`}><strong>Unknown code:</strong> {item}</li>)}{(analysis.unclear_items || []).map((item, index) => <li key={`unclear-${index}`}>{item}</li>)}{(analysis.missing_evidence || []).map((item, index) => <li key={`missing-${index}`}><strong>Missing evidence:</strong> {item}</li>)}</ul></div>
      </details>}

      <details className="mpl-claim-detail-panel">
        <summary>Claim timeline <span>{analysis.timeline.length}</span></summary>
        <div><div className="mpl-timeline">{analysis.timeline.map((item, index) => <div key={`${item.event}-${index}`}><time>{dateLabel(item.date)}</time><strong>{item.event}</strong><span>{item.file} · {statusLabel(item.status)}</span></div>)}</div></div>
      </details>

      <details className="mpl-claim-detail-panel">
        <summary>Related archived files <span>{analysis.related_files.length}</span></summary>
        <div><RelatedFiles files={analysis.related_files} /></div>
      </details>

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
    </div>}
  </section>;
}

function NoticeCard({ notice, loadDetail, onReanalyze, onSelectClaim, onReview }) {
  const [cardExpanded, setCardExpanded] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [claimsExpanded, setClaimsExpanded] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
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
      <td><button type="button" className="mpl-row-open" onClick={(event) => { event.stopPropagation(); toggleCard(); }} aria-expanded={cardExpanded}>{cardExpanded ? "Close" : "Open"} <b aria-hidden="true">{cardExpanded ? "−" : "+"}</b></button></td>
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

      {analysisReady && !!totalSources && <section className="mpl-disclosure">
        <button type="button" className="mpl-section-toggle" aria-expanded={sourcesExpanded} onClick={() => setSourcesExpanded((value) => !value)}>
          <span><strong>Matched source files</strong><small>{matchedClaims.length} claim{matchedClaims.length === 1 ? "" : "s"} · {totalSources} verified 837, MIR, 835, or reconciliation match{totalSources === 1 ? "" : "es"}</small></span>
          <b>{sourcesExpanded ? "Collapse" : "Expand"} <i aria-hidden="true">{sourcesExpanded ? "−" : "+"}</i></b>
        </button>
        {sourcesExpanded && <div className="mpl-disclosure-content mpl-table-wrap">
          <table className="mpl-table mpl-compact-source-table">
            <thead><tr><th>CLAIM</th><th>MATCHED SOURCES</th></tr></thead>
            <tbody>{matchedClaims.map((match) => <tr key={match.claim_number}>
              <td className="mono">{match.claim_number}</td>
              <td><div className="mpl-source-stack">{match.sources.map((source, index) => <div className="mpl-source-row" key={`${match.claim_number}-${source.type}-${source.filename}-${index}`}>
                <span className="mpl-state">{source.type}</span>
                <span className="mpl-source-file"><strong>{source.filename}</strong><small>{statusLabel(source.status)}{source.date ? ` · ${dateLabel(source.date)}` : ""}</small></span>
                <span className="mpl-source-facts">{Object.entries(source.details || {}).map(([key, value]) => <small key={key}><b>{statusLabel(key)}:</b> {String(value ?? "—")}</small>)}</span>
                <a className="mpl-file-link" href={source.download_url}>Download</a>
              </div>)}</div></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>}

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
  const [filters, setFilters] = useState({ type: "", subject: "", sender: "", received: "", program: "", period: "", status: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const refresh = useCallback(async () => { try { const { res, data } = await safeFetchJson("/edi835/api/mpl-notices/"); if (!res.ok || !data.success) throw new Error(data.error || "Unable to load MPL notices."); setNotices((current) => data.notices.map((item) => current.find((old) => old.id === item.id && old.status === item.status && old.email_body !== undefined) || item)); setError(""); } catch (err) { setError(err.message); } }, []);
  const loadDetail = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/`); if (!res.ok || !data.success) throw new Error(data.error || "Unable to open notice."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!notices.some((item) => ACTIVE.has(item.status))) return undefined; const timer = setInterval(() => { refresh(); notices.filter((item) => ACTIVE.has(item.status)).forEach((item) => loadDetail(item.id).catch(() => {})); }, 3000); return () => clearInterval(timer); }, [notices, refresh]);
  const reanalyze = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/analyze/`, { method: "POST" }); if (!res.ok || !data.success) return setError(data.error || "Unable to reanalyze."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const selectClaim = async (id, claimId) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/select-claim/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim_id: claimId }) }); if (!res.ok || !data.success) return setError(data.error || "Unable to select claim."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const review = async (id, claimId, reviewStatus) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/claims/${claimId}/review/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_status: reviewStatus }) }); if (!res.ok || !data.success) { const message = data.error || "Unable to save the review decision."; setError(message); throw new Error(message); } setError(""); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); return data.notice; };

  const setColumnFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  };
  const loweredQuery = query.trim().toLowerCase();
  const filteredNotices = notices.filter((notice) => {
    const received = notice.received_at || notice.created_at || "";
    const period = `${notice.period_start || ""} ${notice.period_end || ""}`;
    const type = notice.notice_type === "ACKNOWLEDGEMENT" ? "acknowledgement" : "mpl return email";
    const searchable = [
      type, notice.subject, notice.sender, received, notice.program, period, notice.status,
      ...(notice.extracted_claim_numbers || []),
      ...(notice.source_matches || []).flatMap((match) => (match.sources || []).map((source) => source.filename)),
    ].join(" ").toLowerCase();
    return (!loweredQuery || searchable.includes(loweredQuery))
      && (!filters.type || type.includes(filters.type.toLowerCase()))
      && (!filters.subject || String(notice.subject || "").toLowerCase().includes(filters.subject.toLowerCase()))
      && (!filters.sender || String(notice.sender || "").toLowerCase().includes(filters.sender.toLowerCase()))
      && (!filters.received || String(received).slice(0, 10) === filters.received)
      && (!filters.program || String(notice.program || "").toLowerCase().includes(filters.program.toLowerCase()))
      && (!filters.period || period.toLowerCase().includes(filters.period.toLowerCase()))
      && (!filters.status || notice.status === filters.status);
  });
  const pageCount = Math.max(1, Math.ceil(filteredNotices.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleNotices = filteredNotices.slice(pageStart, pageStart + pageSize);
  const statuses = [...new Set(notices.map((notice) => notice.status).filter(Boolean))].sort();
  const programs = [...new Set(notices.map((notice) => notice.program).filter(Boolean))].sort();

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
          <thead>
            <tr><th>TYPE</th><th>SUBJECT</th><th>SENDER</th><th>RECEIVED</th><th>PROGRAM</th><th>PERIOD</th><th>STATUS</th><th>ACTION</th></tr>
            <tr className="mpl-filter-row">
              <th><select value={filters.type} onChange={(event) => setColumnFilter("type", event.target.value)} aria-label="Filter by email type"><option value="">All types</option><option value="acknowledgement">Acknowledgement</option><option value="return email">Return email</option></select></th>
              <th><input value={filters.subject} onChange={(event) => setColumnFilter("subject", event.target.value)} placeholder="Filter subject" aria-label="Filter subject" /></th>
              <th><input value={filters.sender} onChange={(event) => setColumnFilter("sender", event.target.value)} placeholder="Filter sender" aria-label="Filter sender" /></th>
              <th><input type="date" value={filters.received} onChange={(event) => setColumnFilter("received", event.target.value)} aria-label="Filter received date" /></th>
              <th><select value={filters.program} onChange={(event) => setColumnFilter("program", event.target.value)} aria-label="Filter program"><option value="">All</option>{programs.map((program) => <option key={program} value={program}>{program}</option>)}</select></th>
              <th><input value={filters.period} onChange={(event) => setColumnFilter("period", event.target.value)} placeholder="YYYY-MM" aria-label="Filter period" /></th>
              <th><select value={filters.status} onChange={(event) => setColumnFilter("status", event.target.value)} aria-label="Filter status"><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></th>
              <th><button type="button" className="mpl-clear-filters" onClick={() => { setQuery(""); setFilters({ type: "", subject: "", sender: "", received: "", program: "", period: "", status: "" }); setPage(1); }}>Clear</button></th>
            </tr>
          </thead>
          <tbody>{visibleNotices.length ? visibleNotices.map((notice) => <NoticeCard key={notice.id} notice={notice} loadDetail={loadDetail} onReanalyze={reanalyze} onSelectClaim={selectClaim} onReview={review} />) : <tr><td colSpan="8" className="mpl-no-results">No MPL emails match the current search and filters.</td></tr>}</tbody>
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
