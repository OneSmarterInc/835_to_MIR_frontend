import type { Occurrence, Row } from "../components/ClaimOccurrenceTable";

export type AnalysisClaim = { claim: string; internal_number: string; billed: string; sequence: number;
  payment?: string | null; patient_responsibility?: string | null; allowed?: string | null; payment_date?: string | null; claim_status?: string };
export type AnalysisFile = { id: string; filename: string; kind: "837" | "835"; uploaded_at: string; claims: AnalysisClaim[];
  status?: "SAVED" | "PARTIAL" | "REJECTED"; accepted_count?: number; rejected_count?: number;
  rejections?: { sequence: number; claim_number: string; reason: string }[] };
export type ComparisonStatus = "Match" | "Mismatch" | "Multiple occurrences — review" | "Latest 835 needs review" | "Reversed — review" | "Awaiting 835 upload" | "Not in uploaded 835" | "Amount unavailable";
export type AnalysisOccurrence = Occurrence & { payment: string | null; patient_responsibility: string | null; allowed: string | null; payment_date?: string | null; claim_status?: string };
export type AnalysisRow = Omit<Row, "occurrences"> & { category: "both" | "837-only";
  reference_count?: number;
  internal_numbers?: string[];
  latest_uploaded_at?: string | null;
  latest_claim_status?: string;
  selected_record_id?: number | null;
  allowed_basis?: "payment" | "payment_and_responsibility";
  latest_payment_date?: string | null;
  display_amounts?: Record<"billed_837" | "billed_835" | "payment" | "patient_responsibility" | "allowed", { count: number; value: string | null }>;
  payment: string | null; patient_responsibility: string | null; allowed: string | null;
  billed_status: ComparisonStatus; allowed_status: ComparisonStatus; allowed_difference: string | null;
  occurrences: AnalysisOccurrence[] };
export type AnalysisSortKey = "claim" | "filename" | "internal_number" | "billed_837" | "billed_835" |
  "payment" | "patient_responsibility" | "allowed" | "difference" | "allowed_difference";

