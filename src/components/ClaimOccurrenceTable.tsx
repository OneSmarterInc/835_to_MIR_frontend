import React from "react";
import { claimAgeBand } from "./ClientClaimComparison";
import { encodeDemoValue } from "../utils/demoEncoder";
import "./Client835837Status.css";

export type Occurrence = { key: string; record_id: number; source_type: string; file_id: string;
  filename: string; received_at: string; internal_number: string; claim_sequence: number;
  billed_837: string | null; billed_835: string | null };
export type Row = { key: string; claim: string; internal_number: string; waiting_days: number;
  billed_837: string | null; billed_835: string | null; difference: string | null;
  status: string; source_837: string; source_835: string; record_835_id: number | null;
  ambiguous: boolean; occurrences: Occurrence[] };
export type SortKey = keyof Row | "source_type" | "filename" | "received_at";
const columns: [SortKey, string][] = [["claim", "Claim"], ["waiting_days", "Waiting days"],
  ["source_type", "Type"], ["filename", "Source file"], ["received_at", "Received"],
  ["internal_number", "Internal claim"], ["billed_837", "Billed 837"], ["billed_835", "Billed 835"],
  ["difference", "Billed difference"], ["status", "835/837 status"]];
const money = (value: string | null) => {
  if (value == null) return "—";
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return `${value.startsWith("-") ? "-" : ""}$${BigInt(whole).toLocaleString("en-US")}.${fraction.padEnd(2, "0")}`;
};
const safe = (value: string) => value ? encodeDemoValue(value, true) : "—";

export default function ClaimOccurrenceTable({ rows, zone = "UTC", loading = false, exporting = false,
  error = "", sort = "claim", direction = "asc", onSort, onOpen, showAge = true,
  emptyMessage = "No claims match these filters.", dateLabel = "Received", showFileId = true }: {
  rows: Row[]; zone?: string; loading?: boolean; exporting?: boolean; error?: string;
  sort?: SortKey; direction?: string; onSort?: (key: SortKey) => void; onOpen?: (id: number) => void;
  showAge?: boolean; emptyMessage?: string; dateLabel?: string; showFileId?: boolean;
}) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const group = groups.get(row.claim) || [];
    group.push(row); groups.set(row.claim, group);
  }
  const visibleColumns = columns.filter(([key]) => showAge || key !== "waiting_days")
    .map(([key, label]) => [key, key === "received_at" ? dateLabel : label] as [SortKey, string]);
  const received = (value: string) => !value ? "—" : new Date(value).toLocaleString("en-US", {
    timeZone: zone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return (
      <div className="cu-table-scroll cu-comparison-scroll" aria-busy={loading}>
        <table className="cu-table cu-comparison-table cu-835837-table">
          <thead><tr>{visibleColumns.map(([key, label]) => <th key={key} aria-sort={key === sort ? direction === "asc" ? "ascending" : "descending" : "none"}>
            <button type="button" disabled={loading || exporting || !onSort} onClick={() => {
              onSort?.(key);
            }}><span>{label}</span><span aria-hidden="true">{key === sort ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button>
          </th>)}</tr></thead>
          {[...groups].map(([claim, rows]) => {
            const files = rows.flatMap(row => row.occurrences.map((item, index) => ({ row, item, index })));
            const days = Math.max(...rows.map(row => row.waiting_days));
            return <tbody key={claim} className="cu-835837-group" aria-label={`Claim ${safe(claim)}`}>
              {files.map(({ row, item, index }, fileIndex) => <tr key={`${row.key}:${item.key}`} className={"cu-row-age-" + claimAgeBand(days)}>
                {fileIndex === 0 && <>
                  <th scope="rowgroup" rowSpan={files.length} className="cu-835837-claim">{safe(claim)}</th>
                  {showAge && <td rowSpan={files.length} className="cu-835837-age"><span className="cu-age-pill" title="Days since the oldest selected 837 receipt">{days === 0 ? "Today" : days + " days"}</span></td>}
                </>}
                <td><span className="cu-835837-type">{item.source_type}</span></td>
                <td className="cu-835837-source" title={`${item.filename} · file ${item.file_id} · claim #${item.claim_sequence}`}>
                  {item.source_type === "835" && onOpen ? <button type="button" className="cu-link" onClick={() => onOpen(item.record_id)}>{item.filename}</button> : item.filename}
                  {item.claim_sequence > 0 && <small>Occurrence {item.claim_sequence}{showFileId && <> · {item.file_id.slice(0, 8)}</>}</small>}
                </td>
                <td className="cu-835837-date"><time dateTime={item.received_at}>{received(item.received_at)}</time></td>
                <td>{safe(item.internal_number)}</td>
                <td className="cu-num">{money(item.billed_837)}</td><td className="cu-num">{money(item.billed_835)}</td>
                {index === 0 && <>
                  <td rowSpan={row.occurrences.length} className="cu-num cu-835837-result">{money(row.difference)}</td>
                  <td rowSpan={row.occurrences.length} className="cu-835837-result"><span className={row.ambiguous ? "cu-issue-warning" : "cu-issue-error"}>{row.status}</span></td>
                </>}
              </tr>)}
            </tbody>;
          })}
          {!rows.length && <tbody><tr><td colSpan={visibleColumns.length} className="cu-empty-comparison">
            {loading ? "Loading 835/837 comparisons…" : error ? "Unable to display claims." : emptyMessage}
          </td></tr></tbody>}
        </table>
      </div>
);
}
