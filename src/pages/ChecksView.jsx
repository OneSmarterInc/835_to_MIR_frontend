import React, { useMemo, useState } from "react";

export default function ChecksView({ trackedFiles = [] }) {
  const [selectedFile, setSelectedFile] = useState(null);

  const parseErrorDetails = (raw) => {
    if (!raw) return { errors: [], findings: [] };
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); }
    catch (_) { return { errors: [String(raw)], findings: [] }; }
  };

  const errorFiles = useMemo(
    () => (trackedFiles || []).filter((file) => String(file.status || "").toUpperCase() === "ERROR"),
    [trackedFiles]
  );

  const findings = useMemo(() => {
    if (!selectedFile) return [];
    const details = parseErrorDetails(selectedFile.error_message);
    if (Array.isArray(details.findings) && details.findings.length) return details.findings;
    return (details.errors || []).map((message, index) => ({
      rule_code: "835-STRUCT",
      rule: "Validation finding",
      segment: "Unknown",
      what_found: typeof message === "string" ? message : JSON.stringify(message),
      source: "OneSmarter 835 structural validation",
      severity: "Hold",
      _index: index,
    }));
  }, [selectedFile]);

  return (
    <section className="view on table-screen">
      <h1>Checks</h1>
      <p className="sub">
        Review validation findings for files that require attention.
      </p>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
          <div className="eyebrow">Checks</div>
          <h2 style={{ margin: "3px 0 4px", fontSize: "17px" }}>Findings on this run</h2>
          <div style={{ fontSize: "12px", color: "var(--ink-2)" }}>
            Only files with an error status are shown. Select a file to see the rule, segment, finding, and source.
          </div>
        </div>

        {errorFiles.length === 0 ? (
          <div style={{ padding: "30px 20px", color: "var(--ink-3)" }}>
            No files with errors right now.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr><th>835 FILE</th><th>RUN</th><th>CLAIMS</th><th>STATUS</th><th>FINDINGS</th></tr>
              </thead>
              <tbody>
                {errorFiles.map((file) => {
                  const details = parseErrorDetails(file.error_message);
                  const count = details.findings?.length || details.errors?.length || 1;
                  return (
                    <tr key={file.id}>
                      <td style={{ fontWeight: 600 }}>{file.original_filename}</td>
                      <td className="num">R-{String(file.id).substring(0, 6).toUpperCase()}</td>
                      <td className="num">{file.claims_count || 0}</td>
                      <td><span className="tag bad">ERROR</span></td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: "5px 10px", fontSize: "11px" }}
                          onClick={() => setSelectedFile(file)}
                        >
                          View {count} finding{count === 1 ? "" : "s"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="card" style={{ marginTop: "16px", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
            <div>
              <div className="eyebrow">Where the rules come from</div>
              <h2 style={{ margin: "3px 0 0", fontSize: "16px" }}>{selectedFile.original_filename}</h2>
            </div>
            <button type="button" className="btn secondary" onClick={() => setSelectedFile(null)}>Close</button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr><th>RULE</th><th>SEGMENT</th><th>WHAT WE FOUND</th><th>SOURCE</th><th>SEVERITY</th></tr>
              </thead>
              <tbody>
                {findings.length ? findings.map((finding, index) => (
                  <tr key={(finding.rule_code || "835") + index}>
                    <td>
                      <div style={{ fontFamily: "var(--display)" }}>{finding.rule_code || "835-STRUCT"}</div>
                      <div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>{finding.rule || "Validation rule"}</div>
                    </td>
                    <td><span className="tag work">{finding.segment || "Unknown"}</span></td>
                    <td>{finding.what_found || "Validation failed."}</td>
                    <td>{finding.source || "OneSmarter 835 structural validation"}</td>
                    <td><span className="tag bad">{finding.severity || "Hold"}</span></td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)" }}>No findings are available for this error record.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
