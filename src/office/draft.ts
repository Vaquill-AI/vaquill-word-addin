import { runWord } from "./run";

/**
 * Insert generated draft text at the cursor without overwriting a selection.
 * A generated first draft is authored content, not a redline, so this inserts
 * normally rather than as a tracked change.
 *
 * We insert with InsertLocation.after (never replace) so that if the user has
 * text selected, the draft lands after it rather than destroying it. For a
 * collapsed cursor, `after` still inserts at the cursor position. The inserted
 * range is then selected and scrolled into view so the user sees where it
 * landed.
 */
export async function insertDraftAtCursor(text: string): Promise<void> {
  return runWord(async (context) => {
    const inserted = context.document.getSelection().insertText(text, Word.InsertLocation.after);
    inserted.select(Word.SelectionMode.select);
    await context.sync();
  });
}
