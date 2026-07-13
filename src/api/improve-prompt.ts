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

const IMPROVE_PROMPT = "/api/v1/drafting/improve-prompt";

export async function improveDraftingPrompt(prompt: string): Promise<ImprovePromptResult> {
  return request(IMPROVE_PROMPT, { method: "POST", body: { prompt } });
}
