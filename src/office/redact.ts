import { runWord } from "./run";

/** Word's body.search caps the needle length; our redaction values are short. */
const SEARCH_LIMIT = 255;
export const DEFAULT_MARKER = "[REDACTED]";

export interface RedactOutcome {
  /** Total occurrences replaced across all values. */
  redacted: number;
  /** Values that could not be found in the document (nothing replaced). */
  notFound: string[];
}

/**
 * Replace every occurrence of each given value with a redaction marker.
 *
 * This is TRUE removal, not a visual mask: change tracking is forced OFF for the
 * edit (and restored after), so the original text is deleted from the body
 * rather than preserved as a reversible tracked deletion that would still travel
 * inside the .docx. Word's native Undo (Ctrl+Z) still reverses it for the user.
 *
 * `onProgress(done, total)` fires after each distinct value so the caller can
 * show an "Applying N of M" counter. Residual metadata (comments, document
 * properties, prior revisions) is out of scope here; the UI must tell the user
 * to run Word's Inspect Document before sending.
 */
export async function redactValues(
  values: string[],
  opts: { marker?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<RedactOutcome> {
  const marker = opts.marker ?? DEFAULT_MARKER;
  // Longest-first: a short value that is a substring of a longer one (e.g. "$5"
  // inside "$500") must be redacted AFTER the longer value, or body.search would
  // match it inside the longer text and corrupt it ("[REDACTED]00"). Redacting
  // the longer value first removes that text so the shorter search can't hit it.
  const unique = [...new Set(values.map((v) => v.trim()).filter((v) => v && v.length <= SEARCH_LIMIT))].sort(
    (a, b) => b.length - a.length,
  );
  if (unique.length === 0) return { redacted: 0, notFound: [] };

  return runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.off;
    await context.sync();

    let redacted = 0;
    const notFound: string[] = [];
    try {
      let done = 0;
      for (const value of unique) {
        try {
          const results = doc.body.search(value, { matchCase: true });
          results.load("items");
          await context.sync();
          const items = results.items;
          if (items.length === 0) {
            notFound.push(value);
          } else {
            for (const range of items) {
              range.insertText(marker, Word.InsertLocation.replace);
            }
            await context.sync();
            redacted += items.length;
          }
        } catch {
          notFound.push(value);
        }
        done += 1;
        opts.onProgress?.(done, unique.length);
      }
    } finally {
      doc.changeTrackingMode = priorMode;
      await context.sync();
    }
    return { redacted, notFound };
  });
}
