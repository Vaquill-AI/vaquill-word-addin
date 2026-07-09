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
