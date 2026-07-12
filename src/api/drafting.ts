import { request, requestForm } from "./http";
import { ApiError } from "./errors";

/**
 * Draft generation. POST /api/v1/drafting/generate produces a full,
 * template-constrained first-draft agreement (3 quota units, multi-LLM, not
 * streamed). The response includes `fullText` (plain text) which the add-in
 * inserts straight into Word. Request body is snake_case (the backend model
 * uses serialization_alias only; input is by field name).
 */

export interface Option {
  value: string;
  label: string;
}

/** A labelled group of document types, rendered as an <optgroup>. */
export interface OptionGroup {
  label: string;
  options: Option[];
}

/**
 * Document types the generator supports, grouped for the picker. Values are the
 * exact backend `DraftCategory` enum values. India-only litigation categories
 * are intentionally omitted (US-only surface).
 */
export const DRAFT_CATEGORY_GROUPS: OptionGroup[] = [
  {
    label: "Commercial",
    options: [
      { value: "nda", label: "NDA" },
      { value: "service", label: "Services Agreement" },
      { value: "consulting", label: "Consulting Agreement" },
      { value: "vendor_agreement", label: "Vendor Agreement" },
      { value: "dpa", label: "Data Processing Agreement" },
      { value: "baa", label: "Business Associate Agreement" },
      { value: "statement_of_work", label: "Statement of Work" },
      { value: "order_form", label: "Order Form" },
      { value: "supply", label: "Supply Agreement" },
      { value: "sale", label: "Sale Agreement" },
      { value: "reseller_agreement", label: "Reseller Agreement" },
      { value: "sla", label: "Service Level Agreement" },
      { value: "franchise", label: "Franchise Agreement" },
      { value: "film_production", label: "Film Production Agreement" },
    ],
  },
  {
    label: "Corporate",
    options: [
      { value: "partnership", label: "Partnership Agreement" },
      { value: "joint_venture", label: "Joint Venture" },
      { value: "shareholders", label: "Shareholders Agreement" },
      { value: "llc_operating_agreement", label: "LLC Operating Agreement" },
      { value: "safe", label: "SAFE" },
      { value: "convertible_note", label: "Convertible Note" },
      { value: "term_sheet", label: "Term Sheet" },
      { value: "letter_of_intent", label: "Letter of Intent" },
      { value: "stock_purchase_agreement", label: "Stock Purchase Agreement" },
      { value: "board_consent", label: "Board Consent" },
      { value: "loan", label: "Loan Agreement" },
      { value: "promissory_note", label: "Promissory Note" },
      { value: "power_of_attorney", label: "Power of Attorney" },
      { value: "settlement_agreement", label: "Settlement Agreement" },
    ],
  },
  {
    label: "Employment",
    options: [
      { value: "employment", label: "Employment Agreement" },
      { value: "offer_letter", label: "Offer Letter" },
      { value: "independent_contractor", label: "Independent Contractor" },
      { value: "severance_agreement", label: "Severance Agreement" },
    ],
  },
  {
    label: "Litigation",
    options: [
      { value: "complaint_civil", label: "Civil Complaint" },
      { value: "answer", label: "Answer" },
      { value: "motion", label: "Motion" },
      { value: "motion_to_dismiss", label: "Motion to Dismiss" },
      { value: "summary_judgment", label: "Summary Judgment" },
      { value: "discovery_request", label: "Discovery Request" },
      { value: "subpoena", label: "Subpoena" },
      { value: "interrogatories", label: "Interrogatories" },
      { value: "deposition_notice", label: "Deposition Notice" },
      { value: "cease_desist", label: "Cease and Desist" },
      { value: "demand_letter", label: "Demand Letter" },
      { value: "appeal_brief", label: "Appeal Brief" },
    ],
  },
  {
    label: "Real Estate",
    options: [
      { value: "lease", label: "Lease" },
      { value: "month_to_month_rental", label: "Month-to-Month Rental" },
      { value: "sublease_agreement", label: "Sublease Agreement" },
      { value: "lease_amendment", label: "Lease Amendment" },
      { value: "lease_renewal", label: "Lease Renewal" },
      { value: "notice_of_non_renewal", label: "Notice of Non-Renewal" },
      { value: "rent_increase_notice", label: "Rent Increase Notice" },
      { value: "notice_of_entry", label: "Notice of Entry" },
      { value: "notice_to_pay_or_quit", label: "Notice to Pay or Quit" },
      { value: "notice_to_cure_or_quit", label: "Notice to Cure or Quit" },
      { value: "notice_to_quit_unconditional", label: "Notice to Quit (Unconditional)" },
      { value: "notice_of_termination", label: "Notice of Termination" },
      { value: "notice_of_termination_by_tenant", label: "Notice of Termination (Tenant)" },
      { value: "security_deposit_itemization", label: "Security Deposit Itemization" },
      { value: "security_deposit_return_demand", label: "Security Deposit Return Demand" },
      { value: "estoppel_certificate", label: "Estoppel Certificate" },
      { value: "cosigner_guarantor_agreement", label: "Cosigner / Guarantor Agreement" },
      { value: "repair_and_deduct_notice", label: "Repair and Deduct Notice" },
      { value: "habitability_complaint", label: "Habitability Complaint" },
      { value: "answer_to_eviction", label: "Answer to Eviction" },
      { value: "affirmative_defense_brief", label: "Affirmative Defense Brief" },
      { value: "lockout_damages_demand", label: "Lockout Damages Demand" },
      { value: "tenant_petition_for_repairs", label: "Tenant Petition for Repairs" },
      { value: "anti_retaliation_complaint", label: "Anti-Retaliation Complaint" },
      { value: "wrongful_eviction_complaint", label: "Wrongful Eviction Complaint" },
      { value: "motion_to_quash_ud_service", label: "Motion to Quash UD Service" },
      { value: "demurrer_to_ud_complaint", label: "Demurrer to UD Complaint" },
      { value: "discovery_request_ud_defense", label: "Discovery Request (UD Defense)" },
      { value: "motion_to_stay_execution", label: "Motion to Stay Execution" },
      { value: "motion_for_relief_from_default", label: "Motion for Relief from Default" },
      { value: "motion_to_expunge_eviction_record", label: "Motion to Expunge Eviction Record" },
      { value: "fha_reasonable_accommodation_request", label: "FHA Reasonable Accommodation Request" },
      { value: "vawa_emergency_transfer_request", label: "VAWA Emergency Transfer Request" },
      { value: "fcra_adverse_action_dispute", label: "FCRA Adverse Action Dispute" },
      { value: "ab1482_exemption_addendum", label: "AB 1482 Exemption Addendum" },
      { value: "stipulation_for_judgment", label: "Stipulation for Judgment" },
      { value: "cash_for_keys_agreement", label: "Cash-for-Keys Agreement" },
      { value: "settlement_and_release", label: "Settlement and Release" },
      { value: "relocation_assistance_notice", label: "Relocation Assistance Notice" },
      { value: "small_claims_complaint", label: "Small Claims Complaint" },
    ],
  },
  {
    label: "IP / Other",
    options: [
      { value: "ip_assignment", label: "IP Assignment" },
      { value: "software_license", label: "Software License" },
      { value: "trademark_license", label: "Trademark License" },
      { value: "open_source_license", label: "Open Source License" },
      { value: "custom", label: "Custom" },
    ],
  },
];

