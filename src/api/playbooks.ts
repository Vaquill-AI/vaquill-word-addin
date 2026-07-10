import { request } from "./http";

/**
 * Negotiation playbooks. Selecting one drives the review to the firm's
 * positions, fallback ladder, and deal-breakers instead of Vaquill AI's
 * default positions. This is the LegalOn-style, playbook-driven review.
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
 * A negotiation position for one clause type: the ordered fallback ladder that
 * is the F3 moat (best-first standard -> fallbacks -> walk-away floor).
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

/** A starter playbook template a user can adopt in one click. */
export interface PlaybookTemplate {
  slug: string;
  name: string;
  description?: string;
  category?: string;
  contractType?: string;
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

/**
 * The snake_case shape the PUT /playbooks/{id} endpoint expects for a position.
 * The read side is camelCase (serialization_alias); the write side accepts field
 * names, which are snake_case, so we convert on the way back.
 */
interface SnakePosition {
  standard_position: string;
  acceptable_range: string;
  fallback_ladder: string[];
  escalation_triggers?: string[];
  deal_breaker?: string | null;
  priority?: string | null;
}

function toSnake(p: PlaybookPosition): SnakePosition {
  return {
    standard_position: (p.standardPosition ?? "").slice(0, 8000),
    acceptable_range: (p.acceptableRange ?? "Negotiable; see fallback ladder.").slice(0, 4000),
    fallback_ladder: p.fallbackLadder ?? [],
    escalation_triggers: p.escalationTriggers,
    deal_breaker: p.dealBreaker ?? null,
    priority: p.priority ?? null,
  };
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
 * Add a proposed clause into a playbook, NON-DESTRUCTIVELY: if the clause key
 * already exists, the language is appended to that clause's fallback ladder; if
 * not, a new position is created. Reuses the existing GET (already loaded) + PUT
 * /playbooks/{id}; no new backend endpoint. Returns the key used.
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
  const positions: Record<string, SnakePosition> = {};
  for (const [k, v] of Object.entries(playbook.positions)) positions[k] = toSnake(v);

  const clause = (input.proposedLanguage ?? "").trim();
  const extra = input.fallback?.trim();
  if (positions[key]) {
    const ladder = [...positions[key].fallback_ladder, clause, ...(extra ? [extra] : [])];
    positions[key] = { ...positions[key], fallback_ladder: ladder.filter(Boolean) };
  } else {
    positions[key] = {
      standard_position: clause.slice(0, 8000) || input.clauseName,
      acceptable_range: "Negotiable; see fallback ladder.",
      fallback_ladder: extra ? [extra] : [],
      deal_breaker: input.isDealBreaker ? "Flagged as a deal-breaker during review." : null,
      priority: null,
    };
  }

  await request(`${PLAYBOOKS}/${playbook.id}`, { method: "PUT", body: { positions } });
  return key;
}
