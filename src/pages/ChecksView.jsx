import React, { useMemo, useState } from "react";

export default function ChecksView({ trackedFiles = [], showHeading = true }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedRuleGroup, setSelectedRuleGroup] = useState(null);

  const parseErrorDetails = (raw) => {
    if (!raw) return { errors: [], findings: [] };
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); }
    catch (_) { return { errors: [String(raw)], findings: [] }; }
  };

  const allFiles = useMemo(() => [...(trackedFiles || [])].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0)), [trackedFiles]);
  const errorFiles = useMemo(() => allFiles.filter((file) => String(file.status || "").toUpperCase() === "ERROR"), [allFiles]);
  const currentRun = allFiles[0] || null;
  const completedFiles = allFiles.filter((file) => ["ARCHIVED", "COMPLETED"].includes(String(file.status || "").toUpperCase()));
  const currentClaims = Number(currentRun?.claims_count || 0);
  const currentRecords = Number(currentRun?.records_count || 0);
  const checkedAt = currentRun?.processing_completed_at || currentRun?.uploaded_at;
  const formatCheckedTime = (value) => {
    if (!value) return "Not checked yet";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not checked yet" : date.toLocaleString([], { hour: "2-digit", minute: "2-digit" });
  };
  const allFindings = useMemo(() => allFiles.flatMap((file) => {
    const details = parseErrorDetails(file.error_message);
    if (Array.isArray(details.findings) && details.findings.length) return details.findings;
    return (details.errors || []).map((message) => ({ rule_code: "835-STRUCT", segment: "Unknown", rule: "Validation finding", source: "OneSmarter 835 structural validation", severity: "Hold", what_found: typeof message === "string" ? message : JSON.stringify(message) }));
  }), [allFiles]);
  const countFindings = (...needles) => allFindings.filter((finding) => {
    const haystack = [finding.rule_code, finding.rule, finding.segment, finding.source, finding.what_found].join(" ").toLowerCase();
    return needles.some((needle) => haystack.includes(needle.toLowerCase()));
  }).length;
  const groupMatchers = {
    envelope: ["envelope", "isa", "iea", "gs", "ge", "st/se", "se01", "control number"],
    segment: ["segment", "clp", "bpr", "trn", "n1"],
    element: ["element", "clp01", "mandatory"],
    balancing: ["balance", "cross-foot", "amount", "payment"],
    reference: ["837", "reference"],
    mir: ["mir", "record", "layout"],
  };
  const findingsForGroup = (groupKey) => {
    const needles = groupMatchers[groupKey] || [];
    return allFindings.filter((finding) => {
      const haystack = [finding.rule_code, finding.rule, finding.segment, finding.source, finding.what_found].join(" ").toLowerCase();
      return needles.some((needle) => haystack.includes(needle.toLowerCase()));
    });
  };
  const envelopeFindings = findingsForGroup("envelope").length;
  const segmentFindings = findingsForGroup("segment").length;
  const elementFindings = findingsForGroup("element").length;
  const balancingFindings = findingsForGroup("balancing").length;
  const referenceFindings = findingsForGroup("reference").length;
  const mirFindings = findingsForGroup("mir").length;
  const heldCount = errorFiles.length;
  const deliveredClaims = completedFiles.reduce((sum, file) => sum + Number(file.claims_count || 0), 0);
  const selectedGroupFindings = selectedRuleGroup ? findingsForGroup(selectedRuleGroup.key) : [];
  const openRuleGroup = (key, title) => {
    if (findingsForGroup(key).length) setSelectedRuleGroup({ key, title });
  };
  const clickableRow = (label, value, groupKey, title) => (
    <div
      key={label}
      role={groupKey && value ? "button" : undefined}
      tabIndex={groupKey && value ? 0 : undefined}
      onClick={() => groupKey && value && openRuleGroup(groupKey, title || label)}
      onKeyDown={(event) => {
        if (groupKey && value && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openRuleGroup(groupKey, title || label);
        }
      }}
      style={{
        display: "flex", justifyContent: "space-between", padding: "8px 0",
        borderBottom: "1px solid var(--line)", fontSize: "13px",
        cursor: groupKey && value ? "pointer" : "default"
      }}
    >
      <span>{label}</span>
      <strong className="num" style={groupKey && value ? { textDecoration: "underline", textUnderlineOffset: "3px" } : undefined}>{value}</strong>
    </div>
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
      <div className="eyebrow" style={{ marginBottom: "8px" }}>
        {currentRun ? "RUN R-" + String(currentRun.id).substring(0, 8).toUpperCase() + " · " + currentClaims + " CLAIMS · CHECKED " + formatCheckedTime(checkedAt) : "NO RUNS AVAILABLE"}
      </div>
      {showHeading && <h1 className="checks-page-title">Checks</h1>}
      <div className="checks-gate-grid">
        <div className="card checks-gate-card" style={{ borderTop: "2px solid var(--accent)" }}>
          <div className="checks-gate-heading"><div className="eyebrow">Gate 1 · Inbound</div><h2>837 as received</h2></div>
          <div className="checks-gate-body">{[
            ["Envelope and control", envelopeFindings, "envelope"],
            ["Segment structure", segmentFindings, "segment"],
            ["Element syntax", elementFindings, "element"],
            ["Claims read", currentClaims, null],
            ["Findings", referenceFindings, "reference"]
          ].map(([label, value, groupKey]) => clickableRow(label, value, groupKey, label))}</div>
          <div className="checks-gate-footer">{referenceFindings ? referenceFindings + " reference finding" + (referenceFindings === 1 ? "" : "s") + " require attention." : "No reference findings are currently reported."}</div>
        </div>
        <div className="card checks-gate-card" style={{ borderTop: "2px solid var(--warning)" }}>
          <div className="checks-gate-heading"><div className="eyebrow">Gate 2 · Inbound</div><h2>835 from the claims system</h2></div>
          <div className="checks-gate-body">{[
            ["Envelope and control", envelopeFindings, "envelope"],
            ["Balancing and cross-foot", balancingFindings, "balancing"],
            ["Against the 837", referenceFindings, "reference"],
            ["Claims read", currentClaims, null],
            ["Findings", heldCount, null]
          ].map(([label, value, groupKey]) => clickableRow(label, value, groupKey, label))}</div>
          <div className="checks-gate-footer">{heldCount ? heldCount + " file" + (heldCount === 1 ? "" : "s") + " held with validation findings." : "No files are currently held at this gate."}</div>
        </div>
        <div className="card checks-gate-card" style={{ borderTop: "2px solid var(--accent)" }}>
          <div className="checks-gate-heading"><div className="eyebrow">Gate 3 · Outbound</div><h2>MIR before it goes</h2></div>
          <div className="checks-gate-body">{[
            ["Record layout and fields", mirFindings, "mir"],
            ["MIR outputs completed", completedFiles.length, null],
            ["Records written", currentRecords, null],
            ["Claims delivered", deliveredClaims, null],
            ["Findings", mirFindings, "mir"]
          ].map(([label, value, groupKey]) => clickableRow(label, value, groupKey, label))}</div>
          <div className="checks-gate-footer">{completedFiles.length ? completedFiles.length + " completed MIR output" + (completedFiles.length === 1 ? "" : "s") + " are available." : "No completed MIR outputs are available yet."}</div>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          marginBottom: "22px"
        }}
      >
        {[
          {
            value: allFiles.length,
            label: "Files checked",
            detail: "For the current client"
          },
          {
            value: heldCount,
            label: "Held before delivery",
            detail: "Files with validation errors"
          },
          {
            value: allFiles.filter((file) => {
              const message = JSON.stringify(parseErrorDetails(file.error_message)).toLowerCase();
              return String(file.status || "").toUpperCase() === "ERROR" &&
                (message.includes("refused") || message.includes("malformed beyond repair") || message.includes("beyond repair"));
            }).length,
            label: "Refused outright",
            detail: "Malformed beyond repair"
          },
          {
            value: allFiles.filter((file) => {
              const message = JSON.stringify(parseErrorDetails(file.error_message)).toLowerCase();
              return message.includes("silently corrected") || message.includes("auto-corrected") || message.includes("autocorrected");
            }).length,
            label: "Silently corrected",
            detail: "By design, never"
          }
        ].map((metric, index) => (
          <div
            key={metric.label}
            style={{
              padding: "22px 26px 18px",
              borderRight: index < 3 ? "1px solid var(--line)" : "none",
              minWidth: 0
            }}
          >
            <div className="num" style={{ fontSize: "30px", fontWeight: 700, lineHeight: 1.1, marginBottom: "8px" }}>
              {Number(metric.value || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "var(--ink-2)", marginBottom: "7px" }}>{metric.label}</div>
            <div style={{ fontSize: "12px", color: "var(--ink-2)" }}>{metric.detail}</div>
          </div>
        ))}
      </div>

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

      <div className="card" style={{ marginTop: "16px", padding: "20px 22px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "17px" }}>Where the rules come from</h2>
        <p className="sub" style={{ margin: 0, maxWidth: "920px", lineHeight: 1.6 }}>
          Every rule cites its source, which matters because a client asking why a file was held deserves better than "our system flagged it." It also tells us which rules are ours to defend and which are simply the standard.
        </p>
      </div>

      {selectedRuleGroup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedRuleGroup.title + " rules"}
          onClick={() => setSelectedRuleGroup(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15, 23, 35, 0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px"
          }}
        >
          <div
            className="card"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(980px, 100%)", maxHeight: "80vh", padding: 0, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
          >
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <div>
                <div className="eyebrow">Matching validation rules</div>
                <h2 style={{ margin: "4px 0 0", fontSize: "18px" }}>{selectedRuleGroup.title}</h2>
                <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--ink-2)" }}>
                  {selectedGroupFindings.length} finding{selectedGroupFindings.length === 1 ? "" : "s"} matched this category. These are the actual rules and validation messages behind the number.
                </div>
              </div>
              <button type="button" className="btn secondary" onClick={() => setSelectedRuleGroup(null)}>Close</button>
            </div>
            <div style={{ overflow: "auto", maxHeight: "calc(80vh - 110px)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th>RULE</th><th>SEGMENT</th><th>WHAT WE FOUND</th><th>SOURCE</th><th>SEVERITY</th></tr>
                </thead>
                <tbody>
                  {selectedGroupFindings.map((finding, index) => (
                    <tr key={(finding.rule_code || "rule") + index}>
                      <td>
                        <div style={{ fontFamily: "var(--display)" }}>{finding.rule_code || "835-STRUCT"}</div>
                        <div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>{finding.rule || "Validation rule"}</div>
                      </td>
                      <td><span className="tag work">{finding.segment || "Unknown"}</span></td>
                      <td>{finding.what_found || "Validation failed."}</td>
                      <td>{finding.source || "OneSmarter 835 structural validation"}</td>
                      <td><span className="tag bad">{finding.severity || "Hold"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
