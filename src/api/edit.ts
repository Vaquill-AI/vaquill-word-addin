import { request } from "./http";
import type { ApprovalLevel, Grounding, RedlineSuggestion } from "./types";

/**
 * Whole-document, instruction-driven edits. Send the open document's text plus a
 * plain-English instruction and get back grounded edits (each anchored to
 * verbatim current language) to render as redline cards.
 *
 * Backend: POST /api/v1/drafting/edit-document. Fields are camelCase on the wire
 * (sectionReference / currentLanguage / proposedLanguage). The rich fields below
 * mirror the contract-review RedlineSuggestion methodology: the SERVER sets
 * `grounding` (anti-hallucination gate) and `approvalLevel` / `isDealBreaker`
 * (playbook gate); the model may propose `fallbackPosition` and `nature`. They
 * are optional so the client tolerates an older thin response.
 */
export interface EditItem {
  label: string;
  sectionReference: string;
  currentLanguage: string;
  proposedLanguage: string;
  rationale: string;
  /** The ladder rung to fall back to if the primary redline is rejected. */
  fallbackPosition?: string | null;
  /** Server-set: verified (verbatim span) | unverified (unconfirmed) | insertion. */
  grounding?: Grounding;
  /** Server-set from the playbook: which sign-off this edit needs before sending. */
  approvalLevel?: ApprovalLevel | null;
  /** Server-set from the playbook: a walk-away deal-breaker. */
  isDealBreaker?: boolean;
  /** The model's classification of the change. */
  nature?: "substantive" | "housekeeping";
}

interface EditResponse {
  edits: EditItem[];
}

export async function editDocument(
  documentText: string,
  instruction: string,
  /** System doc-type playbook slug (nda / msa / ...). When set, the server gates
   *  each edit against that playbook for approval level + deal-breaker. */
  contractType?: string,
  signal?: AbortSignal,
): Promise<EditItem[]> {
  const body: Record<string, unknown> = { documentText, instruction };
  if (contractType) body.contractType = contractType;
  const res = await request<EditResponse>("/api/v1/drafting/edit-document", {
    method: "POST",
    body,
    signal,
  });
  return res.edits ?? [];
}

/**
 * Map a backend edit to the RedlineSuggestion the review card renders + applies.
 * The rich fields (grounding / fallback / nature / approval / deal-breaker) come
 * straight from the server -- never faked. `grounding` defaults to "verified"
 * only because edit-document DROPS any edit whose current_language is not a
 * verbatim span, so every returned edit is genuinely verified (and the server
 * asserts it explicitly). Shared by the Assistant Edit flow and EditView.
 */
export function editToRedline(e: EditItem): RedlineSuggestion {
  return {
    clauseName: e.label,
    sectionReference: e.sectionReference || undefined,
    currentLanguage: e.currentLanguage,
    proposedLanguage: e.proposedLanguage,
    rationale: e.rationale,
    fallbackPosition: e.fallbackPosition ?? null,
    grounding: e.grounding ?? "verified",
    approvalLevel: e.approvalLevel ?? null,
    isDealBreaker: e.isDealBreaker ?? false,
    nature: e.nature,
  };
}
