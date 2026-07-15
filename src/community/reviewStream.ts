import { errorMessage } from "@/api/errors";
import { uuid } from "@/api/ids";
import type { StreamHandlers } from "@/api/sse";
import type { ContractReviewResponse, Grounding, RedlineSuggestion } from "@/api/types";
import { clauseFixPrompt, contractReviewPrompt } from "@/ai/prompts";
import { runJson } from "./llm";

/**
 * Community port of the contract-review streams (redlines + the agentic
 * "draft a stronger fix"). Emits the SAME type-in-JSON SSE events the backend
 * legal-tool streams do (init / progress / result / error / done), so the review
 * UI (src/api/contract-review.ts consumer) is untouched.
 *
 * The backend's grounding gate is mimicked here: a redline is only marked
 * "verified" (safe to auto-apply) when its currentLanguage is a literal substring
 * of the contract; anything the model could not anchor is downgraded to
 * "unverified" so it is shown but never auto-applied.
 */
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function normalizeRedline(r: unknown, doc: string): RedlineSuggestion {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const currentLanguage = str(o.currentLanguage);
  let grounding: Grounding = "unverified";
  if (!currentLanguage) grounding = "insertion";
  else if (doc.includes(currentLanguage)) grounding = "verified";
  const nature =
    o.nature === "housekeeping" ? "housekeeping" : o.nature === "substantive" ? "substantive" : undefined;
  return {
    clauseName: str(o.clauseName, "Clause"),
    sectionReference: typeof o.sectionReference === "string" ? o.sectionReference : null,
    currentLanguage,
    proposedLanguage: str(o.proposedLanguage),
    rationale: str(o.rationale),
    fallbackPosition: typeof o.fallbackPosition === "string" ? o.fallbackPosition : null,
    grounding,
    approvalLevel: null,
    isDealBreaker: o.isDealBreaker === true,
    nature,
  };
}

function shapeReview(
  raw: Record<string, unknown>,
  doc: string,
  contractType: string | null,
  userSide: string | null,
): ContractReviewResponse {
  const redlines = (Array.isArray(raw.redlines) ? raw.redlines : []).map((r) => normalizeRedline(r, doc));
  const dealBreakers = redlines.filter((r) => r.isDealBreaker).length;
  const negotiationPriorities = Array.isArray(raw.negotiationPriorities)
    ? (raw.negotiationPriorities as ContractReviewResponse["negotiationPriorities"])
    : [];
  const missingClauses = Array.isArray(raw.missingClauses)
    ? raw.missingClauses.filter((x): x is string => typeof x === "string")
    : [];
  const flags = Array.isArray(raw.flags) ? (raw.flags as ContractReviewResponse["flags"]) : [];
  return {
    id: uuid(),
    summary: str(raw.summary),
    overallRisk: str(raw.overallRisk, "yellow"),
    contractType,
    userSide,
    redlines,
    negotiationPriorities,
    missingClauses,
    businessImpactSummary: typeof raw.businessImpactSummary === "string" ? raw.businessImpactSummary : null,
    approvalGate: {
      required: dealBreakers > 0,
      level: null,
      dealBreakerCount: dealBreakers,
      reasons: [],
      summary:
        dealBreakers > 0
          ? `${dealBreakers} deal-breaker issue(s) flagged; sign-off recommended before you send.`
          : "No deal-breakers flagged.",
    },
    flags,
  };
}

export async function communityReviewStream(body: unknown, opts: StreamHandlers): Promise<void> {
  const b = (body ?? {}) as {
    documentText?: string;
    contractType?: string;
    userSide?: string;
    markupLevel?: string;
    paperSide?: string;
    reviewInstructions?: string;
  };
  const doc = b.documentText ?? "";
  opts.onEvent({ event: "init", data: JSON.stringify({ totalSteps: 1 }) });
  opts.onEvent({ event: "progress", data: JSON.stringify({ stepIndex: 0, label: "Reviewing the contract" }) });
  try {
    const p = contractReviewPrompt(
      doc,
      str(b.contractType),
      str(b.userSide),
      str(b.markupLevel, "standard"),
      b.paperSide,
      b.reviewInstructions,
    );
    const raw = (await runJson(p.system, p.user)) as Record<string, unknown>;
    const review = shapeReview(raw, doc, b.contractType ?? null, b.userSide ?? null);
    opts.onEvent({ event: "result", data: JSON.stringify({ type: "result", data: review }) });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    opts.onEvent({ event: "error", data: JSON.stringify({ message: errorMessage(e) }) });
    return;
  }
  opts.onEvent({ event: "done", data: JSON.stringify({}) });
}

export async function communityDraftFixStream(body: unknown, opts: StreamHandlers): Promise<void> {
  const b = (body ?? {}) as { clauseName?: string; currentLanguage?: string; jurisdiction?: string };
  const current = str(b.currentLanguage);
  opts.onEvent({
    event: "thinking",
    data: JSON.stringify({ step: "draft", message: "Drafting a stronger clause", progress: 0.5 }),
  });
  try {
    const p = clauseFixPrompt(str(b.clauseName, "Clause"), current, str(b.jurisdiction, "US"));
    const raw = (await runJson(p.system, p.user)) as Record<string, unknown>;
    const proposed = str(raw.proposedLanguage) || current;
    const redline: RedlineSuggestion = {
      clauseName: str(b.clauseName, "Clause"),
      sectionReference: null,
      currentLanguage: current,
      proposedLanguage: proposed,
      rationale: str(raw.rationale),
      fallbackPosition: typeof raw.fallbackPosition === "string" ? raw.fallbackPosition : null,
      grounding: current ? "verified" : "unverified",
      approvalLevel: null,
      isDealBreaker: false,
      nature: "substantive",
    };
    const noChangeNeeded = raw.noChangeNeeded === true || proposed.trim() === current.trim();
    opts.onEvent({
      event: "result",
      data: JSON.stringify({ type: "result", redline, approvalGate: null, noChangeNeeded }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    opts.onEvent({ event: "error", data: JSON.stringify({ message: errorMessage(e) }) });
    return;
  }
  opts.onEvent({ event: "done", data: JSON.stringify({}) });
}
