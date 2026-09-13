import React, { useEffect, useMemo, useState } from "react";
import { safeFetchJson } from "../utils/api";
import ConversionErrorFindings from "../components/ConversionErrorFindings";
import HeldReleaseHistory from "../components/HeldReleaseHistory";
import MissingReferenceStatus from "../components/MissingReferenceStatus";
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
    Number(parts.day) + 4,
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

function buildHeldClaims(findings, recordedHeldCount = 0) {
  const blocking = (Array.isArray(findings) ? findings : []).filter(isBlockingConversionFinding);
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

  if (!blocking.length && Number(recordedHeldCount || 0) > 0) {
    for (let index = 0; index < Number(recordedHeldCount || 0); index += 1) {
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

  return [...groupedClaims.values()].map((claim) => ({
    ...claim,
    resolutionStatus: claim.hasResolvedNonDuplicate && !claim.hasUnresolvedNonDuplicate
      ? "RESOLVED"
      : "UNRESOLVED",
  }));
}

function AlertEmailHistory() {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    safeFetchJson("/edi835/api/checks/alert-emails/", { credentials: "include" })
      .then(({ res, data }) => {
        if (!res.ok || !data?.success) throw new Error(data?.error || "Unable to load alert email history.");
        setEmails(Array.isArray(data.emails) ? data.emails : []);
      })
      .catch((err) => {
        setEmails([]);
        setError(err?.message || "Unable to load alert email history.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const selected = emails.find((email) => String(email.id) === String(selectedId)) || null;
  const label = (email) => email?.category_label || (email?.category === "MISSING_REFERENCE" ? "Missing 837 / RECON" : "Conversion hold");

  return (
    <section style={{ marginTop: "10px" }}>
      <div className="card" style={{ padding: "14px 16px", marginBottom: "12px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">ALERT EMAIL AUDIT</div>
          <h3 style={{ margin: "4px 0", fontSize: "17px" }}>Sent claim alert emails</h3>
          <div style={{ color: "var(--ink-2)", fontSize: "12px" }}>Missing 837/RECON alerts and existing conversion-issue alerts.</div>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading}>Refresh</button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th>SENT</th><th>TYPE</th><th>SUBJECT</th><th>CLAIMS</th><th>RECIPIENTS</th><th>ACTION</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>Loading alert email history…</td></tr>
            ) : error ? (
              <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-2)" }}>{error}</td></tr>
            ) : emails.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No claim alert emails have been recorded yet.</td></tr>
            ) : emails.map((email) => (
              <tr key={email.id}>
                <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(email.sent_at)}</td>
                <td><span className="badge">{label(email)}</span></td>
                <td style={{ minWidth: "320px" }}>{email.subject || "—"}</td>
                <td className="num">{Number(email.claims?.length || 0).toLocaleString()}</td>
                <td style={{ minWidth: "220px" }}>{Array.isArray(email.recipients) && email.recipients.length ? email.recipients.join(", ") : "—"}</td>
                <td><button type="button" className="btn" onClick={() => setSelectedId(String(selectedId) === String(email.id) ? "" : String(email.id))}>{String(selectedId) === String(email.id) ? "Close" : "View email"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card" style={{ marginTop: "14px", padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
            <div className="eyebrow">{label(selected)}</div>
            <h3 style={{ margin: "4px 0", fontSize: "16px" }}>{selected.subject || "Alert email"}</h3>
            <div style={{ fontSize: "12px", color: "var(--ink-3)" }}>Sent {formatTimestamp(selected.sent_at)} · {selected.client_name || "Client"}</div>
            <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--ink-2)" }}><strong>Recipients:</strong> {selected.recipients?.length ? selected.recipients.join(", ") : "—"}</div>
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
              <thead><tr><th>CLAIM</th><th>HELD FROM 835</th><th>HELD SINCE</th><th>ALERT DAY</th><th>ISSUE</th></tr></thead>
              <tbody>{(selected.claims || []).map((claim, index) => (
                <tr key={`${claim.claim_number || "claim"}-${index}`}>
                  <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{claim.claim_number || "—"}</td>
                  <td>{claim.source_835_filename || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(claim.held_since)}</td>
                  <td>{claim.alert_number ? `${claim.alert_number}/${claim.alert_limit || 7}` : "—"}</td>
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

export default function ChecksView({ trackedFiles = [], showHeading = true }) {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeChecksTab, setActiveChecksTab] = useState("validations");
  const [conversionFiles, setConversionFiles] = useState([]);
  const [conversionFilesLoading, setConversionFilesLoading] = useState(false);
  const [conversionFilesError, setConversionFilesError] = useState("");
  const [selectedConversionFileId, setSelectedConversionFileId] = useState("");
  const [selectedConversionFile, setSelectedConversionFile] = useState(null);
  const [selectedConversionLoading, setSelectedConversionLoading] = useState(false);
  const [selectedConversionError, setSelectedConversionError] = useState("");

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

  useEffect(() => {
    if (activeChecksTab !== "conversion") return undefined;

    let alive = true;
    setConversionFilesLoading(true);
    setConversionFilesError("");

    safeFetchJson("/edi835/api/checks/conversion-holds/", { credentials: "include" })
      .then(({ res, data }) => {
        if (!alive) return;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Unable to load conversion hold history.");
        }
        setConversionFiles(Array.isArray(data.files) ? data.files : []);
      })
      .catch((err) => {
        if (!alive) return;
        setConversionFiles([]);
        setConversionFilesError(err?.message || "Unable to load conversion hold history.");
      })
      .finally(() => {
        if (alive) setConversionFilesLoading(false);
      });

    return () => { alive = false; };
  }, [activeChecksTab, trackedFiles]);

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

  const conversionHeldClaimsCount = useMemo(
    () => allFiles.reduce((sum, file) => sum + Number(file.held_claims_count || 0), 0),
    [allFiles]
  );

  const openConversionFindings = async (file) => {
    const fileId = String(file.id);
    setSelectedConversionFileId(fileId);
    setSelectedConversionFile({ ...file, _heldClaims: [] });
    setSelectedConversionLoading(true);
    setSelectedConversionError("");

    try {
      const { res, data } = await safeFetchJson(
        `/edi835/api/tracked-files/${encodeURIComponent(fileId)}/details/`,
        { credentials: "include" }
      );
      if (!res.ok || !data?.success || !data?.file) {
        throw new Error(data?.error || "Unable to load conversion findings.");
      }

      const detail = data.file;
      const heldClaims = buildHeldClaims(detail.conversion_findings, detail.held_claims_count);
      setSelectedConversionFile({
        ...file,
        ...detail,
        _heldClaims: heldClaims,
      });
    } catch (err) {
      setSelectedConversionError(err?.message || "Unable to load conversion findings.");
    } finally {
      setSelectedConversionLoading(false);
    }
  };

  const closeConversionFindings = () => {
    setSelectedConversionFileId("");
    setSelectedConversionFile(null);
    setSelectedConversionLoading(false);
    setSelectedConversionError("");
  };

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
      {showHeading && <WorkspaceHeader eyebrow="Validation workspace" title="Checks" description="Review validation failures, conversion holds, held-claim SFTP releases, missing 837/RECON claims, and alert-email history." />}

      <div className="checks-gate-grid" style={{ gap: "12px", alignItems: "stretch" }}>
        {gateCard({ gateKey: "gate1", eyebrow: "Gate 1 · Inbound", metrics: <>{row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "837 as received", currentClaims, "Number of claims read for the current run."))}{row("Findings", allFindings.length.toLocaleString(), () => openMetric("Findings", "837 as received", allFindings.length, "Validation findings currently recorded for this run."))}</>, footer: "The rule totals above come from the backend validation catalog, not from frontend constants." })}
        {gateCard({ gateKey: "gate2", eyebrow: "Gate 2 · Inbound", metrics: <>{row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "835 from the claims system", currentClaims, "Number of claims represented in the current run."))}{row("Findings", validationHeldCount ? `${validationHeldCount} held` : "0", () => openMetric("Findings", "835 from the claims system", validationHeldCount, "Files currently held because validation findings require attention."))}</>, footer: validationHeldCount ? `${validationHeldCount} file${validationHeldCount === 1 ? " is" : "s are"} held before MIR generation.` : "No 835 files are currently held at this gate." })}
        {gateCard({ gateKey: "gate3", eyebrow: "Gate 3 · Outbound", metrics: <>{row("Records written", currentRecords.toLocaleString(), () => openMetric("Records written", "MIR before it goes", currentRecords, "Number of MIR records written for the current run."))}{row("Conversion holds", conversionHeldClaimsCount.toLocaleString(), () => setActiveChecksTab("conversion"))}</>, footer: currentClaims ? `${Math.min(deliveredClaims || currentRecords, currentClaims).toLocaleString()} of ${currentClaims.toLocaleString()} delivered or prepared for delivery.` : "No completed MIR outputs are available yet." })}
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "18px", marginBottom: "10px", flexWrap: "wrap" }}>
        <button type="button" className={activeChecksTab === "validations" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("validations"); closeConversionFindings(); }}>Validations</button>
        <button type="button" className={activeChecksTab === "conversion" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("conversion"); setSelectedGroup(null); }}>Conversion</button>
        <button type="button" className={activeChecksTab === "held-releases" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("held-releases"); setSelectedGroup(null); closeConversionFindings(); }}>Held SFTP Releases</button>
        <button type="button" className={activeChecksTab === "missing-files" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("missing-files"); setSelectedGroup(null); closeConversionFindings(); }}>Missing Files</button>
        <button type="button" className={activeChecksTab === "alert-emails" ? "btn primary" : "btn"} onClick={() => { setActiveChecksTab("alert-emails"); setSelectedGroup(null); closeConversionFindings(); }}>Alert Emails</button>
      </div>

      {activeChecksTab === "validations" ? (
        <ConversionErrorFindings trackedFiles={validationErrorFiles} showHeading={false} />
      ) : activeChecksTab === "conversion" ? (
        <section style={{ marginTop: "10px" }}>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>835 FILE</th><th>STATUS</th><th>IMPORT MODE</th><th>HELD CLAIMS</th><th>PROCESSED</th><th>ACTION</th></tr></thead>
              <tbody>
                {conversionFilesLoading ? (
                  <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>Loading conversion hold history…</td></tr>
                ) : conversionFilesError ? (
                  <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-2)" }}>{conversionFilesError}</td></tr>
                ) : conversionFiles.length === 0 ? (
                  <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No files with conversion-held claims are currently recorded.</td></tr>
                ) : conversionFiles.map((file) => (
                  <tr key={file.id}>
                    <td style={{ fontWeight: 600 }}>{file.original_filename || file.stored_filename || "—"}</td>
                    <td><span className="badge">{String(file.status || "ARCHIVED").toUpperCase()}</span></td>
                    <td><span className="badge">{String(file.ingestion_source || "MANUAL").toUpperCase()}</span></td>
                    <td className="num">{Number(file.conversion_issue_count || file.held_claims_count || 0).toLocaleString()}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(file.processing_completed_at || file.uploaded_at)}</td>
                    <td><button type="button" className="btn" onClick={() => openConversionFindings(file)} style={{ whiteSpace: "nowrap" }}>View findings</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedConversionFileId && selectedConversionFile && (
            <div className="card" style={{ marginTop: "14px", padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div><div className="eyebrow">HELD CLAIMS FOR</div><h3 style={{ margin: "4px 0 0", fontSize: "16px" }}>{selectedConversionFile.original_filename || selectedConversionFile.stored_filename || "Conversion file"}</h3></div>
                <button type="button" className="btn" onClick={closeConversionFindings}>Close findings</button>
              </div>
              {selectedConversionLoading ? (
                <div style={{ padding: "24px", color: "var(--ink-3)" }}>Loading claim-level findings…</div>
              ) : selectedConversionError ? (
                <div style={{ padding: "24px", color: "var(--ink-2)" }}>{selectedConversionError}</div>
              ) : (
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
              )}
            </div>
          )}
        </section>
      ) : activeChecksTab === "held-releases" ? (
        <HeldReleaseHistory />
      ) : activeChecksTab === "missing-files" ? (
        <MissingReferenceStatus />
      ) : (
        <AlertEmailHistory />
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
