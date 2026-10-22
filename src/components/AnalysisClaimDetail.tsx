import React, { useEffect, useRef } from "react";
import { ComparisonResult } from "./AnalysisComparisonTable";
import { money } from "./ClaimOccurrenceTable";
import { encodeDemoValue } from "../utils/demoEncoder";
import type { AnalysisOccurrence, AnalysisRow } from "../utils/claimAnalysis";

const safe = (value: string) => value ? encodeDemoValue(value, true) : "—";
const date = (value: string) => new Date(value).toLocaleString("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

export default function AnalysisClaimDetail({ row, onBack }: { row: AnalysisRow; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [row.key]);
  const sources = new Map<string, AnalysisOccurrence[]>();
  for (const item of row.occurrences) {
    const key = JSON.stringify([item.source_type, item.filename]);
    const records = sources.get(key) || [];
    records.push(item); sources.set(key, records);
  }
  return <section className="cu-analysis-detail" aria-label="Analysis claim detail">
    <button type="button" className="cu-back-link" onClick={onBack}>← Back to Analysis</button>
    <div className="cu-card cu-analysis-detail-summary">
      <h2 ref={heading} tabIndex={-1}>Claim {safe(row.claim)}</h2>
      <div className="cu-analysis-detail-results">
        <div><h3>Billed comparison <small>CLM02 vs latest CLP03</small></h3>
          <ComparisonResult status={row.billed_status} difference={row.difference} /></div>
        <div><h3>Allowed comparison <small>CLM02 vs total payments or payments + responsibility</small></h3>
          <ComparisonResult status={row.allowed_status} difference={row.allowed_difference} basis={row.allowed_basis} /></div>
      </div>
      {row.ambiguous && <p className="cu-help">This claim has multiple 837 source records, so the submission needs review. Individual source amounts appear below.</p>}
    </div>
    <p className="cu-help">835 billed uses CLP03 from the latest payment date (BPR16). Payments and patient responsibility accumulate across distinct records. Allowed comparison matches either total payments or payments plus responsibility. The source files below show each contribution.</p>
    <h2 className="cu-analysis-files-heading">Claim source files</h2>
    {[...sources].map(([key, records]) => {
      const source = records[0], is835 = source.source_type === "835";
      return <section key={key} className="cu-card cu-analysis-detail-file" aria-label={`${source.source_type} source ${source.filename}`}>
        <h3><span className="cu-analysis-file-type">{source.source_type}</span> {source.filename}</h3>
        <div className="cu-table-scroll" role="region" tabIndex={0} aria-label={`${source.source_type} claim amounts`}>
          <table className="cu-table cu-analysis-source-table">
            <thead><tr><th scope="col">Uploaded (UTC)</th>{is835 && <><th scope="col">Payment date <small>835 · BPR16</small></th><th scope="col">Internal claim <small>835 · CLP07</small></th></>}
              <th scope="col">Billed charges <small>{is835 ? "835 · CLP03" : "837 · CLM02"}</small></th>
              {is835 && <><th scope="col">Claim payment <small>835 · CLP04</small></th>
                <th scope="col">Patient responsibility <small>835 · CLP05 / PR</small></th>
                <th scope="col">Allowed amount <small>835 · Payment + responsibility</small></th></>}
            </tr></thead>
            <tbody>{records.map(item => <tr key={item.key}>
              <td><time dateTime={item.received_at}>{date(item.received_at)}</time></td>
              {is835 && <><td>{item.payment_date || "—"}</td><td>{safe(item.internal_number)}</td></>}<td>{money(is835 ? item.billed_835 : item.billed_837)}</td>
              {is835 && <><td>{money(item.payment)}</td><td>{money(item.patient_responsibility)}</td><td>{money(item.allowed)}</td></>}
            </tr>)}</tbody>
          </table>
        </div>
      </section>;
    })}
    {row.category === "837-only" && <p className="cu-help">No matching 835 is available in Analysis for this claim.</p>}
  </section>;
}
