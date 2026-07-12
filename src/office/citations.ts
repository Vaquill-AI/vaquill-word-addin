import { resolveAfterAnchor } from "./anchor";
import { runWord } from "./run";
import { findBestRange } from "./search";

/**
 * Document operations for the authority verifier: comment on a citation and
 * insert a Table of Authorities. Locating a citation reuses
 * navigate.selectClauseInDocument.
 */

/** Attach a comment to the best-matching occurrence of a citation. Returns false
 *  if not found, or if the located occurrence is in a region where Word forbids
 *  comments (footnote/header). */
export async function commentOnCitation(raw: string, comment: string): Promise<boolean> {
  return runWord(async (context) => {
    const range = await findBestRange(context, raw);
    if (!range) return false;
    try {
      range.insertComment(comment);
      await context.sync();
      return true;
    } catch {
      // Located but comments are unsupported here (e.g. a footnote citation).
      return false;
    }
  });
}

/**
 * Insert a citation as a real Word footnote at the cursor. This is Microsoft's
 * recommended cross-platform citation pattern (`Range.insertFootnote`, WordApi
 * 1.5), and unlike an inline bracket it renumbers and repaginates natively. Used
 * for brief/memo writing where an authority belongs in a footnote, not the body.
 */
export async function insertCitationFootnote(citation: string): Promise<void> {
  const text = citation.trim();
  if (!text) return;
  return runWord(async (context) => {
    // insertFootnote places the reference mark at the (collapsed) selection and
    // puts `text` in the footnote body at the bottom of the page.
    context.document.getSelection().insertFootnote(text);
    await context.sync();
  });
}

export interface AuthorityEntry {
  caseName: string;
  raw: string;
}

/**
 * Insert a Table of Authorities (verified cases) at the user's cursor rather than
 * forcing it to the document end, so the user controls placement (e.g. front
 * matter). Inserts after the paragraph the cursor sits in; falls back to the
 * document end when there is no usable selection. Selects the inserted heading so
 * Word scrolls it into view, so the user sees it appear.
 */
export async function insertTableOfAuthorities(cases: AuthorityEntry[]): Promise<void> {
  return runWord(async (context) => {
    // Table-aware anchor so a cursor inside a table cell does not inject the
    // entire Table of Authorities into that single cell.
    let cursor: Word.Paragraph | Word.Range = await resolveAfterAnchor(context);

    const add = (text: string, style?: Word.BuiltInStyleName): Word.Paragraph => {
      const p = cursor.insertParagraph(text, Word.InsertLocation.after);
      if (style) p.styleBuiltIn = style;
      cursor = p;
      return p;
    };

    add(""); // spacer above the table
    const heading = add("Table of Authorities", Word.BuiltInStyleName.heading1);
    add("Cases", Word.BuiltInStyleName.heading2);

    const sorted = [...cases].sort((a, b) => a.caseName.localeCompare(b.caseName));
    for (const c of sorted) add(`${c.caseName}, ${c.raw}`);

    // Bring the inserted table into view so the user sees it was placed.
    heading.select();
    await context.sync();
  });
}
