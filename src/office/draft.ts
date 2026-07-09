import { runWord } from "./run";

/**
 * Insert generated draft text at the cursor (or replacing the selection).
 * A generated first draft is authored content, not a redline, so this inserts
 * normally rather than as a tracked change.
 */
export async function insertDraftAtCursor(text: string): Promise<void> {
  return runWord(async (context) => {
    context.document.getSelection().insertText(text, Word.InsertLocation.replace);
    await context.sync();
  });
}
