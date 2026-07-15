import { streamAssistant } from "@/api/chat";
import { request } from "@/api/http";
import type { PlaybookPosition } from "@/api/playbooks";

/**
 * AI triage of the counterparty's tracked changes against our playbook.
 * Each change is classified accept / review / reject so the acceptable ones can
 * be auto-accepted. No competitor does this bulk triage natively.
 */
export type Verdict = "accept" | "review" | "reject";

export interface RawVerdict {
  i: number;
  verdict: Verdict;
  reason: string;
  /** 1-3 word playbook clause the change relates to, when a playbook was given. */
  clause?: string;
}

/**
 * Verdicts keyed by the change's INDEX in the input list, not its text. Two
 * tracked changes can share identical snippet text (a counterparty striking the
 * same phrase in two places), so a text key silently collapses them; the index
 * is the stable identity that matches how the document resolves a change.
 */
export type VerdictMap = Record<number, { verdict: Verdict; reason: string; clause?: string }>;

const PROMPT =
  "You are triaging a counterparty's tracked changes to a contract, on behalf of the party reviewing " +
  "it (our preferred positions are in the playbook, if provided). For EACH numbered change output a " +
  'verdict: "accept" if it is harmless or improves our position, "review" if a human should look, or ' +
  '"reject" if it worsens our position, is one-sided against us, or hits a deal-breaker. When a playbook ' +
  'is provided, also add "clause": a 1 to 3 word label of the playbook clause the change relates to ' +
  "(omit it if none applies). " +
  'Return ONLY a JSON array, one object per change, exactly like ' +
  '[{"i":0,"verdict":"accept","reason":"short reason","clause":"Liability cap"}]. ' +
  "Keep each reason under 14 words. Output nothing except the JSON array.";

/** Compact, capped playbook context for the classifier. */
export function positionsSummary(positions: Record<string, PlaybookPosition>): string {
  const lines = Object.entries(positions).map(([k, p]) => {
    const name = k.replace(/_/g, " ");
    const db = p.dealBreaker ? ` (DEAL-BREAKER: ${p.dealBreaker})` : "";
    return `- ${name}: ${p.standardPosition}${db}`;
  });
  return lines.join("\n").slice(0, 6000);
}

function parseVerdicts(text: string): RawVerdict[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return null;
    const out: RawVerdict[] = [];
    for (const x of arr) {
      const i = (x as { i?: unknown }).i;
      const verdict = (x as { verdict?: unknown }).verdict;
      if (typeof i === "number" && (verdict === "accept" || verdict === "review" || verdict === "reject")) {
        const clause = (x as { clause?: unknown }).clause;
        out.push({
          i,
          verdict,
          reason: String((x as { reason?: unknown }).reason ?? ""),
          clause: typeof clause === "string" && clause.trim() ? clause.trim().slice(0, 40) : undefined,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

async function triageViaChat(
  texts: string[],
  positions: string | null,
  signal?: AbortSignal,
): Promise<VerdictMap> {
  const numbered = texts.map((t, i) => `${i}. ${t.trim() || "(formatting change)"}`).join("\n");
  const context =
    (positions ? `OUR PLAYBOOK POSITIONS:\n${positions}\n\n` : "") + `COUNTERPARTY CHANGES:\n${numbered}`;

  // Keep BOTH the raw streamed deltas and the final answer. The final can be the
  // pipeline's "corrected" text (citation / grounding gate), which reformats an
  // answer that has no citations -- and our JSON array has none -- so it can
  // mangle the very JSON we need. When that happens we fall back to the raw
  // stream, which still holds the model's original JSON array.
  let raw = "";
  let acc = "";
  let streamError: unknown = null;
  try {
    await streamAssistant(
      [{ role: "user", content: PROMPT }],
      context,
      {
        signal,
        onDelta: (d) => {
          raw += d;
          acc += d;
        },
        onFinal: (corrected) => {
          if (corrected) acc = corrected;
        },
      },
      { useRag: false },
    );
  } catch (e) {
    // A dropped trailing `done` frame throws even when the full JSON verdict
    // already arrived. Defer to the parse below: if `acc` is complete we salvage
    // the finished (already-billed) answer instead of forcing a re-run; only a
    // genuinely incomplete response rethrows. Mirrors useReview's `delivered`.
    streamError = e;
  }

  const parsed = parseVerdicts(acc) ?? parseVerdicts(raw);
  if (!parsed) {
    if (streamError) throw streamError;
    throw new Error("The AI triage response could not be read. Please try again.");
  }

  const map: VerdictMap = {};
  for (const v of parsed) {
    if (v.i >= 0 && v.i < texts.length) {
      map[v.i] = { verdict: v.verdict, reason: v.reason, clause: v.clause };
    }
  }
  return map;
}

interface EndpointVerdict {
  i?: number;
  verdict?: string;
  reason?: string;
  clause?: string;
}

/**
 * Structured triage via the backend endpoint. Throws to trigger the chat
 * fallback when the endpoint is unavailable (e.g. not yet deployed) or returns
 * nothing usable.
 */
async function triageViaEndpoint(
  texts: string[],
  positions: string | null,
  signal?: AbortSignal,
): Promise<VerdictMap> {
  const res = await request<{ verdicts?: EndpointVerdict[] }>(
    "/api/v1/legal-tools/contract-review/triage-changes",
    { method: "POST", body: { changes: texts, positionsText: positions ?? undefined }, signal },
  );
  const map: VerdictMap = {};
  for (const v of res.verdicts ?? []) {
    if (
      typeof v.i === "number" &&
      v.i >= 0 &&
      v.i < texts.length &&
      (v.verdict === "accept" || v.verdict === "review" || v.verdict === "reject")
    ) {
      const clause = v.clause?.trim();
      map[v.i] = {
        verdict: v.verdict,
        reason: String(v.reason ?? ""),
        clause: clause ? clause.slice(0, 40) : undefined,
      };
    }
  }
  if (Object.keys(map).length === 0) throw new Error("empty triage response");
  return map;
}

/**
 * Triage the counterparty's tracked changes. Prefers the structured backend
 * endpoint; falls back to the client-side chat triage when it is unavailable or
 * returns nothing usable, so triage always works.
 */
export async function triageChanges(
  texts: string[],
  positions: string | null,
  signal?: AbortSignal,
): Promise<VerdictMap> {
  if (texts.length === 0) return {};
  try {
    return await triageViaEndpoint(texts, positions, signal);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return triageViaChat(texts, positions, signal);
  }
}
