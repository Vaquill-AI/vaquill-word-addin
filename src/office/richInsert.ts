/**
 * Insert formatted content into the document using HTML. Word converts inserted
 * HTML into native headings, paragraphs, and bold runs, so generated drafts and
 * clauses look like authored Word content instead of flat pasted text.
 */
import { runWord } from "./run";

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
    const selection = context.document.getSelection();
    const inserted = selection.insertHtml(html, Word.InsertLocation.after);
    inserted.select();
    await context.sync();
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
  return runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    const paras = doc.getSelection().paragraphs;
    paras.load("items");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    try {
      const items = paras.items;
      const anchor = items.length > 0 ? items[items.length - 1] : undefined;
      let cursor: Word.Paragraph | undefined;
      for (const block of blocks) {
        cursor = cursor
          ? cursor.insertParagraph(block, Word.InsertLocation.after)
          : anchor
            ? anchor.insertParagraph(block, Word.InsertLocation.after)
            : doc.body.insertParagraph(block, Word.InsertLocation.end);
      }
      cursor?.select();
      await context.sync();
    } finally {
      doc.changeTrackingMode = priorMode;
      await context.sync();
    }
  });
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
  return runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = tracked ? Word.ChangeTrackingMode.trackAll : Word.ChangeTrackingMode.off;
    try {
      doc.body.insertHtml(html, Word.InsertLocation.end);
      await context.sync();
    } finally {
      doc.changeTrackingMode = priorMode;
      await context.sync();
    }
  });
}
