import React, { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import SecurityView from "./SecurityView";
import ConversionsView from "./ConversionsView";
import FileViewerModal from "../components/FileViewerModal";
import { encodeDemoValue, encodeDemoFileContent } from "../utils/demoEncoder";
import "./ClientUserPortal.css";

const cash = v => v === null || v === undefined || v === "" ? "—" :
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
const safe = v => v == null || v === "" ? "—" : encodeDemoValue(String(v), true);
const timestamp = v => v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-"); };
const filenameText = value => value == null || value === "" ? "—" : String(value);
const navigation = [["home","Home"],["convert","Convert a file"],["attention","Needs attention"],["history","History"]];
async function jsonFetch(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error || "Unable to complete request");
  return body;
}
const baseUrl = "/edi835/api/client-portal/";
const adjustmentMeaning = (group, code) => {
  const known = {
    "45": "Charge exceeds the fee schedule or contracted allowed amount",
    "1": "Deductible",
    "2": "Coinsurance",
    "3": "Copayment",
    "29": "Time limit for filing has expired",
    "97": "Payment included in another service",
  };
  const category = group === "CO" ? "Contractual adjustment" :
    group === "PR" ? "Patient responsibility" :
    group === "OA" ? "Other adjustment" : "Adjustment";
  return category + ": " + (known[String(code)] || "reason code " + code);
};

const isPlanIssue = issue => /plan.?id|subscriber.?id|member.?id/i.test(issue.reason || "");
const isDictionaryIssue = issue => /dictionary|remark|code.?mapping|unknown.?code/i.test(issue.reason || "");
const hiddenFiles = actions => {
  const byFile = new Map();
  [...actions].reverse().forEach(a => {
    if (a.kind === "IGNORE_FILE") byFile.set(a.file_id, true);
    if (a.kind === "REOPEN_FILE") byFile.set(a.file_id, false);
  });
  return byFile;
};

