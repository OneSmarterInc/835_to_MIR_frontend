import React, { useEffect, useMemo, useState } from "react";
import { safeFetchJson } from "../utils/api";

function easternToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function categoryLabel(email) {
  return email?.category_label || (email?.category === "MISSING_REFERENCE" ? "Missing 837 / RECON" : "Conversion hold");
}

function statusLabel(email) {
  return String(email?.status || "NOT_SENT").toUpperCase() === "SENT" ? "SENT" : "NOT SENT";
}

export default function AlertEmailSchedule({ clientId = "" }) {
  const [selectedDate, setSelectedDate] = useState(easternToday);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setSelectedId("");

    const params = new URLSearchParams({ date: selectedDate });
    if (clientId) params.set("client_id", String(clientId));

    safeFetchJson(`/edi835/api/checks/alert-emails/?${params.toString()}`, { credentials: "include" })
      .then(({ res, data }) => {
        if (!alive) return;
        if (!res.ok || !data?.success) throw new Error(data?.error || "Unable to load scheduled alert emails.");
        setEmails(Array.isArray(data.emails) ? data.emails : []);
      })
      .catch((err) => {
        if (!alive) return;
        setEmails([]);
        setError(err?.message || "Unable to load scheduled alert emails.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [selectedDate, clientId, refreshKey]);

  const selected = useMemo(
    () => emails.find((email) => String(email.id) === String(selectedId)) || null,
    [emails, selectedId]
  );

  return (
    <section style={{ marginTop: "10px" }}>
      <div className="card" style={{ padding: "14px 16px", marginBottom: "12px", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">ALERT EMAIL SCHEDULE</div>
          <h3 style={{ margin: "4px 0", fontSize: "17px" }}>Scheduled claim alert emails</h3>
          <div style={{ color: "var(--ink-2)", fontSize: "12px" }}>
            Select an Eastern-calendar date to see the emails and claims scheduled for that day. Historical rows show whether delivery was actually sent.
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: "5px", fontSize: "12px", fontWeight: 600 }}>
            Date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              style={{ minHeight: "36px", padding: "6px 9px", border: "1px solid var(--line)", borderRadius: "4px", background: "var(--surface)", color: "inherit" }}
            />
          </label>
          <button type="button" className="btn" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ padding: "14px 16px", marginBottom: "12px", color: "var(--ink-2)" }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th>STATUS</th><th>SCHEDULED</th><th>TYPE</th><th>SUBJECT</th><th>CLAIMS</th><th>RECIPIENTS</th><th>ACTION</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>Loading scheduled alerts…</td></tr>
            ) : emails.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No alert email is scheduled for this client on the selected date.</td></tr>
            ) : emails.map((email) => {
              const isSelected = String(email.id) === String(selectedId);
              return (
                <tr key={email.id}>
                  <td><span className="badge">{statusLabel(email)}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(email.sent_at || email.scheduled_at)}</td>
                  <td><span className="badge">{categoryLabel(email)}</span></td>
                  <td style={{ minWidth: "320px" }}>{email.subject || "—"}</td>
                  <td className="num">{Number(email.claims?.length || 0).toLocaleString()}</td>
                  <td style={{ minWidth: "220px" }}>{Array.isArray(email.recipients) && email.recipients.length ? email.recipients.join(", ") : "—"}</td>
                  <td><button type="button" className="btn" onClick={() => setSelectedId(isSelected ? "" : String(email.id))}>{isSelected ? "Close" : "View claims"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card" style={{ marginTop: "14px", padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div className="eyebrow">{categoryLabel(selected)}</div>
              <h3 style={{ margin: "4px 0", fontSize: "16px" }}>{selected.subject || "Alert email"}</h3>
              <div style={{ fontSize: "12px", color: "var(--ink-3)" }}>
                <strong>{statusLabel(selected)}</strong> · {selected.status === "SENT" ? `Sent ${formatTimestamp(selected.sent_at)}` : `Scheduled ${formatTimestamp(selected.scheduled_at)}`}
              </div>
              <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--ink-2)" }}><strong>Recipients:</strong> {selected.recipients?.length ? selected.recipients.join(", ") : "—"}</div>
              {selected.error_message && <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--ink-2)" }}><strong>Last delivery error:</strong> {selected.error_message}</div>}
            </div>
            <button type="button" className="btn" onClick={() => setSelectedId("")}>Close</button>
          </div>

          {selected.category === "MISSING_REFERENCE" ? (
            <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>CLAIM</th><th>MISSING IN</th><th>MIR SENT</th><th>MIR FILE</th><th>7-DAY ELIGIBLE</th></tr></thead>
              <tbody>{(selected.claims || []).map((claim, index) => (
                <tr key={`${claim.claim_number || "claim"}-${index}`}>
                  <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{claim.claim_number || "—"}</td>
                  <td>{claim.missing_in_label || (Array.isArray(claim.missing_in) ? claim.missing_in.join(" and ") : "—")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.sent_at)}</td>
                  <td>{claim.mir_filename || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.eligible_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>CLAIM</th><th>HELD FROM 835</th><th>HELD SINCE</th><th>DAYS HELD</th><th>ALERT DAY</th><th>ISSUE</th></tr></thead>
              <tbody>{(selected.claims || []).map((claim, index) => (
                <tr key={`${claim.claim_number || "claim"}-${index}`}>
                  <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{claim.claim_number || "—"}</td>
                  <td>{claim.source_835_filename || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.held_since)}</td>
                  <td className="num">{Number(claim.days_held || 0).toLocaleString()}</td>
                  <td>{claim.alert_number ? `${claim.alert_number}/${claim.alert_limit || "∞"}` : "—"}</td>
                  <td style={{ minWidth: "340px" }}>{Array.isArray(claim.reasons) && claim.reasons.length ? claim.reasons.join("; ") : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
