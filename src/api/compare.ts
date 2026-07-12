import { request, requestForm, requestBinary } from "./http";

/**
 * Document Compare: diff the open Word document against a reference version and
 * get a native tracked-changes redline. The heavy lifting (upload -> diff engine
 * -> redline DOCX + structured hunks) is the existing web `/compare/*` backend;
 * this client only orchestrates it from the pane.
 *
 * Flow: upload each side to `/uploads` -> POST `/run` with the two SourceRefs ->
 * poll `GET /{id}` until status is `ready` (or `failed`) -> download the redline
 * via `GET /{id}/redline.docx`.
 *
 * Backend base: /api/v1/compare (responses camelCase via serialization_alias).
 */
const BASE = "/api/v1/compare";

export type CompareFormat = "docx" | "doc" | "pdf";
export type ComparisonStatus = "queued" | "running" | "ready" | "failed";

/** Response from POST /uploads: a persisted source usable as one comparison side. */
export interface CompareUpload {
  fileId: string;
  format: CompareFormat;
  filename: string;
  sizeBytes: number;
  pageCount: number;
  /**
   * Present only for DOCX uploads that already carry tracked changes, comments,
   * or hidden text. The key is absent (not null) for clean uploads, so the flag
   * plus optional count is enough to warn "this side was compared as-is".
   */
  hiddenRevisions?: {
    hasHiddenRevisions?: boolean;
    trackedChangeCount?: number;
    hasComments?: boolean;
  } | null;
}

/** One side of the comparison, as the backend SourceRef shape. */
export interface SourceRef {
  type: "upload";
  id: string;
  filename: string;
  format: CompareFormat;
  pageCount: number;
  sizeBytes: number;
}

export interface Comparison {
  id: string;
  title: string;
  status: ComparisonStatus;
  hunkCount: number;
  substantiveCount: number;
  aiSummary: string | null;
  aiSummaryBullets: string[] | null;
  errorMessage: string | null;
}

/** Upload one side (the open document blob, or a picked reference file). */
export async function uploadCompareSource(
  file: Blob,
  filename: string,
  signal?: AbortSignal,
): Promise<CompareUpload> {
  const form = new FormData();
  form.append("file", file, filename);
  return requestForm<CompareUpload>(`${BASE}/uploads`, form, { signal });
}

/** Build a SourceRef from an upload result (defaulting page count defensively). */
export function sourceRefFromUpload(u: CompareUpload): SourceRef {
  return {
    type: "upload",
    id: u.fileId,
    filename: u.filename,
    format: u.format,
    pageCount: u.pageCount ?? 0,
    sizeBytes: u.sizeBytes ?? 0,
  };
}

/**
 * Queue a comparison. `original` is the baseline (older) side and `revised` is
 * the newer side, so the redline reads as changes FROM original TO revised.
 * `authorLabel` names the revision author on the produced redline.
 */
export async function runComparison(
  args: { original: SourceRef; revised: SourceRef; title: string; authorLabel: string },
  signal?: AbortSignal,
): Promise<{ comparisonId: string }> {
  return request<{ comparisonId: string }>(`${BASE}/run`, {
    method: "POST",
    body: {
      originalRef: args.original,
      revisedRef: args.revised,
      title: args.title,
      settings: { authorLabel: args.authorLabel, engine: "clippit" },
    },
    signal,
  });
}

/** Fetch one comparison (used to poll for terminal status). */
export async function getComparison(id: string, signal?: AbortSignal): Promise<Comparison> {
  return request<Comparison>(`${BASE}/${encodeURIComponent(id)}`, { signal });
}

/** Download the produced redline .docx (base64) for insert or download. */
export async function getRedlineDocx(
  id: string,
  signal?: AbortSignal,
): Promise<{ base64: string; filename: string }> {
  return requestBinary(`${BASE}/${encodeURIComponent(id)}/redline.docx`, {
    method: "GET",
    signal,
  });
}
