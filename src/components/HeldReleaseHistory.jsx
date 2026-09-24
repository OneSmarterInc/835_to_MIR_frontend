import React, { useEffect, useMemo, useState } from "react";
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

function safeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function statusLabel(release) {
  const status = String(release?.sftp_status || "UNKNOWN").toUpperCase();
  if (status === "PUSHED") return "PUSHED";
  if (status === "PUSH_FAILED") return "PUSH FAILED";
  if (status === "GENERATED") return "NOT PUSHED";
  return status.replaceAll("_", " ");
}

export default function HeldReleaseHistory() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    safeFetchJson("/edi835/api/checks/held-releases/")
      .then(({ res, data }) => {
        if (!alive) return;
        if (!res.ok || !data?.success || !Array.isArray(data?.releases)) {
          throw new Error(data?.error || "Unable to load held-claim SFTP release history.");
        }
        setReleases(data.releases);
        setError("");
      })
      .catch((err) => {
        if (!alive) return;
        setReleases([]);
        setError(err?.message || "Unable to load held-claim SFTP release history.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [refreshKey]);

  const selectedRelease = useMemo(
    () => releases.find((release) => String(release.id) === String(selectedId)) || null,
    [releases, selectedId]
  );

  return (
    <section style={{ marginTop: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">HELD CLAIM RELEASES</div>
          <div style={{ color: "var(--ink-2)", fontSize: "13px", marginTop: "3px" }}>
            MIR batches created after duplicate holds become eligible and their outbound SFTP status.
          </div>
        </div>
        <button type="button" className="btn" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ padding: "14px 16px", marginBottom: "10px", color: "var(--ink-2)" }}>
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>RELEASE MIR FILE</th>
              <th>SFTP STATUS</th>
              <th>CLAIMS</th>
              <th>SERVICES</th>
              <th>COMPLETED</th>
              <th>DETAIL</th>
            </tr>
          </thead>
          <tbody>
            {loading && releases.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>Loading held-claim releases…</td></tr>
            ) : releases.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No held-claim MIR release files have been created yet.</td></tr>
            ) : releases.map((release) => {
              const selected = String(selectedId) === String(release.id);
              return (
                <tr key={release.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedId(selected ? "" : String(release.id))}
                      style={{ border: 0, background: "transparent", color: "inherit", padding: 0, font: "inherit", fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px" }}
                    >
                      {release.mir_filename || release.release_835_filename || "Release file unavailable"}
                    </button>
                  </td>
                  <td><span className="badge">{statusLabel(release)}</span></td>
                  <td className="num">{safeCount(release.claim_count).toLocaleString()}</td>
                  <td className="num">{safeCount(release.service_count).toLocaleString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(release.completed_at || release.created_at)}</td>
                  <td>
                    <button type="button" className="btn" onClick={() => setSelectedId(selected ? "" : String(release.id))}>
                      {selected ? "Close" : "View claims"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRelease && (
        <div className="card" style={{ marginTop: "14px", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <div>
              <div className="eyebrow">CLAIMS SENT IN HELD RELEASE MIR</div>
              <h3 style={{ margin: "4px 0 0", fontSize: "16px" }}>{selectedRelease.mir_filename || "Held release MIR"}</h3>
              <div style={{ marginTop: "5px", color: "var(--ink-2)", fontSize: "12px" }}>
                SFTP status: {statusLabel(selectedRelease)}
                {selectedRelease.error_message ? ` · ${selectedRelease.error_message}` : ""}
              </div>
            </div>
            <button type="button" className="btn" onClick={() => setSelectedId("")}>Close claims</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>CLAIM</th>
                  <th>HELD BACK FROM MIR</th>
                  <th>SOURCE 835</th>
                  <th>PREVIOUSLY SENT</th>
                  <th>ELIGIBLE</th>
                  <th>RELEASED</th>
                  <th>SERVICES</th>
                </tr>
              </thead>
              <tbody>
                {(selectedRelease.claims || []).length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: "22px", textAlign: "center", color: "var(--ink-3)" }}>No claim rows were recorded for this release file.</td></tr>
                ) : selectedRelease.claims.map((claim, index) => (
                  <tr key={`${claim.claim_control_number || claim.claim_number}-${index}`}>
                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{claim.claim_number || claim.claim_control_number || "—"}</td>
                    <td style={{ minWidth: "220px", fontWeight: 600 }}>{claim.held_from_mir || "—"}</td>
                    <td style={{ minWidth: "200px" }}>{claim.source_835_filename || "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.previous_sent_at)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.eligible_send_at)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.released_at || selectedRelease.completed_at)}</td>
                    <td className="num">{safeCount(claim.service_count).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
