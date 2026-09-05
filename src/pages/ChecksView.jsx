import React, { useEffect, useMemo, useState } from "react";
import { safeFetchJson } from "../utils/api";
import ConversionErrorFindings from "../components/ConversionErrorFindings";

function parseDetails(raw) {
  if (!raw) return { findings: [], errors: [] };
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); }
  catch (_) { return { findings: [], errors: [String(raw)] }; }
}

export default function ChecksView({ trackedFiles = [], showHeading = true }) {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);

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

  const openMetric = (title, gate, value, description) => {
    setSelectedGroup({ title, gate, count: value, unit: "", description, source: "Current run", rules: [], findings: [] });
  };

  const row = (label, value, onClick) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px",
        padding: "6px 0", border: 0, borderBottom: "1px solid var(--line)", background: "transparent",
        color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left"
      }}
    >
      <span style={{ fontSize: "13px" }}>{label}</span>
      <span
        className="num"
        style={{
          whiteSpace: "nowrap",
          fontWeight: 600,
          color: "inherit",
          fontSize: "13px",
          textDecoration: "underline",
          textUnderlineOffset: "3px",
          textDecorationThickness: "1px"
        }}
      >
        {value}
      </span>
    </button>
  );

  const groupRows = (gateKey) => {
    const groups = catalog?.[gateKey]?.groups || [];
    if (!catalog && !catalogError) {
      return <div style={{ padding: "7px 0", color: "var(--ink-3)", fontSize: "12px" }}>Loading active checks…</div>;
    }
    if (catalogError) {
      return <div style={{ padding: "7px 0", color: "var(--ink-2)", fontSize: "12px" }}>Validation catalog unavailable — no rule totals are being guessed.</div>;
    }
    return groups.map((group) => row(
      group.title,
      `${Number(group.count || 0).toLocaleString()} ${group.unit || "rules"}`,
      () => setSelectedGroup({ ...group, gate: catalog?.[gateKey]?.title || gateKey, findings: [] })
    ));
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
        <div style={{ padding: "7px 16px 8px", borderTop: "1px solid var(--line)", flex: "1 1 auto" }}>
          {groupRows(gateKey)}
          {metrics}
        </div>
        <div style={{ padding: "9px 16px", borderTop: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)", fontSize: "12px", lineHeight: 1.35, minHeight: "44px", display: "flex", alignItems: "center" }}>{footer}</div>
      </div>
    );
  };

  return (
    <section className="view on table-screen">
      {showHeading && <h1 className="checks-page-title">Checks</h1>}

      <div className="checks-gate-grid" style={{ gap: "12px", alignItems: "stretch" }}>
        {gateCard({
          gateKey: "gate1",
          eyebrow: "Gate 1 · Inbound",
          metrics: <>
            {row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "837 as received", currentClaims, "Number of claims read for the current run."))}
            {row("Findings", allFindings.length.toLocaleString(), () => openMetric("Findings", "837 as received", allFindings.length, "Validation findings currently recorded for this run."))}
          </>,
          footer: "The rule totals above come from the backend validation catalog, not from frontend constants.",
        })}

        {gateCard({
          gateKey: "gate2",
          eyebrow: "Gate 2 · Inbound",
          metrics: <>
            {row("Claims read", currentClaims.toLocaleString(), () => openMetric("Claims read", "835 from the claims system", currentClaims, "Number of claims represented in the current run."))}
            {row("Findings", heldCount ? `${heldCount} held` : "0", () => openMetric("Findings", "835 from the claims system", heldCount, "Files currently held because validation findings require attention."))}
          </>,
          footer: heldCount ? `${heldCount} file${heldCount === 1 ? " is" : "s are"} held before MIR generation.` : "No 835 files are currently held at this gate.",
        })}

        {gateCard({
          gateKey: "gate3",
          eyebrow: "Gate 3 · Outbound",
          metrics: <>
            {row("Records written", currentRecords.toLocaleString(), () => openMetric("Records written", "MIR before it goes", currentRecords, "Number of MIR records written for the current run."))}
            {row("Findings", allFindings.filter((f) => /mir|mp003|mp011|mp013|duplicate/i.test([f.rule_code, f.rule, f.source, f.what_found, f.reason].filter(Boolean).join(" "))).length.toLocaleString(), () => openMetric("Findings", "MIR before it goes", allFindings.length, "MIR-stage findings recorded before outbound delivery."))}
          </>,
          footer: currentClaims ? `${Math.min(deliveredClaims || currentRecords, currentClaims).toLocaleString()} of ${currentClaims.toLocaleString()} delivered or prepared for delivery.` : "No completed MIR outputs are available yet.",
        })}
      </div>

      <ConversionErrorFindings trackedFiles={allFiles} />

      {selectedGroup && (
        <div role="dialog" aria-modal="true" aria-label={`${selectedGroup.title} details`} onClick={() => setSelectedGroup(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card" onClick={(event) => event.stopPropagation()} style={{ width: "min(980px, 100%)", maxHeight: "80vh", overflow: "auto", padding: 0, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" }}>
              <div>
                <div className="eyebrow">{selectedGroup.gate}</div>
                <h2 style={{ margin: "5px 0 3px", fontSize: "20px" }}>{selectedGroup.title}</h2>
                <div style={{ color: "var(--ink-2)", fontSize: "13px" }}>
                  {Number(selectedGroup.count || 0).toLocaleString()} {selectedGroup.unit || ""}
                </div>
              </div>
              <button type="button" className="btn secondary" onClick={() => setSelectedGroup(null)}>Close</button>
            </div>

            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
              <p style={{ margin: 0, lineHeight: 1.6 }}>{selectedGroup.description || "Current validation information."}</p>
              {selectedGroup.source && <div style={{ marginTop: "8px", color: "var(--ink-3)", fontSize: "12px" }}>Source: {selectedGroup.source}</div>}
            </div>

            {Array.isArray(selectedGroup.rules) && selectedGroup.rules.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th>CHECK</th><th>SEGMENT / SCOPE</th><th>WHAT IT ENFORCES</th><th>SEVERITY</th></tr></thead>
                  <tbody>
                    {selectedGroup.rules.map((rule, index) => (
                      <tr key={`${rule.code || "rule"}-${index}`}>
                        <td><div style={{ fontWeight: 700 }}>{rule.code || "CHECK"}</div><div style={{ fontSize: "11px", color: "var(--ink-3)", marginTop: "4px" }}>{rule.name || "Validation check"}</div></td>
                        <td>{rule.segment || "—"}</td>
                        <td>{rule.description || "—"}</td>
                        <td>{rule.severity || "Active"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
