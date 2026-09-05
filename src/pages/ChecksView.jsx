import React, { useMemo, useState } from "react";

const RULE_GROUPS = {
  gate1Envelope: {
    title: "Envelope and control",
    count: 18,
    gate: "Gate 1 · 837 as received",
    scope: "837 interchange and transaction envelopes",
    description: "Checks the inbound 837 control structure before it is used as the reference copy.",
    examples: ["ISA/IEA envelope presence and order", "GS/GE functional-group integrity", "ST/SE transaction-set integrity", "Control-number consistency", "Transaction counts and envelope sequencing"],
  },
  gate1Segment: {
    title: "Segment structure",
    count: 34,
    gate: "Gate 1 · 837 as received",
    scope: "837 segment-level structure",
    description: "Checks required 837 segments, loop placement, and structural relationships used to read claims safely.",
    examples: ["Required claim and subscriber segments", "Loop and segment ordering", "CLM and service-line structure", "Required identifiers", "Supported 837 transaction structure"],
  },
  gate1Element: {
    title: "Element syntax",
    count: 61,
    gate: "Gate 1 · 837 as received",
    scope: "837 element-level syntax",
    description: "Checks required values, element formats, lengths, identifiers, and supported code values in the inbound 837.",
    examples: ["Required element values", "Element length and format", "Claim identifiers", "Date and amount syntax", "Supported qualifier/code values"],
  },
  gate2Envelope: {
    title: "Envelope and control",
    count: 18,
    gate: "Gate 2 · 835 from the claims system",
    scope: "835 interchange and transaction envelopes",
    description: "Checks the 835 control structure before any payment data is converted into MIR.",
    examples: ["ISA/IEA envelope integrity", "GS/GE balancing", "ST/SE balancing", "Control-number matching", "SE01 segment-count validation"],
  },
  gate2Balance: {
    title: "Balancing and cross-foot",
    count: 12,
    gate: "Gate 2 · 835 from the claims system",
    scope: "835 financial balancing",
    description: "Checks claim and payment amounts so a financially inconsistent 835 is held before MIR generation.",
    examples: ["Payment and claim amount balancing", "Service-to-claim rollups", "Cross-foot calculations", "Adjustment consistency", "Paid/allowed/patient-liability relationships"],
  },
  gate2Against837: {
    title: "Against the 837",
    count: 9,
    gate: "Gate 2 · 835 from the claims system",
    scope: "835-to-837 comparison",
    description: "Compares adjudicated 835 claim information back to the original 837 reference copy.",
    examples: ["Claim-control-number match", "Claim presence", "Patient/member reference", "Service-line correlation", "Original claim context"],
  },
  gate3Layout: {
    title: "Record layout and fields",
    count: 47,
    gate: "Gate 3 · MIR before it goes",
    scope: "MIR record layout",
    description: "Checks the generated MIR record structure and required output fields before outbound delivery.",
    examples: ["Required MIR fields", "Record lengths and placement", "Field formatting", "Claim/service record consistency", "Output record completeness"],
  },
  gate3Mpl: {
    title: "MPL edit rules replicated",
    count: 23,
    gate: "Gate 3 · MIR before it goes",
    scope: "MPL preventive edits",
    description: "Runs the replicated MPL-style preventive edits that are available before the MIR leaves the platform.",
    examples: ["Cross-foot edits", "Timely-filing conditions", "Group/sub-group requirements", "Claim-level preventive checks", "Known downstream rejection prevention"],
  },
  gate3Against837: {
    title: "Against the original 837",
    count: 6,
    gate: "Gate 3 · MIR before it goes",
    scope: "MIR-to-837 final comparison",
    description: "Performs a final comparison of the MIR output against the original 837 reference data.",
    examples: ["Claim identity", "Original claim reference", "Member/patient context", "Service correlation", "Delivered claim consistency"],
  },
};

const GROUP_MATCHERS = {
  gate1Envelope: ["envelope", "isa", "iea", "gs", "ge", "st/se", "control number", "segment count"],
  gate1Segment: ["segment", "clm", "subscriber", "service", "loop"],
  gate1Element: ["element", "required value", "invalid value", "invalid code", "length", "syntax"],
  gate2Envelope: ["envelope", "isa", "iea", "gs", "ge", "st/se", "control number", "segment count"],
  gate2Balance: ["balance", "cross-foot", "amount", "payment", "allowed", "liability"],
  gate2Against837: ["837", "reference", "against the 837"],
  gate3Layout: ["mir", "layout", "record", "field"],
  gate3Mpl: ["mp003", "mp011", "mp013", "mpl", "preventive"],
  gate3Against837: ["837", "original 837", "reference"],
};

