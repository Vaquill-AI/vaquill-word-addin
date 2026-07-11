import { request } from "./http";

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
}

interface PlaybookDetailListResponse {
  playbooks: PlaybookDetail[];
  total: number;
}

/** Playbooks including their per-clause positions and fallback ladders. */
export async function getPlaybooksWithPositions(): Promise<PlaybookDetail[]> {
  const res = await request<PlaybookDetailListResponse>(PLAYBOOKS);
  return (res.playbooks ?? []).map((p) => ({ ...p, positions: p.positions ?? {} }));
}

/**
 * A starter playbook template a user can adopt in one click.
 *
 * The templates endpoint returns a RAW dict (no Pydantic serialization_alias),
 * and the add-in does not camelCase responses, so this field arrives snake_case
 * as `contract_type` -- unlike the Pydantic-backed Playbook/PlaybookPosition
 * models above, which alias to camelCase. Reading `contractType` here would be
 * silently `undefined`.
 */
export interface PlaybookTemplate {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  contract_type?: string;
  featured?: boolean;
}

interface TemplateListResponse {
  templates: PlaybookTemplate[];
  total: number;
}

export async function getPlaybookTemplates(): Promise<PlaybookTemplate[]> {
  const res = await request<TemplateListResponse>(`${PLAYBOOKS}/templates`);
  return res.templates ?? [];
}

/** Create a user-owned playbook from a starter template. Returns the new playbook. */
export async function createPlaybookFromTemplate(
  templateSlug: string,
  jurisdiction = "US",
): Promise<PlaybookDetail> {
  return request(`${PLAYBOOKS}/from-template`, {
    method: "POST",
    body: { templateSlug, jurisdiction },
  });
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
