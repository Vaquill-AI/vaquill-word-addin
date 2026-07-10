import { request, requestForm } from "./http";

/**
 * Cross-links into the Vaquill platform: list matters, save the reviewed or
 * drafted work back as a draft (optionally under a matter, with redlines as
 * tracked changes), and save the open document as a reusable template.
 *
 * These endpoints exist already on the backend; the add-in is just now writing
 * work product back instead of only pulling AI generation. Endpoints under
 * /drafting and /templates take SNAKE_CASE input (BaseEntityModel, no alias
 * generator), unlike the camelCase review/chat endpoints.
 */

export interface Matter {
  id: string;
  name: string;
  clientId?: string | null;
  clientName?: string | null;
}
interface MattersResponse {
  matters: Matter[];
  total: number;
}

export async function listMatters(): Promise<Matter[]> {
  const res = await request<MattersResponse>("/api/v1/matters");
  return res.matters ?? [];
}

export interface Client {
  id: string;
  name: string;
}
interface ClientsResponse {
  clients: Client[];
  total: number;
}

export async function listClients(): Promise<Client[]> {
  const res = await request<ClientsResponse>("/api/v1/clients");
  return res.clients ?? [];
}

/** Save text (e.g. an assistant answer) as a note on a client, optionally
 * linked to a matter. `noteType` defaults to "general" server-side. */
export async function createClientNote(
  clientId: string,
  note: { content: string; title?: string; matterId?: string },
): Promise<{ id?: string }> {
  return request<{ id?: string }>(`/api/v1/clients/${clientId}/notes`, {
    method: "POST",
    body: note,
  });
}

/** One review finding mapped to the import endpoint's snake_case redline shape. */
export interface ImportRedline {
  id: string;
  clause_name?: string;
  section_reference?: string | null;
  current_language?: string;
  proposed_language?: string;
  rationale?: string;
  fallback_position?: string | null;
  priority?: string;
}

export interface ImportDraftRequest {
  title: string;
  category?: string;
  content?: unknown; // TipTap document JSON
  matter_id?: string;
  redlines?: ImportRedline[];
}

export interface DraftRef {
  id: string;
  title?: string;
}

/** Land a prepared document (draft or reviewed contract) into the drafting editor. */
export async function importDraft(payload: ImportDraftRequest): Promise<DraftRef> {
  return request<DraftRef>("/api/v1/drafting/import", { method: "POST", body: payload });
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export interface TemplateRef {
  id?: string;
  templateId?: string;
  jobId?: string;
}

/** Upload the open .docx (as base64) to become a parsed, variable-detected template. */
export async function uploadTemplate(
  base64: string,
  filename: string,
  title: string,
  category = "custom",
): Promise<TemplateRef> {
  const form = new FormData();
  form.append(
    "file",
    base64ToBlob(base64, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    filename,
  );
  form.append("title", title);
  form.append("category", category);
  return requestForm<TemplateRef>("/api/v1/templates/upload", form);
}

export interface VendorRef {
  id?: string;
  vendorId?: string;
  name?: string;
}

/**
 * Extract a sub-processor into the vendor registry from a saved DPA draft. Chains
 * off the draft id returned by importDraft, so reviewing a DPA in Word can land
 * it in the vendor/sub-processor registry in one more click.
 */
export async function extractVendorFromDraft(draftId: string): Promise<VendorRef> {
  return request<VendorRef>(`/api/v1/vendors/extract-from-draft/${draftId}`, { method: "POST" });
}
