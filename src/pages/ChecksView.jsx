import React, { useMemo, useState } from "react";

const ENVELOPE_RULES = [
  {
    rule_code: "ENV-001",
    segment: "ISA",
    rule: "ISA Header Required",
    description: "The file must contain an Interchange Control Header (ISA). Validation starts from the ISA envelope.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-002",
    segment: "ISA",
    rule: "Interchange Header Position",
    description: "ISA must be the first X12 segment in the 835 interchange.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-003",
    segment: "IEA",
    rule: "IEA Trailer Required and Final Position",
    description: "The interchange must close with an IEA trailer, and IEA must be the final X12 segment.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-004",
    segment: "ISA/IEA",
    rule: "Interchange Envelope Balance",
    description: "Requires exactly one ISA interchange header and one IEA interchange trailer.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-005",
    segment: "GS/GE",
    rule: "Functional Group Envelope Balance",
    description: "Requires at least one GS and GE segment and requires the number of GS and GE segments to match.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-006",
    segment: "ST/SE",
    rule: "Transaction Set Envelope Balance",
    description: "Requires at least one ST and SE segment and requires the number of ST and SE transaction envelopes to match.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-007",
    segment: "ISA13/IEA02",
    rule: "ISA/IEA Control Number Match",
    description: "Requires the interchange control number in ISA13 to match the interchange control number in IEA02.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-008",
    segment: "ST01",
    rule: "835 Transaction Identifier",
    description: "At least one ST transaction set must identify transaction type 835 (Health Care Payment/Advice).",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-009",
    segment: "ST/SE",
    rule: "Transaction Envelope Ordering",
    description: "Each ST transaction must close with a matching SE before another ST begins; an SE cannot appear without an open ST.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-010",
    segment: "SE01",
    rule: "SE Segment Count Validation",
    description: "SE01 must contain a numeric count equal to the actual number of segments from ST through SE for every transaction.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
  {
    rule_code: "ENV-011",
    segment: "ST02/SE02",
    rule: "ST/SE Control Number Match",
    description: "ST02 and SE02 transaction control numbers must be present and must match for every transaction set.",
    source: "OneSmarter 835 validator · validation.py",
    severity: "Hold",
  },
];

export default function ChecksView({ trackedFiles = [], showHeading = true }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedRuleGroup, setSelectedRuleGroup] = useState(null);

  const professionalRuleCode = (finding = {}) => {
    const raw = String(finding.rule_code ?? finding.code ?? "").trim().toUpperCase();
    const alreadyProfessional = raw.match(/^(ENV|SEG|ELM|REF)-(\d{1,3})$/);
    if (alreadyProfessional) {
      return `${alreadyProfessional[1]}-${alreadyProfessional[2].padStart(3, "0")}`;
    }

    const numericOnly = raw.match(/^(\d{1,3})$/);
    const pyx12Numeric = raw.match(/^PYX12-[A-Z0-9-]+-(\d{1,3})$/);
    const numeric = numericOnly?.[1] || pyx12Numeric?.[1];
    if (!numeric) return raw || "835-STRUCT";

    const segment = String(finding.segment || "").trim().toUpperCase();
    const element = String(finding.element || "").trim().toUpperCase();
    const context = [finding.rule, finding.what_found, finding.source, segment, element]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let family = "SEG";
    if (
      ["ISA", "IEA", "GS", "GE", "ST", "SE", "ISA/IEA", "GS/GE", "ST/SE", "ST02/SE02", "ISA13/IEA02", "SE01"].includes(segment) ||
      context.includes("envelope") ||
      context.includes("control number") ||
      context.includes("segment count")
    ) {
      family = "ENV";
    } else if (segment.startsWith("REF") || context.includes("reference") || context.includes("against the 837")) {
      family = "REF";
    } else if (
      element || context.includes("element") || context.includes("mandatory") ||
      context.includes("required value") || context.includes("minimum length") ||
      context.includes("maximum length") || context.includes("invalid value") || context.includes("invalid code")
    ) {
      family = "ELM";
    }

    return `${family}-${String(numeric).padStart(3, "0")}`;
  };

  const normalizeFinding = (finding) => {
    if (!finding || typeof finding !== "object") return finding;
    return { ...finding, rule_code: professionalRuleCode(finding) };
  };

  const parseErrorDetails = (raw) => {
    if (!raw) return { errors: [], findings: [] };
    let parsed;
    if (typeof raw === "object") parsed = raw;
    else {
      try { parsed = JSON.parse(raw); }
      catch (_) { parsed = { errors: [String(raw)], findings: [] }; }
    }
    return {
      ...parsed,
      findings: Array.isArray(parsed.findings) ? parsed.findings.map(normalizeFinding) : [],
    };
  };

  const allFiles = useMemo(
    () => [...(trackedFiles || [])].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0)),
    [trackedFiles]
  );
  const errorFiles = useMemo(
    () => allFiles.filter((file) => String(file.status || "").toUpperCase() === "ERROR"),
    [allFiles]
  );
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
    return (details.errors || []).map((message) => ({
      rule_code: "835-STRUCT",
      segment: "Unknown",
      rule: "Validation finding",
      source: "OneSmarter 835 structural validation",
      severity: "Hold",
      what_found: typeof message === "string" ? message : JSON.stringify(message),
    }));
  }), [allFiles]);

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

  const rulesForGroup = (groupKey) => groupKey === "envelope" ? ENVELOPE_RULES : findingsForGroup(groupKey);

  const envelopeRuleCount = ENVELOPE_RULES.length;
  const segmentFindings = findingsForGroup("segment").length;
  const elementFindings = findingsForGroup("element").length;
  const balancingFindings = findingsForGroup("balancing").length;
  const referenceFindings = findingsForGroup("reference").length;
  const mirFindings = findingsForGroup("mir").length;
  const heldCount = errorFiles.length;
  const deliveredClaims = completedFiles.reduce((sum, file) => sum + Number(file.claims_count || 0), 0);
  const selectedGroupRows = selectedRuleGroup ? rulesForGroup(selectedRuleGroup.key) : [];
  const selectedGroupIsCatalog = selectedRuleGroup?.key === "envelope";

  const openRuleGroup = (key, title) => {
    if (rulesForGroup(key).length) setSelectedRuleGroup({ key, title });
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
            ["Envelope and control", envelopeRuleCount, "envelope"],
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
            ["Envelope and control", envelopeRuleCount, "envelope"],
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

      <div className="card" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", marginBottom: "22px" }}>
        {[
          { value: allFiles.length, label: "Files checked", detail: "For the current client" },
          { value: heldCount, label: "Held before delivery", detail: "Files with validation errors" },
          {
            value: allFiles.filter((file) => {
              const message = JSON.stringify(parseErrorDetails(file.error_message)).toLowerCase();
              return String(file.status || "").toUpperCase() === "ERROR" && (message.includes("refused") || message.includes("malformed beyond repair") || message.includes("beyond repair"));
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
          <div key={metric.label} style={{ padding: "22px 26px 18px", borderRight: index < 3 ? "1px solid var(--line)" : "none", minWidth: 0 }}>
            <div className="num" style={{ fontSize: "30px", fontWeight: 700, lineHeight: 1.1, marginBottom: "8px" }}>{Number(metric.value || 0).toLocaleString()}</div>
            <div style={{ fontSize: "13px", color: "var(--ink-2)", marginBottom: "7px" }}>{metric.label}</div>
            <div style={{ fontSize: "12px", color: "var(--ink-2)" }}>{metric.detail}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
          <div className="eyebrow">Checks</div>
          <h2 style={{ margin: "3px 0 4px", fontSize: "17px" }}>Findings on this run</h2>
          <div style={{ fontSize: "12px", color: "var(--ink-2)" }}>Only files with an error status are shown. Select a file to see the rule, segment, finding, and source.</div>
        </div>
        {errorFiles.length === 0 ? (
          <div style={{ padding: "30px 20px", color: "var(--ink-3)" }}>No files with errors right now.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>835 FILE</th><th>RUN</th><th>CLAIMS</th><th>STATUS</th><th>FINDINGS</th></tr></thead>
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
                      <td><button type="button" className="btn secondary" style={{ padding: "5px 10px", fontSize: "11px" }} onClick={() => setSelectedFile(file)}>View {count} finding{count === 1 ? "" : "s"}</button></td>
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
        <p className="sub" style={{ margin: 0, maxWidth: "920px", lineHeight: 1.6 }}>Every rule cites its source, which matters because a client asking why a file was held deserves better than "our system flagged it." It also tells us which rules are ours to defend and which are simply the standard.</p>
      </div>

      {selectedRuleGroup && (
        <div role="dialog" aria-modal="true" aria-label={selectedRuleGroup.title + " rules"} onClick={() => setSelectedRuleGroup(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15, 23, 35, 0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card" onClick={(event) => event.stopPropagation()} style={{ width: "min(1080px, 100%)", maxHeight: "80vh", padding: 0, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
              <div>
                <div className="eyebrow">{selectedGroupIsCatalog ? "Validation rule catalog" : "Matching validation rules"}</div>
                <h2 style={{ margin: "4px 0 0", fontSize: "18px" }}>{selectedRuleGroup.title}</h2>
                <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--ink-2)" }}>
                  {selectedGroupIsCatalog
                    ? `${selectedGroupRows.length} validation rules are applied in this category. These are the checks used by the validator.`
                    : `${selectedGroupRows.length} finding${selectedGroupRows.length === 1 ? "" : "s"} matched this category.`}
                </div>
              </div>
              <button type="button" className="btn secondary" onClick={() => setSelectedRuleGroup(null)}>Close</button>
            </div>
            <div style={{ overflow: "auto", maxHeight: "calc(80vh - 110px)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th>RULE</th><th>SEGMENT</th><th>{selectedGroupIsCatalog ? "DESCRIPTION" : "WHAT WE FOUND"}</th><th>SOURCE</th><th>SEVERITY</th></tr>
                </thead>
                <tbody>
                  {selectedGroupRows.map((row, index) => (
                    <tr key={`${professionalRuleCode(row)}-${index}`}>
                      <td>
                        <div style={{ fontFamily: "var(--display)" }}>{professionalRuleCode(row)}</div>
                        <div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>{row.rule || "Validation rule"}</div>
                      </td>
                      <td><span className="tag work">{row.segment || "Unknown"}</span></td>
                      <td>{selectedGroupIsCatalog ? row.description : (row.what_found || "Validation failed.")}</td>
                      <td>{row.source || "OneSmarter 835 structural validation"}</td>
                      <td><span className="tag bad">{row.severity || "Hold"}</span></td>
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
            <div><div className="eyebrow">Where the rules come from</div><h2 style={{ margin: "3px 0 0", fontSize: "16px" }}>{selectedFile.original_filename}</h2></div>
            <button type="button" className="btn secondary" onClick={() => setSelectedFile(null)}>Close</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>RULE</th><th>SEGMENT</th><th>WHAT WE FOUND</th><th>SOURCE</th><th>SEVERITY</th></tr></thead>
              <tbody>
                {findings.length ? findings.map((finding, index) => (
                  <tr key={`${professionalRuleCode(finding)}-${index}`}>
                    <td><div style={{ fontFamily: "var(--display)" }}>{professionalRuleCode(finding)}</div><div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>{finding.rule || "Validation rule"}</div></td>
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
