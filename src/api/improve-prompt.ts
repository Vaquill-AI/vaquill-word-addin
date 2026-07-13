import { request } from "./http";

/**
 * One-click "Improve" for the QuillDraft generation brief. Rewrites the user's
 * key-terms/instructions into a sharper instruction the drafter can execute on,
 * WITHOUT inventing facts: missing parties / amounts / dates stay as bracketed
 * placeholders. Cheap pre-flight rewrite; does not consume the draft quota.
 *
 * Backend: POST /api/v1/drafting/improve-prompt. `changed` is false when the
 * brief was already clear enough that the rewrite is a no-op.
 */
export interface ImprovePromptResult {
  original: string;
  improved: string;
  notes?: string | null;
  changed: boolean;
}

// Three purpose-built improvers share one request/response shape. Each sharpens
// a different KIND of free-text field, so callers pick by what the field is:
//   - drafting: a document-generation brief (parties/terms -> a drafter brief)
//   - legalTool: a steering NOTE for an analysis (review focus, NDA context,
//     rewrite instruction) -- expands the issues to examine, never the facts
//   - chat: a research QUESTION for the assistant
const DRAFTING = "/api/v1/drafting/improve-prompt";
const LEGAL_TOOL = "/api/v1/legal-tools/improve-prompt";
const CHAT = "/api/v1/chat/improve-prompt";

export async function improveDraftingPrompt(prompt: string): Promise<ImprovePromptResult> {
  return request(DRAFTING, { method: "POST", body: { prompt } });
}

/** Improve a steering note (review focus, NDA business context, a rewrite
 *  instruction): expands the issues to cover without inventing facts. */
export async function improveLegalToolPrompt(prompt: string): Promise<ImprovePromptResult> {
  return request(LEGAL_TOOL, { method: "POST", body: { prompt } });
}

/** Improve a research question for the assistant composer. */
export async function improveChatPrompt(prompt: string): Promise<ImprovePromptResult> {
  return request(CHAT, { method: "POST", body: { prompt } });
}
