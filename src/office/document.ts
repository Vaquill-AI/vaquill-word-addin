import { OfficeError, runWord } from "./run";
import { sha256Hex } from "@/lib/hash";

/** Read the whole document body as plain text. Every whole-document read builds
 *  on this, so an extremely large document (Office's single-sync data cap can
 *  make `body.text` fail) surfaces a size-aware hint with a next step. */
export async function readDocumentText(): Promise<string> {
  try {
    return await runWord(async (context) => {
      const body = context.document.body;
      body.load("text");
      await context.sync();
      return body.text;
    });
  } catch (e) {
    const message = (e as Error).message || "Could not read the document.";
    throw new OfficeError(
      `${message} If the document is very large, try reviewing a selection instead.`,
      (e as { code?: string }).code,
    );
  }
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

/** Render a table's rows as a compact pipe-delimited grid so the model reads
 *  rows and columns instead of the flattened tab-run that `body.text` produces
 *  (which scrambles fee schedules, liability-cap grids, and SLA tables). */
function renderTableGrid(values: string[][]): string {
  const rows = values
    .map((row) => row.map((cell) => (cell ?? "").replace(/\s+/g, " ").trim()))
    .filter((row) => row.some((cell) => cell.length > 0))
    .map((row) => `| ${row.join(" | ")} |`);
  return rows.join("\n");
}

/**
 * Read the document preserving the structure a contract review depends on:
 * - each clause prefixed with its Word list/outline NUMBER ("5.2", "(a)") via
 *   `ListItem.listString`, so the model and redline card titles can reference
 *   clauses precisely instead of losing the numbering `body.text` omits;
 * - TABLES rendered as grids (not flattened tab-runs) so fee/liability/SLA
 *   tables are read correctly;
 * plus footnotes and headers/footers (definitions and party names often live
 * there). All APIs used are WordApi 1.3+ (GA cross-platform, under our floor).
 *
 * Tables are placed inline at the point the walk first enters them. Rare edges
 * (adjacent tables with no paragraph between, nested tables) are rendered at the
 * end rather than perfectly in place - never dropped, never a crash.
 *
 * `extras` (default true) appends footnotes + headers/footers. Tables and
 * numbering are body content and are always included regardless, so a body-only
 * read (extras:false) still reads tables/clause-numbers correctly.
 */
export async function readStructuredDocumentText(opts: { extras?: boolean } = {}): Promise<string> {
  const main = await runWord(async (context) => {
    const paras = context.document.body.paragraphs;
    paras.load(
      "text,listItemOrNullObject/listString,listItemOrNullObject/isNullObject,parentTableOrNullObject/isNullObject",
    );
    const tables = context.document.body.tables;
    tables.load("values");
    await context.sync();

    const grids = tables.items.map((t) => renderTableGrid(t.values));
    const out: string[] = [];
    let tableIndex = 0;
    let inTable = false;

    for (const p of paras.items) {
      // `body.paragraphs` (WordApi 1.3+) includes in-cell paragraphs; skip them
      // and render each table once, as a grid, at the point we enter it.
      if (!p.parentTableOrNullObject.isNullObject) {
        if (!inTable) {
          const grid = tableIndex < grids.length ? grids[tableIndex] : undefined;
          if (grid) out.push(grid);
          tableIndex += 1;
          inTable = true;
        }
        continue;
      }
      inTable = false;
      const text = (p.text ?? "").trim();
      if (!text) continue;
      const num = p.listItemOrNullObject.isNullObject
        ? ""
        : (p.listItemOrNullObject.listString ?? "").trim();
      out.push(num ? `${num} ${text}` : text);
    }

    // Any tables the paragraph walk did not reach in place (leading/adjacent/
    // nested tables): append rather than drop them.
    for (let i = tableIndex; i < grids.length; i++) {
      const grid = grids[i];
      if (grid) out.push(grid);
    }
    return out.join("\n");
  });

  if (opts.extras === false) return main;

  const footnotes = await readFootnoteText();
  const headersFooters = await readHeaderFooterText();
  let full = main;
  if (footnotes.length > 0) full += "\n\n[FOOTNOTES]\n" + footnotes.join("\n");
  if (headersFooters.length > 0) full += "\n\n[HEADERS AND FOOTERS]\n" + headersFooters.join("\n");
  return full;
}
