import React from "react";
import { money } from "./ClaimOccurrenceTable";
import { encodeDemoValue } from "../utils/demoEncoder";
import { analysisSources, analysisValues, type AnalysisRow, type AnalysisSortKey, type ComparisonStatus } from "../utils/claimAnalysis";

const columns: [AnalysisSortKey, string, string][] = [
  ["claim", "Claim", "837 / 835"], ["filename", "Source file", "Filename · uploaded UTC"],
  ["internal_number", "Internal claim", "Source reference"],
  ["billed_837", "Billed charges", "837 · CLM02"], ["billed_835", "Billed charges", "835 · CLP03"],
  ["payment", "Claim payment", "835 · CLP04"], ["patient_responsibility", "Patient responsibility", "835 · CLP05"],
  ["allowed", "Allowed amount", "835 · CLP04 + CLP05"],
  ["difference", "Billed comparison", "CLM02 vs CLP03"], ["allowed_difference", "Allowed comparison", "CLM02 vs allowed"],
];
const safe = (value: string) => value ? encodeDemoValue(value, true) : "—";

function ComparisonResult({ status, difference }: { status: ComparisonStatus; difference: string | null }) {
  const tone = status === "Match" ? "match" : status === "Mismatch" ? "mismatch" : "review";
  return <div className={`cu-analysis-result is-${tone}`}><strong>{status}</strong>
    {difference !== null && <small>Difference {money(difference)}</small>}
    {status === "Amount unavailable" && <small>CLP04 or CLP05 not provided</small>}
  </div>;
}

export default function AnalysisComparisonTable({ rows, sort, direction, onSort, emptyMessage }: {
  rows: AnalysisRow[]; sort: AnalysisSortKey; direction: string; onSort: (key: AnalysisSortKey) => void; emptyMessage: string;
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
        <tr>
          <th scope="row" className="cu-analysis-claim">{safe(row.claim)}</th>
          <td className="cu-analysis-source">{analysisSources(row).map(item => <div key={`${item.source_type}:${item.filename}`}>
            <span className="cu-analysis-file-type">{item.source_type}</span> <span>{item.filename}</span>
            <small><time dateTime={item.received_at}>{new Date(item.received_at).toLocaleString("en-US", {
              timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
            })}</time></small>
          </div>)}
          </td>
          <td>{[...new Set(row.occurrences.map(item => item.internal_number))].map(value => <div key={value}>{safe(value)}</div>)}</td>
          {(["billed_837", "billed_835", "payment", "patient_responsibility", "allowed"] as const).map(key => {
            const values = analysisValues(row, key);
            return <td key={key} className="cu-num">{values.length ? values.map(value => <div key={value ?? "unknown"}>{money(value)}</div>) : "—"}</td>;
          })}
          <td className="cu-analysis-comparison-cell"><ComparisonResult status={row.billed_status} difference={row.difference} /></td>
          <td className="cu-analysis-comparison-cell"><ComparisonResult status={row.allowed_status} difference={row.allowed_difference} /></td>
        </tr>
      </tbody>)}
      {!rows.length && <tbody><tr><td colSpan={columns.length} className="cu-empty-comparison">{emptyMessage}</td></tr></tbody>}
    </table>
  </div>;
}
