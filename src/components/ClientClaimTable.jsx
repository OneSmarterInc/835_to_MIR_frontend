import React from "react";
import { encodeDemoValue } from "../utils/demoEncoder";

const safe = value => value == null || value === "" ? "—" : encodeDemoValue(String(value), true);
const cash = value => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
const when = value => value ? new Date(value).toLocaleString() : "";

export function ClaimActionStatus({ claim, recentActions = [] }) {
  const complete = Array.isArray(claim.review_activity);
  const rows = (complete ? claim.review_activity : recentActions)
    .filter(action => claim.id != null && (action.record_id ?? action.claim_id) != null &&
      String(action.record_id ?? action.claim_id) === String(claim.id))
    .slice().sort((a, b) => (Date.parse(b.at) - Date.parse(a.at)) || Number(b.id) - Number(a.id));
  const requests = rows.filter(action => action.kind.startsWith("REQUEST_"));
  const request = requests.find(action => action.status === "OPEN") || requests[0];
  const note = rows.find(action => action.kind === "NOTE");
  if (!rows.length) return <span className="cu-muted">{claim.id == null ? "Source finding only" : complete ? "No actions yet" : "No recent actions"}</span>;
  return <div className="cu-claim-status">
    {request && <div>
      <span className={"cu-tag " + (request.status === "REVIEWED" ? "ok" : "work")}>{request.label}</span>
      <small title={when(request.at)}>{request.status === "REVIEWED" ? "Reviewed" : "Pending review"} · {request.by}</small>
    </div>}
    {note && <div>
      <span className="cu-note-label">Note added</span>
      <p className="cu-note-preview" title={note.message}>{note.message}</p>
      <small title={when(note.at)}>{note.by} · {when(note.at)}</small>
    </div>}
    {!request && !note && <span className="cu-tag">{rows[0].label}</span>}
  </div>;
}

export default function ClientClaimTable({ rows, onOpen, recentActions, showSource = false, loading = false }) {
  return <div className="cu-table-scroll"><table className="cu-table cu-claims-table" aria-label={showSource ? "Claims needing attention" : "Claims waiting on you"}>
    <thead><tr><th>Waiting</th><th>Claim</th><th>Internal claim</th>{showSource && <th>Source file</th>}
      <th>Billed</th><th>Paid</th><th>Payer status</th><th>Why waiting</th><th>Action status / latest note</th></tr></thead>
    <tbody>{rows.map(claim => <tr key={claim.row_key || claim.id} tabIndex={0}
      className={"cu-clickable-row" + (claim.days >= 3 ? " cu-overdue" : "")}
      onClick={event => { if (!event.target.closest("button, a")) onOpen(claim); }}
      onKeyDown={event => {
        if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) {
          event.preventDefault(); onOpen(claim);
        }
      }}>
      <td>{claim.days ? claim.days + " days" : "Today"}</td>
      <td><button type="button" className="cu-link" onClick={() => onOpen(claim)}>{safe(claim.number)}</button></td>
      <td>{safe(claim.internal_number)}</td>{showSource && <td className="cu-source-cell">{claim.file_name}</td>}
      <td>{cash(claim.billed)}</td><td>{cash(claim.paid)}</td><td>{claim.payer_status}</td>
      <td className="cu-reason-cell">{claim.reason || "Requires review"}</td>
      <td><ClaimActionStatus claim={claim} recentActions={recentActions} /></td>
    </tr>)}
    {!rows.length && <tr><td colSpan={showSource ? 9 : 8}>{loading ? "Loading claims…" : "No claims match this view."}</td></tr>}
    </tbody>
  </table></div>;
}

export function PortalPagination({ result, page, onPage, loading, pageSize, onPageSize, label }) {
  const current = result?.page || page;
  const pages = result?.pages || 1;
  return <div className="cu-history-pagination" aria-label={label}>
    <span>{loading ? "Loading…" : `Page ${current} of ${pages} · ${result?.count || 0} records`}</span>
    {onPageSize && <label>Rows per page <select value={pageSize} disabled={loading}
      onChange={event => onPageSize(Number(event.target.value))}>
      {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
    </select></label>}
    <button type="button" className="cu-btn" disabled={loading || current <= 1} onClick={() => onPage(current - 1)}>Previous</button>
    <button type="button" className="cu-btn" disabled={loading || !result || current >= pages} onClick={() => onPage(current + 1)}>Next</button>
  </div>;
}
