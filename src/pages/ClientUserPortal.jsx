import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Topbar from "../components/Topbar";
import { PortalPagination } from "../components/ClientClaimTable";
import ClientClaimComparison from "../components/ClientClaimComparison";
// import ClientFinancialAmounts from "../components/ClientFinancialAmounts";
import SecurityView from "./SecurityView";
import ConversionsView from "./ConversionsView";
import FileViewerModal from "../components/FileViewerModal";
import ClientClaimSources from "../components/ClientClaimSources";
import Client835837Status from "../components/Client835837Status";
import ClientAnalysis from "../components/ClientAnalysis";
import { encodeDemoValue } from "../utils/demoEncoder";
import { clientPagePath, useClientPortalRoute } from "../utils/clientPortalRoute";
import "./ClientUserPortal.css";
import "./ClientClaimDetail.css";

const cash = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? "—" :
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });
const safe = v => v == null || v === "" ? "—" : encodeDemoValue(String(v), true);
const timestamp = v => v ? new Date(v).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
const claimDate = value => {
  if (!value) return "—";
  value = String(value);
  if (!/^\d{8}$/.test(value)) return value;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(4, 6)), day = Number(value.slice(6, 8));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : value;
};
const filenameText = value => value == null || value === "" ? "—" : String(value);
const navigation = [["home","Home"],["convert","Conversions"],["835837","835/837 status"],["analysis","Analysis"],["history","History"]];
const pageNavigation = [["home", "Home"], ["convert", "Convert a file"], ["835837", "835/837 status"], ["analysis", "Analysis"]];
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
export default function ClientUserPortal({ user, onLogout }) {
  const { tab, claimId, analysisClaim, historySection, pathname, navigate } = useClientPortalRoute();
  const isAnalysis = tab === "analysis";
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
    setHistoryPage(1);
  };
  const [dashboard, setDashboard] = useState(null);
  const [actions, setActions] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("All");
  // Financial summary is hidden: const [comparisonMoney, setComparisonMoney] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerPinned, setDrawerPinned] = useState(false);
  const [drawerHover, setDrawerHover] = useState(false);
  const drawer = drawerPinned || drawerHover;
  const drawerCloseTimer = useRef(null);
  const cancelDrawerClose = () => window.clearTimeout(drawerCloseTimer.current);
  const openDrawerPreview = event => {
    if (event.pointerType === "touch") return;
    cancelDrawerClose();
    setDrawerHover(true);
  };
  const closeDrawerPreview = () => {
    cancelDrawerClose();
    // Allow the pointer to cross the short gap below the menu button.
    drawerCloseTimer.current = window.setTimeout(() => setDrawerHover(false), 180);
  };
  const toggleDrawerPin = () => {
    cancelDrawerClose();
    setDrawerHover(false);
    setDrawerPinned(value => !value);
  };
  useEffect(() => () => window.clearTimeout(drawerCloseTimer.current), []);
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onEscape = event => {
      if (event.key === "Escape") {
        cancelDrawerClose(); setDrawerHover(false); setDrawerPinned(false);
        document.querySelector(".cu-header-menu")?.focus();
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [drawer]);

  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [conversionFiles, setConversionFiles] = useState([]);
  const [fileViewerId, setFileViewerId] = useState(null);
  const [claimActivity, setClaimActivity] = useState(null);
  const [claimActivityPage, setClaimActivityPage] = useState(1);
  const [claimActivityLoading, setClaimActivityLoading] = useState(false);
  const [claimActivityError, setClaimActivityError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const setHistorySection = section => navigate(section === "activity" ? "/history/activity" : "/history");
  const [historyResult, setHistoryResult] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const reload = useCallback(() => setRefresh(v => v + 1), []);
  useEffect(() => {
    if (!periodQuery || isAnalysis) {
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
  }, [periodQuery, refresh, isAnalysis]);

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

  const go = next => {
    if (next === "history") setHistoryPage(1);
    navigate(clientPagePath(next));
  };
  useEffect(() => {
    setDetail(null);
    setDecision(null);
    setError("");
    setDrawerHover(false);
    setNotice("");
  }, [pathname]);
  const showClaim = id => navigate(clientPagePath("claim", String(id)));
  useEffect(() => {
    if (tab !== "claim" || !claimId) {
      setDetailLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setClaimActivityPage(1);
    setClaimActivity(null);
    setDetailLoading(true);
    setError("");
    setNotice("");
    jsonFetch(baseUrl + "claim/" + encodeURIComponent(claimId) + "/", { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setDetail(response.claim); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [tab, claimId]);
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


  const metrics = dashboard?.metrics || {};
  const activePeriod = dashboard?.period;
  const periodLabel = activePeriod
    ? activePeriod.from
      ? activePeriod.from === activePeriod.to
        ? displayPeriodDate(activePeriod.from)
        : displayPeriodDate(activePeriod.from) + " – " + displayPeriodDate(activePeriod.to)
      : "Entire available history"
    : periodMode === "custom" ? "Choose From and To dates" : "Loading selected period…";
  const detailActions = claimActivity?.actions || [];

  const timeline = detail ? [
    { label: "835 received", at: detail.received_at, complete: true },
    { label: "Payer payment", at: detail.check_date ? claimDate(detail.check_date) : "Not recorded", complete: !!detail.check_date },
    { label: "Conversion", at: detail.timeline?.find(x => x.label === "Conversion completed")?.at, complete: !!detail.timeline?.find(x => x.label === "Conversion completed") },
    { label: "Review", at: detail.reason ? "Attention needed" : "No hold recorded", complete: !detail.reason },
    { label: "MPL delivery", at: detail.mir_status === "PUSHED" ? "Confirmed" : "Not confirmed", complete: detail.mir_status === "PUSHED" },
  ] : [];

  return <>
    <Topbar user={user} clientUser onToggleDrawer={toggleDrawerPin} onLogout={onLogout}
      drawerOpen={drawer} drawerPinned={drawerPinned}
      onMenuPointerEnter={openDrawerPreview} onMenuPointerLeave={closeDrawerPreview} />
    <div className="cu-shell">
      <nav id="client-navigation" className={"cu-sidebar" + (drawer ? " cu-sidebar-open" : "")}
        onPointerEnter={openDrawerPreview} onPointerLeave={closeDrawerPreview}
        aria-label="Client navigation" aria-hidden={!drawer} inert={!drawer}>
        <div className="grp eyebrow">Operations</div>
        {navigation.filter(([key]) => key !== "history").map(([key,label]) =>
          <button type="button" key={key}
            aria-current={tab === key ? "page" : undefined}
            className={"cu-navitem" + ((tab === key || (key === "home" && tab === "claim")) ? " on" : "")}
            onClick={() => go(key)}><span>{label}</span>
          </button>
        )}
        <div className="grp eyebrow cu-nav-section">Records</div>
        <button type="button" className={"cu-navitem" + (tab === "history" ? " on" : "")}
          onClick={() => go("history")}><span>History</span></button>
        <div className="grp eyebrow cu-nav-section">Account</div>
        <button type="button" className={"cu-navitem" + (tab === "settings" ? " on" : "")}
          onClick={() => go("settings")}><span>Settings</span></button>
      </nav>
      <main className={"cu-main cu-compact" + (tab === "claim" ? " cu-claim-page" : "")}>
        {!["home", "convert", "835837", "analysis"].includes(tab) && <button type="button" className="cu-back-link"
          onClick={() => go("home")}>
          ← Back to Home
        </button>}
        <header className={"cu-heading" + (tab === "claim" ? " cu-claim-heading" : "")}>
          <div className="cu-heading-copy">
            <span className="eyebrow">{dashboard?.client || user.client}{!["analysis", "convert"].includes(tab) && <> · {periodMode.toUpperCase()}</>}</span>
            <h1>{tab === "analysis" ? "Analysis" : tab === "835837" ? "835/837 status" : tab === "home" ? "Claims overview" : tab === "history" ?
              "History" : tab === "convert" ? "Conversions" : tab === "settings" ? "Account settings" :
              "Claim " + safe(detail?.number)}</h1>
            {tab === "claim" && detail && <span className={"cu-claim-badge" + (detail.reason ? " is-held" : "")}>
              {detail.reason ? "On hold · " + detail.days + " days" : "Payer response available"}
            </span>}
            {tab !== "claim" && tab !== "analysis" && <p>{tab === "835837" ? "Review billed-charge differences and 837 claims awaiting an 835." : tab === "home" ?
              "Your client claims, payments and exceptions in one place." :
              tab === "history" ? "Conversions and review activity for your selected period." :
              tab === "convert" ? "Upload a validated 835 for conversion and optional outbound delivery." : tab === "settings" ? "Manage your FileX security keys." :
              detail?.file_name || ""}</p>}
          </div>
          {tab === "claim" && detail && <>
            <div className="cu-actions cu-claim-actions" role="group" aria-label="Claim actions">
              {detail.reason && <button type="button" className="cu-btn cu-primary" disabled={sending}
                onClick={()=>choose(isDictionaryIssue({reason:detail.reason})?"REQUEST_DICTIONARY":isPlanIssue({reason:detail.reason})?"REQUEST_PLAN_ID":"REQUEST_RELEASE",
                  detail.file_id,detail.id,"Request correction / release")}>Request correction / release</button>}
              <button type="button" className="cu-btn cu-subtle" disabled={sending}
                onClick={()=>choose("NOTE",detail.file_id,detail.id,"Add a claim note")}>Add a note</button>
            </div>
            <dl className="cu-claim-meta">
              <div><dt>Source file</dt><dd>{detail.file_name ?
                <details className="cu-source-files">
                  <summary><span className="cu-source-preview">{filenameText(detail.file_name)}</span>
                    <span className="cu-source-toggle"><span className="cu-source-show">View</span><span className="cu-source-hide">Hide</span></span>
                  </summary>
                  <p>{filenameText(detail.file_name)}</p>
                </details> : "—"}</dd></div>
              <div><dt>Received</dt><dd>{timestamp(detail.received_at)}</dd></div>
              <div><dt>Payer</dt><dd>OneSmarter Health</dd></div>
              <div><dt>Patient</dt><dd>{safe(detail.patient_name)}</dd></div>
            </dl>
          </>}
          {pageNavigation.some(([key]) => key === tab) && <nav className="cu-controls cu-page-navigation" aria-label="Page navigation">
            {pageNavigation.map(([key, label]) => <button type="button" className="cu-btn" key={key}
              aria-current={tab === key ? "page" : undefined} onClick={() => go(key)}>{label}</button>)}
          </nav>}
        </header>
        {["home", "history", "835837"].includes(tab) && <section className="cu-period-toolbar" aria-label="Client activity date filters">
          <div className="cu-period-main">
            <div className="cu-period-options" role="group" aria-label="Activity period">
              {PERIODS.map(([key, label]) => <button type="button" key={key}
                className={periodMode === key ? "active" : ""}
                aria-pressed={periodMode === key} onClick={() => selectPeriod(key)}>{label}</button>)}
            </div>
            {periodMode === "custom" && <div className="cu-period-custom">
              <label>From <input aria-label="Custom start date" type="date" value={customFrom}
                max={customTo || undefined} onChange={event => {
                  setCustomFrom(event.target.value); setHistoryPage(1);
                }}/></label>
              <label>To <input aria-label="Custom end date" type="date" value={customTo}
                min={customFrom || undefined} onChange={event => {
                  setCustomTo(event.target.value); setHistoryPage(1);
                }}/></label>
            </div>}
            <span className="cu-period-caption" role="status">{periodLabel}
              {activePeriod?.timezone && <small> · {activePeriod.timezone}</small>}</span>
          </div>
        </section>}
        {tab !== "analysis" && periodMode === "custom" && !periodQuery &&
          <p className="cu-period-hint" role="status">{customFrom && customTo && customFrom > customTo
            ? "From must be on or before To."
            : "Select both From and To dates to see activity for that inclusive range."}</p>}
        {tab !== "analysis" && error && <div className="cu-error" role="alert">{error}</div>}
        {notice && <div className="cu-success" role="status">{notice}</div>}
        {tab !== "analysis" && loading && <p>Loading current client records…</p>}
        {detailLoading && <p>Opening claim…</p>}

        {tab === "analysis" && <ClientAnalysis claimNumber={analysisClaim}
          onClaimChange={id => navigate(clientPagePath("analysis", id))} />}
        {tab === "835837" && periodQuery && <Client835837Status periodQuery={periodQuery} refresh={refresh} onOpen={showClaim} />}
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
          {/* Financial totals strip hidden at the client's request.
          <ClientFinancialAmounts
            metrics={filter === "All" ? metrics : (comparisonMoney || {})}
            loading={loading || (filter !== "All" && !comparisonMoney)}
          />
          */}
          <div className="cu-comparison-category">
            <span>Payer category</span>
            <div className="cu-filters">{["All","Denied","Less paid","Paid in full"].map(x =>
              <button key={x} type="button" aria-pressed={filter === x}
                className={filter===x?"active":""}
                onClick={() => setFilter(x)}>
                {x}</button>)}</div>
          </div>
          <ClientClaimComparison
            periodQuery={periodQuery}
            payerFilter={filter}
            refresh={refresh}
            onOpen={showClaim}
          />
          <section className="cu-card">
            <div className="cu-section-title"><h2>Recent conversions</h2><button className="cu-link" onClick={()=>go("history")}>Full history</button></div>
            <History rows={(dashboard?.history||[]).slice(0,5)} />
          </section>
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

        {tab === "settings" && <div className="cu-security-workspace"><SecurityView embedded /></div>}

        {tab === "history" && periodQuery && <section className="cu-card">
          <div className="cu-history-tabs" role="tablist" aria-label="History sections">
            {[["files", "File history"], ["activity", "Review activity"]].map(([key, label]) =>
              <button type="button" key={key} role="tab" id={"history-tab-" + key}
                aria-selected={historySection === key} aria-controls={"history-panel-" + key}
                tabIndex={historySection === key ? 0 : -1}
                onKeyDown={event => {
                  const keys = ["files", "activity"];
                  const index = keys.indexOf(key);
                  const next = event.key === "ArrowRight" ? keys[(index + 1) % 2] :
                    event.key === "ArrowLeft" ? keys[(index + keys.length - 1) % keys.length] :
                    event.key === "Home" ? keys[0] : event.key === "End" ? keys[1] : null;
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
          </div>
        </section>}

        {tab==="claim" && detail && <>
          <section className="cu-card cu-timeline" aria-label="Claim progress">
            {timeline.map((t,i)=><div className="cu-step" key={i}>
              <span className={"cu-dot "+(t.complete?"complete":"pending")}></span>
              <div><strong>{t.label}</strong><small>{t.at&&t.at.includes("T")?timestamp(t.at):t.at||"Not recorded"}</small></div>
            </div>)}
          </section>
          <section className="cu-card cu-payment-card">
            <div className="cu-section-title"><h2>Payment summary</h2>
              <span className="cu-payment-status">{detail.payer_status || "Status unavailable"}</span></div>
            <div className="cu-amounts">
              {[
                ["Billed",cash(detail.billed),"normal"],
                ["After contract write-offs",cash(detail.allowed),"normal"],
                ["Paid",cash(detail.paid),"good"],
                ["Patient owes",cash(detail.responsibility_amount ?? detail.patient_owes),"warn"],
              ].map(([label,value,tone])=><div className={"cu-amount cu-amount-"+tone} key={label}>
                <span className="eyebrow">{label}</span><strong>{value}</strong></div>)}
            </div>
            <details className="cu-payment-explanation"><summary>Payment explanation</summary><p><b>{detail.payer_status}.</b> The 835 reports {cash(detail.paid)} paid against {cash(detail.billed)} billed.
              {detail.allowed!=null?" Contractual adjustments reduce billed charges to "+cash(detail.allowed)+".":""}
              {" "}Patient responsibility is {cash(detail.responsibility_amount ?? detail.patient_owes)}.
              {detail.check_number?" Payment reference "+safe(detail.check_number)+".":""}</p></details>
            <div className="cu-service-heading"><h3>Service lines</h3><span>{detail.services?.length || 0} services</span></div>
            <div className="cu-table-scroll"><table className="cu-table cu-service-table" aria-label="Claim service lines"><thead><tr>
              <th scope="col">Procedure</th><th scope="col" className="cu-num">Billed</th><th scope="col" className="cu-num">After CO adjustments</th><th scope="col" className="cu-num">Paid</th><th scope="col" className="cu-num">Units</th><th scope="col">Service date</th><th scope="col">Payer adjustments</th></tr></thead>
              <tbody>{(detail.services||[]).map((svc,i)=><tr key={i}>
                <td><strong>{safe(svc.code)}</strong></td><td className="cu-num">{cash(svc.billed)}</td><td className="cu-num">{cash(svc.allowed)}</td><td className="cu-num">{cash(svc.paid)}</td><td className="cu-num">{svc.units ?? "—"}</td><td className="cu-service-date">{claimDate(svc.date)}</td>
                <td>{(svc.adjustments||[]).map((a,j)=><details className="cu-adjustment" key={j}><summary>{a.group}-{a.code}<span>{cash(a.amount)}</span></summary><p>{adjustmentMeaning(a.group,a.code)}</p></details>)}{!svc.adjustments?.length && <span className="cu-muted">—</span>}</td>
              </tr>)}
              {!detail.services?.length&&<tr><td colSpan="7">No service lines recorded in this 835 claim.</td></tr>}
              </tbody></table></div>
            <p className="cu-help">Amounts after contractual adjustments are calculated from recorded CAS CO adjustments, not an explicit payer allowed field.</p>
            {!!detail.adjustments?.length && <details><summary>All payer adjustment codes ({detail.adjustments.length})</summary>
              <div className="cu-table-scroll"><table className="cu-table"><thead><tr><th>Group</th><th>Code</th><th>Amount</th></tr></thead>
                <tbody>{detail.adjustments.map((a,i)=><tr key={i}><td>{a.group}</td><td>{a.code} · {adjustmentMeaning(a.group,a.code)}</td><td>{cash(a.amount)}</td></tr>)}</tbody></table></div></details>}
          </section>
          <div className="cu-claim-bottom">
          <section className={"cu-card cu-claim-notes" + (detail.reason ? " cu-issue" : "")}>
            {detail.reason && <><h2>Why it is waiting on you</h2><p>{detail.reason}</p></>}
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
          </section>
          <section className="cu-card cu-claim-history">
            <h2>Claim history</h2>
            {(detail.timeline||[]).map((event,i)=><p className="cu-event" key={i}><time>{timestamp(event.at)}</time>{event.label}</p>)}
            {!detail.timeline?.length && <p className="cu-help">No additional claim events recorded.</p>}
          </section>
          </div>
          <ClientClaimSources key={detail.id} claimId={detail.id} sources={detail.sources} />
        </>}

        {decision && <div className="cu-backdrop">
          <section className="cu-dialog cu-card" role="dialog" aria-modal="true" aria-label={decision.title} onMouseDown={e=>e.stopPropagation()}>
            <div className="cu-section-title"><h2>{decision.title}</h2>
              <button aria-label="Close" className="cu-link" onClick={()=>setDecision(null)}>✕</button></div>
            <p className="cu-muted">Claim {safe(detail?.number)}</p>
            <p>{decision.kind==="NOTE"?"This note will be visible to your Client Admin.":
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
