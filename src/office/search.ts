/**
 * Tolerance ladder for locating clause text in the open document.
 *
 * Word's body.search with exact matchCase fails when the model's text differs
 * from the document by curly vs straight quotes, en/em dashes, non-breaking
 * spaces, or incidental whitespace. That divergence is extremely common in
 * legal text, so we try progressively looser search variants and return the
 * items from the FIRST variant that yields one or more matches.
 *
 * Because each looser variant only ever matches a superset of the stricter one,
 * returning the first non-empty set preserves the "exactly one match" property
 * when the strict pass already found the clause. Callers that require
 * uniqueness (e.g. redline anchoring) can still count items[] safely.
 *
 * Region coverage: `document.body` is the MAIN story only - it excludes headers,
 * footers, footnotes, and endnotes (per the Word JS API). A redline / citation
 * anchored in one of those regions would never be found by a body-only search
 * (this was the "footnote/header apply gap"). We keep the body as a fast path
 * (the overwhelmingly common case) and only fall back to the other regions when
 * the body search misses, so the common path pays no extra round-trips.
 */

/** Word's search needle caps at ~255 chars; a longer string throws
 *  SearchStringInvalidOrTooLong, which the variant loop would swallow into a
 *  bare "not found". Legal clauses routinely exceed this. */
const WORD_SEARCH_LIMIT = 255;

/**
 * Reduce a long anchor to a searchable window so the clause can still be LOCATED.
 * We search on a word-boundary-trimmed prefix (<=255 chars) rather than the whole
 * clause; that is enough to anchor a comment / bookmark / highlight / selection.
 * Callers that need the EXACT full range (e.g. redline text replacement) guard
 * the length themselves before calling and never reach this path.
 */
function searchWindow(query: string): string {
  if (query.length <= WORD_SEARCH_LIMIT) return query;
  const slice = query.slice(0, WORD_SEARCH_LIMIT);
  const lastSpace = slice.lastIndexOf(" ");
  // Trim to the last word boundary so we don't cut mid-word (an unmatchable
  // fragment); fall back to the hard 255 cut only if the window has no space.
  return lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
}

interface SearchVariant {
  readonly options: Word.SearchOptions | { matchCase: boolean; ignorePunct?: boolean; ignoreSpace?: boolean };
}

const VARIANTS: readonly SearchVariant[] = [
  { options: { matchCase: true } },
  { options: { matchCase: true, ignorePunct: true, ignoreSpace: true } },
  { options: { matchCase: false, ignorePunct: true, ignoreSpace: true } },
];

/** Run the tolerance ladder across one or more search scopes (Body objects).
 *  For each variant, search every scope and return the union of the FIRST
 *  variant that yields any match, preserving the strict-first semantics. */
async function searchScopes(
  context: Word.RequestContext,
  scopes: Word.Body[],
  query: string,
): Promise<Word.Range[]> {
  for (const variant of VARIANTS) {
    try {
      const resultSets = scopes.map((s) => s.search(query, variant.options));
      for (const r of resultSets) r.load("items");
      await context.sync();
      const items = resultSets.flatMap((r) => r.items);
      if (items.length > 0) return items;
    } catch {
      // A single variant can fail (e.g. an unsupported option combination on an
      // older host). Fall through to the next, looser variant.
      continue;
    }
  }
  return [];
}

/** Collect the header/footer/footnote/endnote Bodies (everything `document.body`
 *  excludes), so a redline anchored there can still be located. Each header and
 *  footer is itself a `Body`; each footnote/endnote exposes a `.body`. Degrades
 *  to whatever it could gather if a host lacks footnote/endnote support.
 *  Exported so redaction can fan a replace-all across every region (a body-only
 *  search would leave PII sitting in a footer/footnote of the shipped file).
 *  Platform limit: text inside textboxes/shapes is NOT reachable - Office.js
 *  Body.search does not traverse shape text ranges, so a clause authored in a
 *  textbox cannot be located by any apply path. */
export async function gatherExtraScopes(context: Word.RequestContext): Promise<Word.Body[]> {
  const scopes: Word.Body[] = [];
  const sections = context.document.sections;
  sections.load("items");
  const footnotes = context.document.body.footnotes;
  const endnotes = context.document.body.endnotes;
  footnotes.load("items");
  endnotes.load("items");
  try {
    await context.sync();
  } catch {
    return scopes;
  }

  const headerFooterTypes: Word.HeaderFooterType[] = [
    Word.HeaderFooterType.primary,
    Word.HeaderFooterType.firstPage,
    Word.HeaderFooterType.evenPages,
  ];
  for (const section of sections.items) {
    for (const type of headerFooterTypes) {
      try {
        scopes.push(section.getHeader(type), section.getFooter(type));
      } catch {
        // A header/footer type may be unavailable; skip it.
      }
    }
  }
  for (const note of footnotes.items) scopes.push(note.body);
  for (const note of endnotes.items) scopes.push(note.body);
  return scopes;
}

