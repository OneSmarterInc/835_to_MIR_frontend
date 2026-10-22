import React, { useCallback, useEffect, useState } from "react";
import { encodeDemoValue } from "../utils/demoEncoder";
import { showAppConfirm } from "../components/AppDialog";
import { withCsrf } from "../utils/api";
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
      const response = await fetch("/edi835/api/client-portal/actions/", withCsrf({ credentials:"include" }));
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Failed to load review requests");
      setItems(body.actions || []);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const reviewed = async row => {
    if (!await showAppConfirm("Mark this request reviewed? This will not change claim data, code dictionaries or SFTP files.", { title: "Confirm Review", confirmLabel: "Mark reviewed" })) return;
    setBusy(row.id); setError(""); setMessage("");
    try {
      const response = await fetch("/edi835/api/client-portal/actions/" + row.id + "/review/", withCsrf({
        method: "POST", credentials:"include",
      }));
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
      <p>Operational review queue for actions submitted by Client Users.</p></div>
      <button type="button" className="cu-btn cu-secondary" onClick={reload} disabled={loading}>Refresh</button>
    </header>
    {message && <p className="cu-message" role="status">{message}</p>}
    {error && <p className="cu-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading requests…</p> : open.length === 0 ?
      <div className="cu-card cu-empty-card">No review requests are currently pending.</div> :
      <div className="cu-card cu-table-wrap">
        <table className="cu-table">
          <thead><tr><th>Type</th><th>Client note</th><th>Original file</th><th>Highmark claim</th><th>Requested</th><th>Action</th></tr></thead>
          <tbody>
            {open.map(row => <tr key={row.id}>
              <td><span className="cu-chip">{row.action_type}</span></td>
              <td>{row.note || "—"}</td>
              <td><code>{safe(row.original_filename)}</code></td>
              <td><code>{safe(row.highmark_claim_number)}</code></td>
              <td>{when(row.created_at)}</td>
              <td><button type="button" className="cu-btn cu-primary" disabled={busy === row.id} onClick={()=>reviewed(row)}>
                {busy === row.id ? "Saving…" : "Mark reviewed"}
              </button></td>
            </tr>)}
          </tbody>
        </table>
      </div>}
  </section>;
}
