import React, { useMemo, useState } from "react";

const CODES = [
  ["CX001","CX","COB calculation","COB not calculated due to error in primary calculation","unclassified"],
  ["CX002","CX","COB calculation","Error encountered in COB secondary calculation","unclassified"],
  ["CX003","CX","COB calculation","Review occurred in BCBS Calculator for primary calculation","review"],
  ["CX004","CX","COB calculation","Review occurred in COB Calculator for secondary calculation.","review"],
  ["EI022","EI","BCBS edit, line","Invalid Co-Insurance amount. Correct and resubmit the claim.","fixable"],
  ["EI029","EI","BCBS edit, line","Benefits Management non-covered Reduction Code invalid. Correct and resubmit the claim.","fixable"],
  ["EI131","EI","BCBS edit, line","Code is not applicable to the MPL Interface. Contact MPL if it appears.","escalate"],
  ["FM001","FM","Interface match","The claim cannot be found on the MPL database. Verify ICN and re-submit the claim.","fixable"],
  ["FM002","FM","Interface match","Record retrieved line maximum exceeded. Validate line counts.","review"],
  ["FM003","FM","Interface match","Streamline Adjustment not valid for this claim. Contact BCBS.","escalate"],
  ["UE011","UE","Return to BCBS","Disposition Format already on file. Duplicate claim already processed.","fixable"],
  ["UE012","UE","Return to BCBS","Missing or invalid original/reissue Disposition Format for adjustment.","fixable"],
  ["UE013","UE","Return to BCBS","Disposition Format on file for void/reissue/closeout. Verify or contact BCBS.","escalate"],
  ["UE014","UE","Return to BCBS","Invalid Payment reduction reason code at claim level. Correct and re-submit.","fixable"],
  ["UE015","UE","Return to BCBS","Invalid payment reduction reason code at line level. Correct and re-submit.","fixable"],
  ["UE016","UE","Return to BCBS","Invalid managed care reduction reason code. Correct and re-submit.","fixable"],
  ["UE017","UE","Return to BCBS","Invalid reject/message code for adjudication status at claim level.","fixable"],
  ["UE018","UE","Return to BCBS","Invalid reject/message code for adjudication status at line level.","fixable"],
  ["UE019","UE","Return to BCBS","Disposition Format on MPL Transaction File. Claim has already been processed.","fixable"],
  ["UE020","UE","Return to BCBS","Disposition Format cannot be deleted. Contact MPL.","escalate"],
  ["UE085","UE","Return to BCBS","Coverage expiration.","unclassified"],
  ["UE089","UE","Return to BCBS","Previously approved claim cannot be rejected through a Streamline Adjustment. Contact BCBS.","escalate"],
  ["UE090","UE","Return to BCBS","MIR Adjustment Reason Code not allowed for this claim.","unclassified"],
  ["UE099","UE","Return to BCBS","Adjustment receipt.","unclassified"],
  ["UE106","UE","Return to BCBS","Required message code condition needs review.","unclassified"],
  ["IRL4R","IRL","Return to BCBS","Cannot indicate an approved GOP applies when fraud is suspected.","unclassified"],
  ["MP001","MP","MPL processing","BCBS calculated Fund payment differs from Fund submitted payment amount.","review"],
  ["DRL5B","DRL","Return to BCBS","DF message code condition is not allowed.","unclassified"],
  ["DRL5C","DRL","Return to BCBS","Claim level DF message code requires total non-covered charge greater than zero.","unclassified"],
  ["UPDT","U","Return to BCBS","Claim adjustment processing condition requires review.","unclassified"],
].map(([code,family,family_label,definition,disposition]) => ({
  code, family, family_label, definition, disposition,
  source: "MPL Exception Codes List 5.2",
  guidance: [],
  review_needed: disposition === "review"
}));

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

      <div className="card" style={{padding:"14px",marginBottom:"14px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"10px"}}>
        <select className="control" value={family} onChange={(e)=>setFamily(e.target.value)}>
          <option value="">All code families</option>
          {families.map((f)=><option key={f} value={f}>{f}</option>)}
        </select>
        <select className="control" value={disposition} onChange={(e)=>setDisposition(e.target.value)}>
          <option value="">Any disposition</option>
          {Object.entries(LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
        <select className="control" value={guidanceFilter} onChange={(e)=>setGuidanceFilter(e.target.value)}>
          <option value="">All entries</option>
          <option value="1">Has notice guidance</option>
          <option value="2">Needs a human check</option>
        </select>
        <input className="control" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search a code or its text" />
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
