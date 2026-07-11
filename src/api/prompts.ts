import { request } from "./http";

/**
 * Prompt Library client — reusable saved prompts for the assistant composer.
 * Backend: /api/v1/prompts (GET list, POST create, PATCH update, DELETE).
 *
 * The backend serializes camelCase (serialization_alias on PromptResponse) and
 * the add-in does NOT auto-camelCase, so fields arrive camelCase exactly as
 * declared below. Create/update accept camelCase or snake_case (populate_by_name),
 * so sending these field names is safe.
 */

export type PromptScope = "private" | "org";

export interface Prompt {
  id: string;
  userId: string;
  organizationId: string | null;
  title: string;
  body: string;
  scope: PromptScope;
  createdAt: string;
  updatedAt: string;
  /** True when the caller created it (vs an org-shared prompt from a teammate). */
  isOwner: boolean;
}

interface PromptListResponse {
  prompts: Prompt[];
}

/** Own prompts (any scope) plus org-shared prompts from teammates, newest first. */
export async function listPrompts(signal?: AbortSignal): Promise<Prompt[]> {
  const res = await request<PromptListResponse>("/api/v1/prompts", { signal });
  return res.prompts ?? [];
}

export interface PromptInput {
  title: string;
  body: string;
  scope: PromptScope;
}

export async function createPrompt(input: PromptInput, signal?: AbortSignal): Promise<Prompt> {
  return request<Prompt>("/api/v1/prompts", { method: "POST", body: input, signal });
}

export async function updatePrompt(
  id: string,
  patch: Partial<PromptInput>,
  signal?: AbortSignal,
): Promise<Prompt> {
  return request<Prompt>(`/api/v1/prompts/${id}`, { method: "PATCH", body: patch, signal });
}

export async function deletePrompt(id: string, signal?: AbortSignal): Promise<void> {
  await request<void>(`/api/v1/prompts/${id}`, { method: "DELETE", signal });
}
