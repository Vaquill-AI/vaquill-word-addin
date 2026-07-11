import { request } from "@/api/http";

/**
 * Custom guideline checklist: run a set of plain-English guideline questions
 * against the whole document. Each guideline comes back with a citation-grounded
 * verdict and a proving `quote` copied verbatim from the document (blank when the
 * verdict is not grounded in a document passage).
 *
 * Backed by POST /api/v1/guidelines/check, which accepts camelCase input
 * (validation_alias) and returns camelCase (serialization_alias). All fields are
 * required on the wire, but the UI still null-guards defensively.
 */

export type GuidelineVerdict = "met" | "partial" | "not_met" | "unclear";

export interface GuidelineResult {
  guideline: string;
  verdict: GuidelineVerdict;
  explanation: string;
  /** Verbatim proving passage from the document, or "" when not grounded. */
  quote: string;
}

interface GuidelineCheckResponse {
  results?: GuidelineResult[];
}

const GUIDELINES = "/api/v1/guidelines/check";

export async function checkGuidelines(
  documentText: string,
  guidelines: string[],
  signal?: AbortSignal,
): Promise<GuidelineResult[]> {
  const res = await request<GuidelineCheckResponse>(GUIDELINES, {
    method: "POST",
    body: { documentText, guidelines },
    signal,
  });
  return res.results ?? [];
}
