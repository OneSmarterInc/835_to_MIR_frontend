import type { AnalysisRow } from "./claimAnalysis";

export const analysisEndpoint = "/edi835/api/client-portal/analysis/";
export type AnalysisUploadSummary = { id: string; filename: string; kind: "837" | "835"; uploaded_at: string;
  status: string; accepted_count: number; rejected_count: number };
export type AnalysisPage = { rows: AnalysisRow[]; total: number; page: number; pages: number;
  category: "both" | "837-only"; counts: Record<"both" | "837-only", number>; file_counts: Record<"837" | "835", number> };

export async function readAnalysis<T>(params: URLSearchParams, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${analysisEndpoint}?${params}`, { credentials: "include", signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || "Unable to load Analysis results. Please retry.");
  const view = params.get("view");
  if ((view === "comparison" && (!Array.isArray(result.rows) || !result.counts || !result.file_counts || !Number.isInteger(result.total)))
      || (view === "claim" && (!result.row || !Array.isArray(result.row.occurrences)))
      || (view === "rejections" && !Array.isArray(result.rejections))) {
    throw new Error("Unable to load Analysis results. Please retry.");
  }
  return result as T;
}

export async function downloadAnalysis(params: URLSearchParams, filename: string): Promise<void> {
  const response = await fetch(`${analysisEndpoint}?${params}`, { credentials: "include" });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Unable to download the report. Please retry.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  try {
    link.href = url; link.download = filename; document.body.appendChild(link); link.click();
  } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1500); }
}
