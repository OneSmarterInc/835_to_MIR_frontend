import React, { useEffect, useMemo, useState } from "react";
import { safeFetchJson } from "../utils/api";
import ConversionErrorFindings from "../components/ConversionErrorFindings";
import HeldReleaseHistory from "../components/HeldReleaseHistory";
import WorkspaceHeader from "../components/WorkspaceHeader";

function parseDetails(raw) {
  if (!raw) return { findings: [], errors: [] };
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); }
  catch (_) { return { findings: [], errors: [String(raw)] }; }
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

function formatDuplicateEligibleTimestamp(previousSentAt, fallbackEligibleSendAt) {
  if (!previousSentAt) return formatTimestamp(fallbackEligibleSendAt);
  const parsed = new Date(previousSentAt);
  if (Number.isNaN(parsed.getTime())) return formatTimestamp(fallbackEligibleSendAt);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(parsed).map((part) => [part.type, part.value])
  );
  const fourthDay = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + 3,
    12,
    0,
    0
  ));
  const year = fourthDay.getUTCFullYear();
  const month = String(fourthDay.getUTCMonth() + 1).padStart(2, "0");
  const day = String(fourthDay.getUTCDate()).padStart(2, "0");
  const zoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(fourthDay).find((part) => part.type === "timeZoneName")?.value || "ET";

  return `${month}/${day}/${year}, 05:30:00 PM ${zoneName}`;
}

function isBlockingConversionFinding(finding) {
  const severity = String(finding?.severity || "").toUpperCase();
  return severity === "HOLD" || severity === "REFUSE";
}

function isDuplicateFinding(finding) {
  const code = String(finding?.rule_code || finding?.rule_name || "").toUpperCase();
  return code.startsWith("DUPLICATE");
}

