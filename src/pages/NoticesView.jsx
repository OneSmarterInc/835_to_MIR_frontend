import React, { useCallback, useEffect, useState } from "react";
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
  const analysis = claim.analysis;
  if (!analysis) return <div className="mpl-empty">Evidence analysis is waiting to run.</div>;
  return <div className="mpl-analysis">
    <div className="mpl-analysis-heading"><div><span>AI-ASSISTED, EVIDENCE-BOUND REVIEW</span><h3>{claim.claim_number || claim.internal_claim_number}</h3></div><div className="mpl-confidence">{Math.round(analysis.confidence * 100)}% confidence<br/><small>Human review required</small></div></div>
    <p className="mpl-summary">{analysis.summary}</p>
    <h4>Claim timeline</h4><div className="mpl-timeline">{analysis.timeline.map((item, index) => <div key={`${item.event}-${index}`}><time>{dateLabel(item.date)}</time><strong>{item.event}</strong><span>{item.file} · {statusLabel(item.status)}</span></div>)}</div>
    <h4>Verified issues</h4>{analysis.findings.length ? <div className="mpl-table-wrap"><table className="mpl-table"><thead><tr><th>SEVERITY</th><th>ISSUE</th><th>EVIDENCE</th></tr></thead><tbody>{analysis.findings.map((finding, index) => <tr key={`${finding.code}-${index}`}><td><span className={`mpl-severity ${finding.severity}`}>{finding.severity}</span></td><td><strong>{statusLabel(finding.code)}</strong><small>{finding.description}</small></td><td>{finding.evidence}</td></tr>)}</tbody></table></div> : <p className="mpl-empty">No configured deterministic rule found a discrepancy.</p>}
    {!![...(analysis.unknown_codes || []), ...(analysis.unclear_items || []), ...(analysis.missing_evidence || [])].length && <><h4>Unclear or not understood</h4><ul className="mpl-uncertainty">{(analysis.unknown_codes || []).map((item) => <li key={`code-${item}`}><strong>Unknown code:</strong> {item}</li>)}{(analysis.unclear_items || []).map((item, index) => <li key={`unclear-${index}`}>{item}</li>)}{(analysis.missing_evidence || []).map((item, index) => <li key={`missing-${index}`}><strong>Missing evidence:</strong> {item}</li>)}</ul></>}
    <h4>Recommended resolution</h4><ol className="mpl-actions">{analysis.recommended_actions.map((action, index) => <li key={index}>{typeof action === "string" ? action : action.explanation}</li>)}</ol>
    <p className="mpl-caution">Recommendations require claims/EDI review. They may improve acceptance but do not guarantee payer approval.</p>
    <h4>Related archived files</h4><RelatedFiles files={analysis.related_files} />
    <div className="mpl-card-actions"><button className="mpl-btn primary" onClick={() => onReview(noticeId, claim.claim_id, "APPROVED")}>Approve Analysis</button><button className="mpl-btn secondary" onClick={() => onReview(noticeId, claim.claim_id, "CHANGES_REQUIRED")}>Mark Changes Required</button><span className="mpl-state">{statusLabel(analysis.review_status)}</span></div>
  </div>;
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

  const toggleCard = async () => {
    if (!cardExpanded && !detail) await loadDetail(notice.id);
    setCardExpanded((value) => !value);
  };
  const toggleEmail = async () => {
    if (!detail) await loadDetail(notice.id);
    setEmailExpanded((value) => !value);
  };

  return <article className={`mpl-notice-card ${cardExpanded ? "is-open" : ""}`}>
    <button type="button" className="mpl-notice-summary" onClick={toggleCard} aria-expanded={cardExpanded}>
      <span className="mpl-summary-main">
        <span className="mpl-email-type">{notice.notice_type === "ACKNOWLEDGEMENT" ? "ACKNOWLEDGEMENT" : "MPL RETURN EMAIL"}</span>
        <strong>{notice.subject}</strong>
        <span className="mpl-summary-meta">
          <span>{notice.sender || "Sender unavailable"}</span>
          <span>{dateLabel(notice.received_at || notice.created_at)}</span>
          <span>{notice.program || "Program unavailable"}</span>
          {(notice.period_start || notice.period_end) && <span>{notice.period_start || "—"} – {notice.period_end || "—"}</span>}
        </span>
      </span>
      <span className="mpl-summary-side">
        <span className={`mpl-status ${notice.status?.toLowerCase()}`}>{statusLabel(notice.status)}</span>
        <span className="mpl-open-label">{cardExpanded ? "Close" : "Open"} <b aria-hidden="true">{cardExpanded ? "−" : "+"}</b></span>
      </span>
    </button>

    {cardExpanded && <div className="mpl-notice-detail">
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
    </div>}
  </article>;
}

export default function NoticesView() {
  const [notices, setNotices] = useState([]); const [modal, setModal] = useState(false); const [error, setError] = useState("");
  const refresh = useCallback(async () => { try { const { res, data } = await safeFetchJson("/edi835/api/mpl-notices/"); if (!res.ok || !data.success) throw new Error(data.error || "Unable to load MPL notices."); setNotices((current) => data.notices.map((item) => current.find((old) => old.id === item.id && old.status === item.status && old.email_body !== undefined) || item)); setError(""); } catch (err) { setError(err.message); } }, []);
  const loadDetail = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/`); if (!res.ok || !data.success) throw new Error(data.error || "Unable to open notice."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!notices.some((item) => ACTIVE.has(item.status))) return undefined; const timer = setInterval(() => { refresh(); notices.filter((item) => ACTIVE.has(item.status)).forEach((item) => loadDetail(item.id).catch(() => {})); }, 3000); return () => clearInterval(timer); }, [notices, refresh]);
  const reanalyze = async (id) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/analyze/`, { method: "POST" }); if (!res.ok || !data.success) return setError(data.error || "Unable to reanalyze."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const selectClaim = async (id, claimId) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/select-claim/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim_id: claimId }) }); if (!res.ok || !data.success) return setError(data.error || "Unable to select claim."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  const review = async (id, claimId, reviewStatus) => { const { res, data } = await safeFetchJson(`/edi835/api/mpl-notices/${id}/claims/${claimId}/review/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ review_status: reviewStatus }) }); if (!res.ok || !data.success) return setError(data.error || "Unable to review analysis."); setNotices((items) => items.map((item) => item.id === id ? data.notice : item)); };
  return <section className="view on mpl-view" id="v-notices">
    <WorkspaceHeader eyebrow="Returned from MPL" title="MPL Notices" description="Upload the original Outlook MPL email, investigate its claims against verified application data, and review evidence-bound recommendations."><button className="mpl-btn light" onClick={() => setModal(true)}>+ Upload Email</button></WorkspaceHeader>
    {error && <div className="mpl-error">{error}</div>}
    {!notices.length && !error && <div className="mpl-zero"><h2>No MPL emails uploaded</h2><p>Upload the first returned MIR .msg file to begin claim investigation.</p><button className="mpl-btn primary" onClick={() => setModal(true)}>Upload Email</button></div>}
    <div className="mpl-notice-list">{notices.map((notice) => <NoticeCard key={notice.id} notice={notice} loadDetail={loadDetail} onReanalyze={reanalyze} onSelectClaim={selectClaim} onReview={review} />)}</div>
    {modal && <NoticeModal onClose={() => setModal(false)} onCreated={(notice) => { setNotices((items) => [notice, ...items]); setModal(false); }} />}
  </section>;
}
