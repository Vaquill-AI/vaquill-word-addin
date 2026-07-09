import { runWord } from "./run";

/** Read the whole document body as plain text. */
export async function readDocumentText(): Promise<string> {
  return runWord(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();
    return body.text;
  });
}

/** Read the current selection as plain text, or "" when nothing is selected. */
export async function readSelectionText(): Promise<string> {
  return runWord(async (context) => {
    const sel = context.document.getSelection();
    sel.load("text");
    await context.sync();
    return sel.text ?? "";
  });
}

export interface DocumentStats {
  chars: number;
  words: number;
}

export async function getDocumentStats(): Promise<DocumentStats> {
  const text = await readDocumentText();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { chars: text.length, words };
}
