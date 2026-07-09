/**
 * Client-side US case-citation extractor. Finds candidate reporter citations
 * (volume reporter page) so we can verify each against the corpus. The backend
 * does the authoritative parsing and matching; this only needs to find spans.
 */

// Reporter tokens ordered specific-first so "F. Supp. 2d" wins over "F.".
const REPORTERS = [
  "U\\.?\\s?S\\.?",
  "S\\.?\\s?Ct\\.?",
  "L\\.?\\s?Ed\\.?(?:\\s?2d)?",
  "F\\.?\\s?Supp\\.?(?:\\s?(?:2d|3d))?",
  "F\\.?\\s?App'?x\\.?",
  "F\\.?\\s?(?:2d|3d|4th)",
  "F\\.",
  "A\\.?\\s?(?:2d|3d)?",
  "P\\.?\\s?(?:2d|3d)?",
  "N\\.?\\s?E\\.?(?:\\s?(?:2d|3d))?",
  "N\\.?\\s?W\\.?(?:\\s?(?:2d|3d))?",
  "S\\.?\\s?E\\.?(?:\\s?(?:2d|3d))?",
  "S\\.?\\s?W\\.?(?:\\s?(?:2d|3d))?",
  "So\\.?(?:\\s?(?:2d|3d))?",
  "Cal\\.?(?:\\s?(?:App|Rptr)\\.?)?(?:\\s?(?:2d|3d|4th|5th))?",
  "N\\.?\\s?Y\\.?(?:\\s?(?:2d|3d))?",
];

const CITATION_RE = new RegExp(
  `\\b(\\d{1,4})\\s+(${REPORTERS.join("|")})\\s+(\\d{1,4})\\b`,
  "g",
);

export interface ExtractedCitation {
  /** The citation exactly as it appears (first occurrence). */
  raw: string;
  /** How many times it appears in the document. */
  count: number;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Extract unique case citations from document text, with occurrence counts.
 * Deduped by normalized form; capped to keep verification within rate limits.
 */
export function extractCaseCitations(text: string, cap = 20): ExtractedCitation[] {
  const byKey = new Map<string, ExtractedCitation>();
  for (const m of text.matchAll(CITATION_RE)) {
    const raw = normalize(m[0]);
    const key = raw.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { raw, count: 1 });
  }
  return Array.from(byKey.values()).slice(0, cap);
}

export const EXTRACT_CAP = 20;
