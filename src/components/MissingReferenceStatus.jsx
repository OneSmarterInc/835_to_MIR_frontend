import React, { useEffect, useState } from "react";
import { safeFetchJson } from "../utils/api";

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

export default function MissingReferenceStatus() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    safeFetchJson("/edi835/api/checks/missing-references/", { credentials: "include" })
      .then(({ res, data }) => {
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Unable to load claims missing 837/RECON data.");
        }
        setClaims(Array.isArray(data.claims) ? data.claims : []);
      })
      .catch((err) => {
        setClaims([]);
        setError(err?.message || "Unable to load claims missing 837/RECON data.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <section style={{ marginTop: "10px" }}>
      <div className="card" style={{ padding: "14px 16px", marginBottom: "12px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">MISSING FILE MONITOR</div>
          <h3 style={{ margin: "4px 0", fontSize: "17px" }}>Claims missing from 837 / RECON</h3>
          <div style={{ color: "var(--ink-2)", fontSize: "12px" }}>
            Current unresolved claims, their arrival/send dates, next 5:30 PM ET alert, and emails already sent.
          </div>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading}>Refresh</button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>CLAIM</th>
              <th>MISSING IN</th>
              <th>CAME IN</th>
              <th>835 FILE</th>
              <th>MIR SENT</th>
              <th>NEXT EMAIL</th>
              <th>EMAILS SENT</th>
              <th>LAST EMAIL</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>Loading missing claims…</td></tr>
            ) : error ? (
              <tr><td colSpan="8" style={{ padding: "24px", textAlign: "center", color: "var(--ink-2)" }}>{error}</td></tr>
            ) : claims.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No pushed MIR claims are currently missing from 837 or RECON.</td></tr>
            ) : claims.map((claim, index) => (
              <tr key={`${claim.client_id || "client"}-${claim.claim_number || "claim"}-${index}`}>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{claim.claim_number || "—"}</td>
                <td><span className="badge">{claim.missing_in_label || claim.missing_in?.join(" and ") || "—"}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.came_in_at)}</td>
                <td style={{ minWidth: "180px" }}>{claim.source_835_filename || "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.sent_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div>{formatTimestamp(claim.next_email_at)}</div>
                  {claim.email_due && <div style={{ marginTop: "4px" }}><span className="badge">DUE</span></div>}
                </td>
                <td className="num" style={{ fontWeight: 700 }}>{Number(claim.email_count || 0).toLocaleString()}</td>
                <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.last_email_sent_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
