import type {
  ContractReviewResponse,
  NegotiationPriority,
  ReviewApprovalGate,
} from "@/api/types";

/**
 * Split document text into contiguous sections each at most `maxChars`, breaking
 * on paragraph boundaries so no clause is cut mid-sentence. A single paragraph
 * larger than the limit is hard-split as a last resort. Order is preserved, so a
 * redline's `currentLanguage` still exists verbatim in the full document and can
 * be anchored at apply time.
 */
export function splitIntoSections(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const sections: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) sections.push(current);
    current = "";
  };

  for (const p of paragraphs) {
    const block = `${p}\n\n`;
    if (block.length > maxChars) {
      flush();
      for (let i = 0; i < p.length; i += maxChars) sections.push(p.slice(i, i + maxChars));
      continue;
    }
    if (current.length + block.length > maxChars) flush();
    current += block;
  }
  flush();

  return sections.length > 0 ? sections : [text.slice(0, maxChars)];
}

const LEVEL_RANK: Record<string, number> = { manager: 1, partner: 2, gc: 3 };
const RISK_RANK: Record<string, number> = { green: 1, yellow: 2, red: 3 };

function mergeGates(parts: ContractReviewResponse[]): ReviewApprovalGate | null | undefined {
  const gates = parts.map((p) => p.approvalGate).filter((g): g is ReviewApprovalGate => !!g);
  if (gates.length === 0) return parts[0]?.approvalGate;

  const required = gates.some((g) => g.required);
  let level: "manager" | "partner" | "gc" | null = null;
  for (const g of gates) {
    if (g.level && (!level || LEVEL_RANK[g.level] > LEVEL_RANK[level])) level = g.level;
  }
  const dealBreakerCount = gates.reduce((s, g) => s + (g.dealBreakerCount || 0), 0);
  const reasons = gates.flatMap((g) => g.reasons ?? []);
  const summary = required
    ? `${level ?? "Sign-off"} sign-off required. ${dealBreakerCount} deal-breaker${dealBreakerCount === 1 ? "" : "s"} across the document.`
    : "No sign-off required.";
  return { required, level, dealBreakerCount, reasons, summary };
}

function mergePriorities(parts: ContractReviewResponse[]): NegotiationPriority[] {
  const byTier = new Map<number, NegotiationPriority>();
  for (const p of parts) {
    for (const np of p.negotiationPriorities ?? []) {
      const existing = byTier.get(np.tier);
      if (existing) {
        existing.items = [...existing.items, ...np.items];
      } else {
        byTier.set(np.tier, { ...np, items: [...np.items] });
      }
    }
  }
  return [...byTier.values()].sort((a, b) => a.tier - b.tier);
}

/**
 * Merge per-section reviews into one result. Redlines and priorities concatenate
 * (sections are disjoint), the gate takes the highest level and summed
 * deal-breakers, and overall risk takes the worst section.
 *
 * `missingClauses` is intentionally cleared: a per-section pass cannot see the
 * whole contract, so "missing" claims would be false positives. The summary says
 * so, so the reviewer knows a whole-document missing-clause check was not done.
 */
export function mergeReviews(parts: ContractReviewResponse[]): ContractReviewResponse {
  const first = parts[0];
  const n = parts.length;

  let overallRisk = first.overallRisk;
  for (const p of parts) {
    if ((RISK_RANK[p.overallRisk] ?? 0) > (RISK_RANK[overallRisk] ?? 0)) overallRisk = p.overallRisk;
  }

  const sectionLines = parts
    .map((p, i) => `Section ${i + 1}: ${p.summary}`)
    .join(" ");
  const summary =
    `This document was too long for a single pass, so it was reviewed in ${n} sections. ` +
    `Missing-clause analysis is skipped in sectioned mode (no single section sees the whole contract). ` +
    sectionLines;

  return {
    ...first,
    summary,
    overallRisk,
    redlines: parts.flatMap((p) => p.redlines ?? []),
    negotiationPriorities: mergePriorities(parts),
    missingClauses: [],
    approvalGate: mergeGates(parts),
  };
}