/**
 * Flat listing of every document type, used by `labelOf` and default lookups.
 * Derived from the grouped set so the two never drift.
 */
export const DRAFT_CATEGORIES: Option[] = DRAFT_CATEGORY_GROUPS.flatMap((g) => g.options);

/** Drafting tone (ClauseTone in the backend). Sent as the `tone` field. */
export const DRAFT_TONES: Option[] = [
  { value: "protective", label: "Protective" },
  { value: "balanced", label: "Balanced" },
  { value: "permissive", label: "Permissive" },
];

export interface GeneratedSection {
  id: string;
  title: string;
  content: string;
  clauseType?: string | null;
}

/**
 * A structured issue for the review queue (DraftIssue in the backend). Older
 * responses omit `issues` entirely, so treat every field as optional.
 */
export interface DraftIssue {
  sectionId?: string | null;
  sectionTitle?: string | null;
  severity?: "info" | "warning" | "error";
  code: string;
  message: string;
  suggestedFix?: string | null;
}

/**
 * One legal authority cited across the draft (DraftAuthority in the backend).
 * `url` is present only when a click-to-verify link could be built.
 */
export interface DraftAuthority {
  citation: string;
  url?: string | null;
  kind?: string;
  jurisdiction?: string;
  verified?: boolean;
  pinpoint?: string;
}

export interface DraftResult {
  draftId: string;
  title: string;
  category: string;
  fullText: string;
  sections: GeneratedSection[];
  qualityScore?: number;
  issues?: DraftIssue[];
  authorities?: DraftAuthority[];
}

export interface DraftParams {
  category: string;
  title: string;
  governingLawState?: string;
  specialInstructions?: string;
  tone?: string;
  /**
   * Ids of uploaded reference documents (from uploadDraftReference) to ground the
   * generated draft in. The backend injects their extracted text into every
   * section prompt, so terms/party names/definitions can be carried across.
   */
  referenceDocumentIds?: string[];
}

/** One uploaded reference document, returned by uploadDraftReference. */
export interface DraftReference {
  id: string;
  fileName: string;
  wordCount: number;
}

