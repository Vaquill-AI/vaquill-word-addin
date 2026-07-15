import { ApiError } from "@/api/errors";
import { uuid } from "@/api/ids";
import {
  citationStylePrompt,
  classifyContractPrompt,
  compliancePrompt,
  editDocumentPrompt,
  explainPrompt,
  guidelinesPrompt,
  improvePrompt,
  ndaTriagePrompt,
  plainEnglishPrompt,
  playbookFitPrompt,
  reconcilePrompt,
  redactPrompt,
  rewritePrompt,
  riskPrompt,
} from "@/ai/prompts";
import { searchCitation } from "./courtlistener";
import { getDraftRow, startDraft } from "./draft";
import { runJson } from "./llm";
import { del, getAll, put } from "./store";

/**
 * Community request shim. Replaces `fetch(api.vaquill.ai)` for the JSON API when
 * the build is the community edition. It matches the backend path + method to a
 * local handler that either runs the user's provider (LLM features) or reads/writes
 * IndexedDB (library CRUD), returning the SAME shape the backend would, so the
 * ~35 api/*.ts wrappers and every feature component are untouched.
 *
 * Anything not implemented here throws a REQUIRES_ACCOUNT error, which the UI
 * already renders as a friendly message. That is the default gate: a feature that
 * needs Vaquill AI's hosted data or account says so instead of failing oddly.
 */

interface StoredPrompt {
  id: string;
  userId: string;
  organizationId: string | null;
  title: string;
  body: string;
  scope: string;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
}

interface StoredClause {
  id: string;
  name: string;
  clauseType: string;
  content: string;
  jurisdiction: string;
  tone: string;
  applicableActs: string[];
  tags: string[];
  applicableCategories: string[] | null;
  source: string;
  isSystem: boolean;
  createdAt: string;
}

