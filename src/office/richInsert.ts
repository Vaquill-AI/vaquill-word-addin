/**
 * Insert formatted content into the document using HTML. Word converts inserted
 * HTML into native headings, paragraphs, and bold runs, so generated drafts and
 * clauses look like authored Word content instead of flat pasted text.
 */
import { resolveAfterAnchor } from "./anchor";
import { runWord, serializeTrackChanges } from "./run";
import { sampleInsertionFont, matchInsertedFont } from "./font";
import { inheritListNumbering } from "./lists";

/** Escape the five HTML-significant characters so text content is never markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface DraftSection {
  title: string;
}

interface Draft {
  title: string;
  sections: DraftSection[];
  fullText: string;
}

/** Render one blank-line-delimited block as an <h2> section title or a <p>. */
function renderParagraph(paragraph: string, sectionTitles: Set<string>): string {
  const trimmed = paragraph.trim();
  if (!trimmed) return "";
  const escaped = escapeHtml(trimmed);
  if (sectionTitles.has(trimmed.toLowerCase())) {
    return `<h2>${escaped}</h2>`;
  }
  return `<p>${escaped}</p>`;
}

/** Build the full HTML string for a draft: title heading plus body paragraphs. */
function buildDraftHtml(draft: Draft): string {
  const sectionTitles = new Set(draft.sections.map((s) => s.title.trim().toLowerCase()));
  const body = draft.fullText
    .split(/\n\s*\n/)
    .map((paragraph) => renderParagraph(paragraph, sectionTitles))
    .filter((html) => html.length > 0)
    .join("");
  return `<h1>${escapeHtml(draft.title)}</h1>${body}`;
}

/**
 * Insert a generated draft as formatted HTML after the current selection, so it
 * never overwrites whatever the user has selected, then select the inserted
 * range.
 */
export async function insertDraftFormatted(draft: Draft): Promise<void> {
  const html = buildDraftHtml(draft);
  return runWord(async (context) => {
    // Sample the surrounding font BEFORE inserting so the HTML (which otherwise
    // lands in the Calibri default) adopts the document's family + size.
    const font = await sampleInsertionFont(context);
    const selection = context.document.getSelection();
    const inserted = selection.insertHtml(html, Word.InsertLocation.after);
    inserted.select();
    await context.sync();
    await matchInsertedFont(context, inserted, font);
  });
}

/** Split clause text into non-empty paragraph blocks (blank-line delimited). */
function clauseBlocks(text: string): string[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return blocks.length > 0 ? blocks : [text.trim()];
}

/**
 * Insert a standalone clause (e.g. a playbook position / fallback rung) as a
 * clean tracked insertion, on its own paragraph(s) immediately after the
 * paragraph the cursor sits in.
 *
 * Deliberately NOT a word-level diff-replace (unlike replaceSelectionTracked):
 * a playbook rung is standalone reference language, so diffing it against
 * whatever text happens to be selected interleaves the two into unreadable
 * garbage. Inserting whole paragraphs after the current one is non-destructive
 * (it never overwrites the selection) and never splits a word mid-token.
 */
export async function insertClauseTracked(text: string): Promise<void> {
  const blocks = clauseBlocks(text);
  return serializeTrackChanges(() => runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    // Table-aware anchor (never inserts inside a table cell). Resolved BEFORE the
    // mode flip since it is read-only.
    const anchor = await resolveAfterAnchor(context);

    const priorMode = doc.changeTrackingMode;
    try {
      // Commit the mode flip on its own sync BEFORE inserting, or Word may record
      // the insert as an untracked edit (the "tracked insertion" never appears).
      doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
      await context.sync();
      const inserted: Word.Paragraph[] = [];
      let cursor: Word.Paragraph | undefined;
      for (const block of blocks) {
        cursor = cursor
          ? cursor.insertParagraph(block, Word.InsertLocation.after)
          : anchor.insertParagraph(block, Word.InsertLocation.after);
        inserted.push(cursor);
      }
      cursor?.select();
      await context.sync();
      // Join the anchor's numbered list so the contract renumbers natively
      // rather than the inserted clause breaking the outline.
      await inheritListNumbering(context, anchor, inserted);
    } finally {
      // Best-effort restore so a broken context can't mask the original error.
      try {
        doc.changeTrackingMode = priorMode;
        await context.sync();
      } catch {
        // original error (if any) propagates
      }
    }
  }));
}

