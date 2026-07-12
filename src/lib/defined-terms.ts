/**
 * Defined-terms hygiene analysis (client-only, pure text analysis).
 *
 * Flags the three defined-term defects transactional lawyers care about, a
 * marquee contract-review feature (Litera Contract Companion, Spellbook,
 * ContractKen):
 *   - unused:    a term is defined but never used elsewhere (dead definition).
 *   - duplicate: the same term is defined more than once (conflicting defs).
 *   - undefined: a quoted, capitalized term is used but never defined (gap).
 *
 * Precision over recall: the detector only recognizes the standard definition
 * grammars ("X" means..., and parentheticals like (the "X") / (each a "X")), and
 * the "undefined" check requires the term to also appear UNQUOTED so ordinary
 * quotations are not flagged. It is a hygiene aid, not a parser: it will miss
 * exotic definition styles rather than emit noise.
 */

export type TermFindingKind = "undefined" | "duplicate" | "unused";

export interface TermFinding {
  term: string;
  kind: TermFindingKind;
  /** Total occurrences of the term in the document (for the detail line). */
  count: number;
  /** For duplicate: how many times it was defined. */
  definitionCount: number;
}

export interface DefinedTermsReport {
  /** Distinct terms recognized as defined. */
  definedCount: number;
  findings: TermFinding[];
}

// A defined term: opens with a capital letter, no quote chars inside, bounded so
// a stray quote pair cannot run away. Straight and curly quotes both allowed.
const Q_OPEN = "[\"“”]";
const Q_CLOSE = "[\"“”]";
const TERM = "([A-Z][^\"“”]{0,60})";

// "X" means / shall mean / has the meaning / refers to ...
const VERB_DEF = new RegExp(
  `${Q_OPEN}${TERM}${Q_CLOSE}(?:\\(s\\))?\\s*(?:means|shall\\s+mean|shall\\s+have\\s+the\\s+meaning|has\\s+the\\s+meaning|refers?\\s+to|shall\\s+refer\\s+to)\\b`,
  "gi",
);

// Parenthetical: ( [lead-in] "X" ...  e.g. ("X"), (the "X"), (each a "X"),
// (collectively, the "Xs"), (hereinafter referred to as the "X").
const PAREN_LEADIN =
  "(?:the\\s+|each\\s+(?:a\\s+)?|an?\\s+|collectively,?\\s+(?:the\\s+)?|individually,?\\s+(?:a\\s+)?|together,?\\s+(?:the\\s+)?|hereinafter,?\\s+(?:referred\\s+to\\s+as\\s+)?(?:the\\s+)?|referred\\s+to\\s+as\\s+(?:the\\s+)?)?";
const PAREN_DEF = new RegExp(`\\(\\s*${PAREN_LEADIN}${Q_OPEN}${TERM}${Q_CLOSE}`, "g");

// Any quoted, capitalized token (candidate defined-term usages).
const QUOTED_TOKEN = new RegExp(`${Q_OPEN}${TERM}${Q_CLOSE}`, "g");

/** Normalize a captured term: trim, collapse inner whitespace, drop a trailing
 *  plural "(s)" marker and stray punctuation. */
function normalizeTerm(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\(s\)$/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

/** Escape a term for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Count occurrences of a whole-word term, tolerating a simple plural (s / y->ies).
 *  Case-sensitive: defined terms are proper-cased, and matching case avoids
 *  counting the common lowercase word (e.g. the defined "Party" vs "party").
 *  Uses \b boundaries only (no lookbehind), so it is safe on Safari / WKWebView
 *  hosts (Word on Mac, Word on the web in Safari) where lookbehind can be
 *  unsupported and would throw at RegExp construction. */
function countTermOccurrences(text: string, term: string): number {
  const esc = escapeRe(term);
  let variants = `${esc}s?`;
  if (/y$/.test(term)) variants = `(?:${esc}|${escapeRe(term.slice(0, -1))}ies)`;
  const re = new RegExp(`\\b(?:${variants})\\b`, "g");
  return (text.match(re) ?? []).length;
}

/** Count how many times a term appears in quotes. */
function countQuotedOccurrences(text: string, term: string): number {
  const re = new RegExp(`${Q_OPEN}${escapeRe(term)}(?:\\(s\\))?${Q_CLOSE}`, "g");
  return (text.match(re) ?? []).length;
}

function collectDefinitions(text: string): Map<string, number> {
  const defs = new Map<string, number>();
  for (const re of [VERB_DEF, PAREN_DEF]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const term = normalizeTerm(m[1]);
      if (term.length < 2) continue;
      defs.set(term, (defs.get(term) ?? 0) + 1);
    }
  }
  return defs;
}

function collectQuotedTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  QUOTED_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTED_TOKEN.exec(text)) !== null) {
    const t = normalizeTerm(m[1]);
    if (t.length >= 2) tokens.add(t);
  }
  return tokens;
}

const MAX_PER_BUCKET = 100;

/**
 * Analyze defined-term hygiene. Pure: takes the document text, returns findings.
 * Buckets are ordered by actionability (potential gap first, cleanup last) and
 * each bucket is capped so a pathological document cannot produce an unbounded
 * list.
 */
export function analyzeDefinedTerms(text: string): DefinedTermsReport {
  const defs = collectDefinitions(text);
  const quoted = collectQuotedTokens(text);

  const undefinedF: TermFinding[] = [];
  const duplicateF: TermFinding[] = [];
  const unusedF: TermFinding[] = [];

  // Defined-term checks: duplicate vs unused.
  for (const [term, defCount] of defs) {
    const total = countTermOccurrences(text, term);
    if (defCount >= 2) {
      duplicateF.push({ term, kind: "duplicate", count: total, definitionCount: defCount });
      continue;
    }
    // Defined once: "used" means it appears beyond its single definition site.
    if (total <= 1) {
      unusedF.push({ term, kind: "unused", count: total, definitionCount: 1 });
    }
  }

  // Undefined check: a quoted, capitalized token that is never defined but also
  // appears UNQUOTED (so it is used like a defined term, not a stray quotation).
  for (const token of quoted) {
    if (defs.has(token)) continue;
    const total = countTermOccurrences(text, token);
    const quotedCount = countQuotedOccurrences(text, token);
    if (total > quotedCount) {
      undefinedF.push({ term: token, kind: "undefined", count: total, definitionCount: 0 });
    }
  }

  const byCountDesc = (a: TermFinding, b: TermFinding) => b.count - a.count;
  const findings = [
    ...undefinedF.sort(byCountDesc).slice(0, MAX_PER_BUCKET),
    ...duplicateF.sort(byCountDesc).slice(0, MAX_PER_BUCKET),
    ...unusedF.sort((a, b) => a.term.localeCompare(b.term)).slice(0, MAX_PER_BUCKET),
  ];

  return { definedCount: defs.size, findings };
}
