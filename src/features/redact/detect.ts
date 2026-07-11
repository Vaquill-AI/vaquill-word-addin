import type { DetectedEntity } from "@/api/redact";
import { aiCategoryForEntity, CATEGORIES } from "./categories";

export interface RedactCandidate {
  category: string;
  /** The exact text to redact (verbatim, so it can be found in the document). */
  text: string;
  /** How many times it appears in the document. */
  count: number;
}

/**
 * Scan document text for sensitive values in the selected categories.
 * A value is claimed by the highest-priority category that matches it (CATEGORIES
 * order), so nothing is double-listed. Returns unique values with occurrence
 * counts, grouped-ready (one entry per distinct value).
 */
export function scanText(text: string, selected: ReadonlySet<string>): RedactCandidate[] {
  const claimed = new Set<string>();
  const out: RedactCandidate[] = [];

  for (const cat of CATEGORIES) {
    if (!selected.has(cat.key)) continue;
    // value -> count, within this category
    const counts = new Map<string, number>();
    for (const pattern of cat.patterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[0]?.trim();
        if (!value || claimed.has(value)) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    for (const [value, count] of counts) {
      claimed.add(value);
      out.push({ category: cat.key, text: value, count });
    }
  }
  return out;
}

/** Count non-overlapping occurrences of `needle` in `haystack` (matchCase, like
 *  the office redaction search). */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Merge AI-detected entities into an existing regex candidate list.
 *
 * The backend returns entity-level kinds (person / organization / location);
 * each maps to a UI category key (names / orgs / locations) via
 * `aiCategoryForEntity`. Only entities in a selected AI category are kept. A
 * value already present as a candidate (exact-text match) is NOT re-added, so
 * nothing is listed twice; occurrence counts come from the same document text.
 * The office layer redacts longest-first, so a short entity that is a substring
 * of a longer value is still handled safely.
 */
export function mergeAiEntities(
  base: RedactCandidate[],
  entities: DetectedEntity[],
  text: string,
  selected: ReadonlySet<string>,
): RedactCandidate[] {
  const claimed = new Set(base.map((c) => c.text));
  const merged = [...base];

  for (const entity of entities) {
    const value = entity.text?.trim();
    if (!value || claimed.has(value)) continue;
    const catKey = aiCategoryForEntity(entity.category);
    if (!catKey || !selected.has(catKey)) continue;
    const count = countOccurrences(text, value);
    if (count === 0) continue; // Not in the document (text changed): skip.
    claimed.add(value);
    merged.push({ category: catKey, text: value, count });
  }
  return merged;
}
