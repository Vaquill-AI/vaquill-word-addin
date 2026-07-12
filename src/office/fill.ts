import { isProtectionError, runWord, serializeTrackChanges } from "./run";
import { gatherExtraScopes } from "./search";

const SEARCH_LIMIT = 255;

export interface FillApplyOutcome {
  applied: number;
  notFound: string[];
}

/**
 * Replace each placeholder token with its value as a TRACKED change, so a fill
 * lands as a reviewable redline (accept/reject in Word) rather than a silent
 * edit. Placeholders are unique verbatim tokens, so a matchCase search locates
 * them exactly. Change tracking is enabled for the edit and restored after.
 */
export async function applyFills(
  fills: { placeholder: string; value: string }[],
  opts: { onProgress?: (done: number, total: number) => void } = {},
): Promise<FillApplyOutcome> {
  const items = fills.filter(
    (f) => f.placeholder.trim() && f.value.trim() && f.placeholder.length <= SEARCH_LIMIT,
  );
  if (items.length === 0) return { applied: 0, notFound: [] };

  return serializeTrackChanges(() => runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    // Placeholders commonly sit in headers/footers (page footers, letterhead),
    // which doc.body excludes - a body-only search would leave the literal token
    // in the shipped file. Fan the fill across every region and replace every
    // occurrence (a token like [EFFECTIVE DATE] may appear in both body and
    // footer). gatherExtraScopes degrades to [] if the host lacks the regions.
    const scopes: Word.Body[] = [doc.body, ...(await gatherExtraScopes(context))];

    let applied = 0;
    const notFound: string[] = [];
    try {
      let done = 0;
      for (const { placeholder, value } of items) {
        try {
          const resultSets = scopes.map((s) => s.search(placeholder, { matchCase: true }));
          for (const r of resultSets) r.load("items");
          await context.sync();
          const ranges = resultSets.flatMap((r) => r.items);
          if (ranges.length === 0) {
            notFound.push(placeholder);
          } else {
            for (const range of ranges) {
              range.insertText(value, Word.InsertLocation.replace);
            }
            await context.sync();
            applied += ranges.length;
          }
        } catch (err) {
          // A protected/read-only document blocks the insert. Swallowing it would
          // report the placeholder as merely "not found"; re-throw so runWord
          // surfaces the clean "Restrict Editing" message instead.
          if (isProtectionError(err)) throw err;
          notFound.push(placeholder);
        }
        done += 1;
        opts.onProgress?.(done, items.length);
      }
    } finally {
      // Best-effort restore so a broken context can't mask the original error.
      try {
        doc.changeTrackingMode = priorMode;
        await context.sync();
      } catch {
        // original error (if any) propagates
      }
    }
    return { applied, notFound };
  }));
}
