import { runWord } from "./run";
import { sha256Hex } from "@/lib/hash";

/** Read the whole document body as plain text. */
export async function readDocumentText(): Promise<string> {
  return runWord(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();
    return body.text;
  });
}

/**
 * A content fingerprint of the current document body. Used to tell whether the
 * draft changed since a review was run. This reads the full body text, so call
 * it debounced, not on every keystroke.
 */
export async function readDocumentFingerprint(): Promise<string> {
  return sha256Hex(await readDocumentText());
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

/**
 * Read footnote body text. Footnotes are Word.NoteItemCollection (WordApi 1.5).
 * Isolated in its own runWord so a host without footnote support fails here
 * without discarding the body text read by the caller.
 */
async function readFootnoteText(): Promise<string[]> {
  try {
    return await runWord(async (context) => {
      const notes = context.document.body.footnotes;
      notes.load("items");
      await context.sync();
      notes.items.forEach((n) => n.body.load("text"));
      await context.sync();
      return notes.items
        .map((n) => (n.body.text ?? "").trim())
        .filter((t) => t.length > 0);
    });
  } catch {
    return [];
  }
}

/**
 * Read primary header and footer body text across all sections. Primary headers
 * repeat per section, so identical text is de-duplicated. Isolated in its own
 * runWord so a host without header/footer support still returns the body text.
 */
async function readHeaderFooterText(): Promise<string[]> {
  try {
    return await runWord(async (context) => {
      const sections = context.document.sections;
      sections.load("items");
      await context.sync();
      const bodies = sections.items.flatMap((s) => [
        s.getHeader(Word.HeaderFooterType.primary),
        s.getFooter(Word.HeaderFooterType.primary),
      ]);
      bodies.forEach((b) => b.load("text"));
      await context.sync();
      const texts = bodies.map((b) => (b.text ?? "").trim()).filter((t) => t.length > 0);
      return [...new Set(texts)];
    });
  } catch {
    return [];
  }
}

/**
 * Read the full document text for review: body, plus footnotes and primary
 * headers/footers. Definitions often live in footnotes and party names in
 * headers, so a body-only read would miss them. Footnote and header reads are
 * each isolated so a host lacking them still returns the body text.
 */
export async function readFullDocumentText(): Promise<string> {
  const body = await readDocumentText();
  const footnotes = await readFootnoteText();
  const headersFooters = await readHeaderFooterText();

  let out = body;
  if (footnotes.length > 0) {
    out += "\n\n[FOOTNOTES]\n" + footnotes.join("\n");
  }
  if (headersFooters.length > 0) {
    out += "\n\n[HEADERS AND FOOTERS]\n" + headersFooters.join("\n");
  }
  return out;
}