export default function ClientUserPortal({ user, onLogout }) {
  const [tab, setTab] = useState("home");
  const [date, setDate] = useState(today);
  const [dashboard, setDashboard] = useState(null);
  const [actions, setActions] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("All");
  const [selectedFile, setSelectedFile] = useState("");
  const [detail, setDetail] = useState(null);
  const [claimReturnTab, setClaimReturnTab] = useState("home");
  const [detailLoading, setDetailLoading] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!drawer) return undefined;
    const onEscape = event => {
      if (event.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [drawer]);

  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [conversionFiles, setConversionFiles] = useState([]);
  const [fileViewerId, setFileViewerId] = useState(null);
  const [expandedFile, setExpandedFile] = useState(null);
  const [expandedPage, setExpandedPage] = useState(1);
  const [expandedClaims, setExpandedClaims] = useState(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyResult, setHistoryResult] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const reload = useCallback(() => setRefresh(v => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      jsonFetch(baseUrl + "overview/?date=" + encodeURIComponent(date), { signal: controller.signal }),
      jsonFetch(baseUrl + "actions/", { signal: controller.signal }),
    ]).then(([d,a]) => {
      setDashboard(d);
      setActions(a.actions || []);
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, refresh]);

  useEffect(() => {
    if (tab !== "history") return undefined;
    const controller = new AbortController();
    setHistoryLoading(true);
    jsonFetch(baseUrl + "history/?page=" + historyPage, { signal: controller.signal })
      .then(setHistoryResult)
      .catch(e => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [tab, historyPage, refresh]);

  useEffect(() => {
    if (!expandedFile || tab !== "attention") return undefined;
    const controller = new AbortController();
    setExpandedLoading(true);
    setExpandedError("");
    jsonFetch(baseUrl + "holds/" + encodeURIComponent(expandedFile) +
      "/?page=" + expandedPage + "&page_size=20", { signal: controller.signal })
      .then(setExpandedClaims)
      .catch(e => {
        if (e.name !== "AbortError") setExpandedError(e.message);
      })
      .finally(() => { if (!controller.signal.aborted) setExpandedLoading(false); });
    return () => controller.abort();
  }, [expandedFile, expandedPage, refresh, tab]);
  const openAttentionIssue = issue => {
    setTab("attention");
    setExpandedFile(issue.kind === "hold" ? issue.id : null);
    setExpandedPage(1);
    setExpandedClaims(null);
    setDrawer(false);
    window.setTimeout(() => {
      document.getElementById("cu-attention-" + issue.id)?.scrollIntoView({
        behavior: "smooth", block: "start",
      });
    }, 0);
  };
  const toggleHeldFile = id => {
    setExpandedFile(current => current === id ? null : id);
    setExpandedPage(1);
    setExpandedClaims(null);
    setExpandedError("");
  };

  const go = next => {
    if (next === "history") setHistoryPage(1);
    setTab(next);
    setDetail(null);
    setDecision(null);
    setError("");
    setDrawer(false);
    setSelectedFile("");
  };
  const showClaim = async id => {
    setClaimReturnTab(tab === "attention" ? "attention" : "home");
    setDetailLoading(true);
    setError("");
    setNotice("");
    setShowSegments(false);
    try {
      const response = await jsonFetch(baseUrl + "claim/" + encodeURIComponent(id) + "/");
      setDetail(response.claim);
      setTab("claim");
    } catch(e) { setError(e.message); }
    finally { setDetailLoading(false); }
  };
  const choose = (kind, file_id, claim_id, title) => {
    setNote("");
    setDecision({ kind, file_id, claim_id, title });
    setError("");
    setNotice("");
  };
  const sendDecision = async () => {
    if (!decision) return;
    setSending(true); setError("");
    try {
      const result = await jsonFetch(baseUrl + "actions/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: decision.kind, file_id: decision.file_id,
          claim_id: decision.claim_id || null, message: note.trim() }),
      });
      setNotice(result.message || "Decision saved.");
      setDecision(null);
      reload();
    } catch(e) { setError(e.message); }
    finally { setSending(false); }
  };
  const refreshConversionFiles = useCallback(async (signal) => {
    const results = await jsonFetch("/edi835/api/tracked-files/?include_conversion_findings=0", { signal });
    setConversionFiles(results.files || []);
  }, []);
  useEffect(() => {
    if (tab !== "convert") return undefined;
    const controller = new AbortController();
    refreshConversionFiles(controller.signal).catch(e => {
      if (e.name !== "AbortError") setError(e.message);
    });
    return () => controller.abort();
  }, [tab, refreshConversionFiles, refresh]);


  const hidden = useMemo(() => {
    const flags = hiddenFiles(actions);
    (dashboard?.ignored_files || []).forEach(id => flags.set(id, true));
    return flags;
  }, [actions, dashboard]);
  const issues = (dashboard?.issues || []).filter(i => !hidden.get(i.id));
  const claims = dashboard?.claims || [];
  const visible = claims.filter(c =>
    (!selectedFile || c.file_id === selectedFile) &&
    (filter === "All" || (filter === "Denied" ? ["Denied","No payment"].includes(c.payer_status) :
      filter === "Less paid" ? c.payer_status === "Paid less than billed" : c.payer_status === "Paid in full")));
  const metrics = dashboard?.metrics || {};
  const age = [["Today",0],["1 day",1],["2 days",2],["3+ days",3]].map(([name,v]) =>
    [name, claims.filter(c => v === 3 ? c.days >= 3 : c.days === v).length]);
  const maxAge = Math.max(1, ...age.map(x => x[1]));
  const reasonGroup = (dashboard?.issues || []).reduce((acc, i) => {
    const key = i.kind === "error" ? "Unreadable file" : i.reason || "Conversion hold";
    if (!acc[key]) acc[key] = { reason:key, count:0, files:0 };
    acc[key].count += i.kind === "error" ? 0 : Number(i.count || 0);
    acc[key].files += 1;
    return acc;
  }, {});

  const timeline = detail ? [
    { label: "835 received", at: detail.received_at, complete: true },
    { label: "Payer payment dated", at: detail.check_date, complete: !!detail.check_date },
    { label: "Conversion completed", at: detail.timeline?.find(x => x.label === "Conversion completed")?.at, complete: !!detail.timeline?.find(x => x.label === "Conversion completed") },
    { label: detail.reason ? "Waiting on review" : "Review not required", at: detail.reason ? "Attention needed" : "", complete: !detail.reason },
    { label: "Sent to MPL", at: detail.mir_status === "PUSHED" ? "Confirmed" : "Not confirmed", complete: detail.mir_status === "PUSHED" },
  ] : [];

  return <>
    <Topbar user={user} clientUser onToggleDrawer={() => setDrawer(v => !v)} onLogout={onLogout} />
    <div className="cu-shell">
      {drawer && <button type="button" className="cu-sidebar-backdrop"
        aria-label="Close navigation menu" onClick={() => setDrawer(false)}/>}
      <nav className={"cu-sidebar" + (drawer ? " cu-sidebar-open" : "")}
        aria-label="Client navigation" aria-hidden={!drawer} inert={!drawer}>
        <div className="grp eyebrow">Operations</div>
        {navigation.filter(([key]) => key !== "history").map(([key,label]) =>
          <button type="button" key={key}
            className={"cu-navitem" + ((tab === key || (key === "home" && tab === "claim")) ? " on" : "")}
            onClick={() => go(key)}><span>{label}</span>
            {key === "attention" && issues.length > 0 &&
              <span className="cu-count">{issues.length}</span>}
          </button>
        )}
        <div className="grp eyebrow cu-nav-section">Records</div>
        <button type="button" className={"cu-navitem" + (tab === "history" ? " on" : "")}
          onClick={() => go("history")}><span>History</span></button>
        <div className="grp eyebrow cu-nav-section">Account</div>
        <button type="button" className={"cu-navitem" + (tab === "settings" ? " on" : "")}
          onClick={() => go("settings")}><span>Settings</span></button>
      </nav>
      <main className="cu-main">
        {tab !== "home" && <button type="button" className="cu-back-link"
          onClick={() => go(tab === "claim" ? claimReturnTab : "home")}>
          ← Back to {tab === "claim" && claimReturnTab === "attention" ? "Needs Attention" : "Home"}
        </button>}
        {tab !== "convert" && <header className="cu-heading">
          <div className="cu-heading-copy">
            <span className="eyebrow">{dashboard?.client || user.client} · {date}</span>
            <h1>{tab === "home" ? "Claims overview" : tab === "attention" ?
              (issues.length + " things need a decision from you") : tab === "history" ?
              "Recent conversions" : tab === "convert" ? "Convert an 835 file" : tab === "settings" ? "Account settings" :
              "Claim " + safe(detail?.number)}</h1>
            <p>{tab === "home" ?
              "Your client claims, payments and exceptions in one place." :
              tab === "attention" ? "Everything else continues through the conversion pipeline." :
              tab === "history" ? "MIR conversions and delivery status from your client." :
              tab === "convert" ? "Upload a validated 835 for conversion and optional outbound delivery." : tab === "settings" ? "Manage your FileX security keys." :
              detail?.file_name || ""}</p>
          </div>
          {tab === "home" && <div className="cu-controls">
            <label className="cu-date-filter">Activity date<input type="date" value={date}
              onChange={e => setDate(e.target.value || today())} /></label>
            <button type="button" className="cu-btn" onClick={reload}>Refresh</button>
            <button type="button" className="cu-btn cu-primary" onClick={() => go("convert")}>Convert a file</button>
          </div>}
        </header>}
        {error && <div className="cu-error" role="alert">{error}</div>}
        {notice && <div className="cu-success" role="status">{notice}</div>}
        {loading && <p>Loading current client records…</p>}
        {detailLoading && <p>Opening claim…</p>}

        {tab === "home" && <>
          <div className="cu-kpis">
            {[
              ["Received",metrics.received_files,"files · "+(metrics.received_claims||0)+" claims",false],
              ["Converted",metrics.converted_claims,"claims",false],
              ["Waiting on you",metrics.waiting_claims,"claims · oldest "+(metrics.oldest_days||0)+" days",true],
              ["Sent to MPL",metrics.sent_claims,"claims · "+(metrics.sent_files||0)+" files",false],
            ].map(([title,value,sub,warn]) =>
              <section className={"cu-card cu-kpi"+(warn?" cu-warning":"")} key={title}>
                <span className="eyebrow">{title}</span><strong>{Number(value||0).toLocaleString()}</strong>
                <small>{sub}</small></section>)}
          </div>
          <section className="cu-card">
            <div className="cu-section-title"><h2>Claims waiting on you, by days waiting</h2>
              <span>{metrics.waiting_claims||0} held claims</span></div>
            {age.map(([label,count],idx) => <div className="cu-aging-row" key={label}>
              <span className={idx===3?"cu-old":""}>{label}</span>
              <div className="cu-track"><i className={idx===3?"cu-old-bar":""} style={{width: (count/maxAge*100)+"%"}} /></div>
              <b>{count} claims</b></div>)}
            <p className="cu-help">Showing {claims.length} individually matched claims; counts above may be higher when source records have not yet been normalized.</p>
            <div className="cu-filters">{["All","Denied","Less paid","Paid in full"].map(x =>
              <button key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>
                {x}{x==="All"?" ("+(metrics.waiting_claims||0)+")":""}</button>)}</div>
            {selectedFile && <p className="cu-help">Filtered to a source file. <button className="cu-link" onClick={() => setSelectedFile("")}>Show all</button></p>}
            <div className="cu-table-scroll"><table className="cu-table"><thead><tr>
              <th>Waiting</th><th>Claim</th><th>Internal claim</th><th>Billed</th>
              <th>Paid</th><th>Payer said (835)</th><th>Why waiting</th><th></th></tr></thead>
              <tbody>{visible.map(c => <tr key={c.id} className={c.days>=3?"cu-overdue":""}>
                <td>{c.days ? c.days+" days":"Today"}</td>
                <td><button className="cu-link" onClick={()=>showClaim(c.id)}>{safe(c.number)}</button></td>
                <td>{safe(c.internal_number)}</td><td>{cash(c.billed)}</td><td>{cash(c.paid)}</td>
                <td>{c.payer_status}</td><td>{c.reason||"Requires review"}</td>
                <td><button className="cu-link" onClick={()=>showClaim(c.id)}>Review</button></td>
              </tr>)}
              {!visible.length && <tr><td colSpan="8">No claims match this filter.</td></tr>}
              </tbody></table></div>
            {dashboard?.claims_limited && <p className="cu-help">Showing the first 200 matched claims.</p>}
          </section>
          <section className="cu-card cu-notice">
            <div className="cu-section-title"><h2>{issues.length} things need a decision from you</h2>
              <button className="cu-link" onClick={()=>go("attention")}>See all</button></div>
            {issues.slice(0,3).map(i => <div className="cu-issue-mini" key={i.id}>
              <div><b>{i.kind==="error"?"File could not be processed":i.count+" claims held"} · {i.filename}</b>
                <small>{i.reason}</small></div>
              <button className="cu-btn" onClick={()=>openAttentionIssue(i)}>Review</button></div>)}
            {!issues.length && <p>No outstanding conversion issues in the current queue.</p>}
          </section>
          <section className="cu-card">
            <div className="cu-section-title"><h2>Recent conversions</h2><button className="cu-link" onClick={()=>go("history")}>Full history</button></div>
            <History rows={(dashboard?.history||[]).slice(0,5)} />
          </section>
        </>}

        {tab==="attention" && <>
          <p className="cu-help">Issues are grouped by source file. You can request corrections, add notes or hide an item. Actual plan-ID and mapping corrections require Client Admin review.</p>
          {issues.map(i=><section id={"cu-attention-"+i.id} className={"cu-card cu-issue"+(i.kind==="error"?" cu-stopped":"")} key={i.id}>
            <div className="cu-section-title"><h2>{i.kind==="error"?"1 file could not be read":i.count+" claims are held"}</h2>
              <span className="cu-status">{i.kind==="error"?"Stopped":"Waiting on you"}</span></div>
            <p className="cu-muted">{i.filename} · {i.days===0?"Received today":i.days+" days waiting"}</p>
            <div className="cu-explanation"><b>What this means</b><p>{i.reason}</p></div>
            {(() => {
              const related = actions.filter(a => String(a.file_id) === String(i.id) &&
                (a.kind === "NOTE" || a.kind.startsWith("REQUEST_")));
              return <section className="cu-file-activity" aria-label="Notes and requests">
                <div className="cu-section-title"><h3>Notes and requests</h3>
                  <span>{related.length ? related.length + " recorded" : "No notes yet"}</span></div>
                {related.slice(0, 8).map(a => <div className="cu-file-activity-row" key={a.id}>
                  <span className="cu-activity-date">{timestamp(a.at)}</span>
                  <div><strong>{a.kind === "NOTE" ? "Note" : a.label}</strong>
                    <span className="cu-activity-author"> · {a.by}</span>
                    {a.message && <p>{a.message}</p>}</div>
                  <span className="cu-activity-status">{a.status}</span>
                </div>)}
              </section>;
            })()}
            {i.kind === "hold" && expandedFile === i.id && <section className="cu-held-panel">
              <div className="cu-section-title"><h3>Held claims in {i.filename}</h3>
                <span>{expandedClaims?.held_total ?? i.count} recorded holds</span></div>
              {expandedLoading && <p>Loading held claims…</p>}
              {expandedError && <p className="cu-error" role="alert">{expandedError}</p>}
              <div className="cu-table-scroll"><table className="cu-table">
                <thead><tr><th>Claim</th><th>Internal</th><th>Billed</th><th>Paid</th><th>Hold reason</th><th>Details</th></tr></thead>
                <tbody>{(expandedClaims?.claims || []).map((claim, index) =>
                  <tr key={claim.id || ("finding-" + index)}>
                    <td>{safe(claim.number)}</td><td>{safe(claim.internal_number)}</td>
                    <td>{cash(claim.billed)}</td><td>{cash(claim.paid)}</td>
                    <td>{claim.reason || "Review needed"}</td>
                    <td>{claim.id ?
                      <button className="cu-link" onClick={() => showClaim(claim.id)}>Open claim</button> :
                      <span className="cu-muted">Source finding only</span>}</td>
                  </tr>)}
                  {!expandedLoading && !(expandedClaims?.claims || []).length &&
                    <tr><td colSpan="6">No matched held claims found in the stored 835.</td></tr>}
                </tbody>
              </table></div>
              <div className="cu-history-pagination" aria-label="Held claims pages">
                <span>Page {expandedClaims?.page || expandedPage} of {expandedClaims?.pages || 1}</span>
                <button type="button" className="cu-btn"
                  disabled={expandedLoading || expandedPage <= 1}
                  onClick={() => setExpandedPage(page => Math.max(1, page - 1))}>Previous</button>
                <button type="button" className="cu-btn"
                  disabled={expandedLoading || expandedPage >= (expandedClaims?.pages || 1)}
                  onClick={() => setExpandedPage(page => page + 1)}>Next</button>
              </div>
            </section>}
            <h3>What you can do</h3>
            <div className="cu-actions">
              {i.kind==="hold" && <>
                <button className="cu-btn cu-primary" onClick={()=>choose(isPlanIssue(i)?"REQUEST_PLAN_ID":isDictionaryIssue(i)?"REQUEST_DICTIONARY":"REQUEST_RELEASE",i.id,null,
                  isPlanIssue(i)?"Request plan ID from member record":isDictionaryIssue(i)?"Request dictionary entry":"Request claim review")}>
                  {isPlanIssue(i)?"Request plan ID correction":isDictionaryIssue(i)?"Request dictionary correction":"Request review / release"}
                </button>
                <button className="cu-btn" onClick={() => toggleHeldFile(i.id)}
                  aria-expanded={expandedFile === i.id}>
                  {expandedFile === i.id ? "Hide held claims" : "See held claims"}</button>
              </>}
              <button className="cu-btn" onClick={()=>choose("REQUEST_RESEND",i.id,null,"Ask claims system to resend")}>
                Ask claims system to resend</button>
              <button className="cu-btn cu-subtle" onClick={()=>choose("NOTE",i.id,null,"Add a note")}>Add note</button>
              <button className="cu-btn cu-subtle" onClick={()=>choose("IGNORE_FILE",i.id,null,"Hide this issue")}>Ignore this file</button>
            </div>
          </section>)}
          {!issues.length && <section className="cu-card">No issues are waiting for a decision.</section>}
          {Object.keys(reasonGroup).length>0 && <p className="cu-help">Recorded issue categories: {Object.values(reasonGroup).length}. A recorded request does not transmit a file or change a payer response.</p>}
        </>}

        {tab==="convert" && <div className="cu-conversions-workspace">
          <ConversionsView
            trackedFiles={conversionFiles}
            onRefreshData={async () => { await refreshConversionFiles(); reload(); }}
            onOpenFileModal={id => setFileViewerId(id)}
            isClientUser
            activeClientId={user.client_id || ""}
          />
        </div>}

        {tab==="history" && <section className="cu-card">
          <div className="cu-section-title"><h2>File history</h2><span>Paginated MIR outputs · {dashboard?.client}</span></div>
          {historyLoading && <p>Loading conversion history…</p>}
          <History rows={historyResult?.files||dashboard?.history||[]} />
          <div className="cu-history-pagination">
            <span>Page {historyResult?.page||1} of {historyResult?.pages||1} · {historyResult?.count||0} files</span>
            <button type="button" className="cu-btn" disabled={historyPage<=1||historyLoading}
              onClick={()=>setHistoryPage(v=>Math.max(1,v-1))}>Previous</button>
            <button type="button" className="cu-btn" disabled={historyLoading||historyPage>=(historyResult?.pages||1)}
              onClick={()=>setHistoryPage(v=>v+1)}>Next</button>
          </div>
          <h3>Recent client review activity</h3>
          <Activity rows={actions} />
          {!!(dashboard?.ignored_files || []).length && <section className="cu-explanation">
            <h3>Ignored file issues</h3>
            {(dashboard?.issues || []).filter(i => (dashboard?.ignored_files || []).includes(i.id)).map(i =>
              <div className="cu-issue-mini" key={i.id}><span>{i.filename} · {i.reason}</span>
                <button className="cu-btn" onClick={() => choose("REOPEN_FILE", i.id, null, "Restore issue to Needs Attention")}>Restore</button>
              </div>)}
          </section>}
        </section>}

        {tab==="claim" && detail && <>
          <div className="cu-chip">{detail.reason?"Waiting "+detail.days+" days":"Payer response available"}</div>
          <p className="cu-muted">Received {timestamp(detail.received_at)} in {detail.file_name}
            {detail.payer?" · Payer: "+detail.payer:""} {detail.patient_name?" · Patient: "+safe(detail.patient_name):""}</p>
          <section className="cu-card cu-timeline">
            {timeline.map((t,i)=><div className="cu-step" key={i}>
              <span className={"cu-dot "+(t.complete?"complete":"pending")}></span>
              <div><strong>{t.label}</strong><small>{t.at&&t.at.includes("T")?timestamp(t.at):t.at||"Not recorded"}</small></div>
            </div>)}
          </section>
          <section className="cu-card">
            <h2>What the payer said</h2>
            <div className="cu-amounts">
              {[
                ["Billed",cash(detail.billed),"normal"],
                ["After contract write-offs",cash(detail.allowed),"normal"],
                ["Paid",cash(detail.paid),"good"],
                ["Patient owes",cash(detail.patient_owes),"warn"],
              ].map(([label,value,tone])=><div className={"cu-amount "+tone} key={label}>
                <span className="eyebrow">{label}</span><strong>{value}</strong></div>)}
            </div>
            <div className="cu-explanation"><b>{detail.payer_status}.</b> The 835 reports {cash(detail.paid)} paid against {cash(detail.billed)} billed.
              {detail.allowed!==null?" Contractual adjustments reduce billed charges to "+cash(detail.allowed)+".":""}
              {" "}Patient responsibility is {cash(detail.patient_owes)}.
              {detail.check_number?" Payment reference "+safe(detail.check_number)+".":""}</div>
            <h3>Service lines</h3><div className="cu-table-scroll"><table className="cu-table"><thead><tr>
              <th>Procedure</th><th>Billed</th><th>After CO adjustments</th><th>Paid</th><th>Units / date</th><th>Payer adjustments</th></tr></thead>
              <tbody>{(detail.services||[]).map((svc,i)=><tr key={i}>
                <td><strong>{safe(svc.code)}</strong></td><td>{cash(svc.billed)}</td><td>{cash(svc.allowed)}</td><td>{cash(svc.paid)}</td><td>{svc.units||"—"} {svc.date||""}</td>
                <td>{(svc.adjustments||[]).map((a,j)=><div key={j}>{cash(a.amount)} — {adjustmentMeaning(a.group,a.code)} ({a.group}-{a.code})</div>)}</td>
              </tr>)}
              {!detail.services?.length&&<tr><td colSpan="6">No service lines recorded in this 835 claim.</td></tr>}
              </tbody></table></div>
            <p className="cu-help">Amounts after contractual adjustments are calculated from recorded CAS CO adjustments, not an explicit payer allowed field.</p>
            {!!detail.adjustments?.length && <details><summary>All payer adjustment codes ({detail.adjustments.length})</summary>
              <div className="cu-table-scroll"><table className="cu-table"><thead><tr><th>Group</th><th>Code</th><th>Amount</th></tr></thead>
                <tbody>{detail.adjustments.map((a,i)=><tr key={i}><td>{a.group}</td><td>{a.code} · {adjustmentMeaning(a.group,a.code)}</td><td>{cash(a.amount)}</td></tr>)}</tbody></table></div></details>}
          </section>
          {detail.reason && <section className="cu-card cu-issue">
            <h2>Why it is waiting on you</h2><p>{detail.reason}</p>
            <section className="cu-file-activity" aria-label="Existing claim notes">
              <h3>Notes and requests</h3>
              {actions.filter(a => a.claim_id === detail.id).map(a => (
                <div className="cu-file-activity-row" key={a.id}>
                  <span className="cu-activity-date">{timestamp(a.at)}</span>
                  <div><strong>{a.label}</strong> · {a.by}{a.message && <p>{a.message}</p>}</div>
                  <span className="cu-activity-status">{a.status}</span>
                </div>
              ))}
              {!actions.some(a => a.claim_id === detail.id) && <p className="cu-help">No notes on this claim yet.</p>}
            </section>
            <div className="cu-actions">
              <button className="cu-btn cu-primary" onClick={()=>choose(isDictionaryIssue({reason:detail.reason})?"REQUEST_DICTIONARY":isPlanIssue({reason:detail.reason})?"REQUEST_PLAN_ID":"REQUEST_RELEASE",
                detail.file_id,detail.id,"Request correction / release")}>Request correction / release</button>
              <button className="cu-btn" onClick={()=>choose("REQUEST_RESEND",detail.file_id,detail.id,"Request a corrected resend")}>Request resend</button>
              <button className="cu-btn cu-subtle" onClick={()=>choose("NOTE",detail.file_id,detail.id,"Add a claim note")}>Add a note</button>
            </div>
          </section>}
          <section className="cu-card">
            <h2>History on this claim</h2>
            {(detail.timeline||[]).map((event,i)=><p className="cu-event" key={i}><time>{timestamp(event.at)}</time>{event.label}</p>)}
            {actions.filter(a => a.claim_id===detail.id).map(a=><p className="cu-event" key={a.id}><time>{timestamp(a.at)}</time>{a.label}: {a.message||a.status}</p>)}
          </section>
          <div className="cu-tech"><button className="cu-link" onClick={()=>setShowSegments(v=>!v)}>{showSegments?"Hide":"View"} 835 segments for this claim</button>
            {showSegments&&<pre>{encodeDemoFileContent((detail.technical_segments||[]).join("~\n"),"835",true)}</pre>}</div>
        </>}

        {decision && <div className="cu-backdrop" onMouseDown={()=>setDecision(null)}>
          <section className="cu-dialog cu-card" role="dialog" aria-modal="true" aria-label={decision.title} onMouseDown={e=>e.stopPropagation()}>
            <div className="cu-section-title"><h2>{decision.title}</h2>
              <button aria-label="Close" className="cu-link" onClick={()=>setDecision(null)}>✕</button></div>
            <p>{decision.kind==="IGNORE_FILE"?"This removes the issue from your client's active attention list, but keeps the underlying file and audit record.":
              decision.kind==="NOTE"?"This note will be visible to your Client Admin.":
              "A review request will be saved for Client Admin action. FileX will not automatically correct the 835 or resend the source."}</p>
            <section className="cu-dialog-note-history" aria-label="Earlier notes and requests">
              <h3>Previous notes and requests</h3>
              {actions.filter(a => String(a.file_id) === String(decision.file_id) &&
                (decision.claim_id ? a.claim_id === decision.claim_id : !a.claim_id) &&
                (a.kind === "NOTE" || a.kind.startsWith("REQUEST_"))).map(a => (
                <div className="cu-file-activity-row" key={a.id}>
                  <span className="cu-activity-date">{timestamp(a.at)}</span>
                  <div><strong>{a.label}</strong><span className="cu-activity-author"> · {a.by}</span>
                    {a.message && <p>{a.message}</p>}</div>
                  <span className="cu-activity-status">{a.status}</span>
                </div>
              ))}
              {!actions.some(a => String(a.file_id) === String(decision.file_id) &&
                (decision.claim_id ? a.claim_id === decision.claim_id : !a.claim_id) &&
                (a.kind === "NOTE" || a.kind.startsWith("REQUEST_"))) &&
                <p className="cu-help">No previous notes for this {decision.claim_id ? "claim" : "file"}.</p>}
            </section>
            <label>Notes {decision.kind==="NOTE"?"(required)":"(optional)"}
              <textarea rows="4" maxLength="2000" value={note} onChange={e=>setNote(e.target.value)} placeholder="Explain the correction or action required…" />
            </label>
            <div className="cu-actions"><button className="cu-btn cu-primary" onClick={sendDecision}
              disabled={sending||(decision.kind==="NOTE"&&!note.trim())}>{sending?"Saving…":"Save decision"}</button>
              <button className="cu-btn" onClick={()=>setDecision(null)}>Cancel</button></div>
          </section>
        </div>}
      </main>
    </div>
    {fileViewerId && <FileViewerModal fileId={fileViewerId} onClose={() => setFileViewerId(null)} />}
  </>;
}

