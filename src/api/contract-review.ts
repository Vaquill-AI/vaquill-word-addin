import { postStream } from "./sse";
import { request } from "./http";
import { requestBinary } from "./http";
import { ApiError } from "./errors";
import type {
  ContractReviewRequest,
  ContractReviewResponse,
  CorrectedContractRequest,
  RedlineSuggestion,
  ReviewApprovalGate,
} from "./types";

const REVIEW_STREAM = "/api/v1/legal-tools/contract-review/stream";
const EXPORT_CORRECTED = "/api/v1/legal-tools/export-corrected";
const CLASSIFY = "/api/v1/legal-tools/contract-review/classify";
const DRAFT_FIX = "/api/v1/legal-tools/contract-review/redline/draft-fix";

/**
 * Auto-detect the contract type from the document so the Review form can pre-fill
 * it instead of asking the user. Fast, cheap, non-streaming. `contractType` is
 * null when nothing clearly fits, so the caller keeps its remembered default.
 */
export async function classifyContract(
  documentText: string,
): Promise<{ contractType: string | null; confidence: number }> {
  return request(CLASSIFY, { method: "POST", body: { documentText } });
}

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

// ---------------------------------------------------------------------------
// Agentic "Draft a stronger fix" (rung 1 of the agentic review system)
// ---------------------------------------------------------------------------

/** One reasoning phase of the agentic clause fix (plan -> draft -> validate ->
 *  repair -> critique -> gate). `progress` is 0..1 for a progress bar. */
export interface ClauseFixThinkingStep {
  step: string;
  message: string;
  progress: number;
}

/** The final, grounded, approval-gated replacement the loop produced. When
 *  `noChangeNeeded` is true the clause already meets the playbook position and
 *  `redline.proposedLanguage` echoes the current language (do not swap). */
export interface ClauseFixOutcome {
  redline: RedlineSuggestion;
  approvalGate?: ReviewApprovalGate | null;
  noChangeNeeded: boolean;
}

export interface ClauseFixRequest {
  clauseName: string;
  /** Normalized clause-type key; used server-side to pick the playbook position. */
  clauseType: string;
  currentLanguage: string;
  userSide?: string;
  paperSide?: "own" | "counterparty";
  playbookId?: string;
  jurisdiction?: string;
}

export interface ClauseFixHandlers {
  onThinking?: (t: ClauseFixThinkingStep) => void;
  onResult: (r: ClauseFixOutcome) => void;
  signal?: AbortSignal;
}

/**
 * Stream the agentic clause fix for a single flagged clause. Unlike the plain
 * `/drafting/clause/rewrite` refine, this drafts against the full playbook depth
 * and returns a verified, gated RedlineSuggestion. Emits `thinking` per phase and
 * one `result`. Throws ApiError on quota/transport failures. Resolves on `done`.
 */
export async function streamClauseFix(
  req: ClauseFixRequest,
  handlers: ClauseFixHandlers,
): Promise<void> {
  await postStream(DRAFT_FIX, req, {
    signal: handlers.signal,
    onEvent: ({ event, data }) => {
      switch (event) {
        case "thinking": {
          const p = safeParse<{ step?: string; message?: string; progress?: number }>(data);
          if (p && handlers.onThinking) {
            handlers.onThinking({
              step: p.step ?? "",
              message: p.message ?? "",
              progress: typeof p.progress === "number" ? p.progress : 0,
            });
          }
          break;
        }
        case "result": {
          // draft-fix emits a FLAT result payload {type,redline,approvalGate,...},
          // not the {data:<...>} envelope the review stream uses.
          const p = safeParse<{
            redline?: RedlineSuggestion;
            approvalGate?: ReviewApprovalGate | null;
            noChangeNeeded?: boolean;
          }>(data);
          if (p?.redline) {
            handlers.onResult({
              redline: p.redline,
              approvalGate: p.approvalGate ?? null,
              noChangeNeeded: !!p.noChangeNeeded,
            });
          }
          break;
        }
        case "error": {
          const e = safeParse<{ message?: string }>(data);
          throw new ApiError("server", 0, e?.message ?? "The fix could not be drafted.");
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
