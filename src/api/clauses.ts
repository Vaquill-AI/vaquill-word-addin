import { request } from "./http";

/**
 * Personal clause library: reusable clause snippets a user (or the firm) saves
 * and inserts into the open document. Backed by the drafting clause-library
 * endpoints. System clauses (isSystem) ship with the product and cannot be
 * deleted; user clauses can.
 *
 * Backend: GET/POST /api/v1/drafting/clauses, DELETE /api/v1/drafting/clauses/{id}.
 * The drafting models read snake_case field names on input and return camelCase.
 */
export interface ClauseEntry {
  id: string;
  name: string;
  clauseType: string;
  content: string;
  jurisdiction: string;
  tone: string;
  applicableActs: string[];
  tags: string[];
  applicableCategories?: string[] | null;
  source: string;
  isSystem: boolean;
  createdAt?: string | null;
}

export interface ClauseSearchParams {
  clauseType?: string;
  jurisdiction?: string;
  tone?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export interface ClauseCreateInput {
  name: string;
  /** Pattern ^[a-z][a-z0-9_]*$ on the wire; callers should pass a normalized key. */
  clauseType: string;
  content: string;
  jurisdiction?: string;
  tone?: string;
  tags?: string[];
}

// Normalize a free-text name into a valid clause_type key (backend pattern
// ^[a-z][a-z0-9_]*$). Falls back to "custom_clause" when nothing usable remains.
export function toClauseTypeKey(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "")
    .slice(0, 64);
  return key || "custom_clause";
}

export async function searchClauses(params: ClauseSearchParams = {}): Promise<ClauseEntry[]> {
  const q = new URLSearchParams();
  if (params.clauseType) q.set("clauseType", params.clauseType);
  if (params.jurisdiction) q.set("jurisdiction", params.jurisdiction);
  if (params.tone) q.set("tone", params.tone);
  if (params.source) q.set("source", params.source);
  q.set("limit", String(params.limit ?? 100));
  if (params.offset) q.set("offset", String(params.offset));
  return request<ClauseEntry[]>(`/api/v1/drafting/clauses?${q.toString()}`);
}

export async function createClause(input: ClauseCreateInput): Promise<ClauseEntry> {
  const body = {
    name: input.name,
    clause_type: input.clauseType,
    content: input.content,
    jurisdiction: input.jurisdiction ?? "US",
    tone: input.tone ?? "balanced",
    tags: input.tags ?? [],
  };
  return request<ClauseEntry>("/api/v1/drafting/clauses", { method: "POST", body });
}

export async function deleteClause(id: string): Promise<void> {
  await request<void>(`/api/v1/drafting/clauses/${id}`, { method: "DELETE" });
}
