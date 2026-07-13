import { request, requestForm } from "./http";
import { ApiError } from "./errors";

/**
 * OCR for scanned uploads. When the plain text extractor returns nothing (a
 * scanned PDF or an image), this recovers the text via the backend OCR job so an
 * attachment is actually usable as context.
 *
 * Backend: POST /api/v1/legal-tools/ocr (multipart) -> 202 {jobId, status};
 * poll GET /api/v1/legal-tools/ocr/{jobId} until completed/failed. OCR consumes
 * one message-quota unit, so callers should only fall back to it when text
 * extraction genuinely found nothing.
 */
export interface OcrJob {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | string;
  progress: number;
  pageCount: number;
  extractedText?: string | null;
  filename?: string | null;
  errorMessage?: string | null;
}

// Formats the backend OCR accepts. Anything else should not attempt OCR.
const OCR_ELIGIBLE = /\.(pdf|jpe?g|png|tiff?)$/i;

/** Whether a filename is a format the OCR backend can process. */
export function isOcrEligible(name: string): boolean {
  return OCR_ELIGIBLE.test(name);
}

export async function startOcr(file: File, handwritten = false): Promise<OcrJob> {
  const form = new FormData();
  form.append("file", file);
  form.append("handwritten", String(handwritten));
  return requestForm<OcrJob>("/api/v1/legal-tools/ocr", form);
}

export async function getOcrJob(jobId: string): Promise<OcrJob> {
  return request<OcrJob>(`/api/v1/legal-tools/ocr/${jobId}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

const POLL_INTERVAL_MS = 2500;
const DEFAULT_MAX_WAIT_MS = 150_000;

/**
 * Start OCR and poll to completion, resolving with the extracted text. Bounded
 * by `maxWaitMs` so a stuck job cannot hang the attach flow forever; throws on
 * failure, timeout, or abort.
 */
export async function ocrToText(
  file: File,
  opts: { signal?: AbortSignal; onProgress?: (progress: number) => void; maxWaitMs?: number } = {},
): Promise<string> {
  const { signal, onProgress, maxWaitMs = DEFAULT_MAX_WAIT_MS } = opts;
  const started = Date.now();
  let job = await startOcr(file);
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (job.status === "completed") return (job.extractedText ?? "").trim();
    if (job.status === "failed") {
      throw new ApiError("server", 0, job.errorMessage || "OCR could not read this document.");
    }
    if (Date.now() - started > maxWaitMs) {
      throw new ApiError("network", 0, "OCR is taking too long. Try a smaller or clearer file.");
    }
    onProgress?.(job.progress ?? 0);
    await sleep(POLL_INTERVAL_MS, signal);
    job = await getOcrJob(job.jobId);
  }
}