// Keep exact, signed cents throughout comparison; never round through floating point.
const cents = (value: string) => BigInt(value.replace(".", ""));
const decimal = (value: bigint) => {
  const magnitude = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, "0")}`;
};
const normalize = (value: string) => value.trim().toUpperCase();
const normalizeInternal = (value: string) => normalize(value).replace(/^ZZ:/, "").trim();
const allowedAmount = (claim: AnalysisClaim): string | null => claim.payment == null || claim.patient_responsibility == null
  ? null : decimal(cents(claim.payment) + cents(claim.patient_responsibility));
const differenceAmount = (left: string, right: string | null): string | null => {
  if (right == null) return null;
  const difference = cents(left) - cents(right);
  return decimal(difference < 0n ? -difference : difference);
};

// Identical financial records in the same uploaded file do not create an
// ambiguous match. Keep distinct amounts/references rather than choosing one.
type SourceClaim = { file: AnalysisFile; claim: AnalysisClaim };
const newestFirst = (left: SourceClaim, right: SourceClaim) =>
  Date.parse(right.file.uploaded_at) - Date.parse(left.file.uploaded_at) ||
  (left.file.id < right.file.id ? 1 : left.file.id > right.file.id ? -1 : right.claim.sequence - left.claim.sequence);

function distinctClaims(claims: SourceClaim[]): SourceClaim[] {
  const seen = new Set<string>();
  return [...claims].sort(newestFirst).filter(({ file, claim }) => {
    if (file.kind === "835" && !normalizeInternal(claim.internal_number)) return true;
    const key = JSON.stringify([file.filename, normalizeInternal(claim.internal_number), claim.billed, claim.payment ?? null, claim.patient_responsibility ?? null, claim.payment_date ?? null, claim.claim_status ?? ""]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function analysisValues(row: AnalysisRow, key: "billed_837" | "billed_835" | "payment" | "patient_responsibility" | "allowed"): (string | null)[] {
  if (key !== "billed_837") return [row[key]];
  const kind = "837";
  return [...new Set(row.occurrences.filter(item => item.source_type === kind).map(item => item[key]))];
}

export function analysisSources(row: AnalysisRow): AnalysisOccurrence[] {
  const seen = new Set<string>();
  return row.occurrences.filter(item => {
    const key = JSON.stringify([item.source_type, item.filename]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function analyzeClaims(submitted: AnalysisFile | AnalysisFile[] | null, received: AnalysisFile | AnalysisFile[] | null): AnalysisRow[] {
  const submittedFiles = !submitted ? [] : Array.isArray(submitted) ? submitted : [submitted];
  const receivedFiles = !received ? [] : Array.isArray(received) ? received : [received];
  const submissions = new Map<string, SourceClaim[]>(), remittances = new Map<string, SourceClaim[]>();
  for (const [files, map] of [[submittedFiles, submissions], [receivedFiles, remittances]] as const) {
    for (const file of files) for (const claim of file.claims) {
      const key = normalize(claim.claim), records = map.get(key) || [];
      records.push({ file, claim }); map.set(key, records);
    }
  }
  const occurrence = (file: AnalysisFile, claim: AnalysisClaim): AnalysisOccurrence => ({
    key: `${file.id}:${claim.sequence}`, record_id: claim.sequence, file_id: file.id,
    source_type: file.kind, filename: file.filename, received_at: file.uploaded_at,
    internal_number: file.kind === "835" ? normalizeInternal(claim.internal_number) : "", claim_sequence: claim.sequence,
    payment_date: file.kind === "835" ? claim.payment_date ?? null : null,
    claim_status: claim.claim_status ?? "",
    billed_837: file.kind === "837" ? claim.billed : null, billed_835: file.kind === "835" ? claim.billed : null,
    payment: file.kind === "835" ? claim.payment ?? null : null,
    patient_responsibility: file.kind === "835" ? claim.patient_responsibility ?? null : null,
    allowed: file.kind === "835" ? allowedAmount(claim) : null,
  });
  const rows: AnalysisRow[] = [];
  for (const [number, submittedClaims] of submissions) {
    const claims = distinctClaims(submittedClaims);
    const matches = distinctClaims(remittances.get(number) || []);
    const ambiguous = matches.length > 0 && claims.length > 1;
    const paired = matches.length > 0 && claims.length === 1;
    const sum = (value: (claim: AnalysisClaim) => string | null | undefined): string | null => {
      if (!matches.length) return null;
      let total = 0n;
      for (const { claim } of matches) {
        const amount = value(claim);
        if (amount == null) return null;
        total += cents(amount);
      }
      return decimal(total);
    };
    const references = [...new Set(matches.map(({ claim }) => normalizeInternal(claim.internal_number)).filter(Boolean))].sort();
    const latest = matches[0];
    const latestFile = latest?.file;
    const latestDate = latest?.claim.payment_date ?? null;
    const billed835 = latest?.claim.billed ?? null;
    const latestByInternal = new Map<string, SourceClaim>();
    for (const item of matches) {
      const internal = normalizeInternal(item.claim.internal_number) || `${item.file.id}:${item.claim.sequence}`;
      if (!latestByInternal.has(internal)) latestByInternal.set(internal, item);
    }
    const reversedClaim = [...latestByInternal.values()].some(item => item.claim.claim_status === "22");
    const payment = sum(claim => claim.payment);
    const responsibility = sum(claim => claim.patient_responsibility);
    const allowed = sum(allowedAmount);
    const difference = paired ? differenceAmount(claims[0].claim.billed, billed835) : null;
    const paymentsMatch = paired && payment === claims[0].claim.billed;
    const allowedDifference = paymentsMatch ? "0.00" : paired ? differenceAmount(claims[0].claim.billed, allowed) : null;
    const comparisonStatus = (delta: string | null): ComparisonStatus => reversedClaim ? "Reversed — review" : ambiguous ? "Multiple occurrences — review" :
      !matches.length ? receivedFiles.length ? "Not in uploaded 835" : "Awaiting 835 upload" :
      delta === null ? "Amount unavailable" : delta === "0.00" ? "Match" : "Mismatch";
    const billedStatus = paired && billed835 === null ? "Latest 835 needs review" : comparisonStatus(difference);
    rows.push({ key: number, claim: number, internal_number: references.join(" | "), reference_count: references.length, internal_numbers: references, waiting_days: 0,
      latest_uploaded_at: latestFile?.uploaded_at ?? null, latest_claim_status: latest?.claim.claim_status ?? "",
      latest_payment_date: latestDate, allowed_basis: paymentsMatch ? "payment" : "payment_and_responsibility",
      category: matches.length ? "both" : "837-only", ambiguous,
      billed_837: claims.length === 1 ? claims[0].claim.billed : null,
      billed_835: billed835,
      difference, allowed_difference: allowedDifference, allowed,
      payment,
      patient_responsibility: responsibility,
      billed_status: billedStatus, allowed_status: comparisonStatus(allowedDifference),
      status: billedStatus,
      source_837: claims[0].file.filename, source_835: matches.length ? matches[0].file.filename : "", record_835_id: null,
      occurrences: [...claims.map(({ file, claim }) => occurrence(file, claim)),
        ...matches.map(({ file, claim }) => occurrence(file, claim))],
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
    ["Claim", "837 source file", "835 source file", "837 uploaded (UTC)", "835 uploaded (UTC)", "Internal claim",
      "Billed charges (837 CLM02)", "Billed charges (835 CLP03)", "Claim payment (835 CLP04)",
      "Patient responsibility (835 CLP05 / PR)", "Allowed amount (835 payment + responsibility)",
      "Billed difference (CLM02 vs CLP03)", "Billed comparison status",
      "Allowed difference (CLM02 vs payment + responsibility)", "Allowed comparison status"],
    ...rows.map(row => {
      const sources = analysisSources(row);
      const source = (kind: string, key: "filename" | "received_at") => sources.filter(item => item.source_type === kind).map(item => item[key]).join(" | ");
      const amount = (key: Parameters<typeof analysisValues>[1]) => analysisValues(row, key).map(value => value ?? "Unknown").join(" | ");
      return [row.claim, source("837", "filename"), source("835", "filename"), source("837", "received_at"), source("835", "received_at"),
        [...new Set(row.occurrences.map(item => item.internal_number))].filter(Boolean).join(" | "),
        amount("billed_837"), amount("billed_835"), amount("payment"), amount("patient_responsibility"), amount("allowed"),
        row.difference, row.billed_status, row.allowed_difference, row.allowed_status];
    }),
  ].map(record => record.map(escape).join(",")).join("\r\n");
}

export function isAnalysisMismatch(row: AnalysisRow): boolean {
  return row.category === "both" && row.allowed_status !== "Match";
}
