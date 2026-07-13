import { request, requestForm } from "./http";

/**
 * Negotiation playbooks. Selecting one drives the review to the firm's
 * positions, fallback ladder, and deal-breakers instead of Vaquill AI's
 * default positions. This is the playbook-driven review.
 * Source: GET /api/v1/legal-tools/playbooks.
 */
export interface Playbook {
  id: string;
  name: string;
  description?: string | null;
  contractType: string;
  isDefault: boolean;
  /** ISO timestamp of the last edit. Drives the "modified X ago" label. */
  updatedAt?: string | null;
  /** ISO timestamp the playbook was created. */
  createdAt?: string | null;
  /**
   * Set when the playbook is shared across the user's organization (Playbook v2
   * org-sharing); null / absent for a personal playbook. Surfaced as a "Shared"
   * badge.
   */
  organizationId?: string | null;
}

interface PlaybookListResponse {
  playbooks: Playbook[];
  total: number;
}

const PLAYBOOKS = "/api/v1/legal-tools/playbooks";

export async function listPlaybooks(): Promise<Playbook[]> {
  const res = await request<PlaybookListResponse>(PLAYBOOKS);
  return res.playbooks ?? [];
}

/**
 * A negotiation position for one clause type: the ordered fallback ladder
 * (best-first standard, then fallbacks, then the walk-away floor).
 */
export interface PlaybookPosition {
  standardPosition: string;
  acceptableRange?: string;
  escalationTriggers?: string[];
  fallbackLadder: string[];
  dealBreaker?: string | null;
  priority?: "must_have" | "should_have" | "nice_to_have" | null;
}

export interface PlaybookDetail {
  id: string;
  name: string;
  contractType: string;
  isDefault: boolean;
  positions: Record<string, PlaybookPosition>;
  /** ISO timestamp of the last edit. Drives the "modified X ago" label. */
  updatedAt?: string | null;
  /** ISO timestamp the playbook was created. */
  createdAt?: string | null;
  /**
   * Set when the playbook is shared across the user's organization (Playbook v2
   * org-sharing); null / absent for a personal playbook. Surfaced as a "Shared"
   * badge.
   */
  organizationId?: string | null;
}

interface PlaybookDetailListResponse {
  playbooks: PlaybookDetail[];
  total: number;
}

/** Playbooks including their per-clause positions and fallback ladders. */
/** A starter playbook extracted from an open contract (not yet saved). */
export interface ExtractedPlaybook {
  /** Clause-type -> position map, passed straight back to createPlaybook. */
  positions: Record<string, unknown>;
  extractedCount: number;
  /** Detected (or supplied) contract-type key, e.g. "nda". */
  contractType: string;
  jurisdiction: string;
  source: string;
}

/**
 * Extract a starter playbook from the open contract's text: the backend
 * classifies each clause block and returns draft positions the user reviews and
 * saves. Does NOT persist (the human gate is `createPlaybook`). The positions are
 * passed back verbatim to createPlaybook, so no client-side reshaping is needed.
 */
export async function extractPlaybookFromText(text: string): Promise<ExtractedPlaybook> {
  const form = new FormData();
  form.append("text", text);
  form.append("contract_type", "auto");
  const res = await requestForm<{
    positions?: Record<string, unknown>;
    extracted_count?: number;
    contract_type?: string;
    jurisdiction?: string;
    source?: string;
  }>(`${PLAYBOOKS}/extract-from-docx`, form);
  const positions = res.positions ?? {};
  return {
    positions,
    extractedCount: res.extracted_count ?? Object.keys(positions).length,
    contractType: res.contract_type ?? "",
    jurisdiction: res.jurisdiction ?? "US",
    source: res.source ?? "text",
  };
}

/** Save a new playbook (e.g. from an extraction). Returns the created id. */
export async function createPlaybook(input: {
  name: string;
  contractType: string;
  positions: Record<string, unknown>;
}): Promise<{ id: string }> {
  return request<{ id: string }>(PLAYBOOKS, {
    method: "POST",
    body: {
      name: input.name,
      contractType: input.contractType,
      positions: input.positions,
    },
  });
}

export async function getPlaybooksWithPositions(): Promise<PlaybookDetail[]> {
  const res = await request<PlaybookDetailListResponse>(PLAYBOOKS);
  return (res.playbooks ?? []).map((p) => ({ ...p, positions: p.positions ?? {} }));
}

/** A safe clause key derived from a clause name. */
export function clauseKey(clauseName: string): string {
  return (
    clauseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "clause"
  );
}

/**
 * Add a proposed clause into a playbook NON-DESTRUCTIVELY via the backend
 * learning endpoint (POST /playbooks/{id}/learning/apply): it appends the text
 * as a new fallback rung on the target clause only (seeding the clause if it
 * doesn't exist yet) and snapshots a version, so it is undoable. Returns the
 * clause key used.
 *
 * The previous implementation re-serialized the ENTIRE positions map through a
 * 6-field shape and PUT it wholesale, which silently dropped rationale,
 * risk_weight, structured constraints, library_clause_id, and approval_level on
 * every clause and re-enabled disabled ones. This touches a single clause and
 * leaves the rest of the playbook (which drives review + drafting) intact.
 */
export async function addToPlaybook(
  playbook: PlaybookDetail,
  input: {
    clauseName: string;
    proposedLanguage: string;
    fallback?: string | null;
    isDealBreaker?: boolean;
  },
): Promise<string> {
  const key = clauseKey(input.clauseName);
  const apply = (text: string) =>
    request(`${PLAYBOOKS}/${playbook.id}/learning/apply`, {
      method: "POST",
      body: { clauseType: key, text: text.slice(0, 8000), mode: "add_fallback" },
    });

  const clause = (input.proposedLanguage ?? "").trim() || input.clauseName;
  await apply(clause);
  const extra = input.fallback?.trim();
  if (extra && extra !== clause) await apply(extra);
  return key;
}
