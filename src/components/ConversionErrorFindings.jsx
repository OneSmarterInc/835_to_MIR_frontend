import React, { useMemo, useState } from "react";
import TimeDisplay from "./TimeDisplay";

function parseDetails(raw) {
  if (!raw) return { findings: [], errors: [] };
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); }
  catch (_) { return { findings: [], errors: [String(raw)] }; }
}

function normalizeFinding(item, index) {
  if (typeof item === "string") {
    return {
      key: `error-${index}`,
      rule: "VALIDATION",
      gate: "835",
      checks: item,
      source: "OneSmarter validation",
      severity: "HOLD",
    };
  }

  const finding = item || {};
  return {
    key: `${finding.rule_code || finding.rule || "finding"}-${index}`,
    rule: finding.rule_code || finding.code || finding.rule || "VALIDATION",
    gate: finding.gate || finding.file_type || finding.segment || "835",
    checks: finding.what_found || finding.reason || finding.detail || finding.message || finding.description || finding.rule || "Validation finding",
    source: finding.source || finding.standard || "OneSmarter validation",
    severity: String(finding.severity || finding.action || "HOLD").toUpperCase(),
  };
}

function findingsForFile(file) {
  const direct = Array.isArray(file?.conversion_findings) ? file.conversion_findings : [];
  const details = parseDetails(file?.error_message);
  const parsedFindings = Array.isArray(details.findings) ? details.findings : [];
  const parsedErrors = Array.isArray(details.errors) ? details.errors : [];
  return [...direct, ...parsedFindings, ...parsedErrors].map(normalizeFinding);
}

function severityBadgeStyle(value) {
  const severity = String(value || "").toUpperCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "72px",
    padding: "4px 9px",
    borderRadius: "4px",
    fontSize: "10.5px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    border: "1px solid transparent",
  };

  if (severity === "ERROR" || severity === "REFUSE" || severity === "FAILED" || severity === "FAIL") {
    return {
      ...base,
      background: "#FDE8E6",
      color: "#B42318",
      borderColor: "#F7C9C4",
    };
  }

  if (severity === "HOLD") {
    return {
      ...base,
      background: "#FFF3D6",
      color: "#A15C00",
      borderColor: "#F3D9A5",
    };
  }

  if (severity === "WARN" || severity === "WARNING") {
    return {
      ...base,
      background: "#FFF8CC",
      color: "#7A6100",
      borderColor: "#E8DB8E",
    };
  }

  if (severity === "INFO" || severity === "ACTIVE") {
    return {
      ...base,
      background: "#E8F1FF",
      color: "#245EA8",
      borderColor: "#C9DCF7",
    };
  }

  if (severity === "PASS" || severity === "OK" || severity === "SUCCESS") {
    return {
      ...base,
      background: "#E4F5EE",
      color: "#087A5A",
      borderColor: "#BFE5D8",
    };
  }

  return {
    ...base,
    background: "#EEF1F5",
    color: "#526174",
    borderColor: "#D7DEE7",
  };
}

function statusBadgeStyle(value) {
  const status = String(value || "").toUpperCase();
  if (status === "ERROR" || status === "PARTIAL") {
    return severityBadgeStyle("ERROR");
  }
  if (status === "PROCESSING" || status === "HOLD") {
    return severityBadgeStyle("HOLD");
  }
  if (status === "ARCHIVED" || status === "COMPLETED") {
    return severityBadgeStyle("SUCCESS");
  }
  return severityBadgeStyle("INFO");
}

export default function ConversionErrorFindings({ trackedFiles = [] }) {
  const [selectedFileId, setSelectedFileId] = useState("");

  const errorFiles = useMemo(() => {
    return [...(trackedFiles || [])]
      .map((file) => ({ ...file, _findings: findingsForFile(file) }))
      .filter((file) => {
        const status = String(file.status || "").toUpperCase();
        return status === "ERROR" || status === "PARTIAL" || file._findings.length > 0;
      })
      .sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
  }, [trackedFiles]);

  const selectedFile = errorFiles.find((file) => String(file.id) === String(selectedFileId)) || null;

  return (
    <section style={{ marginTop: "18px" }}>
      <div style={{ marginBottom: "8px" }}>
        <div className="eyebrow">CONVERSION ERRORS</div>
        <h2 style={{ margin: "4px 0", fontSize: "18px" }}>Files with findings</h2>
        <div style={{ color: "var(--ink-2)", fontSize: "12px" }}>
          Files that were held, failed, or produced conversion findings. Select View findings to inspect the exact errors.
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>835 FILE</th>
              <th>STATUS</th>
              <th>CLAIMS</th>
              <th>FINDINGS</th>
              <th>PROCESSED (ET)</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {errorFiles.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No conversion files with errors or findings.</td></tr>
            ) : errorFiles.map((file) => (
              <tr key={file.id}>
                <td style={{ fontWeight: 600 }}>{file.original_filename || file.stored_filename || "—"}</td>
                <td>
                  <span style={statusBadgeStyle(file.status)}>{String(file.status || "ERROR").toUpperCase()}</span>
                </td>
                <td className="num">{Number(file.claims_count || 0).toLocaleString()}</td>
                <td className="num">{file._findings.length.toLocaleString()}</td>
                <td><TimeDisplay value={file.processing_completed_at || file.uploaded_at} includeSeconds easternOnly /></td>
                <td>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setSelectedFileId(String(file.id))}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    View findings
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedFile && (
        <div className="card" style={{ marginTop: "14px", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <div className="eyebrow">FINDINGS FOR</div>
              <h3 style={{ margin: "4px 0 0", fontSize: "16px" }}>{selectedFile.original_filename || selectedFile.stored_filename || "Conversion file"}</h3>
            </div>
            <button type="button" className="btn secondary" onClick={() => setSelectedFileId("")}>Close findings</button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>RULE</th>
                  <th>GATE</th>
                  <th>CHECKS / ERROR</th>
                  <th>SOURCE</th>
                  <th>SEVERITY</th>
                </tr>
              </thead>
              <tbody>
                {selectedFile._findings.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: "22px", textAlign: "center", color: "var(--ink-3)" }}>This file is marked as an error, but no structured finding details were recorded.</td></tr>
                ) : selectedFile._findings.map((finding) => (
                  <tr key={finding.key}>
                    <td style={{ fontWeight: 600 }}>{finding.rule}</td>
                    <td>{finding.gate}</td>
                    <td>{finding.checks}</td>
                    <td>{finding.source}</td>
                    <td>
                      <span style={severityBadgeStyle(finding.severity)}>{finding.severity}</span>
                    </td>
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