function parseDetails(raw) {
  if (!raw) return { findings: [], errors: [] };
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); }
  catch (_) { return { findings: [], errors: [String(raw)] }; }
}

export default function ChecksView({ trackedFiles = [], showHeading = true }) {
  const [selectedGroup, setSelectedGroup] = useState(null);

  const allFiles = useMemo(
    () => [...(trackedFiles || [])].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0)),
    [trackedFiles]
  );

  const currentRun = allFiles[0] || null;
  const currentClaims = Number(currentRun?.claims_count || 0);
  const currentRecords = Number(currentRun?.records_count || 0);
  const errorFiles = allFiles.filter((file) => String(file.status || "").toUpperCase() === "ERROR");
  const heldCount = errorFiles.length;
  const completedFiles = allFiles.filter((file) => ["ARCHIVED", "COMPLETED"].includes(String(file.status || "").toUpperCase()));
  const deliveredClaims = completedFiles.reduce((sum, file) => sum + Number(file.claims_count || 0), 0);

  const allFindings = useMemo(() => allFiles.flatMap((file) => {
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
  }), [allFiles]);

  const matchingFindings = (groupKey) => {
    const needles = GROUP_MATCHERS[groupKey] || [];
    return allFindings.filter((finding) => {
      const haystack = [finding.rule_code, finding.rule, finding.segment, finding.source, finding.what_found, finding.reason]
        .filter(Boolean).join(" ").toLowerCase();
      return needles.some((needle) => haystack.includes(needle));
    });
  };

  const currentFindings = allFindings.length;
  const gate3Findings = matchingFindings("gate3Layout").length + matchingFindings("gate3Mpl").length;

  const openGroup = (groupKey, extra = {}) => {
    const base = RULE_GROUPS[groupKey] || {};
    setSelectedGroup({ key: groupKey, ...base, ...extra, findings: matchingFindings(groupKey) });
  };

  const openMetric = (title, gate, value, description) => {
    setSelectedGroup({ title, gate, count: value, scope: title, description, examples: [], findings: [] });
  };

  const row = (label, value, onClick, tone = "good") => (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
        padding: "9px 0", border: 0, borderBottom: "1px solid var(--line)", background: "transparent",
        color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left"
      }}
    >
      <span style={{ fontSize: "14px" }}>{label}</span>
      <span className="num" style={{ display: "inline-flex", alignItems: "center", gap: "7px", whiteSpace: "nowrap", fontWeight: 600 }}>
        {tone !== "plain" && <span aria-hidden="true" style={{ width: "8px", height: "8px", borderRadius: "50%", background: tone === "warn" ? "#b98117" : "#0f7f6d", display: "inline-block" }} />}
        {value}
      </span>
    </button>
  );

  const gateCard = ({ eyebrow, title, subtitle, accent, rows, footer }) => (
    <div className="card checks-gate-card" style={{ padding: 0, overflow: "hidden", borderTop: `3px solid ${accent}` }}>
      <div style={{ padding: "20px 20px 16px" }}>
        <div className="eyebrow">{eyebrow}</div>
        <h2 style={{ margin: "7px 0 4px", fontSize: "18px" }}>{title}</h2>
        <div style={{ color: "var(--ink-2)", fontSize: "13px" }}>{subtitle}</div>
      </div>
      <div style={{ padding: "12px 20px 14px", borderTop: "1px solid var(--line)" }}>{rows}</div>
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", fontSize: "13px", lineHeight: 1.5 }}>{footer}</div>
    </div>
  );

  return (
    <section className="view on table-screen">
      {showHeading && <h1 className="checks-page-title">Checks</h1>}

      <div className="checks-gate-grid">
        {gateCard({
          eyebrow: "Gate 1 · Inbound",
          title: "837 as received",
          subtitle: "From the payer, kept as the reference copy",
          accent: "#0f7f6d",
          rows: <>
            {row("Envelope and control", "18 rules", () => openGroup("gate1Envelope"))}
            {row("Segment structure", "34 rules", () => openGroup("gate1Segment"))}
            {row("Element syntax", "61 rules", () => openGroup("gate1Element"))}
            {row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "Gate 1 · 837 as received", currentClaims, "Number of claims read from the current inbound 837 reference file."), "plain")}
            {row("Findings", currentFindings.toLocaleString(), () => openMetric("Findings", "Gate 1 · 837 as received", currentFindings, "Validation findings currently associated with the selected client's run."), currentFindings ? "warn" : "plain")}
          </>,
          footer: "Held so the MIR can be compared back to it later. That comparison is the whole point.",
        })}

        {gateCard({
          eyebrow: "Gate 2 · Inbound",
          title: "835 from the claims system",
          subtitle: "What the plan adjudicated",
          accent: "#b98117",
          rows: <>
            {row("Envelope and control", "18 rules", () => openGroup("gate2Envelope"))}
            {row("Balancing and cross-foot", "12 rules", () => openGroup("gate2Balance"), "warn")}
            {row("Against the 837", "9 rules", () => openGroup("gate2Against837"))}
            {row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "Gate 2 · 835 from the claims system", currentClaims, "Number of claims represented in the current validation run."), "plain")}
            {row("Findings", heldCount ? `${heldCount} held` : "0", () => openMetric("Findings", "Gate 2 · 835 from the claims system", heldCount, "Files or claims currently held because validation findings require attention."), heldCount ? "warn" : "plain")}
          </>,
          footer: heldCount ? `${heldCount} file${heldCount === 1 ? " is" : "s are"} held here rather than converted, because a bad 835 makes a bad MIR.` : "No 835 files are currently held at this gate.",
        })}

        {gateCard({
          eyebrow: "Gate 3 · Outbound",
          title: "MIR before it goes",
          subtitle: "The last chance to catch anything",
          accent: "#0f7f6d",
          rows: <>
            {row("Record layout and fields", "47 rules", () => openGroup("gate3Layout"))}
            {row("MPL edit rules replicated", "23 rules", () => openGroup("gate3Mpl"))}
            {row("Against the original 837", "6 rules", () => openGroup("gate3Against837"))}
            {row("Records written", currentRecords.toLocaleString(), () => openMetric("Records written", "Gate 3 · MIR before it goes", currentRecords, "Number of MIR records written for the current run."), "plain")}
            {row("Findings", gate3Findings.toLocaleString(), () => openMetric("Findings", "Gate 3 · MIR before it goes", gate3Findings, "MIR-stage validation findings detected before outbound delivery."), gate3Findings ? "warn" : "plain")}
          </>,
          footer: currentClaims ? `${Math.min(deliveredClaims || currentRecords, currentClaims).toLocaleString()} of ${currentClaims.toLocaleString()} delivered or prepared for delivery. Anything held remains visible rather than being lost.` : "No completed MIR outputs are available yet.",
        })}
      </div>

      {selectedGroup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedGroup.title} details`}
          onClick={() => setSelectedGroup(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div className="card" onClick={(event) => event.stopPropagation()} style={{ width: "min(900px, 100%)", maxHeight: "80vh", overflow: "auto", padding: 0, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
              <div>
                <div className="eyebrow">{selectedGroup.gate}</div>
                <h2 style={{ margin: "5px 0 3px", fontSize: "20px" }}>{selectedGroup.title}</h2>
                <div style={{ color: "var(--ink-2)", fontSize: "13px" }}>{selectedGroup.count} {String(selectedGroup.count).includes("rule") ? "" : (selectedGroup.key ? "rules" : "")}</div>
              </div>
              <button type="button" className="btn secondary" onClick={() => setSelectedGroup(null)}>Close</button>
            </div>

            <div style={{ padding: "20px 22px" }}>
              <div style={{ marginBottom: "18px" }}>
                <div className="eyebrow">What this checks</div>
                <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>{selectedGroup.description}</p>
              </div>

              {selectedGroup.scope && <div style={{ marginBottom: "18px" }}><strong>Scope:</strong> {selectedGroup.scope}</div>}

              {selectedGroup.examples?.length > 0 && (
                <div style={{ marginBottom: "18px" }}>
                  <div className="eyebrow">Examples</div>
                  <ul style={{ margin: "8px 0 0", paddingLeft: "20px", lineHeight: 1.8 }}>
                    {selectedGroup.examples.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}

              {selectedGroup.findings?.length > 0 ? (
                <div>
                  <div className="eyebrow">Findings on current data</div>
                  <div style={{ overflowX: "auto", marginTop: "8px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><th>RULE</th><th>SEGMENT</th><th>WHAT WE FOUND</th><th>SEVERITY</th></tr></thead>
                      <tbody>
                        {selectedGroup.findings.map((finding, index) => (
                          <tr key={`${finding.rule_code || "rule"}-${index}`}>
                            <td>{finding.rule_code || finding.code || finding.rule || "Validation rule"}</td>
                            <td>{finding.segment || "—"}</td>
                            <td>{finding.what_found || finding.reason || finding.message || "Validation finding"}</td>
                            <td>{finding.severity || "Hold"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : selectedGroup.key ? (
                <div style={{ padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)" }}>No matching findings are currently reported for this rule group.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
