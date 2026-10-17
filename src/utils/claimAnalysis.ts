import type { Occurrence, Row } from "../components/ClaimOccurrenceTable";

export type AnalysisClaim = { claim: string; internal_number: string; billed: string; sequence: number };
export type AnalysisFile = { id: string; filename: string; kind: "837" | "835"; uploaded_at: string; claims: AnalysisClaim[] };
export type AnalysisRow = Row & { category: "both" | "837-only" };

// Keep exact, signed cents throughout comparison; never round through floating point.
const cents = (value: string) => BigInt(value.replace(".", ""));
const decimal = (value: bigint) => `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
const normalize = (value: string) => value.trim().toUpperCase();

export function analyzeClaims(submitted: AnalysisFile | null, received: AnalysisFile | null): AnalysisRow[] {
  if (!submitted) return [];
  const submissions = new Map<string, AnalysisClaim[]>(), remittances = new Map<string, AnalysisClaim[]>();
  for (const [file, map] of [[submitted, submissions], [received, remittances]] as const) {
    for (const claim of file?.claims || []) {
      const key = normalize(claim.claim), records = map.get(key) || [];
      records.push(claim); map.set(key, records);
    }
  }
  const occurrence = (file: AnalysisFile, claim: AnalysisClaim): Occurrence => ({
    key: `${file.id}:${claim.sequence}`, record_id: claim.sequence, file_id: file.id,
    source_type: file.kind, filename: file.filename, received_at: file.uploaded_at,
    internal_number: claim.internal_number, claim_sequence: claim.sequence,
    billed_837: file.kind === "837" ? claim.billed : null, billed_835: file.kind === "835" ? claim.billed : null,
  });
  const rows: AnalysisRow[] = [];
  for (const [number, claims] of submissions) {
    const matches = remittances.get(number) || [];
    const ambiguous = matches.length > 0 && (matches.length > 1 || claims.length > 1);
    const paired = matches.length === 1 && claims.length === 1;
    const difference = paired ? cents(claims[0].billed) - cents(matches[0].billed) : null;
    if (difference === 0n) continue;
    rows.push({ key: number, claim: number, internal_number: claims[0].internal_number, waiting_days: 0,
      category: matches.length ? "both" : "837-only", ambiguous,
      billed_837: claims.length === 1 ? claims[0].billed : null,
      billed_835: matches.length === 1 ? matches[0].billed : null,
      difference: difference === null ? null : decimal(difference < 0n ? -difference : difference),
      status: ambiguous ? "Multiple occurrences — review" : paired ? "Billed amounts differ" : received ? "Not in uploaded 835" : "Awaiting 835 upload",
      source_837: submitted.filename, source_835: matches.length ? received!.filename : "", record_835_id: null,
      occurrences: [...claims.map(claim => occurrence(submitted, claim)),
        ...matches.map(claim => occurrence(received!, claim))],
    });
  }
  return rows;
}

export function analysisCsv(rows: AnalysisRow[]): string {
  const escape = (value: string | null) => {
    let text = value ?? "";
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\ufeff" + [
    ["Claim", "File type", "Source file", "Uploaded", "Claim occurrence", "Internal claim", "Billed 837", "Billed 835", "Billed difference", "835/837 status"],
    ...rows.flatMap(row => row.occurrences.map(item => [row.claim, item.source_type, item.filename,
      item.received_at, String(item.claim_sequence), item.internal_number, item.billed_837, item.billed_835, row.difference, row.status])),
  ].map(record => record.map(escape).join(",")).join("\r\n");
}
