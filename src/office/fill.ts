import { runWord } from "./run";

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

  return runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    let applied = 0;
    const notFound: string[] = [];
    try {
      let done = 0;
      for (const { placeholder, value } of items) {
        try {
          const results = doc.body.search(placeholder, { matchCase: true });
          results.load("items");
          await context.sync();
          const ranges = results.items;
          if (ranges.length === 0) {
            notFound.push(placeholder);
          } else {
            for (const range of ranges) {
              range.insertText(value, Word.InsertLocation.replace);
            }
            await context.sync();
            applied += ranges.length;
          }
        } catch {
          notFound.push(placeholder);
        }
        done += 1;
        opts.onProgress?.(done, items.length);
      }
    } finally {
      doc.changeTrackingMode = priorMode;
      await context.sync();
    }
    return { applied, notFound };
  });
}