/**
 * Strip a leading clause enumerator ("5.2", "(a)", "Section 4.", "IV.") so a
 * clause the model quoted together WITH its Word list-number still anchors
 * against the document body - where the auto-number is NOT part of the
 * searchable text (readStructuredDocumentText prefixes clause text with
 * ListItem.listString for the model, but body.search never sees that number).
 * Used ONLY as a fallback after an exact search misses, so an over-eager strip
 * can never mis-anchor the common case. Returns "" when nothing was stripped.
 */
function stripLeadingEnumerator(s: string): string {
  const stripped = s.replace(
    /^\s*(?:section|article|clause)?\s*(?:\d+(?:\.\d+)*|\([a-z0-9]{1,4}\)|[a-z]{1,2}[.)]|[ivxlcdm]+[.)])\s+/i,
    "",
  );
  return stripped !== s ? stripped.trim() : "";
}

/**
 * Find ranges matching `query`, escalating tolerance until one variant matches.
 * Searches the main body first (fast path); only if that misses does it fall
 * back to headers, footers, footnotes, and endnotes. If everything misses and
 * the query begins with a clause enumerator, it retries once with that stripped
 * (so a model-quoted "5.2 The Indemnifying Party..." still anchors). Returns an
 * empty array when the query is blank or nothing matches anywhere.
 */
export async function findRanges(
  context: Word.RequestContext,
  query: string,
): Promise<Word.Range[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Try the query as-is first (exact path, unaffected by the fallback), then -
  // only on a total miss - the enumerator-stripped form.
  const attempts = [trimmed];
  const stripped = stripLeadingEnumerator(trimmed);
  if (stripped && stripped !== trimmed) attempts.push(stripped);

  for (const attempt of attempts) {
    // Window long anchors down to Word's search limit so a >255-char clause is
    // still located instead of silently returning [] (see searchWindow).
    const needle = searchWindow(attempt);

    const bodyHit = await searchScopes(context, [context.document.body], needle);
    if (bodyHit.length > 0) return bodyHit;

    const extraScopes = await gatherExtraScopes(context);
    if (extraScopes.length > 0) {
      const extraHit = await searchScopes(context, extraScopes, needle);
      if (extraHit.length > 0) return extraHit;
    }
  }
  return [];
}

/**
 * Locate the single best range for a clause, disambiguating DUPLICATES.
 *
 * `findRanges` returns every match; for a needle that is duplicated boilerplate
 * (a defined term that appears in the Definitions section and again in the
 * operative clause, "including without limitation", etc.), blindly taking the
 * first match anchors on the wrong occurrence. This picks the candidate whose
 * containing paragraph text best matches the FULL clause: the real occurrence
 * sits in a paragraph that contains the whole clause, while a coincidental
 * short-phrase hit sits in a different, shorter paragraph. Pass the full clause
 * text (it is windowed internally for the search). Returns null when nothing
 * matches. Only pays the extra paragraph-load sync when there is ambiguity.
 */
export async function findBestRange(
  context: Word.RequestContext,
  fullText: string,
): Promise<Word.Range | null> {
  const ranges = await findRanges(context, fullText);
  if (ranges.length <= 1) return ranges[0] ?? null;

  const target = fullText.trim().toLowerCase();
  const firstParas = ranges.map((r) => r.paragraphs.getFirst());
  for (const p of firstParas) p.load("text");
  await context.sync();

  let best: Word.Range | null = ranges[0] ?? null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < ranges.length; i++) {
    const ptext = (firstParas[i]?.text ?? "").trim().toLowerCase();
    // Prefer a paragraph that contains the whole clause (or vice-versa for a
    // windowed needle); tie-break toward the paragraph closest in length to the
    // clause so a huge catch-all paragraph does not win by coincidence.
    const contains = ptext.includes(target) || target.includes(ptext) ? 1 : 0;
    const lenScore =
      1 - Math.abs(ptext.length - target.length) / Math.max(ptext.length, target.length, 1);
    const score = contains + lenScore;
    if (score > bestScore) {
      bestScore = score;
      best = ranges[i] ?? best;
    }
  }
  return best;
}
