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
 */

interface SearchVariant {
  readonly options: Word.SearchOptions | { matchCase: boolean; ignorePunct?: boolean; ignoreSpace?: boolean };
}

const VARIANTS: readonly SearchVariant[] = [
  { options: { matchCase: true } },
  { options: { matchCase: true, ignorePunct: true, ignoreSpace: true } },
  { options: { matchCase: false, ignorePunct: true, ignoreSpace: true } },
];

/**
 * Find ranges matching `query`, escalating tolerance until one variant matches.
 * Returns an empty array when the query is blank or no variant matches.
 */
export async function findRanges(
  context: Word.RequestContext,
  query: string,
): Promise<Word.Range[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const body = context.document.body;
  for (const variant of VARIANTS) {
    try {
      const results = body.search(trimmed, variant.options);
      results.load("items");
      await context.sync();
      if (results.items.length > 0) {
        return results.items;
      }
    } catch {
      // A single variant can fail (e.g. an unsupported option combination on an
      // older host). Fall through to the next, looser variant rather than
      // aborting the whole lookup.
      continue;
    }
  }
  return [];
}