/**
 * Insert a passage (a heading line plus the body split into paragraphs) at the
 * user's cursor as a tracked change, and select it so Word scrolls it into view.
 * Used by Research to drop a statute section / quote where the caret sits, rather
 * than at the document end. Change-tracking mode is saved and restored.
 */
export async function insertPassageAtCursor(heading: string, text: string): Promise<void> {
  const body = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return serializeTrackChanges(() =>
    runWord(async (context) => {
      const doc = context.document;
      doc.load("changeTrackingMode");
      await context.sync();

      // Table-aware anchor (never inserts inside a table cell).
      const anchor = await resolveAfterAnchor(context);

      const priorMode = doc.changeTrackingMode;
      try {
        // Commit the mode flip before inserting so the insert is tracked.
        doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        await context.sync();
        const head = anchor.insertParagraph(heading, Word.InsertLocation.after);
        head.styleBuiltIn = Word.BuiltInStyleName.heading3;
        let cursor: Word.Paragraph = head;
        for (const block of body.length ? body : [text]) {
          cursor = cursor.insertParagraph(block, Word.InsertLocation.after);
        }
        head.select();
        await context.sync();
      } finally {
        try {
          doc.changeTrackingMode = priorMode;
          await context.sync();
        } catch {
          // original error (if any) propagates
        }
      }
    }),
  );
}

/**
 * Insert pre-built, already-safe HTML at the user's cursor as a tracked change,
 * and select it so Word scrolls it into view. The caller is responsible for
 * escaping any text content in `html` (see markdownToSafeHtml in Research).
 */
export async function insertHtmlAtCursor(html: string): Promise<void> {
  return serializeTrackChanges(() =>
    runWord(async (context) => {
      const doc = context.document;
      doc.load("changeTrackingMode");
      await context.sync();

      // Sample before the insert so the inserted HTML matches the doc's font.
      const font = await sampleInsertionFont(context);
      const priorMode = doc.changeTrackingMode;
      try {
        // Commit the mode flip before inserting so the insert is tracked.
        doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        await context.sync();
        const range = doc.getSelection().insertHtml(html, Word.InsertLocation.after);
        range.select();
        await context.sync();
        await matchInsertedFont(context, range, font);
      } finally {
        try {
          doc.changeTrackingMode = priorMode;
          await context.sync();
        } catch {
          // original error (if any) propagates
        }
      }
    }),
  );
}

/**
 * Insert a missing clause as a tracked change: a heading plus body paragraph
 * appended to the end of the document. Change-tracking mode is saved and
 * restored around the insert (mirroring redline.ts) so we never leave the
 * document stuck in track-all.
 */
export async function insertClauseFormatted(
  clauseName: string,
  text: string,
  opts: { tracked?: boolean } = {},
): Promise<void> {
  // `tracked` (default) inserts the clause as a reviewable tracked change; pass
  // tracked:false for a clean insert (change tracking forced off for the edit).
  const tracked = opts.tracked ?? true;
  const html = `<h2>${escapeHtml(clauseName)}</h2><p>${escapeHtml(text)}</p>`;
  return serializeTrackChanges(() => runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    // Sample the document's base font before inserting so the appended clause
    // matches it rather than the HTML default.
    const font = await sampleInsertionFont(context);
    const priorMode = doc.changeTrackingMode;
    try {
      // Commit the mode flip before inserting so the insert is tracked (or the
      // clean insert is genuinely untracked) rather than racing in one batch.
      doc.changeTrackingMode = tracked ? Word.ChangeTrackingMode.trackAll : Word.ChangeTrackingMode.off;
      await context.sync();
      const range = doc.body.insertHtml(html, Word.InsertLocation.end);
      await context.sync();
      await matchInsertedFont(context, range, font);
    } finally {
      try {
        doc.changeTrackingMode = priorMode;
        await context.sync();
      } catch {
        // original error (if any) propagates
      }
    }
  }));
}
