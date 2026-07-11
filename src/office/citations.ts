import { runWord } from "./run";
import { findRanges } from "./search";

/**
 * Document operations for the authority verifier: comment on a citation and
 * insert a Table of Authorities. Locating a citation reuses
 * navigate.selectClauseInDocument.
 */

/** Attach a comment to the first occurrence of a citation. Returns false if not found. */
export async function commentOnCitation(raw: string, comment: string): Promise<boolean> {
  return runWord(async (context) => {
    const items = await findRanges(context, raw);
    const range = items[0];
    if (!range) return false;
    range.insertComment(comment);
    await context.sync();
    return true;
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
    const doc = context.document;
    const paras = doc.getSelection().paragraphs;
    paras.load("items");
    await context.sync();

    const items = paras.items;
    let cursor: Word.Paragraph | null = items.length > 0 ? items[items.length - 1] ?? null : null;

    const add = (text: string, style?: Word.BuiltInStyleName): Word.Paragraph => {
      const p = cursor
        ? cursor.insertParagraph(text, Word.InsertLocation.after)
        : doc.body.insertParagraph(text, Word.InsertLocation.end);
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
