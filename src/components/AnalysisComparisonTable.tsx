import React from "react";
import { money } from "./ClaimOccurrenceTable";
import { encodeDemoValue } from "../utils/demoEncoder";
import { analysisValues, type AnalysisRow, type AnalysisSortKey, type ComparisonStatus } from "../utils/claimAnalysis";

const columns: [AnalysisSortKey, string, string][] = [
  ["claim", "Claim", "837 / 835"],
  ["internal_number", "Internal claim", "835 · CLP07"],
  ["billed_837", "837 billed", "837 · CLM02"],
  ["payment", "Claim payment", "835 · CLP04 total"], ["patient_responsibility", "Patient responsibility", "835 · CLP05 / PR total"],
  ["allowed", "Allowed amount", "835 · Payment + responsibility totals"],
  ["allowed_difference", "Allowed comparison", "CLM02 vs payments / allowed"],
];
const safe = (value: string) => value ? encodeDemoValue(value, true) : "—";

export function ComparisonResult({ status, difference, basis }: { status: ComparisonStatus; difference: string | null; basis?: string }) {
  const tone = status === "Match" ? "match" : status === "Mismatch" ? "mismatch" : "review";
  return <div className={`cu-analysis-result is-${tone}`}><strong>{status}</strong>
    {status === "Match" && basis === "payment" && <small>Total payments match</small>}
    {difference !== null && <small>Difference {money(difference)}</small>}
    {status === "Amount unavailable" && <small>Source amounts need reprocessing</small>}
    {status === "Reversed — review" && <small>Latest CLP reverses the previous payment; review the source entries</small>}
    {status === "Latest 835 needs review" && <small>Conflicting CLP03 amounts in the latest uploaded file</small>}
  </div>;
}

export default function AnalysisComparisonTable({ rows, sort, direction, onSort, onOpenClaim, disabled, emptyMessage, loading = false, loadingRows = 10, showDenials = false }: {
  rows: AnalysisRow[]; sort: AnalysisSortKey; direction: string; onSort: (key: AnalysisSortKey) => void; emptyMessage: string;
  onOpenClaim: (key: string) => void; disabled?: boolean; loading?: boolean; loadingRows?: number; showDenials?: boolean;
}) {
  return <div className="cu-table-scroll cu-comparison-scroll" tabIndex={0} role="region" aria-label="Claim amount comparisons">
    <table className={`cu-table cu-comparison-table cu-analysis-table${showDenials ? " has-denials" : ""}`}>
      <thead><tr>{columns.map(([key, label, source]) => <th key={key} scope="col"
        aria-sort={key === sort ? direction === "asc" ? "ascending" : "descending" : "none"}>
        <button type="button" onClick={() => onSort(key)}>
          <span>{label}<small>{source}</small></span><span aria-hidden="true">{key === sort ? direction === "asc" ? "↑" : "↓" : "↕"}</span>
        </button>
      </th>)}{showDenials ? <><th scope="col" className="cu-analysis-denial-heading">CAS</th>
        <th scope="col" className="cu-analysis-denial-heading">Denial reason</th>
        <th scope="col" className="cu-analysis-denial-heading">RARC code</th></> : null}</tr></thead>
      {loading && <tbody className="cu-analysis-skeleton" aria-hidden="true">
        {Array.from({ length: loadingRows }, (_, index) => <tr key={index}>
          {columns.map(([key]) => <td key={key}><span /></td>)}
          {showDenials ? <><td><span /></td><td><span /></td><td><span /></td></> : null}
        </tr>)}
      </tbody>}
      {!loading && rows.map(row => <tbody key={row.key} className="cu-analysis-group" aria-label={`Claim ${safe(row.claim)}`}>
        <tr className="cu-analysis-claim-row" onClick={() => { if (!disabled) onOpenClaim(row.key); }}>
          <th scope="row" className="cu-analysis-claim"><button type="button" className="cu-link" disabled={disabled}
            data-analysis-claim={row.key} aria-label={`Open claim ${safe(row.claim)}`}
            onClick={event => { event.stopPropagation(); onOpenClaim(row.key); }}>{safe(row.claim)}</button></th>
          <td>{(() => {
            const references = row.internal_numbers ?? [...new Set(row.occurrences.filter(item => item.source_type === "835").map(item => item.internal_number).filter(Boolean))];
            if (!references.length) return safe(row.internal_number);
            return <span className="cu-analysis-references">{references.map(reference => <span key={reference}>{safe(reference)}</span>)}</span>;
          })()}</td>
          {(["billed_837", "payment", "patient_responsibility", "allowed"] as const).map(key => {
            const summary = row.display_amounts?.[key];
            if (summary) return <td key={key} className="cu-num">{summary.count > 1 ? <span className="cu-analysis-multiple">Multiple ({summary.count})</span> : money(summary.value)}</td>;
            const values = analysisValues(row, key);
            return <td key={key} className="cu-num">{values.length > 1 ? <span className="cu-analysis-multiple">Multiple ({values.length})</span> : money(values[0] ?? null)}</td>;
          })}
          <td className="cu-analysis-comparison-cell"><ComparisonResult status={row.allowed_status} difference={row.allowed_difference} basis={row.allowed_basis} /></td>
          {showDenials && <td className="cu-analysis-denial-codes cu-analysis-cas-codes">
            {row.denial_codes?.length ? row.denial_codes.map(code => <div key={code}>{code}</div>) : "—"}
          </td>}
          {showDenials && <td className="cu-analysis-denial-reasons">
            {row.carc_codes?.length ? row.carc_codes.map(item => <div key={item.code}>{item.description || "—"}</div>) : "—"}
          </td>}
          {showDenials ? <td className="cu-analysis-denial-codes">
            {row.rarc_codes?.length ? row.rarc_codes.map(item => <div key={item.code}><span className="cu-analysis-code"
              tabIndex={0} title={item.description || "Description unavailable"}
              aria-label={`${item.code}: ${item.description || "Description unavailable"}`}>{item.code}</span></div>) : "—"}
          </td> : null}
        </tr>
      </tbody>)}
      {!loading && !rows.length && <tbody><tr><td colSpan={columns.length + (showDenials ? 3 : 0)} className="cu-empty-comparison">{emptyMessage}</td></tr></tbody>}
    </table>
  </div>;
}
