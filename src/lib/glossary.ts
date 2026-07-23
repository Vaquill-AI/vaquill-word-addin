/**
 * Build a reading glossary from a contract: each defined term mapped to the text
 * of its definition, for an in-Word "what does this term mean" navigator. Pure
 * client-side text analysis (no backend), deterministic, precision over recall.
 *
 * This complements the defined-terms HYGIENE analyzer (analyzeDefinedTerms),
 * which flags undefined / duplicate / unused terms but never captures the
 * definition body. Here we capture the body so a lawyer reading a clause can
 * resolve a term without scrolling back to the definitions section.
 */

// A defined term: opens with a capital, no quote chars inside, length-bounded.
// Straight and curly quotes both allowed. Mirrors lib/defined-terms.ts grammar.
const Q_OPEN = "[\"“”]";
const Q_CLOSE = "[\"“”]";
const TERM = "([A-Z][^\"“”]{0,60})";
const VERB =
  "(?:means|shall\\s+mean|shall\\s+have\\s+the\\s+meaning|has\\s+the\\s+meaning|refers?\\s+to|shall\\s+refer\\s+to)";

// "X" means / shall mean / has the meaning / refers to ...
const VERB_DEF = new RegExp(`${Q_OPEN}${TERM}${Q_CLOSE}(?:\\(s\\))?\\s*${VERB}\\b`, "gi");
// Parenthetical: ("X"), (the "X"), (each a "X"), (collectively, the "Xs"), ...
const PAREN_LEADIN =
  "(?:the\\s+|each\\s+(?:a\\s+)?|an?\\s+|collectively,?\\s+(?:the\\s+)?|individually,?\\s+(?:a\\s+)?|together,?\\s+(?:the\\s+)?|hereinafter,?\\s+(?:referred\\s+to\\s+as\\s+)?(?:the\\s+)?|referred\\s+to\\s+as\\s+(?:the\\s+)?)?";
const PAREN_DEF = new RegExp(`\\(\\s*${PAREN_LEADIN}${Q_OPEN}${TERM}${Q_CLOSE}`, "g");

const DEFINITION_MAX = 600;

export interface GlossaryEntry {
  term: string;
  /** The definition body: the line/paragraph the definition sits in. */
  definition: string;
  /** Total occurrences of the term in the document. */
  occurrences: number;
}

function normalizeTerm(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\(s\)$/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The line/paragraph that contains `index` (definitions sit one per line in the
 *  flattened body text), trimmed and capped. */
function lineAround(text: string, index: number): string {
  let start = index;
  while (start > 0 && text[start - 1] !== "\n" && text[start - 1] !== "\r") start--;
  let end = index;
  while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end++;
  return text.slice(start, end).trim().slice(0, DEFINITION_MAX);
}

/** The simple plural form(s) of a defined term, matching the counting rule in
 *  {@link countTermOccurrences}: a "y" ending pluralizes to "ies", otherwise "+s".
 *  Exported so occurrence-cycling searches the SAME set the badge counts, keeping
 *  the "N uses" count and the "k of N" cycle count in agreement. */
export function termOccurrenceVariants(term: string): string[] {
  return /y$/.test(term) ? [`${term.slice(0, -1)}ies`] : [`${term}s`];
}

/** Whole-word occurrence count, tolerating a simple plural. Case-sensitive so the
 *  defined "Party" is not confused with the ordinary word "party". No lookbehind
 *  (Safari / WKWebView safe). */
function countTermOccurrences(text: string, term: string): number {
  const forms = [term, ...termOccurrenceVariants(term)].map(escapeRe);
  const re = new RegExp(`\\b(?:${forms.join("|")})\\b`, "g");
  return (text.match(re) ?? []).length;
}

/**
 * Extract every defined term with its definition body. When a term is defined
 * more than once the first definition wins (the hygiene tool flags the
 * duplicate); the result is sorted alphabetically for a stable reading list.
 */
export function buildGlossary(text: string): GlossaryEntry[] {
  const seen = new Map<string, string>();
  for (const re of [VERB_DEF, PAREN_DEF]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const term = normalizeTerm(m[1]);
      if (term.length < 2 || seen.has(term)) continue;
      seen.set(term, lineAround(text, m.index));
    }
  }
  const entries: GlossaryEntry[] = [];
  for (const [term, definition] of seen) {
    entries.push({ term, definition, occurrences: countTermOccurrences(text, term) });
  }
  entries.sort((a, b) => a.term.localeCompare(b.term));
  return entries;
}

/**
 * Resolve a selected snippet to a glossary entry: an exact term match (ignoring
 * case, quotes, and a trailing plural), or a selection that contains exactly one
 * known term. Returns null when nothing resolves unambiguously.
 */
export function resolveSelectionTerm(
  entries: GlossaryEntry[],
  selection: string,
): GlossaryEntry | null {
  const sel = selection.trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  if (!sel) return null;
  const lower = sel.toLowerCase();

  const exact = entries.find(
    (e) => e.term.toLowerCase() === lower || `${e.term.toLowerCase()}s` === lower,
  );
  if (exact) return exact;

  // The selection is a longer phrase: resolve only if it contains exactly one
  // known term (so an ambiguous multi-term selection stays unresolved).
  const contained = entries.filter((e) => new RegExp(`\\b${escapeRe(e.term)}s?\\b`, "i").test(sel));
  return contained.length === 1 ? contained[0] : null;
}
