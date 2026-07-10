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

/** Insert a simple Table of Authorities (verified cases) at the end of the document. */
export async function insertTableOfAuthorities(cases: AuthorityEntry[]): Promise<void> {
  return runWord(async (context) => {
    const body = context.document.body;
    body.insertParagraph("", Word.InsertLocation.end);

    const heading = body.insertParagraph("Table of Authorities", Word.InsertLocation.end);
    heading.styleBuiltIn = Word.BuiltInStyleName.heading1;

    const sub = body.insertParagraph("Cases", Word.InsertLocation.end);
    sub.styleBuiltIn = Word.BuiltInStyleName.heading2;

    const sorted = [...cases].sort((a, b) => a.caseName.localeCompare(b.caseName));
    for (const c of sorted) {
      body.insertParagraph(`${c.caseName}, ${c.raw}`, Word.InsertLocation.end);
    }
    await context.sync();
  });
}
