import React, { useCallback, useEffect, useState } from "react";
import { encodeDemoValue } from "../utils/demoEncoder";
import "./ClientUserPortal.css";

const safe = v => v ? encodeDemoValue(String(v), true) : "—";
const when = v => v ? new Date(v).toLocaleString("en-US", { dateStyle:"medium", timeStyle:"short" }) : "—";

export default function ClientReviewQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/edi835/api/client-portal/actions/", { credentials:"include" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Failed to load review requests");
      setItems(body.actions || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const reviewed = async row => {
    if (!window.confirm("Mark this request reviewed? This will not change claim data, code dictionaries or SFTP files.")) return;
    setBusy(row.id); setError(""); setMessage("");
    try {
      const response = await fetch("/edi835/api/client-portal/actions/" + row.id + "/review/", {
        method: "POST", credentials:"include",
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Unable to mark reviewed");
      setMessage(body.message);
      await reload();
    } catch(e) { setError(e.message); }
    finally { setBusy(null); }
  };
  const open = items.filter(i=>i.status==="OPEN");
  return <section className="cu-main cu-admin-requests">
    <header className="cu-heading"><div><span className="eyebrow">CLIENT ADMIN · OPERATIONS</span>
      <h1>Client review requests</h1>
      <p>Correction requests, resend requests, file decisions and notes from your Client Users.</p></div>
      <button className="cu-btn" onClick={reload}>Refresh</button></header>
    {error&&<p className="cu-error" role="alert">{error}</p>}
    {message&&<p className="cu-success" role="status">{message}</p>}
    <div className="cu-kpis"><section className="cu-card cu-kpi"><span className="eyebrow">Open requests</span><strong>{open.length}</strong></section>
      <section className="cu-card cu-kpi"><span className="eyebrow">Recent activity</span><strong>{items.length}</strong><small>Latest 200 actions</small></section></div>
    <section className="cu-card">
      <div className="cu-section-title"><h2>Items needing your review</h2><span>Requests are not automatic fixes or retransmissions.</span></div>
      {loading&&<p>Loading review queue…</p>}
      <div className="cu-table-scroll"><table className="cu-table"><thead><tr>
        <th>Created</th><th>File</th><th>Action</th><th>Details</th><th>Submitted by</th><th>Status</th><th>Decision</th>
      </tr></thead><tbody>
        {items.map(row=><tr key={row.id}>
          <td>{when(row.at)}</td><td>{safe(row.file_name)}</td><td>{row.label}</td>
          <td>{row.message||"—"}</td><td>{row.by}</td><td>{row.status}</td>
          <td>{row.status==="OPEN"?
            <button className="cu-btn" disabled={busy===row.id} onClick={()=>reviewed(row)}>{busy===row.id?"Saving…":"Mark reviewed"}</button>
            :"Reviewed"}</td>
        </tr>)}
        {!loading&&!items.length&&<tr><td colSpan="7">No client review requests have been recorded yet.</td></tr>}
      </tbody></table></div>
    </section>
  </section>;
}
