import { streamAssistant } from "@/api/chat";
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
}

export type VerdictMap = Record<string, { verdict: Verdict; reason: string }>;

const PROMPT =
  "You are triaging a counterparty's tracked changes to a contract, on behalf of the party reviewing " +
  "it (our preferred positions are in the playbook, if provided). For EACH numbered change output a " +
  'verdict: "accept" if it is harmless or improves our position, "review" if a human should look, or ' +
  '"reject" if it worsens our position, is one-sided against us, or hits a deal-breaker. ' +
  'Return ONLY a JSON array, one object per change, exactly like [{"i":0,"verdict":"accept","reason":"short reason"}]. ' +
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
        out.push({ i, verdict, reason: String((x as { reason?: unknown }).reason ?? "") });
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function triageChanges(
  texts: string[],
  positions: string | null,
  signal?: AbortSignal,
): Promise<VerdictMap> {
  const numbered = texts.map((t, i) => `${i}. ${t.trim() || "(formatting change)"}`).join("\n");
  const context =
    (positions ? `OUR PLAYBOOK POSITIONS:\n${positions}\n\n` : "") + `COUNTERPARTY CHANGES:\n${numbered}`;

  let acc = "";
  let streamError: unknown = null;
  try {
    await streamAssistant(
      [{ role: "user", content: PROMPT }],
      context,
      {
        signal,
        onDelta: (d) => {
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

  const parsed = parseVerdicts(acc);
  if (!parsed) {
    if (streamError) throw streamError;
    throw new Error("The AI triage response could not be read. Please try again.");
  }

  const map: VerdictMap = {};
  for (const v of parsed) {
    if (v.i >= 0 && v.i < texts.length) map[texts[v.i]] = { verdict: v.verdict, reason: v.reason };
  }
  return map;
}