function bodyObj(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function nowIso(): string {
  return new Date().toISOString();
}

function requiresAccount(): never {
  throw new ApiError(
    "unknown",
    0,
    "This feature needs a Vaquill AI account and is not available in the community edition.",
    "REQUIRES_ACCOUNT",
  );
}

async function handleLlm(path: string, body: Record<string, unknown>): Promise<unknown> {
  switch (path) {
    case "/api/v1/drafting/clause/rewrite": {
      const p = rewritePrompt(
        str(body.clause_text),
        str(body.instruction, "Rewrite for clarity and legal precision"),
        str(body.mode, "rewrite"),
        str(body.tone, "balanced"),
        str(body.jurisdiction, "US"),
      );
      return runJson(p.system, p.user);
    }
    case "/api/v1/drafting/clause/explain": {
      const p = explainPrompt(str(body.clause_text), str(body.jurisdiction, "US"));
      return runJson(p.system, p.user);
    }
    case "/api/v1/legal-tools/plain-english": {
      const p = plainEnglishPrompt(str(body.text));
      return runJson(p.system, p.user);
    }
    case "/api/v1/legal-tools/risk-assessment": {
      const p = riskPrompt(str(body.documentText), str(body.riskCategory, "contract"));
      return runJson(p.system, p.user);
    }
    case "/api/v1/legal-tools/compliance-check": {
      const p = compliancePrompt(
        str(body.documentText),
        str(body.regulationType),
        str(body.documentCategory, "other"),
      );
      return runJson(p.system, p.user);
    }
    case "/api/v1/guidelines/check": {
      const p = guidelinesPrompt(str(body.documentText), strArray(body.guidelines));
      return runJson(p.system, p.user);
    }
    case "/api/v1/us/citation-style": {
      const p = citationStylePrompt(strArray(body.citations));
      return runJson(p.system, p.user);
    }
    case "/api/v1/drafting/improve-prompt":
      return runJson(...improveArgs(str(body.prompt), "drafting"));
    case "/api/v1/legal-tools/improve-prompt":
      return runJson(...improveArgs(str(body.prompt), "legalTool"));
    case "/api/v1/chat/improve-prompt":
      return runJson(...improveArgs(str(body.prompt), "chat"));
    case "/api/v1/legal-tools/nda-triage": {
      const p = ndaTriagePrompt(
        str(body.documentText),
        str(body.counterpartyName),
        str(body.businessContext),
      );
      const raw = (await runJson(p.system, p.user)) as Record<string, unknown>;
      // The result type requires an id; effectiveClassification mirrors
      // classification when no playbook is configured (there is none here).
      return { id: uuid(), ...raw, effectiveClassification: raw.classification ?? null };
    }
    case "/api/v1/drafting/reconcile-terms": {
      const p = reconcilePrompt(str(body.clauseText), str(body.destinationText));
      return runJson(p.system, p.user);
    }
    case "/api/v1/redaction/detect-entities": {
      const p = redactPrompt(str(body.documentText));
      return runJson(p.system, p.user);
    }
    case "/api/v1/legal-tools/contract-review/classify": {
      const p = classifyContractPrompt(str(body.documentText));
      const raw = (await runJson(p.system, p.user)) as Record<string, unknown>;
      return {
        contractType: typeof raw.contractType === "string" ? raw.contractType : null,
        confidence: typeof raw.confidence === "number" ? raw.confidence : 0.5,
      };
    }
    case "/api/v1/playbook-fit/check": {
      const positions = (
        body.positions && typeof body.positions === "object" ? body.positions : {}
      ) as Record<string, { standardPosition: string; fallbackLadder: string[]; dealBreaker: string | null }>;
      const p = playbookFitPrompt(str(body.documentText), positions);
      return runJson(p.system, p.user);
    }
    case "/api/v1/drafting/edit-document": {
      // Whole-document instruction edits run on the user's own model. Not
      // proprietary (like contract review, it is a grounded-redline task), so it
      // works in BYOK with a client-side grounding gate below.
      const documentText = str(body.documentText);
      const priorEdits = (Array.isArray(body.priorEdits) ? body.priorEdits : []).map((e) => {
        const o = bodyObj(e);
        return {
          label: str(o.label),
          currentLanguage: str(o.currentLanguage),
          proposedLanguage: str(o.proposedLanguage),
        };
      });
      const p = editDocumentPrompt(
        documentText,
        str(body.instruction),
        str(body.contractType) || undefined,
        strArray(body.priorInstructions),
        priorEdits,
      );
      const raw = (await runJson(p.system, p.user)) as Record<string, unknown>;
      return groundEdits(documentText, raw);
    }
    default:
      return null;
  }
}

/**
 * Grounding gate for edit-document, mirroring the backend: keep only edits whose
 * currentLanguage is a verbatim substring of the document (so the redline can be
 * located and applied), plus explicit insertions. A non-verbatim edit is dropped
 * rather than applied against text that is not there.
 */
function groundEdits(documentText: string, raw: Record<string, unknown>): unknown {
  const list = Array.isArray(raw.edits) ? raw.edits : [];
  const edits = list
    .map((item) => bodyObj(item))
    .map((e) => {
      const currentLanguage = str(e.currentLanguage);
      const isInsertion = str(e.grounding) === "insertion" || currentLanguage === "";
      const verbatim = currentLanguage !== "" && documentText.includes(currentLanguage);
      return { e, currentLanguage, isInsertion, verbatim };
    })
    .filter(({ isInsertion, verbatim }) => isInsertion || verbatim)
    .map(({ e, currentLanguage, isInsertion }) => ({
      label: str(e.label, "Edit"),
      sectionReference: str(e.sectionReference),
      currentLanguage,
      proposedLanguage: str(e.proposedLanguage),
      rationale: str(e.rationale),
      fallbackPosition: typeof e.fallbackPosition === "string" ? e.fallbackPosition : null,
      grounding: isInsertion ? "insertion" : "verified",
      nature:
        e.nature === "housekeeping" ? "housekeeping" : e.nature === "substantive" ? "substantive" : undefined,
    }));
  return { overview: str(raw.overview), edits, summary: str(raw.summary) };
}

interface StoredPlaybook {
  id: string;
  name: string;
  contractType: string;
  isDefault: boolean;
  positions: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  organizationId: string | null;
}

/** One bundled starter so the Playbooks list is not empty on first run. */
const SEED_PLAYBOOKS: StoredPlaybook[] = [
  {
    id: "seed-nda",
    name: "Mutual NDA (starter)",
    contractType: "nda",
    isDefault: true,
    positions: {
      confidentiality_term: {
        standardPosition: "Confidentiality survives 3 years after termination.",
        fallbackLadder: ["Up to 5 years", "Perpetual for trade secrets only"],
        dealBreaker: "No fixed term / indefinite for all information.",
      },
      permitted_use: {
        standardPosition: "Use limited to evaluating the stated business purpose.",
        fallbackLadder: ["Use for the ongoing relationship"],
        dealBreaker: "Unrestricted use of disclosed information.",
      },
      carve_outs: {
        standardPosition: "Standard exclusions (public, already known, independently developed, required by law).",
        fallbackLadder: [],
        dealBreaker: "No exclusions at all.",
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organizationId: null,
  },
];

async function seededPlaybooks(): Promise<StoredPlaybook[]> {
  const existing = await getAll<StoredPlaybook>("playbooks");
  if (existing.length > 0) return existing;
  for (const p of SEED_PLAYBOOKS) await put("playbooks", p);
  return SEED_PLAYBOOKS;
}

async function handlePlaybooksCrud(
  method: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (path === "/api/v1/legal-tools/playbooks") {
    if (method === "GET") {
      const playbooks = await seededPlaybooks();
      return { playbooks, total: playbooks.length };
    }
    if (method === "POST") {
      const ts = nowIso();
      const row: StoredPlaybook = {
        id: uuid(),
        name: str(body.name, "Playbook"),
        contractType: str(body.contractType, "custom"),
        isDefault: false,
        positions:
          body.positions && typeof body.positions === "object"
            ? (body.positions as Record<string, unknown>)
            : {},
        createdAt: ts,
        updatedAt: ts,
        organizationId: null,
      };
      await put("playbooks", row);
      return { id: row.id };
    }
  }
  const applyMatch = /^\/api\/v1\/legal-tools\/playbooks\/([^/]+)\/learning\/apply$/.exec(path);
  if (applyMatch && method === "POST") {
    const existing = (await getAll<StoredPlaybook>("playbooks")).find((p) => p.id === applyMatch[1]);
    if (!existing) throw new ApiError("not_found", 404, "Playbook not found.");
    const clauseType = str(body.clauseType);
    const text = str(body.text);
    const positions = { ...existing.positions } as Record<
      string,
      { standardPosition?: string; fallbackLadder?: string[]; dealBreaker?: string | null }
    >;
    const pos = positions[clauseType] ?? { standardPosition: "", fallbackLadder: [], dealBreaker: null };
    pos.fallbackLadder = [...(pos.fallbackLadder ?? []), text];
    positions[clauseType] = pos;
    await put("playbooks", { ...existing, positions, updatedAt: nowIso() });
    return {};
  }
  return null;
}

/** Case-law authority: verified browser-direct against the user's CourtListener
 *  token. Statute resolution and good-law treatment have no BYOK equivalent, so
 *  they return an empty/negative result the best-effort callers tolerate. */
async function handleAuthority(method: string, path: string): Promise<unknown> {
  const [clean, query = ""] = path.split("?");
  if (method === "GET" && clean === "/api/v1/us/citation-lookup") {
    return searchCitation(new URLSearchParams(query).get("citation") ?? "");
  }
  if (method === "GET" && /^\/api\/v1\/us\/case\/[^/]+\/citations$/.test(clean)) {
    return {}; // forward-citation count is not available browser-direct.
  }
  if (method === "GET" && clean === "/api/v1/us-statutes/resolve") {
    return { found: false }; // no statute corpus in the community edition.
  }
  if (method === "POST" && clean === "/api/v1/citation-status/batch") {
    return { results: [] }; // good-law treatment is not available browser-direct.
  }
  return null;
}

/** Degraded draft generation: mimics the queue-and-poll flow with an in-memory
 *  job (see community/draft.ts). */
async function handleDrafting(
  method: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (method === "POST" && path === "/api/v1/drafting/generate/queue") {
    return startDraft(body);
  }
  if (method === "GET" && path === "/api/v1/drafting/drafts") {
    // The drafts-list wrapper (api/drafts.ts) expects a bare array.
    return [];
  }
  const rowMatch = /^\/api\/v1\/drafting\/drafts\/([^/]+)$/.exec(path);
  if (method === "GET" && rowMatch) {
    const row = getDraftRow(rowMatch[1]);
    if (!row) throw new ApiError("not_found", 404, "Draft not found.");
    return row;
  }
  if (method === "POST" && /^\/api\/v1\/drafting\/drafts\/[^/]+\/cancel$/.test(path)) {
    return { cancelled: false };
  }
  return null;
}

function improveArgs(prompt: string, kind: "drafting" | "legalTool" | "chat"): [string, string] {
  const p = improvePrompt(prompt, kind);
  return [p.system, p.user];
}

async function handlePromptsCrud(
  method: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (path === "/api/v1/prompts") {
    if (method === "GET") {
      const prompts = await getAll<StoredPrompt>("prompts");
      prompts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return { prompts };
    }
    if (method === "POST") {
      const ts = nowIso();
      const row: StoredPrompt = {
        id: uuid(),
        userId: "local",
        organizationId: null,
        title: str(body.title),
        body: str(body.body),
        scope: str(body.scope, "private"),
        createdAt: ts,
        updatedAt: ts,
        isOwner: true,
      };
      await put("prompts", row);
      return row;
    }
  }
  const idMatch = /^\/api\/v1\/prompts\/([^/]+)$/.exec(path);
  if (idMatch) {
    const id = idMatch[1];
    if (method === "DELETE") {
      await del("prompts", id);
      return undefined;
    }
    if (method === "PATCH") {
      const existing = (await getAll<StoredPrompt>("prompts")).find((p) => p.id === id);
      if (!existing) throw new ApiError("not_found", 404, "Prompt not found.");
      const row: StoredPrompt = {
        ...existing,
        title: typeof body.title === "string" ? body.title : existing.title,
        body: typeof body.body === "string" ? body.body : existing.body,
        scope: typeof body.scope === "string" ? body.scope : existing.scope,
        updatedAt: nowIso(),
      };
      await put("prompts", row);
      return row;
    }
  }
  return null;
}

async function handleClausesCrud(
  method: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (path === "/api/v1/drafting/clauses") {
    if (method === "GET") {
      const clauses = await getAll<StoredClause>("clauses");
      clauses.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return clauses;
    }
    if (method === "POST") {
      const row: StoredClause = {
        id: uuid(),
        name: str(body.name),
        clauseType: str(body.clause_type, "custom"),
        content: str(body.content),
        jurisdiction: str(body.jurisdiction, "US"),
        tone: str(body.tone, "balanced"),
        applicableActs: [],
        tags: strArray(body.tags),
        applicableCategories: null,
        source: "user",
        isSystem: false,
        createdAt: nowIso(),
      };
      await put("clauses", row);
      return row;
    }
  }
  const idMatch = /^\/api\/v1\/drafting\/clauses\/([^/]+)$/.exec(path);
  if (idMatch && method === "DELETE") {
    await del("clauses", idMatch[1]);
    return undefined;
  }
  return null;
}

/** Benign responses for the shell's boot-time calls, so nothing crashes. */
function handleShell(method: string, path: string): unknown {
  if (method === "GET" && path === "/api/v1/auth/me") {
    return { userId: "local", initialized: true };
  }
  if (method === "GET" && path === "/api/v1/matters") return { matters: [], total: 0 };
  if (method === "GET" && path === "/api/v1/clients") return { clients: [], total: 0 };
  if (method === "GET" && path === "/api/v1/quotas/summary") {
    return { tier: "community", tierName: "Community (your key)", usage: null };
  }
  if (method === "POST" && path === "/api/v1/redline-feedback/feedback") return {};
  return null;
}

export async function communityRequest<T>(path: string, method: string, body: unknown): Promise<T> {
  const clean = path.split("?")[0];
  const m = method.toUpperCase();
  const b = bodyObj(body);

  const shell = handleShell(m, clean);
  if (shell !== null) return shell as T;

  const prompts = await handlePromptsCrud(m, clean, b);
  if (prompts !== null) return prompts as T;

  const clauses = await handleClausesCrud(m, clean, b);
  if (clauses !== null) return clauses as T;

  const playbooks = await handlePlaybooksCrud(m, clean, b);
  if (playbooks !== null) return playbooks as T;

  const authority = await handleAuthority(m, path);
  if (authority !== null) return authority as T;

  const drafting = await handleDrafting(m, clean, b);
  if (drafting !== null) return drafting as T;

  // LLM routes throw a provider ApiError on a bad key / rate limit (which must
  // surface) and return null only when the path is not an LLM route.
  if (m === "POST") {
    const llm = await handleLlm(clean, b);
    if (llm !== null) return llm as T;
  }

  return requiresAccount();
}
