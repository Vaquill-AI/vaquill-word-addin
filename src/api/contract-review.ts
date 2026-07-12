import { postStream } from "./sse";
import { requestBinary } from "./http";
import { ApiError } from "./errors";
import type {
  ContractReviewRequest,
  ContractReviewResponse,
  CorrectedContractRequest,
} from "./types";

const REVIEW_STREAM = "/api/v1/legal-tools/contract-review/stream";
const EXPORT_CORRECTED = "/api/v1/legal-tools/export-corrected";

/** Hard client-side cap mirrored from the backend ContractReviewRequest. */
export const MAX_DOCUMENT_CHARS = 200_000;

export interface ReviewProgress {
  step: number;
  total?: number;
  label?: string;
}

export interface ReviewStreamHandlers {
  onProgress?: (p: ReviewProgress) => void;
  onResult: (r: ContractReviewResponse) => void;
  signal?: AbortSignal;
}

function safeParse<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Stream a contract review. Resolves when the `done` event arrives.
 * Throws ApiError on quota (402), size (413), or transport failures.
 */
export async function streamContractReview(
  req: ContractReviewRequest,
  handlers: ReviewStreamHandlers,
): Promise<void> {
  if (req.documentText.length > MAX_DOCUMENT_CHARS) {
    throw new ApiError(
      "too_large",
      413,
      "This document is too long to review in full. Select a section instead.",
      "document_too_large",
    );
  }

  // The backend legal-tool stream carries the event name inside the JSON as
  // `type`, so sse.ts surfaces it as `event`. Payload shapes (see
  // legal_tools_streaming.py): init `{totalSteps}`, progress
  // `{stepIndex,label,status}`, result `{data: <review>}`, error `{message}`.
  let total: number | undefined;
  await postStream(REVIEW_STREAM, req, {
    signal: handlers.signal,
    onEvent: ({ event, data }) => {
      switch (event) {
        case "init": {
          const p = safeParse<{ totalSteps?: number }>(data);
          if (typeof p?.totalSteps === "number") total = p.totalSteps;
          break;
        }
        case "progress": {
          const p = safeParse<{ stepIndex?: number; label?: string }>(data);
          if (p && handlers.onProgress) {
            handlers.onProgress({ step: p.stepIndex ?? 0, total, label: p.label });
          }
          break;
        }
        case "result": {
          // The review is nested under `data` (event payload is {type,data}).
          const r = safeParse<{ data?: ContractReviewResponse }>(data);
          if (r?.data) handlers.onResult(r.data);
          break;
        }
        case "error": {
          const e = safeParse<{ message?: string }>(data);
          throw new ApiError("server", 0, e?.message ?? "The review failed.");
        }
        default:
          break; // done, heartbeats
      }
    },
  });
}

/**
 * Request the authoritative tracked-changes .docx for the accepted redlines.
 * The endpoint returns raw .docx bytes, base64-encoded here for Office.js
 * insertFileFromBase64. Authorship is stamped "Vaquill AI Contract Review"
 * server-side, which the in-pane apply path cannot do (Office.js cannot set a
 * tracked-change author).
 */
export async function exportCorrectedDocx(
  req: CorrectedContractRequest,
): Promise<{ base64: string; filename: string }> {
  return requestBinary(EXPORT_CORRECTED, { method: "POST", body: req });
}
