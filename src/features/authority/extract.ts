/**
 * Client-side US citation extractor. Finds candidate case-reporter citations
 * (volume reporter page) AND statute citations (federal U.S.C. / C.F.R. and
 * state code cites) so we can verify each against the corpus. The backend does
 * the authoritative parsing and matching; this only needs to find spans.
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

// Federal statute / regulation cites: "18 U.S.C. 1030", "42 U.S.C. § 1983(a)",
// "42 U.S.C.A. § 1983", "17 CFR 240.10b-5", "17 C.F.R. § 240.10b-5". Title
// numbers are 1-54, so a leading one-or-two-digit volume is required (this is
// what keeps a bare case reporter like "347 U.S. 483" out of this pattern:
// there is no "C" after "U.S." there).
const FEDERAL_STATUTE_RE =
  /\b\d{1,2}\s+(?:U\.?\s?S\.?\s?C\.?(?:A\.?)?|C\.?\s?F\.?\s?R\.?)\s+(?:§+\s*)?\d[\w.-]*(?:\s*\([\w]+\))*/g;

// State code cites, anchored on a capitalized abbreviation cluster followed by
// a section symbol: "Cal. Civ. Code § 1950.5", "N.Y. CPLR § 213",
// "Tex. Bus. & Com. Code § 17.50", "Fla. Stat. § 95.11", "A.R.S. § 3-201.01".
// Requiring the "§" plus a capitalized cluster keeps ordinary prose and bare
// contract-clause references ("§ 5.2") out.
const STATE_STATUTE_RE =
  /\b(?:(?:[A-Z][A-Za-z.'&]{0,14}|&)\.?\s+){1,6}§+\s*\d[\w.-]*(?:\s*\([\w]+\))*/g;

// A real state code cite carries an abbreviation-with-period ("Cal.", "N.Y.",
// "A.R.S.", "Fla.") or a code keyword. Requiring one keeps a document's own
// internal cross-references ("Agreement § 4.2") out of the statute results.
const STATE_CODE_SIGNAL_RE =
  /\b[A-Z][A-Za-z]{0,3}\.|(?:\bCode\b|\bStat(?:s|utes)?\b|\bAnn\b|\bCPLR\b|\bLaws\b|\bRev\.?\s?Stat)/;

// Cheap classifier used by the verifier to route a raw citation to the right
// endpoint without the extractor having to thread `kind` through the hook.
// A case reporter ("347 U.S. 483") contains none of these markers; a statute
// cite carries "U.S.C" / "C.F.R" / a section symbol / a code word.
const STATUTE_HINT_RE =
  /(?:U\.?\s?S\.?\s?C|C\.?\s?F\.?\s?R)\b|§|\bCode\b|\bStat(?:s|utes)?\b|\bCPLR\b/i;

export type CitationKind = "case" | "statute";

export interface ExtractedCitation {
  /** The citation exactly as it appears (first occurrence, whitespace-normalized). */
  raw: string;
  /** How many times it appears in the document. */
  count: number;
  /** Which corpus this citation should be verified against. */
  kind: CitationKind;
}

/** Coverage of the most recent extraction, so the UI can report the cap honestly. */
export interface ExtractCoverage {
  /** Total unique citations detected in the document (case + statute), before the cap. */
  detected: number;
  /** How many were returned for verification (min of detected and the cap). */
  checked: number;
  /** The cap that was applied. */
  cap: number;
}

export const EXTRACT_CAP = 20;

let lastCoverage: ExtractCoverage = { detected: 0, checked: 0, cap: EXTRACT_CAP };

/**
 * Coverage of the last {@link extractCaseCitations} call. Read by the Authority
 * view to show "Showing first N of M" so the cap never overstates coverage.
 * Extraction runs synchronously before any result renders, so this is always
 * current by the time the view reads it.
 */
export function getExtractCoverage(): ExtractCoverage {
  return lastCoverage;
}

/** True when a raw citation should be verified as a statute rather than a case. */
export function isStatuteCitation(raw: string): boolean {
  return STATUTE_HINT_RE.test(raw);
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

interface Hit {
  raw: string;
  start: number;
  end: number;
  kind: CitationKind;
}

function overlaps(hit: Hit, taken: Hit[]): boolean {
  return taken.some((t) => hit.start < t.end && t.start < hit.end);
}

function collect(re: RegExp, kind: CitationKind, text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(re)) {
    const whole = m[0];
    if (!whole) continue;
    const start = m.index ?? 0;
    hits.push({ raw: normalize(whole), start, end: start + whole.length, kind });
  }
  return hits;
}

/**
 * Extract unique case + statute citations from document text, with occurrence
 * counts. Deduped by normalized form and returned in document order; capped to
 * keep verification within rate limits. Federal statute spans are claimed
 * before state spans so a federal cite is never double-counted as a state one.
 * The full detected total is recorded in {@link getExtractCoverage}.
 */
export function extractCaseCitations(text: string, cap = EXTRACT_CAP): ExtractedCitation[] {
  const cases = collect(CITATION_RE, "case", text);
  const federal = collect(FEDERAL_STATUTE_RE, "statute", text);
  const state = collect(STATE_STATUTE_RE, "statute", text).filter((h) =>
    STATE_CODE_SIGNAL_RE.test(h.raw),
  );

  // Federal statute + case spans win over the broader state pattern so a
  // federal cite like "42 U.S.C. § 1983" is not re-captured as "U.S.C. § 1983".
  const claimed: Hit[] = [...cases, ...federal];
  const stateKept = state.filter((h) => !overlaps(h, claimed));

  const ordered = [...claimed, ...stateKept].sort((a, b) => a.start - b.start);

  const byKey = new Map<string, ExtractedCitation>();
  for (const h of ordered) {
    const key = h.raw.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { raw: h.raw, count: 1, kind: h.kind });
  }

  const unique = Array.from(byKey.values());
  const capped = unique.slice(0, cap);
  lastCoverage = { detected: unique.length, checked: capped.length, cap };
  return capped;
}
