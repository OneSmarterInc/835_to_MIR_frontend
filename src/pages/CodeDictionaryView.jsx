import React, { useMemo, useState } from "react";

import CODES from "../data/codeDictionary.json";

const LABELS = {
  fixable: "Fixable by the Fund",
  escalate: "Escalate to BCBS or MPL",
  review: "Review or validate",
  informational: "Informational",
  unclassified: "No stated action",
  undefined: "Not in the sheet"
};

export default function CodeDictionaryView() {
  const [family, setFamily] = useState("");
  const [disposition, setDisposition] = useState("");
  const [guidanceFilter, setGuidanceFilter] = useState("");
  const [search, setSearch] = useState("");

  const families = useMemo(() => [...new Set(CODES.map((c) => c.family))].sort(), []);
  const filtered = useMemo(() => CODES.filter((entry) => {
    const text = [entry.code, entry.definition, entry.family, entry.family_label].join(" ").toLowerCase();
    if (family && entry.family !== family) return false;
    if (disposition && entry.disposition !== disposition) return false;
    if (guidanceFilter === "1" && !entry.guidance?.length) return false;
    if (guidanceFilter === "2" && !entry.review_needed) return false;
    return !search.trim() || text.includes(search.trim().toLowerCase());
  }), [family, disposition, guidanceFilter, search]);

  const tallies = useMemo(() => ({
    total: CODES.length,
    fixable: CODES.filter((c) => c.disposition === "fixable").length,
    escalate: CODES.filter((c) => c.disposition === "escalate").length,
    review: CODES.filter((c) => c.disposition === "review").length,
  }), []);

  return (
    <section className="view on table-screen">
      <div className="eyebrow">BCBS Message and Exception Codes · MIR909</div>
      <h1>Exception code dictionary</h1>
      <p className="sub" style={{maxWidth:"980px"}}>
        Every code MPL publishes, with what it means, what the source says to do about it, and any practical guidance available. Official text and accumulated guidance are kept separate.
      </p>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"12px",margin:"22px 0"}}>
        {[
          [tallies.total,"Codes loaded"],
          [tallies.fixable,"Fixable by the Fund"],
          [tallies.escalate,"Escalate"],
          [tallies.review,"Needs review"]
        ].map(([value,label]) => <div key={label} className="card" style={{padding:"16px"}}><div className="num" style={{fontSize:"24px"}}>{value}</div><div style={{fontSize:"12px",color:"var(--ink-2)",marginTop:"5px"}}>{label}</div></div>)}
      </div>

      <div
        className="card"
        style={{
          padding: "18px 20px",
          marginBottom: "14px",
          background: "var(--surface)",
          border: "1px solid var(--line)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: "4px" }}>FILTER THE DICTIONARY</div>
            <div style={{ fontSize: "13px", color: "var(--ink-2)" }}>Narrow the list by family, disposition, or guidance.</div>
          </div>
          {(family || disposition || guidanceFilter || search) && (
            <button
              className="btn"
              onClick={() => { setFamily(""); setDisposition(""); setGuidanceFilter(""); setSearch(""); }}
              style={{ whiteSpace: "nowrap" }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(210px, 1fr) minmax(240px, 1fr) minmax(210px, 1fr) minmax(260px, 1.2fr)",
            gap: "14px",
            alignItems: "end"
          }}
        >
          <label style={{ display: "grid", gap: "7px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink-2)" }}>CODE FAMILY</span>
            <select className="control" style={{ width: "100%", height: "42px" }} value={family} onChange={(e)=>setFamily(e.target.value)}>
              <option value="">All code families</option>
              {families.map((f)=><option key={f} value={f}>{f}</option>)}
            </select>
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink-2)" }}>DISPOSITION</span>
            <select className="control" style={{ width: "100%", height: "42px" }} value={disposition} onChange={(e)=>setDisposition(e.target.value)}>
              <option value="">Any disposition</option>
              {Object.entries(LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}
            </select>
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink-2)" }}>GUIDANCE</span>
            <select className="control" style={{ width: "100%", height: "42px" }} value={guidanceFilter} onChange={(e)=>setGuidanceFilter(e.target.value)}>
              <option value="">All entries</option>
              <option value="1">Has notice guidance</option>
              <option value="2">Needs a human check</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "7px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink-2)" }}>SEARCH</span>
            <input className="control" style={{ width: "100%", height: "42px", boxSizing: "border-box" }} value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search a code or its text" />
          </label>
        </div>
      </div>

      <div style={{fontSize:"12px",color:"var(--ink-2)",margin:"8px 0 12px"}}>{filtered.length} of {CODES.length} entries shown</div>

      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",minWidth:"900px"}}>
            <thead><tr><th>Code</th><th>Family</th><th>Meaning</th><th>Disposition</th><th>Source</th></tr></thead>
            <tbody>
              {filtered.map((entry)=>(
                <tr key={entry.code}>
                  <td><strong className="num">{entry.code}</strong></td>
                  <td><div>{entry.family_label}</div><div style={{fontSize:"11px",color:"var(--ink-3)"}}>{entry.family}</div></td>
                  <td style={{maxWidth:"520px",whiteSpace:"normal"}}>{entry.definition}</td>
                  <td><span className={`tag ${entry.disposition === "fixable" ? "ok" : entry.disposition === "escalate" ? "bad" : "work"}`}>{LABELS[entry.disposition] || entry.disposition}</span></td>
                  <td>{entry.source}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan="5" style={{padding:"35px",textAlign:"center",color:"var(--ink-3)"}}>No codes match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
