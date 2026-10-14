import React, { useCallback, useEffect, useState } from "react";
import Topbar from "../components/Topbar";
import { encodeDemoValue } from "../utils/demoEncoder";
import "./ClientUserPortal.css";

const currency = value => value == null || value === "" ? "—" :
  Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
const safe = value => value ? encodeDemoValue(String(value), true) : "—";
const dateText = value => value ? new Date(value).toLocaleString() : "—";
const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")].join("-");
};
const nav = [["home", "Home"], ["convert", "Convert a file"],
  ["attention", "Needs attention"], ["history", "History"]];
const getData = async (url, signal) => {
  const response = await fetch(url, { credentials: "include", signal });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "Unable to load client records");
  return data;
};

export default function ClientUserPortal({ user, onLogout }) {
  const [tab, setTab] = useState("home");
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [category, setCategory] = useState("All");
  const [selectedFile, setSelectedFile] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const reload = useCallback(() => setRefresh(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getData("/edi835/api/client-portal/overview/?date=" + encodeURIComponent(date), controller.signal)
      .then(setData)
      .catch(e => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, refresh]);

  const viewClaim = async id => {
    setDetailLoading(true);
    setError("");
    try {
      const result = await getData("/edi835/api/client-portal/claim/" + id + "/");
      setDetail(result.claim);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openTab = next => {
    setTab(next);
    setDrawer(false);
    setDetail(null);
  };
  const metrics = data?.metrics || {};
  const issues = data?.issues || [];
  const claims = data?.claims || [];
  const visibleClaims = claims.filter(c => (!selectedFile || c.file_id === selectedFile) && (category === "All" ||
    (category === "Denied" ? c.payer_status === "Denied" || c.payer_status === "No payment" :
      category === "Less paid" ? c.payer_status === "Paid less than billed" :
      c.payer_status === "Paid in full")));
  const aging = [
    ["Today", claims.filter(c => c.days === 0).length],
    ["1 day", claims.filter(c => c.days === 1).length],
    ["2 days", claims.filter(c => c.days === 2).length],
    ["3+ days", claims.filter(c => c.days >= 3).length],
  ];
  const maximum = Math.max(1, ...aging.map(a => a[1]));

  return <>
    <Topbar user={user} onLogout={onLogout} onToggleDrawer={() => setDrawer(d => !d)} />
    <div className="cu-shell">
      <aside className={"cu-sidebar " + (drawer ? "cu-sidebar-open" : "")}>
        <p className="cu-org">{data?.client || user.client || "Client workspace"}</p>
        <p className="eyebrow">CLIENT USER WORKSPACE</p>
        <nav aria-label="Client User navigation">
          {nav.map(([key, label]) => <button key={key} type="button"
            className={tab === key ? "cu-selected" : ""}
            onClick={() => openTab(key)}>{label}
            {key === "attention" && issues.length > 0 && <span className="cu-count">{issues.length}</span>}
          </button>)}
        </nav>
        <p className="cu-sidebar-foot">{user.name} · Client User</p>
      </aside>
      <main className="cu-main">
        <div className="cu-heading">
          <div><p className="eyebrow">{data?.client || user.client} · {date}</p>
            <h1>{tab === "home" ? "Claims overview" :
              tab === "attention" ? "Needs attention" :
              tab === "history" ? "Conversion history" : "Convert a file"}</h1>
            <p>{tab === "home" ? "Your claims, conversion results and items needing review." :
              tab === "attention" ? "Review issues from your organization's 835 processing." :
              tab === "history" ? "Recent MIR conversions for your organization." :
              "File conversion operations are managed by your Client Admin."}</p>
          </div>
          <div className="cu-controls"><label>Activity date
            <input type="date" value={date} onChange={e => setDate(e.target.value || today())} />
          </label><button type="button" className="cu-btn" onClick={reload}>Refresh</button></div>
        </div>
        {error && <p className="cu-error" role="alert">{error}</p>}
        {loading && <p>Loading client activity…</p>}
        {tab === "home" && <>
          <div className="cu-kpis">
            {[
              ["Received", metrics.received_files, "files · " + (metrics.received_claims || 0) + " claims"],
              ["Converted", metrics.converted_claims, "claims"],
              ["Waiting for review", metrics.waiting_claims, "claims · oldest " + (metrics.oldest_days || 0) + " days"],
              ["Sent to MPL", metrics.sent_claims, "claims · " + (metrics.sent_files || 0) + " files"],
            ].map(([label, value, desc], i) => <section className={"cu-card cu-kpi " + (i === 2 ? "cu-warning" : "")} key={label}>
              <span className="eyebrow">{label}</span><strong>{Number(value || 0).toLocaleString()}</strong>
              <small>{desc}</small></section>)}
          </div>
          <section className="cu-card">
            <div className="cu-section-title"><h2>Claims waiting on review</h2>
              <span>{metrics.waiting_claims || 0} held · {claims.length} matched claim records</span></div>
            {aging.map(([label, count]) => <div className="cu-aging-row" key={label}>
              <span>{label}</span><div className="cu-track"><i style={{ width: (count / maximum * 100) + "%" }} /></div>
              <b>{count}</b></div>)}
            <p className="cu-help">Age breakdown uses the held claims matched to recorded conversion findings (up to 200 rows).</p>
            {selectedFile && <p className="cu-help">Filtered to selected source file. <button className="cu-link" onClick={() => setSelectedFile(null)}>Show all claims</button></p>}
            <div className="cu-filters">{["All", "Denied", "Less paid", "Paid in full"].map(x =>
              <button key={x} type="button" className={category === x ? "active" : ""}
                onClick={() => setCategory(x)}>{x}</button>)}</div>
            <div className="cu-table-scroll"><table className="cu-table"><thead><tr>
              <th>Waiting</th><th>Claim</th><th>Billed</th><th>Paid</th>
              <th>Payer result</th><th>Why held</th><th></th>
            </tr></thead><tbody>
              {visibleClaims.map(c => <tr key={c.id}>
                <td>{c.days === 0 ? "Today" : c.days + " days"}</td>
                <td><button className="cu-link" onClick={() => viewClaim(c.id)}>{safe(c.number)}</button></td>
                <td>{currency(c.billed)}</td><td>{currency(c.paid)}</td>
                <td>{c.payer_status}</td><td>{c.reason || "Review needed"}</td>
                <td><button className="cu-link" onClick={() => viewClaim(c.id)}>Review</button></td>
              </tr>)}
              {!visibleClaims.length && <tr><td colSpan="7">No matching held claim records.</td></tr>}
            </tbody></table></div>
            {data?.claims_limited && <p className="cu-help">Showing the first 200 matched held claims.</p>}
          </section>
          <section className="cu-card cu-notice">
            <div className="cu-section-title"><h2>{metrics.decisions || 0} items need review</h2>
              <button className="cu-link" onClick={() => openTab("attention")}>See all</button></div>
            {issues.slice(0, 3).map(issue => <div className="cu-issue-mini" key={issue.id}>
              <div><b>{issue.kind === "error" ? "A file could not be processed" :
                issue.count + " claims held"} · {issue.filename}</b>
                <small>{issue.reason}</small></div>
              <button className="cu-btn" onClick={() => openTab("attention")}>Review</button>
            </div>)}
            {!issues.length && <p>There are no recent recorded conversion holds or file errors.</p>}
          </section>
          <section className="cu-card">
            <div className="cu-section-title"><h2>Recent conversions</h2>
              <button className="cu-link" onClick={() => openTab("history")}>Full history</button></div>
            <History rows={(data?.history || []).slice(0, 5)} />
          </section>
        </>}
        {tab === "attention" && <div className="cu-issues">
          {issues.map(issue => <section className={"cu-card cu-issue " + (issue.kind === "error" ? "cu-stopped" : "")} key={issue.id}>
            <div className="cu-section-title"><h2>{issue.kind === "error" ? "File processing stopped" :
              issue.count + " claims are held"}</h2>
              <span>{issue.days} days waiting</span></div>
            <p className="cu-muted">{issue.filename}</p>
            <div className="cu-explanation"><b>What this means</b><p>{issue.reason}</p></div>
            {issue.kind === "hold" && <button className="cu-btn" onClick={() => { setSelectedFile(issue.id); openTab("home"); }}>See held claims</button>}
            <p className="cu-help">Corrections and resend requests must be handled by your Client Admin.</p>
          </section>)}
          {!issues.length && <section className="cu-card">No recent issues require review.</section>}
        </div>}
        {tab === "history" && <section className="cu-card"><History rows={data?.history || []} /></section>}
        {tab === "convert" && <section className="cu-card">
          <h2>File conversion</h2><p>To prevent accidental uploads or retransmissions, this role cannot start a conversion.
            Your Client Admin can convert files, manage SFTP connections and release held records.</p>
          <button className="cu-btn" onClick={() => openTab("history")}>See completed conversions</button>
        </section>}
        {detailLoading && <p>Loading payer response…</p>}
        {detail && <div className="cu-backdrop" onMouseDown={() => setDetail(null)}>
          <section className="cu-detail cu-card" role="dialog" aria-modal="true" aria-label="Claim details"
            onMouseDown={e => e.stopPropagation()}>
            <div className="cu-section-title"><div><p className="eyebrow">PAYER RESPONSE · 835</p>
              <h2>Claim {safe(detail.number)}</h2><p>{detail.file_name}</p></div>
              <button className="cu-btn" onClick={() => setDetail(null)}>Close</button></div>
            <div className="cu-kpis">
              {[["Billed", currency(detail.billed)], ["Paid", currency(detail.paid)],
                ["Patient responsibility", currency(detail.patient_owes)]].map(([k, v]) =>
                <div className="cu-card cu-kpi" key={k}><span className="eyebrow">{k}</span><strong>{v}</strong></div>)}
            </div>
            <div className="cu-explanation"><b>What the payer said</b>
              <p>{detail.payer_status} · CLP status {detail.status_code || "not recorded"}</p></div>
            <h3>Service lines</h3><div className="cu-table-scroll"><table className="cu-table"><thead><tr>
              <th>Procedure</th><th>Billed</th><th>Paid</th><th>Units</th></tr></thead><tbody>
              {(detail.services || []).map((s, i) => <tr key={i}><td>{s.code}</td>
                <td>{currency(s.billed)}</td><td>{currency(s.paid)}</td><td>{s.units || "—"}</td></tr>)}
              {!detail.services?.length && <tr><td colSpan="4">No 835 service lines recorded.</td></tr>}
              </tbody></table></div>
            <h3>Payer adjustments (CAS)</h3><div className="cu-table-scroll"><table className="cu-table"><thead><tr>
              <th>Group</th><th>Reason code</th><th>Amount</th></tr></thead><tbody>
              {(detail.adjustments || []).map((a, i) => <tr key={i}><td>{a.group}</td>
                <td>{a.code}</td><td>{currency(a.amount)}</td></tr>)}
              {!detail.adjustments?.length && <tr><td colSpan="3">No CAS adjustments recorded.</td></tr>}
              </tbody></table></div>
            {detail.reason && <div className="cu-explanation"><b>Why this claim is held</b><p>{detail.reason}</p></div>}
            <h3>History on this claim</h3>{(detail.timeline || []).map((ev, i) =>
              <p className="cu-muted" key={i}>{dateText(ev.at)} · {ev.label}</p>)}
          </section></div>}
      </main>
    </div>
  </>;
}

function History({ rows }) {
  return <div className="cu-table-scroll"><table className="cu-table"><thead><tr>
    <th>Converted</th><th>File</th><th>Claims</th><th>Status</th></tr></thead><tbody>
    {rows.map(item => <tr key={item.id}><td>{dateText(item.date)}</td>
      <td>{item.filename}</td><td>{item.count}</td><td>{item.status}</td></tr>)}
    {!rows.length && <tr><td colSpan="4">No conversions recorded.</td></tr>}
  </tbody></table></div>;
}
