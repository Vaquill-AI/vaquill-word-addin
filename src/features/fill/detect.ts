/**
 * Detect labeled placeholders in the open document's text. We only detect
 * LABELED tokens (bracketed or mustache), because the label is what the backend
 * matches against the reference. Bare blanks (underscores) carry no label and
 * are skipped.
 *
 *   [Company Name]   [Insert Date]   {{governing_law}}
 */
const PLACEHOLDER_RE = /\[[^\]\n]{1,80}\]|\{\{[^}\n]{1,80}\}\}/g;

/** Unique placeholder tokens in document order (verbatim, so they can be found + replaced). */
export function detectPlaceholders(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const token = match[0].trim();
    // Skip obviously non-placeholder brackets (e.g. "[1]" citation markers are
    // fine to include; but an empty "[]" is not).
    if (token.length <= 2 || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}
