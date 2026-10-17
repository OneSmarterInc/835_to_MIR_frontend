import React from "react";
import { money } from "./ClaimOccurrenceTable";
import { encodeDemoValue } from "../utils/demoEncoder";
import { analysisValues, type AnalysisRow, type AnalysisSortKey, type ComparisonStatus } from "../utils/claimAnalysis";

const columns: [AnalysisSortKey, string, string][] = [
  ["claim", "Claim", "837 / 835"],
  ["internal_number", "Internal claim", "Source reference"],
  ["billed_837", "837 billed", "837 · CLM02"], ["billed_835", "835 billed", "835 · CLP03"],
  ["payment", "Claim payment", "835 · CLP04"], ["patient_responsibility", "Patient responsibility", "835 · CLP05 / PR"],
  ["allowed", "Allowed amount", "835 · Payment + responsibility"],
  ["difference", "Billed comparison", "CLM02 vs CLP03"], ["allowed_difference", "Allowed comparison", "CLM02 vs allowed"],
];
const safe = (value: string) => value ? encodeDemoValue(value, true) : "—";

export function ComparisonResult({ status, difference }: { status: ComparisonStatus; difference: string | null }) {
  const tone = status === "Match" ? "match" : status === "Mismatch" ? "mismatch" : "review";
  return <div className={`cu-analysis-result is-${tone}`}><strong>{status}</strong>
    {difference !== null && <small>Difference {money(difference)}</small>}
    {status === "Amount unavailable" && <small>Source amounts need reprocessing</small>}
  </div>;
}

export default function AnalysisComparisonTable({ rows, sort, direction, onSort, onOpenClaim, disabled, emptyMessage }: {
  rows: AnalysisRow[]; sort: AnalysisSortKey; direction: string; onSort: (key: AnalysisSortKey) => void; emptyMessage: string;
  onOpenClaim: (key: string) => void; disabled?: boolean;
}) {
  return <div className="cu-table-scroll cu-comparison-scroll" tabIndex={0} role="region" aria-label="Claim amount comparisons">
    <table className="cu-table cu-comparison-table cu-analysis-table">
      <thead><tr>{columns.map(([key, label, source]) => <th key={key} scope="col"
        aria-sort={key === sort ? direction === "asc" ? "ascending" : "descending" : "none"}>
        <button type="button" onClick={() => onSort(key)}>
          <span>{label}<small>{source}</small></span><span aria-hidden="true">{key === sort ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
        </button>
      </th>)}</tr></thead>
      {rows.map(row => <tbody key={row.key} className="cu-analysis-group" aria-label={`Claim ${safe(row.claim)}`}>
        <tr className="cu-analysis-claim-row" onClick={() => { if (!disabled) onOpenClaim(row.key); }}>
          <th scope="row" className="cu-analysis-claim"><button type="button" className="cu-link" disabled={disabled}
            data-analysis-claim={row.key} aria-label={`Open claim ${safe(row.claim)}`}
            onClick={event => { event.stopPropagation(); onOpenClaim(row.key); }}>{safe(row.claim)}</button></th>
          <td>{(() => {
            const references = [...new Set(row.occurrences.map(item => item.internal_number).filter(Boolean))];
            return references.length > 1 ? `Multiple (${references.length})` : safe(references[0] || "");
          })()}</td>
          {(["billed_837", "billed_835", "payment", "patient_responsibility", "allowed"] as const).map(key => {
            const values = analysisValues(row, key);
            return <td key={key} className="cu-num">{values.length > 1 ? <span className="cu-analysis-multiple">Multiple ({values.length})</span> : money(values[0] ?? null)}</td>;
          })}
          <td className="cu-analysis-comparison-cell"><ComparisonResult status={row.billed_status} difference={row.difference} /></td>
          <td className="cu-analysis-comparison-cell"><ComparisonResult status={row.allowed_status} difference={row.allowed_difference} /></td>
        </tr>
      </tbody>)}
      {!rows.length && <tbody><tr><td colSpan={columns.length} className="cu-empty-comparison">{emptyMessage}</td></tr></tbody>}
    </table>
  </div>;
}