/**
 * Upload a reference document to ground a draft. The backend extracts + stores
 * its text and returns an id to pass as `referenceDocumentIds` on generate.
 * Backend: POST /api/v1/drafting/upload-reference (multipart).
 */
export async function uploadDraftReference(file: File): Promise<DraftReference> {
  const form = new FormData();
  form.append("file", file);
  const res = await requestForm<{ id: string; fileName?: string; wordCount?: number }>(
    "/api/v1/drafting/upload-reference",
    form,
  );
  return { id: res.id, fileName: res.fileName ?? file.name, wordCount: res.wordCount ?? 0 };
}

const GENERATE = "/api/v1/drafting/generate";
const GENERATE_QUEUE = "/api/v1/drafting/generate/queue";
const draftPath = (id: string) => `/api/v1/drafting/drafts/${encodeURIComponent(id)}`;
const cancelPath = (id: string) => `${draftPath(id)}/cancel`;

/** Shared request body for both the synchronous and queued generate paths. */
function generateBody(p: DraftParams): Record<string, unknown> {
  return {
    category: p.category,
    title: p.title,
    jurisdiction: "US",
    tone: p.tone || "balanced",
    special_instructions: p.specialInstructions || undefined,
    governing_law_state: p.governingLawState || undefined,
    reference_document_ids:
      p.referenceDocumentIds && p.referenceDocumentIds.length > 0
        ? p.referenceDocumentIds
        : undefined,
  };
}

/**
 * Synchronous generation (legacy / fallback). One request that blocks until the
 * multi-LLM pipeline finishes and returns the full DraftResult (including
 * `authorities`, which the durable path does not persist). Bound to the request
 * lifecycle, so a nav-away or a stalled tab loses the result. Prefer
 * {@link generateDraftQueued}; this remains as a fallback for older backends.
 */
export async function generateDraft(p: DraftParams): Promise<DraftResult> {
  return request(GENERATE, { method: "POST", body: generateBody(p) });
}

// ------------------------------------------------------------------
// Durable queued generation (start -> poll -> reconstruct DraftResult)
// ------------------------------------------------------------------

/** Live progress event from the polled draft row (already camelCase on the
 *  wire; the backend writes these keys verbatim into `generation_progress`). */
export interface GenerationProgress {
  stepIndex?: number;
  label?: string;
  status?: string;
  totalSteps?: number;
  sections?: { title?: string; status?: string }[];
  /** Set to "CANCELLED" when the user stopped the run. */
  errorCode?: string;
}

export interface GenerateQueuedOptions {
  /** Aborts both the start request and the poll loop. */
  signal?: AbortSignal;
  /** Fires once the placeholder draft row exists, before any polling. Lets the
   *  caller keep the draftId so it can call {@link cancelDraftGeneration}. */
  onStart?: (draftId: string) => void;
  /** Fires on every poll tick with the latest lifecycle status + progress. */
  onProgress?: (update: { status: string; progress: GenerationProgress }) => void;
  /** Delay between poll ticks. Default 2000ms. */
  pollIntervalMs?: number;
  /** Overall wall-clock budget for the whole poll loop. Default 5 minutes. */
  pollTimeoutMs?: number;
}

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

/** Subset of DraftResponse (camelCase) the poll loop reads. All optional so an
 *  absent field never crashes the reconstruction. */
interface DraftRow {
  id?: string;
  title?: string;
  category?: string;
  content?: { type?: string; content?: TiptapNode[] } | null;
  metadata?: Record<string, unknown> | null;
  generationStatus?: string | null;
  generationProgress?: GenerationProgress | null;
  generationError?: string | null;
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

function abortError(): Error {
  return new DOMException("Generation cancelled.", "AbortError");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Flatten a TipTap node subtree to its plain text. */
function nodeText(node?: TiptapNode): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) return node.content.map(nodeText).join("");
  return "";
}

/**
 * Reconstruct the section outline from the stored TipTap document. Level-2
 * headings start a new section; level-1 headings are the reserved document
 * title (skipped); everything else is body text folded into the current
 * section. Mirrors how the backend builds the document from its skeleton.
 */
function sectionsFromDoc(blocks: TiptapNode[]): GeneratedSection[] {
  const sections: GeneratedSection[] = [];
  let current: { id: string; title: string; body: string[] } | null = null;
  let idx = 0;

  const flush = () => {
    if (current && (current.title || current.body.length > 0)) {
      sections.push({ id: current.id, title: current.title, content: current.body.join("\n\n") });
    }
    current = null;
  };

  for (const block of blocks) {
    const text = nodeText(block).trim();
    if (!text) continue;
    const rawLevel = block.attrs?.level;
    const level = typeof rawLevel === "number" ? rawLevel : undefined;
    if (block.type === "heading" && level === 1) continue;
    if (block.type === "heading" && level === 2) {
      flush();
      current = { id: `s-${idx++}`, title: text, body: [] };
      continue;
    }
    if (!current) current = { id: `s-${idx++}`, title: "", body: [] };
    current.body.push(text);
  }
  flush();
  return sections;
}

