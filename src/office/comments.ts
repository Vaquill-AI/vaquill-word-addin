import { runWord } from "./run";
import { findRanges } from "./search";

/**
 * Insert the playbook rationale for each flagged issue as a native Word comment
 * anchored on the clause text. This gives the reviewer the "why" inline, next to
 * the clause, rather than only in the pane. Comments are WordApi 1.4 (GA).
 */

/**
 * Insert a rationale comment for each item that has one. Returns the count of
 * comments actually inserted. Each item is wrapped in its own try/catch so a
 * single failed lookup or insert does not abort the whole batch, and each
 * successful insert is flushed with its own sync so a later failure cannot
 * discard an already-queued comment.
 */
export async function insertRationaleComments(
  items: { currentLanguage: string; rationale: string }[],
): Promise<number> {
  return runWord(async (context) => {
    let inserted = 0;
    for (const item of items) {
      try {
        const rationale = item.rationale.trim();
        const query = item.currentLanguage.trim();
        if (!rationale || !query) continue;
        const ranges = await findRanges(context, query);
        // Anchor on the first match; any match is enough to attach the note.
        if (ranges.length === 0) continue;
        ranges[0].insertComment(rationale);
        await context.sync();
        inserted += 1;
      } catch {
        // One clause failing to comment must not stop the rest.
        continue;
      }
    }
    return inserted;
  });
}
