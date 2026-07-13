/**
 * A short, single-line snippet of the text on either side of a span, trimmed to
 * word boundaries with ellipses, for showing a hit (a citation, a redaction, a
 * defect) inside its surrounding sentence. Shared by the surfaces that need an
 * in-context preview.
 */
export interface ContextSnippet {
  before: string;
  after: string;
}

const DEFAULT_RADIUS = 40;

/** Snippet around an explicit [start, end) span in `text`. */
export function snippetAround(
  text: string,
  start: number,
  end: number,
  radius = DEFAULT_RADIUS,
): ContextSnippet {
  let before = text.slice(Math.max(0, start - radius), start).replace(/\s+/g, " ");
  let after = text.slice(end, end + radius).replace(/\s+/g, " ");

  // Drop a dangling partial word at the far edge and mark the truncation.
  if (start - radius > 0) {
    const sp = before.indexOf(" ");
    before = "…" + (sp >= 0 ? before.slice(sp + 1) : before);
  }
  if (end + radius < text.length) {
    const sp = after.lastIndexOf(" ");
    after = (sp >= 0 ? after.slice(0, sp) : after) + "…";
  }
  return { before, after };
}

/** Snippet around the first occurrence of `value` in `text`, or undefined. */
export function snippetAroundValue(
  text: string,
  value: string,
  radius = DEFAULT_RADIUS,
): ContextSnippet | undefined {
  const idx = text.indexOf(value);
  if (idx < 0) return undefined;
  return snippetAround(text, idx, idx + value.length, radius);
}