/** Rebuild the plain-text draft the way the backend does (uppercased title,
 *  blank-line-delimited sections) so the preview + Word insert match the
 *  synchronous path. */
function buildFullText(title: string, sections: GeneratedSection[]): string {
  const parts: string[] = [title.toUpperCase(), "", ""];
  for (const s of sections) {
    parts.push(s.title, "", s.content, "");
  }
  return parts.join("\n");
}

/** Map a completed draft row into the DraftResult shape the UI already renders.
 *  `authorities` is intentionally absent: the durable row does not persist it. */
function draftResultFromRow(row: DraftRow): DraftResult {
  const title = (row.title || "Untitled draft").toString();
  const doc = row.content ?? undefined;
  const blocks = Array.isArray(doc?.content) ? (doc?.content as TiptapNode[]) : [];
  const sections = sectionsFromDoc(blocks);
  const meta = row.metadata ?? {};
  const quality = (meta as { quality_score?: unknown }).quality_score;
  const issues = (meta as { issues?: unknown }).issues;
  return {
    draftId: row.id || "",
    title,
    category: row.category || "",
    fullText: buildFullText(title, sections),
    sections,
    qualityScore: typeof quality === "number" ? quality : undefined,
    issues: Array.isArray(issues) ? (issues as DraftIssue[]) : undefined,
  };
}

/**
 * Durable draft generation. POSTs to /generate/queue (which enqueues a Celery
 * job and returns immediately), then polls the draft row until it leaves the
 * in-flight state. Survives tab reload on the backend; the poll here just
 * reconnects the UI to progress. Resolves with the reconstructed DraftResult on
 * completion; rejects with an AbortError if the caller aborts or the run is
 * cancelled, or an ApiError on failure / timeout.
 */
export async function generateDraftQueued(
  p: DraftParams,
  opts: GenerateQueuedOptions = {},
): Promise<DraftResult> {
  const start = await request<{ draftId?: string; status?: string }>(GENERATE_QUEUE, {
    method: "POST",
    body: generateBody(p),
    signal: opts.signal,
  });
  const draftId = start?.draftId;
  if (!draftId) throw new Error("Draft generation could not be started.");
  opts.onStart?.(draftId);

  const interval = opts.pollIntervalMs ?? 2000;
  const deadline = Date.now() + (opts.pollTimeoutMs ?? 300_000);

  for (;;) {
    if (opts.signal?.aborted) throw abortError();
    if (Date.now() > deadline) {
      throw new ApiError(
        "unknown",
        0,
        "Draft generation is taking longer than expected. Open Vaquill to find it in your drafts.",
        "POLL_TIMEOUT",
      );
    }

    const row = await request<DraftRow>(draftPath(draftId), {
      method: "GET",
      signal: opts.signal,
      timeoutMs: 30_000,
    });

    // NULL generation_status means a legacy row that pre-dates the durable-job
    // migration; treat it as already completed.
    const gstatus = row?.generationStatus ?? "completed";
    const progress = (row?.generationProgress ?? {}) as GenerationProgress;
    opts.onProgress?.({ status: gstatus, progress });

    if (gstatus === "completed") return draftResultFromRow(row);
    if (gstatus === "failed") {
      // Cancellation reuses the `failed` status (no `cancelled` enum), tagged
      // via errorCode. Surface it as an abort, not a scary error.
      if (progress?.errorCode === "CANCELLED") throw abortError();
      throw new ApiError("unknown", 0, row?.generationError || "Draft generation failed. Please try again.");
    }

    await delay(interval, opts.signal);
  }
}

/**
 * Ask the backend to stop an in-flight generation. Idempotent and best-effort:
 * cancelling an already-finished (or foreign) draft returns `{cancelled:false}`.
 * Call this alongside aborting the local poll so the worker actually stops.
 */
export async function cancelDraftGeneration(draftId: string): Promise<boolean> {
  try {
    const res = await request<{ cancelled?: boolean }>(cancelPath(draftId), {
      method: "POST",
      timeoutMs: 15_000,
    });
    return res?.cancelled === true;
  } catch {
    // A failed cancel must never surface as a generation error; the local
    // abort already stopped the UI from waiting.
    return false;
  }
}

/** True when a caught error is a caller/user cancellation (vs a real failure). */
export function isGenerationCancelled(e: unknown): boolean {
  return isAbort(e);
}
