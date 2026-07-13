import { isProtectionError, OfficeError, runWord, serializeTrackChanges } from "./run";
import { gatherExtraScopes } from "./search";

/** Word's body.search caps the needle length; our redaction values are short. */
const SEARCH_LIMIT = 255;
export const DEFAULT_MARKER = "[REDACTED]";

// A solid black redaction bar. We replace the sensitive text with full-block
// glyphs shaded black (font + highlight), sized to the original so the bar reads
// as a real redaction, not a placeholder word. The original characters are
// genuinely deleted (see redactValues), so this is a true redaction with a
// redaction's LOOK, never a highlight laid over still-present text.
const BAR_CHAR = "█";
const BAR_MIN = 2;
const BAR_MAX = 16;

function barFor(value: string): string {
  const n = Math.max(BAR_MIN, Math.min(BAR_MAX, value.replace(/\s+/g, "").length));
  return BAR_CHAR.repeat(n);
}

/**
 * Where to look for occurrences to redact:
 * - "document": the whole body (default).
 * - "selection": only the text the user has highlighted.
 */
export type RedactScope = "document" | "selection";

export interface RedactOutcome {
  /** Total occurrences replaced across all values. */
  redacted: number;
  /** Values that could not be found in the document (nothing replaced). */
  notFound: string[];
}

/**
 * Replace every occurrence of each given value with a solid black redaction bar
 * (or a literal `opts.marker` if one is given).
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
 *
 * `scope` limits where occurrences are searched and replaced: "document"
 * (default) scans the whole body; "selection" scans only the current selection
 * (Range.search), so text elsewhere in the document is left untouched.
 */
export async function redactValues(
  values: string[],
  opts: { marker?: string; scope?: RedactScope; onProgress?: (done: number, total: number) => void } = {},
): Promise<RedactOutcome> {
  // A literal `marker` (if given) is inserted verbatim; otherwise each value is
  // replaced with a black bar sized to it and shaded black.
  const marker = opts.marker;
  const scope = opts.scope ?? "document";
  // Longest-first: a short value that is a substring of a longer one (e.g. "$5"
  // inside "$500") must be redacted AFTER the longer value, or body.search would
  // match it inside the longer text and corrupt it ("[REDACTED]00"). Redacting
  // the longer value first removes that text so the shorter search can't hit it.
  const unique = [...new Set(values.map((v) => v.trim()).filter((v) => v && v.length <= SEARCH_LIMIT))].sort(
    (a, b) => b.length - a.length,
  );
  if (unique.length === 0) return { redacted: 0, notFound: [] };

  return serializeTrackChanges(() => runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.off;
    await context.sync();

    // Regions to search. "selection" stays scoped to the highlighted range. For
    // "document" scope we must cover EVERY region a value can hide in: the main
    // body plus headers, footers, footnotes, and endnotes (doc.body excludes all
    // of those). A body-only search would leave, e.g., an SSN repeated in the
    // page footer sitting in the shipped .docx while the tool reports success.
    // findRanges is deliberately NOT reused here: its "first non-empty scope
    // wins" semantics would stop at the body and skip a footer copy, whereas
    // redaction must replace every occurrence in every region.
    let scopes: (Word.Body | Word.Range)[];
    if (scope === "selection") {
      // The selection is re-resolved live at apply time (it cannot survive from
      // the earlier scan across Word.run boundaries). If the user collapsed or
      // moved the caret since scanning, a body-less zero-width range would match
      // nothing and every value would be mislabeled "not found" - a data-leak-
      // grade wrong signal for a redaction tool. Require a real selection.
      const sel = doc.getSelection();
      sel.load("text");
      await context.sync();
      if (!sel.text || !sel.text.trim()) {
        throw new OfficeError(
          "Nothing is selected. Re-select the text to redact, or switch to whole-document scope.",
          "no_selection",
        );
      }
      scopes = [sel];
    } else {
      scopes = [doc.body, ...(await gatherExtraScopes(context))];
    }

    let redacted = 0;
    const notFound: string[] = [];
    try {
      let done = 0;
      for (const value of unique) {
        try {
          const resultSets = scopes.map((s) => s.search(value, { matchCase: true }));
          for (const r of resultSets) r.load("items");
          await context.sync();
          const items = resultSets.flatMap((r) => r.items);
          if (items.length === 0) {
            notFound.push(value);
          } else {
            const replacement = marker ?? barFor(value);
            for (const range of items) {
              const inserted = range.insertText(replacement, Word.InsertLocation.replace);
              // Shade the bar solid black (fill + text) so it reads as a
              // redaction. Skipped when a literal marker was requested.
              if (!marker) {
                inserted.font.color = "#000000";
                inserted.font.highlightColor = "#000000";
              }
            }
            await context.sync();
            redacted += items.length;
          }
        } catch (err) {
          // A protected/read-only document blocks the insert (AccessDenied).
          // Swallowing it would report the still-present value as "not found" -
          // the user would then ship the unredacted file. Re-throw so runWord
          // surfaces the clean "Restrict Editing" message instead.
          if (isProtectionError(err)) throw err;
          notFound.push(value);
        }
        done += 1;
        opts.onProgress?.(done, unique.length);
      }
    } finally {
      // Best-effort restore of the user's prior tracking mode. If the context is
      // already broken (e.g. the protection re-throw above), swallow the restore
      // failure so it never masks the original error.
      try {
        doc.changeTrackingMode = priorMode;
        await context.sync();
      } catch {
        // original error (if any) propagates; nothing more we can do here
      }
    }
    return { redacted, notFound };
  }));
}
