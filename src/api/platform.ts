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
  // POST /drafting/import returns { draftId, title, category, ... } (camelCase,
  // no `id` alias). Reading `id` here always yielded undefined, breaking the
  // "Open it" link and the vendor-extraction flow.
  draftId: string;
  title?: string;
}

/** Land a prepared document (draft or reviewed contract) into the drafting editor. */
export async function importDraft(payload: ImportDraftRequest): Promise<DraftRef> {
  return request<DraftRef>("/api/v1/drafting/import", { method: "POST", body: payload });
}

/** File an EXISTING draft (already persisted by /generate) into a matter as a
 *  matter document. Use this instead of re-importing a generated draft, which
 *  would create a duplicate, mis-typed row. matterId is a query param. */
export async function saveDraftToMatter(draftId: string, matterId: string): Promise<void> {
  await request(
    `/api/v1/drafting/drafts/${draftId}/save-to-matter?matterId=${encodeURIComponent(matterId)}`,
    { method: "POST" },
  );
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

/** LLM-proposed vendor fields extracted from a DPA draft. NOT persisted; the
 *  user confirms before creating (POST /vendors). */
export interface VendorExtraction {
  vendorName?: string | null;
  contactEmail?: string | null;
  isSubprocessor?: boolean;
  dataCategories?: string[];
  subProcessors?: string[];
}

export interface VendorExtractResult {
  draftId: string;
  extraction: VendorExtraction;
}

/**
 * Extract a vendor/sub-processor PROPOSAL from a saved DPA draft. This does NOT
 * create the vendor (the backend deliberately requires human confirmation, and
 * the endpoint is gated behind a feature flag). Follow with createVendor().
 */
export async function extractVendorFromDraft(draftId: string): Promise<VendorExtractResult> {
  return request<VendorExtractResult>(`/api/v1/vendors/extract-from-draft/${draftId}`, {
    method: "POST",
  });
}

export interface VendorCreatePayload {
  name: string;
  contactEmail?: string;
  isSubprocessor?: boolean;
  dataCategories?: string[];
  linkDraftId?: string;
}

/** Create a vendor in the registry, optionally linked to the source draft. */
export async function createVendor(payload: VendorCreatePayload): Promise<{ id?: string }> {
  return request<{ id?: string }>("/api/v1/vendors", { method: "POST", body: payload });
}
