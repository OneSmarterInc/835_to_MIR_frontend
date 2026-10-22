import React, { useEffect, useRef } from "react";
import { ComparisonResult } from "./AnalysisComparisonTable";
import { money } from "./ClaimOccurrenceTable";
import { encodeDemoValue } from "../utils/demoEncoder";
import type { AnalysisOccurrence, AnalysisRow } from "../utils/claimAnalysis";

const safe = (value: string) => value ? encodeDemoValue(value, true) : "Not provided";
const date = (value: string) => new Date(value).toLocaleString("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});
const newestFirst = (a: AnalysisOccurrence, b: AnalysisOccurrence) =>
  Date.parse(b.received_at) - Date.parse(a.received_at) ||
  (a.file_id < b.file_id ? 1 : a.file_id > b.file_id ? -1 : (b.claim_sequence ?? 0) - (a.claim_sequence ?? 0));

function total(records: AnalysisOccurrence[], field: "payment" | "patient_responsibility" | "allowed"): string | null {
  let cents = 0n;
  for (const record of records) {
    const value = record[field];
    if (value == null) return null;
    cents += BigInt(value.replace(".", ""));
  }
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function Amounts({ values }: { values: [string, string | null][] }) {
  return <dl className="cu-claim-metrics">{values.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>;
}

function SourceFiles({ records, remittance }: { records: AnalysisOccurrence[]; remittance: boolean }) {
  const files = new Map<string, AnalysisOccurrence[]>();
  for (const item of [...records].sort(newestFirst)) {
    const key = `${item.source_type}:${item.file_id}`;
    const entries = files.get(key) || [];
    entries.push(item); files.set(key, entries);
  }
  return <>{[...files].map(([key, items]) => <section key={key} className="cu-claim-source" aria-label={`${items[0].source_type} source ${items[0].filename}`}>
    <header><span className="cu-analysis-file-type">{items[0].source_type}</span><h4>{items[0].filename}</h4>
      <span>{items.length} {items.length === 1 ? "record" : "records"}</span></header>
    <p className="cu-claim-source-date">Uploaded (UTC): <time dateTime={items[0].received_at}>{date(items[0].received_at)}</time></p>
    <div className="cu-table-scroll" role="region" tabIndex={0} aria-label={`${items[0].source_type} claim amounts`}>
      <table className="cu-table cu-claim-detail-table"><thead><tr>
        <th scope="col">Sequence</th>
        {remittance && <><th scope="col">Payment date <small>BPR16</small></th><th scope="col">Claim status <small>CLP02</small></th></>}
        <th scope="col">Billed charges <small>{remittance ? "CLP03 · Source value" : "CLM02"}</small></th>
        {remittance && <><th scope="col">Payment <small>CLP04</small></th><th scope="col">Patient responsibility <small>CLP05 / PR</small></th><th scope="col">Allowed amount <small>Payment + responsibility</small></th></>}
      </tr></thead><tbody>{items.map(item => <tr key={item.key}>
        <td>{item.claim_sequence ?? "—"}</td>
        {remittance && <><td>{item.payment_date || "—"}</td><td><span className={item.claim_status === "22" ? "cu-claim-reversal" : ""}>{item.claim_status === "22" ? "22 · Reversal" : item.claim_status || "—"}</span></td></>}
        <td className="cu-num">{money(remittance ? item.billed_835 : item.billed_837)}</td>
        {remittance && <><td className="cu-num">{money(item.payment)}</td><td className="cu-num">{money(item.patient_responsibility)}</td><td className="cu-num">{money(item.allowed)}</td></>}
      </tr>)}</tbody></table>
    </div>
  </section>)}</>;
}

export default function AnalysisClaimDetail({ row, onBack }: { row: AnalysisRow; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [row.key]);
  const internalClaims = new Map<string, AnalysisOccurrence[]>();
  const submissions = row.occurrences.filter(item => item.source_type === "837");
  const remittances = row.occurrences.filter(item => item.source_type === "835");
  for (const item of remittances) {
    const key = item.internal_number.trim().toUpperCase();
    const entries = internalClaims.get(key) || [];
    entries.push(item); internalClaims.set(key, entries);
  }
  return <section className="cu-analysis-detail" aria-label="Analysis claim detail">
    <button type="button" className="cu-back-link" onClick={onBack}>← Back to Analysis</button>
    <div className="cu-card cu-analysis-detail-summary">
      <div className="cu-claim-overview"><div><h2 ref={heading} tabIndex={-1}>Claim {safe(row.claim)}</h2>
        <p>{internalClaims.size} internal claim {internalClaims.size === 1 ? "group" : "groups"} · {remittances.length} remit {remittances.length === 1 ? "record" : "records"}</p></div>
        <div><h3>Allowed comparison</h3><ComparisonResult status={row.allowed_status} difference={row.allowed_difference} basis={row.allowed_basis} /></div></div>
      <Amounts values={[["837 billed", row.billed_837], ["Total payments", row.payment], ["Patient responsibility", row.patient_responsibility], ["Allowed amount", row.allowed]]} />
      {row.ambiguous && <p className="cu-help">Multiple 837 source records need review before an automatic match can be confirmed.</p>}
    </div>
    <p className="cu-help">Overall totals combine the internal claims below. Allowed comparison matches billed charges against total payments or payments plus patient responsibility. Each file retains its original CLP03 amount. Reversals reduce signed totals; an unresolved final reversal stays for review.</p>
    <h2 className="cu-analysis-files-heading">Internal claim breakdown</h2>
    {[...internalClaims].sort(([a], [b]) => a.localeCompare(b)).map(([internal, records], index) => {
      const latest = [...records].sort(newestFirst)[0];
      const fileCount = new Set(records.map(item => item.file_id)).size;
      return <details key={internal} className="cu-card cu-internal-claim" open>
        <summary><span>Internal claim {index + 1} · {safe(internal)}</span><span>{fileCount} {fileCount === 1 ? "file" : "files"} · {records.length} {records.length === 1 ? "record" : "records"}</span></summary>
        <Amounts values={[["Latest source billed · CLP03", latest.billed_835], ["Payments · CLP04 total", total(records, "payment")], ["Patient responsibility total", total(records, "patient_responsibility")], ["Allowed contribution", total(records, "allowed")]]} />
        <p className="cu-help">Latest entry: {latest.filename} · sequence {latest.claim_sequence ?? "—"}{latest.claim_status === "22" ? " · Reversed — review" : ""}. Ordered by upload time, then CLP sequence.</p>
        <SourceFiles records={records} remittance />
      </details>;
    })}
    {row.category === "837-only" && <p className="cu-help">No matching 835 is available in Analysis for this claim.</p>}
    <section className="cu-card cu-claim-submissions"><h2>837 submitted claim</h2><SourceFiles records={submissions} remittance={false} /></section>
  </section>;
}
