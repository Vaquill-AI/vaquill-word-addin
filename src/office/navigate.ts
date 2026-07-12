import { runWord } from "./run";
import { findBestRange } from "./search";

/**
 * Scroll the document to a clause and select it. This is the bidirectional link
 * that makes the pane feel native: click an issue in the pane, Word jumps to and
 * highlights the exact text. Returns false when the clause cannot be located
 * (e.g. whitespace-normalized differently), so the UI can degrade gracefully.
 */
export async function selectClauseInDocument(text: string): Promise<boolean> {
  const q = text.trim();
  if (!q) return false;

  return runWord(async (context) => {
    // Pass the full clause: findBestRange windows the search internally and uses
    // the full text to land on the right occurrence of duplicated boilerplate.
    const range = await findBestRange(context, q);
    if (!range) return false;

    // Selecting a range scrolls it into view and highlights it in Word.
    range.select(Word.SelectionMode.select);
    await context.sync();
    return true;
  });
}
