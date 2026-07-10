import { runWord } from "./run";
import { findRanges } from "./search";

/**
 * Scroll the document to a clause and select it. This is the bidirectional link
 * that makes the pane feel native: click an issue in the pane, Word jumps to and
 * highlights the exact text. Returns false when the clause cannot be located
 * (e.g. whitespace-normalized differently), so the UI can degrade gracefully.
 */
export async function selectClauseInDocument(text: string): Promise<boolean> {
  const q = text.trim();
  if (!q) return false;
  // body.search caps at 255 chars; a prefix is enough to locate the start.
  const query = q.length > 255 ? q.slice(0, 255) : q;

  return runWord(async (context) => {
    const items = await findRanges(context, query);
    const range = items[0];
    if (!range) return false;

    // Selecting a range scrolls it into view and highlights it in Word.
    range.select(Word.SelectionMode.select);
    await context.sync();
    return true;
  });
}