function History({rows}) {
  return <div className="cu-table-scroll"><table className="cu-table"><thead><tr>
    <th>Date</th><th>835 source</th><th>MIR file</th><th>Claims</th><th>Result</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.id}><td>{timestamp(r.date)}</td>
      <td>{filenameText(r.source_filename)}</td><td>{filenameText(r.filename)}</td><td>{r.count}</td>
      <td><span className={"cu-tag "+(r.status==="PUSHED"?"ok":"work")}>{r.status==="PUSHED"?"Sent to MPL":r.status==="PUSH_FAILED"?"Delivery failed":"Converted; pending delivery"}</span></td>
    </tr>)}{!rows.length&&<tr><td colSpan="5">No conversions recorded for this client.</td></tr>}</tbody>
  </table></div>;
}
function Activity({rows}) {
  return <div className="cu-table-scroll"><table className="cu-table"><thead><tr>
    <th>Date</th><th>File</th><th>Action</th><th>By</th><th>Status</th></tr></thead><tbody>
    {rows.map(a=><tr key={a.id}><td>{timestamp(a.at)}</td><td>{safe(a.file_name)}</td>
      <td>{a.label}{a.message?" · "+a.message:""}</td><td>{a.by}</td><td>{a.status}</td></tr>)}
    {!rows.length&&<tr><td colSpan="5">No review actions yet.</td></tr>}</tbody></table></div>;
}