export default function ChecksView({ trackedFiles = [], showHeading = true }) {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeChecksTab, setActiveChecksTab] = useState("validations");
  const [selectedConversionFileId, setSelectedConversionFileId] = useState("");

  useEffect(() => {
    let alive = true;
    safeFetchJson("/edi835/api/checks/catalog/")
      .then(({ res, data }) => {
        if (!alive) return;
        if (!res.ok || !data?.success || !data?.catalog) {
          throw new Error(data?.error || "Unable to load validation catalog.");
        }
        setCatalog(data.catalog);
        setCatalogError("");
      })
      .catch((err) => {
        if (!alive) return;
        setCatalog(null);
        setCatalogError(err?.message || "Unable to load validation catalog.");
      });
    return () => { alive = false; };
  }, []);

  const allFiles = useMemo(
    () => [...(trackedFiles || [])].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0)),
    [trackedFiles]
  );

  const currentRun = allFiles[0] || null;
  const currentClaims = Number(currentRun?.claims_count || 0);
  const currentRecords = Number(currentRun?.records_count || 0);

  const validationErrorFiles = useMemo(
    () => allFiles.filter((file) => (
      String(file.status || "").toUpperCase() === "ERROR"
      && Number(file.held_claims_count || 0) === 0
    )),
    [allFiles]
  );

  const validationHeldCount = validationErrorFiles.length;
  const completedFiles = allFiles.filter((file) => ["ARCHIVED", "COMPLETED"].includes(String(file.status || "").toUpperCase()));
  const deliveredClaims = completedFiles.reduce((sum, file) => sum + Number(file.delivered_claims_count ?? file.claims_count ?? 0), 0);

  const allFindings = useMemo(() => validationErrorFiles.flatMap((file) => {
    const details = parseDetails(file.error_message);
    if (Array.isArray(details.findings) && details.findings.length) return details.findings;
    return (details.errors || []).map((message) => ({
      rule_code: "VALIDATION",
      rule: "Validation finding",
      segment: "Unknown",
      what_found: typeof message === "string" ? message : JSON.stringify(message),
      source: "OneSmarter validation",
      severity: "Hold",
    }));
  }), [validationErrorFiles]);

  const conversionFiles = useMemo(() => {
    return allFiles.map((file) => {
      const findings = Array.isArray(file.conversion_findings) ? file.conversion_findings : [];
      const blocking = findings.filter(isBlockingConversionFinding);
      const groupedClaims = new Map();

      blocking.forEach((finding, index) => {
        const claimNumber = finding.claim_number || finding.claim_control_number || `Held claim ${index + 1}`;
        const groupKey = finding.claim_index ? `${claimNumber}:claim-index:${finding.claim_index}` : claimNumber;
        const existing = groupedClaims.get(groupKey) || {
          claimNumber,
          reasons: [],
          previousMirFilename: null,
          previousSentAt: null,
          eligibleSendAt: null,
          resolvedMirFilename: null,
          resolvedAt: null,
          resolvedSource835Filename: null,
          alertCount: 0,
          lastAlertSentAt: null,
          hasResolvedNonDuplicate: false,
          hasUnresolvedNonDuplicate: false,
        };
        const code = finding.rule_code || finding.rule_name || "Conversion hold";
        const reason = finding.reason || finding.message || "Claim requires conversion review.";
        existing.reasons.push(`${code}: ${reason}`);
        if (finding.previous_mir_filename) existing.previousMirFilename = finding.previous_mir_filename;
        if (finding.previous_sent_at) existing.previousSentAt = finding.previous_sent_at;
        if (finding.eligible_send_at) existing.eligibleSendAt = finding.eligible_send_at;
        if (finding.hold_resolved_mir_filename) existing.resolvedMirFilename = finding.hold_resolved_mir_filename;
        if (finding.hold_resolved_at) existing.resolvedAt = finding.hold_resolved_at;
        if (finding.hold_resolved_source_835_filename) existing.resolvedSource835Filename = finding.hold_resolved_source_835_filename;
        existing.alertCount = Math.max(existing.alertCount, Number(finding.seven_day_hold_alert_count || 0));
        if (finding.seven_day_hold_last_alert_sent_at) existing.lastAlertSentAt = finding.seven_day_hold_last_alert_sent_at;

        if (!isDuplicateFinding(finding)) {
          if (String(finding.hold_resolution_status || "").toUpperCase() === "RESOLVED") {
            existing.hasResolvedNonDuplicate = true;
          } else {
            existing.hasUnresolvedNonDuplicate = true;
          }
        }
        groupedClaims.set(groupKey, existing);
      });

      const recordedHeldCount = Number(file.held_claims_count || 0);
      if (!blocking.length && recordedHeldCount > 0) {
        for (let index = 0; index < recordedHeldCount; index += 1) {
          groupedClaims.set(`unknown-${index}`, {
            claimNumber: "Claim number unavailable",
            reasons: ["Conversion hold details were not recorded for this historical run."],
            previousMirFilename: null,
            previousSentAt: null,
            eligibleSendAt: null,
            resolvedMirFilename: null,
            resolvedAt: null,
            resolvedSource835Filename: null,
            alertCount: 0,
            lastAlertSentAt: null,
            hasResolvedNonDuplicate: false,
            hasUnresolvedNonDuplicate: true,
          });
        }
      }

      const heldClaims = [...groupedClaims.values()].map((claim) => ({
        ...claim,
        resolutionStatus: claim.hasResolvedNonDuplicate && !claim.hasUnresolvedNonDuplicate
          ? "RESOLVED"
          : "UNRESOLVED",
      }));
      const unresolvedCount = heldClaims.filter((claim) => claim.resolutionStatus !== "RESOLVED").length;

      return {
        ...file,
        _heldClaims: heldClaims,
        _issueCount: heldClaims.length,
        _heldCount: recordedHeldCount || unresolvedCount,
        _unresolvedCount: unresolvedCount,
      };
    })
      .filter((file) => file._issueCount > 0 || file._heldCount > 0)
      .sort((a, b) => new Date(b.processing_completed_at || b.uploaded_at || 0) - new Date(a.processing_completed_at || a.uploaded_at || 0));
  }, [allFiles]);

  const selectedConversionFile = conversionFiles.find(
    (file) => String(file.id) === String(selectedConversionFileId)
  ) || null;

  const conversionHeldClaimsCount = conversionFiles.reduce((sum, file) => sum + Number(file._heldCount || 0), 0);

  const openMetric = (title, gate, value, description) => {
    setSelectedGroup({ title, gate, count: value, unit: "", description, source: "Current run", rules: [], findings: [] });
  };

  const row = (label, value, onClick) => (
    <button type="button" onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", padding: "6px 0", border: 0, borderBottom: "1px solid var(--line)", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}>
      <span style={{ fontSize: "13px" }}>{label}</span>
      <span className="num" style={{ whiteSpace: "nowrap", fontWeight: 600, color: "inherit", fontSize: "13px", textDecoration: "underline", textUnderlineOffset: "3px", textDecorationThickness: "1px" }}>{value}</span>
    </button>
  );

  const groupRows = (gateKey) => {
    const groups = catalog?.[gateKey]?.groups || [];
    if (!catalog && !catalogError) return <div style={{ padding: "7px 0", color: "var(--ink-3)", fontSize: "12px" }}>Loading active checks…</div>;
    if (catalogError) return <div style={{ padding: "7px 0", color: "var(--ink-2)", fontSize: "12px" }}>Validation catalog unavailable — no rule totals are being guessed.</div>;
    return groups.map((group) => row(group.title, `${Number(group.count || 0).toLocaleString()} ${group.unit || "rules"}`, () => setSelectedGroup({ ...group, gate: catalog?.[gateKey]?.title || gateKey, findings: [] })));
  };

  const gateCard = ({ gateKey, eyebrow, footer, metrics }) => {
    const gate = catalog?.[gateKey] || {};
    return (
      <div className="card checks-gate-card" style={{ padding: 0, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "13px 16px 10px" }}>
          <div className="eyebrow" style={{ fontSize: "10px" }}>{eyebrow}</div>
          <h2 style={{ margin: "4px 0 2px", fontSize: "16px" }}>{gate.title || (gateKey === "gate1" ? "837 as received" : gateKey === "gate2" ? "835 from the claims system" : "MIR before it goes")}</h2>
          <div style={{ color: "var(--ink-2)", fontSize: "12px" }}>{gate.subtitle || "Active validation checks"}</div>
        </div>
        <div style={{ padding: "7px 16px 8px", borderTop: "1px solid var(--line)", flex: "1 1 auto" }}>{groupRows(gateKey)}{metrics}</div>
        <div style={{ padding: "9px 16px", borderTop: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", fontSize: "12px", lineHeight: 1.35, minHeight: "44px", display: "flex", alignItems: "center" }}>{footer}</div>
      </div>
    );
  };

  return (
    <section className="view on table-screen">
      {showHeading && <WorkspaceHeader eyebrow="Validation workspace" title="Checks" description="Review validation failures, claim-level conversion holds, and held-claim SFTP releases." />}

      <div className="checks-gate-grid" style={{ gap: "12px", alignItems: "stretch" }}>
        {gateCard({ gateKey: "gate1", eyebrow: "Gate 1 · Inbound", metrics: <>{row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "837 as received", currentClaims, "Number of claims read for the current run."))}{row("Findings", allFindings.length.toLocaleString(), () => openMetric("Findings", "837 as received", allFindings.length, "Validation findings currently recorded for this run."))}</>, footer: "The rule totals above come from the backend validation catalog, not from frontend constants." })}
        {gateCard({ gateKey: "gate2", eyebrow: "Gate 2 · Inbound", metrics: <>{row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "835 from the claims system", currentClaims, "Number of claims represented in the current run."))}{row("Findings", validationHeldCount ? `${validationHeldCount} held` : "0", () => openMetric("Findings", "835 from the claims system", validationHeldCount, "Files currently held because validation findings require attention."))}</>, footer: validationHeldCount ? `${validationHeldCount} file${validationHeldCount === 1 ? " is" : "s are"} held before MIR generation.` : "No 835 files are currently held at this gate." })}
        {gateCard({ gateKey: "gate3", eyebrow: "Gate 3 · Outbound", metrics: <>{row("Records written", currentRecords.toLocaleString(), () => openMetric("Records written", "MIR before it goes", currentRecords, "Number of MIR records written for the current run."))}{row("Conversion holds", conversionHeldClaimsCount.toLocaleString(), () => setActiveChecksTab("conversion"))}</>, footer: currentClaims ? `${Math.min(deliveredClaims || currentRecords, currentClaims).toLocaleString()} of ${currentClaims.toLocaleString()} delivered or prepared for delivery.` : "No completed MIR outputs are available yet." })}
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "18px", marginBottom: "10px", flexWrap: "wrap" }}>
        <button type="button" className={activeChecksTab === "validations" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("validations"); setSelectedConversionFileId(""); }}>Validations</button>
        <button type="button" className={activeChecksTab === "conversion" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("conversion"); setSelectedGroup(null); }}>Conversion</button>
        <button type="button" className={activeChecksTab === "held-releases" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("held-releases"); setSelectedGroup(null); setSelectedConversionFileId(""); }}>Held SFTP Releases</button>
      </div>

      {activeChecksTab === "validations" ? (
        <ConversionErrorFindings trackedFiles={validationErrorFiles} showHeading={false} />
      ) : activeChecksTab === "conversion" ? (
        <section style={{ marginTop: "10px" }}>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>835 FILE</th><th>STATUS</th><th>IMPORT MODE</th><th>HELD CLAIMS</th><th>PROCESSED</th><th>ACTION</th></tr></thead>
              <tbody>
                {conversionFiles.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No files with conversion-held claims are currently recorded.</td></tr>
                ) : conversionFiles.map((file) => (
                  <tr key={file.id}>
                    <td style={{ fontWeight: 600 }}>{file.original_filename || file.stored_filename || "—"}</td>
                    <td><span className="badge">{String(file.status || "ARCHIVED").toUpperCase()}</span></td>
                    <td><span className="badge">{String(file.ingestion_source || "MANUAL").toUpperCase()}</span></td>
                    <td className="num">{Number(file._heldCount || 0).toLocaleString()}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(file.processing_completed_at || file.uploaded_at)}</td>
                    <td><button type="button" className="btn" onClick={() => setSelectedConversionFileId(String(file.id))} style={{ whiteSpace: "nowrap" }}>View findings</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedConversionFile && (
            <div className="card" style={{ marginTop: "14px", padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div><div className="eyebrow">HELD CLAIMS FOR</div><h3 style={{ margin: "4px 0 0", fontSize: "16px" }}>{selectedConversionFile.original_filename || selectedConversionFile.stored_filename || "Conversion file"}</h3></div>
                <button type="button" className="btn" onClick={() => setSelectedConversionFileId("")}>Close findings</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th>CLAIM</th><th>RESOLUTION</th><th>HOLD REASON</th><th>PREVIOUS MIR FILE</th><th>PREVIOUSLY SENT</th><th>ELIGIBLE TO SEND</th></tr></thead>
                  <tbody>
                    {selectedConversionFile._heldClaims.length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: "22px", textAlign: "center", color: "var(--ink-3)" }}>Held claim details are not available for this historical file.</td></tr>
                    ) : selectedConversionFile._heldClaims.map((claim, index) => (
                      <tr key={`${claim.claimNumber}-${index}`}>
                        <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{claim.claimNumber}</td>
                        <td style={{ minWidth: "210px" }}>
                          <span className="badge">{claim.resolutionStatus}</span>
                          {claim.resolutionStatus === "RESOLVED" ? (
                            <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ink-3)", lineHeight: 1.45 }}>
                              {claim.resolvedMirFilename && <div>Resolved in: {claim.resolvedMirFilename}</div>}
                              {claim.resolvedAt && <div>{formatTimestamp(claim.resolvedAt)}</div>}
                            </div>
                          ) : claim.alertCount > 0 ? (
                            <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ink-3)" }}>
                              Daily alerts: {claim.alertCount}/7
                            </div>
                          ) : null}
                        </td>
                        <td style={{ minWidth: "360px" }}>{[...new Set(claim.reasons)].map((reason, reasonIndex) => <div key={`${claim.claimNumber}-${reasonIndex}`} style={{ marginBottom: reasonIndex === claim.reasons.length - 1 ? 0 : "5px" }}>{reason}</div>)}</td>
                        <td style={{ minWidth: "220px", fontWeight: 600 }}>{claim.previousMirFilename || "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.previousSentAt)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{formatDuplicateEligibleTimestamp(claim.previousSentAt, claim.eligibleSendAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : (
        <HeldReleaseHistory />
      )}

      {selectedGroup && activeChecksTab === "validations" && (
        <div role="dialog" aria-modal="true" aria-label={`${selectedGroup.title} details`} onClick={() => setSelectedGroup(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card" onClick={(event) => event.stopPropagation()} style={{ width: "min(980px, 100%)", maxHeight: "80vh", overflow: "auto", padding: 0, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
              <div><div className="eyebrow">{selectedGroup.gate}</div><h2 style={{ margin: "5px 0 3px", fontSize: "20px" }}>{selectedGroup.title}</h2><div style={{ color: "var(--ink-2)", fontSize: "13px" }}>{Number(selectedGroup.count || 0).toLocaleString()} {selectedGroup.unit || ""}</div></div>
              <button type="button" className="btn" onClick={() => setSelectedGroup(null)}>Close</button>
            </div>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{selectedGroup.description || "Current validation information."}</p>
              {selectedGroup.source && <div style={{ marginTop: "8px", color: "var(--ink-3)", fontSize: "12px" }}>Source: {selectedGroup.source}</div>}
            </div>
            {Array.isArray(selectedGroup.rules) && selectedGroup.rules.length > 0 && (
              <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>CHECK</th><th>SEGMENT / SCOPE</th><th>WHAT IT ENFORCES</th><th>SEVERITY</th></tr></thead><tbody>{selectedGroup.rules.map((rule, index) => <tr key={`${rule.code || "rule"}-${index}`}><td><div style={{ fontWeight: 700 }}>{rule.code || "CHECK"}</div><div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>{rule.name || "Validation check"}</div></td><td>{rule.segment || "—"}</td><td>{rule.description || "—"}</td><td>{rule.severity || "Active"}</td></tr>)}</tbody></table></div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
