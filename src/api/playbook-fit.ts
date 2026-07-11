import { request } from "@/api/http";
import type { PlaybookPosition } from "@/api/playbooks";

/**
 * Playbook fit report: evaluate the open contract against a negotiation
 * playbook's per-clause positions. For each clause the playbook covers (a
 * standard position, an ordered fallback ladder, and a walk-away deal-breaker),
 * the backend classifies where the contract sits on that clause's ladder and
 * returns a citation-grounded verdict with a proving `quote` copied verbatim from
 * the contract (blank when not grounded in a document passage).
 *
 * Backed by POST /api/v1/playbook-fit/check, which accepts camelCase input and
 * returns camelCase. All fields are required on the wire, but the UI still
 * null-guards defensively.
 */

export type PlaybookFitVerdict =
  | "meets_standard"
  | "meets_fallback"
  | "below_floor"
  | "not_addressed";

export interface PlaybookFitResult {
  clauseType: string;
  verdict: PlaybookFitVerdict;
  /** Short label of the matched ladder step, e.g. "Standard", "Fallback 2". */
  rung: string;
  finding: string;
  /** Verbatim proving passage from the contract, or "" when not grounded. */
  quote: string;
}

interface PlaybookFitResponse {
  results?: PlaybookFitResult[];
}

const PLAYBOOK_FIT = "/api/v1/playbook-fit/check";

/**
 * The wire shape for a clause position. Trimmed from {@link PlaybookPosition} to
 * only what the fit check reads (standard / ladder / floor), so we never ship the
 * whole playbook payload.
 */
interface PlaybookFitPositionInput {
  standardPosition: string;
  fallbackLadder: string[];
  dealBreaker: string | null;
}

/**
 * Reduce a playbook's positions map to the minimal shape the fit check needs.
 * Exported so the view can build the request body from a `PlaybookDetail`.
 */
export function toFitPositions(
  positions: Record<string, PlaybookPosition>,
): Record<string, PlaybookFitPositionInput> {
  const out: Record<string, PlaybookFitPositionInput> = {};
  for (const [clauseType, pos] of Object.entries(positions)) {
    out[clauseType] = {
      standardPosition: pos.standardPosition ?? "",
      fallbackLadder: pos.fallbackLadder ?? [],
      dealBreaker: pos.dealBreaker ?? null,
    };
  }
  return out;
}

export async function checkPlaybookFit(
  documentText: string,
  positions: Record<string, PlaybookPosition>,
  signal?: AbortSignal,
): Promise<PlaybookFitResult[]> {
  const res = await request<PlaybookFitResponse>(PLAYBOOK_FIT, {
    method: "POST",
    body: { documentText, positions: toFitPositions(positions) },
    signal,
  });
  return res.results ?? [];
}
