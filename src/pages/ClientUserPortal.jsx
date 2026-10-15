import React, { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import ClientClaimTable, { PortalPagination } from "../components/ClientClaimTable";
import ClientClaimComparison from "../components/ClientClaimComparison";
import ClientFinancialAmounts from "../components/ClientFinancialAmounts";
import SecurityView from "./SecurityView";
import ConversionsView from "./ConversionsView";
import FileViewerModal from "../components/FileViewerModal";
import { encodeDemoValue, encodeDemoFileContent } from "../utils/demoEncoder";
import "./ClientUserPortal.css";

const cash = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? "—" :
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
const safe = v => v == null || v === "" ? "—" : encodeDemoValue(String(v), true);
const timestamp = v => v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
const filenameText = value => value == null || value === "" ? "—" : String(value);
const navigation = [["home","Home"],["convert","Conversions"],["attention","Needs attention"],["history","History"]];
const PERIODS = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["all", "All"], ["custom", "Custom"]];
const displayPeriodDate = value => {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};
async function jsonFetch(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error || "Unable to complete request");
  return body;
}
const baseUrl = "/edi835/api/client-portal/";
const linkedAction = action => ({ ...action, claim_id: action.record_id ?? action.claim_id });
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
  const [periodMode, setPeriodMode] = useState("daily");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const periodQuery = useMemo(() => {
    if (periodMode === "custom" && (!customFrom || !customTo || customFrom > customTo)) return null;
    const params = new URLSearchParams({ period: periodMode });
    if (periodMode === "custom") {
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    return params.toString();
  }, [periodMode, customFrom, customTo]);
  const selectPeriod = mode => {
    setPeriodMode(mode);
    setComparisonMoney(null);
    setHomePage(1);
    setAttentionPage(1);
    setHistoryPage(1);
    setAttentionFile("");
    setSelectedFile("");
  };
  const [dashboard, setDashboard] = useState(null);
  const [actions, setActions] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("All");
  const [comparisonMoney, setComparisonMoney] = useState(null);
  const [homePage, setHomePage] = useState(1);
  const [selectedFile, setSelectedFile] = useState("");
  const [detail, setDetail] = useState(null);
  const [claimReturnTab, setClaimReturnTab] = useState("home");
  const [detailLoading, setDetailLoading] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
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
  const [attentionPage, setAttentionPage] = useState(1);
  const [attentionPageSize, setAttentionPageSize] = useState(10);
  const [attentionFile, setAttentionFile] = useState("");
  const [attentionResult, setAttentionResult] = useState(null);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionError, setAttentionError] = useState("");
  const [claimActivity, setClaimActivity] = useState(null);
  const [claimActivityPage, setClaimActivityPage] = useState(1);
  const [claimActivityLoading, setClaimActivityLoading] = useState(false);
  const [claimActivityError, setClaimActivityError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [historySection, setHistorySection] = useState("files");
  const [historyResult, setHistoryResult] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const reload = useCallback(() => setRefresh(v => v + 1), []);
  useEffect(() => {
    if (!periodQuery) {
      setDashboard(null);
      setActions([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setDashboard(null);
    Promise.all([
      jsonFetch(baseUrl + "overview/?" + periodQuery, { signal: controller.signal }),
      jsonFetch(baseUrl + "actions/?" + periodQuery, { signal: controller.signal }),
    ]).then(([d,a]) => {
      if (controller.signal.aborted) return;
      setDashboard(d);
      setActions((a.actions || []).map(linkedAction));
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [periodQuery, refresh]);

  useEffect(() => {
    if (tab !== "history" || historySection !== "files" || !periodQuery) return undefined;
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryResult(null);
    jsonFetch(baseUrl + "history/?" + periodQuery + "&page=" + historyPage + "&page_size=" + historyPageSize, { signal: controller.signal })
      .then(setHistoryResult)
      .catch(e => { if (e.name !== "AbortError") setHistoryError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [tab, historySection, historyPage, historyPageSize, periodQuery, refresh]);

  useEffect(() => {
    if (tab !== "attention" || !periodQuery) return undefined;
    const controller = new AbortController();
    setAttentionLoading(true);
    setAttentionError("");
    setAttentionResult(null);
    jsonFetch(baseUrl + "attention/?" + periodQuery + "&page=" + attentionPage + "&page_size=" + attentionPageSize +
      "&payer_status=" + encodeURIComponent(({ All: "all", Denied: "denied", "Less paid": "less", "Paid in full": "paid" })[filter] || "all") +
      (attentionFile ? "&file_id=" + encodeURIComponent(attentionFile) : ""), { signal: controller.signal })
      .then(setAttentionResult)
      .catch(e => { if (e.name !== "AbortError") setAttentionError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setAttentionLoading(false); });
    return () => controller.abort();
  }, [attentionFile, attentionPage, attentionPageSize, periodQuery, filter, refresh, tab]);

  useEffect(() => {
    if (tab !== "claim" || !detail?.id) return undefined;
    const controller = new AbortController();
    setClaimActivityLoading(true);
    setClaimActivityError("");
    setClaimActivity(null);
    jsonFetch(baseUrl + "actions/?claim_id=" + detail.id + "&page=" + claimActivityPage,
      { signal: controller.signal })
      .then(data => setClaimActivity({ ...data, actions: (data.actions || []).map(linkedAction) }))
      .catch(e => { if (e.name !== "AbortError") setClaimActivityError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setClaimActivityLoading(false); });
    return () => controller.abort();
  }, [tab, detail?.id, claimActivityPage, refresh]);

  const openAttentionIssue = issue => {
    setTab("attention");
    setAttentionFile(issue.kind === "hold" ? issue.id : "");
    setAttentionPage(1);
    setDrawer(false);
  };

  const go = next => {
    if (next === "history") { setHistoryPage(1); setHistorySection("files"); }
    if (next === "attention" && tab !== "claim") { setAttentionPage(1); setAttentionFile(""); }
    setTab(next);
    setDetail(null);
    setDecision(null);
    setError("");
    setDrawer(false);
    setNotice("");
    setSelectedFile("");
  };
  const showClaim = async id => {
    if (detailLoading) return;
    setClaimActivityPage(1);
    setClaimActivity(null);
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
  const openClaimRow = claim => {
    if (claim.id != null) { showClaim(claim.id); return; }
    setClaimReturnTab("attention");
    setClaimActivity(null);
    setDetail({ ...claim, sourceOnly: true });
    setTab("claim");
  };
  const choose = (kind, file_id, claim_id, title) => {
    if ((kind === "NOTE" || kind.startsWith("REQUEST_")) && claim_id == null) return;
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
      setClaimActivityPage(1);
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
  const displayedIssues = filter === "All" ? issues :
    issues.filter(issue => visible.some(claim => claim.file_id === issue.id));
  const activePeriod = dashboard?.period;
  const periodLabel = activePeriod
    ? activePeriod.from
      ? activePeriod.from === activePeriod.to
        ? displayPeriodDate(activePeriod.from)
        : displayPeriodDate(activePeriod.from) + " – " + displayPeriodDate(activePeriod.to)
      : "Entire available history"
    : periodMode === "custom" ? "Choose From and To dates" : "Loading selected period…";
  const homePages = Math.max(1, Math.ceil(visible.length / 10));
  const currentHomePage = Math.min(homePage, homePages);
  const age = [["Today",0],["1 day",1],["2 days",2],["3+ days",3]].map(([name,v]) =>
    [name, visible.filter(c => v === 3 ? c.days >= 3 : c.days === v).length]);
  const maxAge = Math.max(1, ...age.map(x => x[1]));
  const detailActions = claimActivity?.actions || [];

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
            className={"cu-navitem" + ((tab === key || (key === claimReturnTab && tab === "claim")) ? " on" : "")}
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
      <main className={"cu-main" + (tab === "convert" ? "" : " cu-compact")}>
        {tab !== "home" && <button type="button" className="cu-back-link"
          onClick={() => go(tab === "claim" ? claimReturnTab : "home")}>
          ← Back to {tab === "claim" && claimReturnTab === "attention" ? "Needs Attention" : "Home"}
        </button>}
        {tab !== "convert" && <header className="cu-heading">
          <div className="cu-heading-copy">
            <span className="eyebrow">{dashboard?.client || user.client} · {periodMode.toUpperCase()}</span>
            <h1>{tab === "home" ? "Claims overview" : tab === "attention" ?
              "Needs attention" : tab === "history" ?
              "History" : tab === "convert" ? "Convert an 835 file" : tab === "settings" ? "Account settings" :
              "Claim " + safe(detail?.number)}</h1>
            <p>{tab === "home" ?
              "Your client claims, payments and exceptions in one place." :
              tab === "attention" ? "Review each held claim and track its notes and requests." :
              tab === "history" ? "Conversions, review activity and previously ignored file issues." :
              tab === "convert" ? "Upload a validated 835 for conversion and optional outbound delivery." : tab === "settings" ? "Manage your FileX security keys." :
              detail?.file_name || ""}</p>
          </div>
          {tab === "home" && <div className="cu-controls">
            <button type="button" className="cu-btn" onClick={reload} disabled={!periodQuery}>Refresh</button>
            <button type="button" className="cu-btn cu-primary" onClick={() => go("convert")}>Convert a file</button>
          </div>}
        </header>}
        {["home", "attention", "history"].includes(tab) && <section className="cu-period-toolbar" aria-label="Client activity date filters">
          <div className="cu-period-main">
            <div className="cu-period-options" role="group" aria-label="Activity period">
              {PERIODS.map(([key, label]) => <button type="button" key={key}
                className={periodMode === key ? "active" : ""}
                aria-pressed={periodMode === key} onClick={() => selectPeriod(key)}>{label}</button>)}
            </div>
            {periodMode === "custom" && <div className="cu-period-custom">
              <label>From <input aria-label="Custom start date" type="date" value={customFrom}
                max={customTo || undefined} onChange={event => {
                  setCustomFrom(event.target.value); setComparisonMoney(null); setHomePage(1); setAttentionPage(1); setHistoryPage(1);
                }}/></label>
              <label>To <input aria-label="Custom end date" type="date" value={customTo}
                min={customFrom || undefined} onChange={event => {
                  setCustomTo(event.target.value); setComparisonMoney(null); setHomePage(1); setAttentionPage(1); setHistoryPage(1);
                }}/></label>
            </div>}
            <span className="cu-period-caption" role="status">{periodLabel}
              {activePeriod?.timezone && <small> · {activePeriod.timezone}</small>}</span>
          </div>
          <button type="button" className={"cu-btn cu-attention-action" + (tab === "attention" ? " selected" : "")}
            disabled={!periodQuery} onClick={() => go("attention")}>
            Needs Attention <span aria-hidden="true">↓</span>
            <small>Longest waiting first</small>
          </button>
        </section>}
        {periodMode === "custom" && !periodQuery &&
          <p className="cu-period-hint" role="status">{customFrom && customTo && customFrom > customTo
            ? "From must be on or before To."
            : "Select both From and To dates to see activity for that inclusive range."}</p>}
        {error && <div className="cu-error" role="alert">{error}</div>}
        {notice && <div className="cu-success" role="status">{notice}</div>}
        {loading && <p>Loading current client records…</p>}
        {detailLoading && <p>Opening claim…</p>}

        {tab === "home" && periodQuery && <>
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
          <ClientFinancialAmounts
            metrics={filter === "All" ? metrics : (comparisonMoney || {})}
            loading={loading || (filter !== "All" && !comparisonMoney)}
          />
          <div className="cu-comparison-category">
            <span>Payer category</span>
            <div className="cu-filters">{["All","Denied","Less paid","Paid in full"].map(x =>
              <button key={x} type="button" aria-pressed={filter === x}
                className={filter===x?"active":""}
                onClick={() => { setFilter(x); setComparisonMoney(null); setHomePage(1); }}>
                {x}</button>)}</div>
          </div>
          <ClientClaimComparison
            periodQuery={periodQuery}
            payerFilter={filter}
            refresh={refresh}
            onFinancialTotals={setComparisonMoney}
            onOpen={showClaim}
          />
          <section className="cu-card">
            <div className="cu-section-title"><h2>Claims waiting on you, by days waiting</h2>
              <span>{filter === "All" ? (metrics.waiting_claims||0) : visible.length} {filter === "All" ? "held claims" : "matching held claims"}</span></div>
            {age.map(([label,count],idx) => <div className="cu-aging-row" key={label}>
              <span className={idx===3?"cu-old":""}>{label}</span>
              <div className="cu-track"><i className={idx===3?"cu-old-bar":""} style={{width: (count/maxAge*100)+"%"}} /></div>
              <b>{count} claims</b></div>)}
            <p className="cu-help">{visible.length} individually matched claims.  <button type="button" className="cu-link" onClick={() => go("attention")}>View all claims needing attention</button></p>

            {selectedFile && <p className="cu-help">Filtered to a source file. <button className="cu-link" onClick={() => setSelectedFile("")}>Show all</button></p>}
            <ClientClaimTable rows={visible.slice((currentHomePage - 1) * 10, currentHomePage * 10)} recentActions={actions} onOpen={openClaimRow} loading={loading} />
            <PortalPagination result={{ page: currentHomePage, pages: homePages, count: visible.length }}
              page={currentHomePage} onPage={setHomePage} loading={loading} label="Overview claim pages" />
            {dashboard?.claims_limited && <p className="cu-help">Showing the first 200 matched claims.</p>}
          </section>
          <section className="cu-card cu-notice">
            <div className="cu-section-title"><h2>Source files needing attention ({displayedIssues.length})</h2>
              <button className="cu-link" onClick={()=>go("attention")}>See all</button></div>
            {displayedIssues.slice(0,3).map(i => <div className="cu-issue-mini" key={i.id}>
              <div><b>{i.kind==="error"?"File could not be processed":i.count+" claims held"} · {i.filename}</b>
                <small>{i.reason}</small></div>
              <button className="cu-btn" onClick={()=>openAttentionIssue(i)}>Review</button></div>)}
            {!displayedIssues.length && <p>No source files match the selected payer category in this period.</p>}
          </section>
          <section className="cu-card">
            <div className="cu-section-title"><h2>Recent conversions</h2><button className="cu-link" onClick={()=>go("history")}>Full history</button></div>
            <History rows={(dashboard?.history||[]).slice(0,5)} />
          </section>
        </>}

        {tab === "attention" && periodQuery && <section className="cu-card">
          <div className="cu-section-title"><h2>Claims needing attention · longest waiting first</h2>
            <span>{attentionResult?.count ?? "—"} records</span></div>
          <p className="cu-help">Claims from 835 files received in the selected period, sorted by days waiting (highest first).
            {filter !== "All" && <> Payer category: <strong>{filter}</strong>.
              <button className="cu-link" type="button" onClick={() => { setFilter("All"); setComparisonMoney(null); setAttentionPage(1); }}>Clear category</button></>}
            {" "}Select a row to review its notes and requests.</p>
          {attentionFile && <p className="cu-help">Filtered to one source file. <button type="button" className="cu-link"
            onClick={() => { setAttentionFile(""); setAttentionPage(1); }}>Show all claims</button></p>}
          {attentionError && <p className="cu-error" role="alert">{attentionError} <button type="button" className="cu-link" onClick={reload}>Retry</button></p>}
          {!attentionError && <ClientClaimTable rows={attentionResult?.claims || []} recentActions={actions}
            onOpen={openClaimRow} showSource loading={attentionLoading} />}
          <PortalPagination result={attentionResult} page={attentionPage} onPage={setAttentionPage}
            loading={attentionLoading} label="Attention pages" pageSize={attentionPageSize}
            onPageSize={size => { setAttentionPageSize(size); setAttentionPage(1); }} />
          {!!attentionResult?.unmatched_count && <p className="cu-help">{attentionResult.unmatched_count} source findings are not linked to a stored claim yet. Their details are available; claim actions require a matched claim record.</p>}
          {issues.some(issue => issue.kind === "error") && <details className="cu-file-errors">
            <summary>Files that could not be read</summary>
            <p className="cu-help">These files have no claim rows to review. A Client Admin must correct the source file.</p>
            {issues.filter(issue => issue.kind === "error").map(issue => <p key={issue.id}>{issue.filename} — {issue.reason}</p>)}
          </details>}
        </section>}

        {tab==="convert" && <div className="cu-conversions-workspace">
          <ConversionsView
            trackedFiles={conversionFiles}
            onRefreshData={async () => { await refreshConversionFiles(); reload(); }}
            onOpenFileModal={id => setFileViewerId(id)}
            isClientUser
            activeClientId={user.client_id || ""}
          />
        </div>}

        {tab === "settings" && <div className="cu-security-workspace"><SecurityView embedded /></div>}

        {tab === "history" && periodQuery && <section className="cu-card">
          <div className="cu-history-tabs" role="tablist" aria-label="History sections">
            {[["files", "File history"], ["activity", "Review activity"], ["ignored", "Ignored file issues"]].map(([key, label]) =>
              <button type="button" key={key} role="tab" id={"history-tab-" + key}
                aria-selected={historySection === key} aria-controls={"history-panel-" + key}
                tabIndex={historySection === key ? 0 : -1}
                onKeyDown={event => {
                  const keys = ["files", "activity", "ignored"];
                  const index = keys.indexOf(key);
                  const next = event.key === "ArrowRight" ? keys[(index + 1) % 3] :
                    event.key === "ArrowLeft" ? keys[(index + 2) % 3] :
                    event.key === "Home" ? keys[0] : event.key === "End" ? keys[2] : null;
                  if (next) { event.preventDefault(); setHistorySection(next); document.getElementById("history-tab-" + next)?.focus(); }
                }} onClick={() => setHistorySection(key)}>{label}</button>)}
          </div>
          <div role="tabpanel" id={"history-panel-" + historySection} aria-labelledby={"history-tab-" + historySection} tabIndex={0}>
            {historySection === "files" && <>
              <h2>File history</h2>
              {historyError && <p className="cu-error" role="alert">{historyError} <button type="button" className="cu-link" onClick={reload}>Retry</button></p>}
              {historyLoading ? <p role="status">Loading conversion history…</p> : !historyError && <History rows={historyResult?.files || []} />}
              <PortalPagination result={historyResult} page={historyPage} onPage={setHistoryPage}
                loading={historyLoading} label="File history pages" pageSize={historyPageSize}
                onPageSize={size => { setHistoryPageSize(size); setHistoryPage(1); }} />
            </>}
            {historySection === "activity" && <>
              <h2>Recent review activity</h2><p className="cu-help">Latest 200 actions recorded in the selected period. Each claim retains its complete note history on its detail screen.</p>
              <Activity rows={actions} />
            </>}
            {historySection === "ignored" && <>
              <h2>Ignored file issues</h2>
              <p className="cu-help">Previous file-level decisions are preserved here. Held claims remain available individually in Needs Attention.</p>
              {(dashboard?.issues || []).filter(i => (dashboard?.ignored_files || []).includes(i.id)).map(i =>
                <div className="cu-issue-mini" key={i.id}><span>{i.filename} · {i.reason}</span>
                  <span className="cu-muted">Legacy file-level decision</span>
                </div>)}
              {!(dashboard?.ignored_files || []).length && <p className="cu-help">No ignored file issues.</p>}
            </>}
          </div>
        </section>}

        {tab === "claim" && detail?.sourceOnly && <section className="cu-card">
          <h2>Source claim finding</h2><p>{detail.reason}</p><p className="cu-muted">{detail.file_name}</p>
          <p className="cu-help">This finding is not linked to a stored claim. Ask your Client Admin to reconcile the source before adding claim-specific notes or requests.</p>
        </section>}
        {tab==="claim" && detail && !detail.sourceOnly && <>
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
                ["Patient owes",cash(detail.responsibility_amount ?? detail.patient_owes),"warn"],
              ].map(([label,value,tone])=><div className={"cu-amount cu-amount-"+tone} key={label}>
                <span className="eyebrow">{label}</span><strong>{value}</strong></div>)}
            </div>
            <div className="cu-explanation"><b>{detail.payer_status}.</b> The 835 reports {cash(detail.paid)} paid against {cash(detail.billed)} billed.
              {detail.allowed!==null?" Contractual adjustments reduce billed charges to "+cash(detail.allowed)+".":""}
              {" "}Patient responsibility is {cash(detail.responsibility_amount ?? detail.patient_owes)}.
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
              <h3>Notes and requests for this claim</h3>
              {claimActivityLoading && <p role="status">Loading claim activity…</p>}
              {claimActivityError && <p className="cu-error" role="alert">{claimActivityError}</p>}
              {detailActions.map(a => (
                <div className="cu-file-activity-row" key={a.id}>
                  <span className="cu-activity-date">{timestamp(a.at)}</span>
                  <div><strong>{a.label}</strong> · {a.by}{a.message && <p>{a.message}</p>}</div>
                  <span className="cu-activity-status">{a.status}</span>
                </div>
              ))}
              {!claimActivityLoading && !claimActivityError && !detailActions.length && <p className="cu-help">No notes on this claim yet.</p>}
              <PortalPagination result={claimActivity} page={claimActivityPage} onPage={setClaimActivityPage}
                loading={claimActivityLoading} label="Claim activity pages" />
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
          </section>
          <div className="cu-tech"><button className="cu-link" onClick={()=>setShowSegments(v=>!v)}>{showSegments?"Hide":"View"} 835 segments for this claim</button>
            {showSegments&&<pre>{encodeDemoFileContent((detail.technical_segments||[]).join("~\n"),"835",true)}</pre>}</div>
        </>}

        {decision && <div className="cu-backdrop" onMouseDown={()=>setDecision(null)}>
          <section className="cu-dialog cu-card" role="dialog" aria-modal="true" aria-label={decision.title} onMouseDown={e=>e.stopPropagation()}>
            <div className="cu-section-title"><h2>{decision.title}</h2>
              <button aria-label="Close" className="cu-link" onClick={()=>setDecision(null)}>✕</button></div>
            <p className="cu-muted">Claim {safe(detail?.number)}</p>
            <p>{decision.kind==="IGNORE_FILE"?"This removes the issue from your client's active attention list, but keeps the underlying file and audit record.":
              decision.kind==="NOTE"?"This note will be visible to your Client Admin.":
              "A review request will be saved for Client Admin action. FileX will not automatically correct the 835 or resend the source."}</p>
            <section className="cu-dialog-note-history" aria-label="Earlier notes and requests">
              <h3>Previous notes and requests</h3>
              {detailActions.filter(a => String(a.file_id) === String(decision.file_id) &&
                (decision.claim_id ? a.claim_id === decision.claim_id : !a.claim_id) &&
                (a.kind === "NOTE" || a.kind.startsWith("REQUEST_"))).map(a => (
                <div className="cu-file-activity-row" key={a.id}>
                  <span className="cu-activity-date">{timestamp(a.at)}</span>
                  <div><strong>{a.label}</strong><span className="cu-activity-author"> · {a.by}</span>
                    {a.message && <p>{a.message}</p>}</div>
                  <span className="cu-activity-status">{a.status}</span>
                </div>
              ))}
              {!detailActions.some(a => String(a.file_id) === String(decision.file_id) &&
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
    <th>Date</th><th>Scope</th><th>File</th><th>Action</th><th>By</th><th>Status</th></tr></thead><tbody>
    {rows.map(a=><tr key={a.id}><td>{timestamp(a.at)}</td><td>{a.claim_id ? "Claim #" + a.claim_id : "File-wide (legacy)"}</td><td>{filenameText(a.file_name)}</td>
      <td>{a.label}{a.message?" · "+a.message:""}</td><td>{a.by}</td><td>{a.status}</td></tr>)}
    {!rows.length&&<tr><td colSpan="6">No review actions yet.</td></tr>}</tbody></table></div>;
}
