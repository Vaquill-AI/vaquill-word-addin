import { request } from "./http";

/**
 * Per-suggestion quality feedback for the contract-review pane.
 *
 * The review pane shows quality thumbs (good / needs-work) on each redline
 * suggestion. This records that signal against the backend so the learning
 * layer can aggregate it. It is a lightweight, best-effort signal: distinct
 * from whether the user accepted or dismissed the redline into the document.
 */

/** "up" = good suggestion, "down" = needs work. */
export type RedlineRating = "up" | "down";

export interface RedlineFeedbackInput {
  rating: RedlineRating;
  clauseName?: string;
  clauseType?: string;
  contractType?: string;
  rationale?: string;
}

interface RedlineFeedbackResponse {
  recorded: boolean;
}

const REDLINE_FEEDBACK = "/api/v1/redline-feedback/feedback";

/**
 * Record a redline quality thumbs. Fire-and-forget: resolves to `true` when the
 * signal landed, `false` on any failure (including cancellation). Never throws,
 * so a failed POST can never disrupt the review flow.
 */
export async function recordRedlineFeedback(
  input: RedlineFeedbackInput,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    // Backend body is camelCase; see RedlineFeedbackRequest in the backend.
    const res = await request<RedlineFeedbackResponse>(REDLINE_FEEDBACK, {
      method: "POST",
      body: input,
      signal,
    });
    return Boolean(res?.recorded);
  } catch {
    // Best-effort: the optimistic local UI already reflects the rating.
    return false;
  }
}
