/**
 * Resolve where to place a standalone paragraph insertion relative to the user's
 * caret, TABLE-AWARE.
 *
 * The naive approach - anchor on the selection's last paragraph and
 * insertParagraph("After") - drops the content INSIDE the cell when the caret
 * sits in a table cell (signature block, schedule, fee table), corrupting the
 * table layout. This helper detects that case and returns an anchor positioned
 * after the WHOLE table instead, so an inserted clause / passage / table lands as
 * a normal body paragraph.
 *
 * Call inside a `Word.run`; it performs its own `context.sync()` calls. Both a
 * `Paragraph` and a `Range` expose `insertParagraph(text, InsertLocation.after)`,
 * so callers can treat the return value uniformly.
 */
export async function resolveAfterAnchor(
  context: Word.RequestContext,
): Promise<Word.Paragraph | Word.Range> {
  const doc = context.document;
  const paras = doc.getSelection().paragraphs;
  paras.load("items");
  await context.sync();

  const items = paras.items;
  const last = items.length > 0 ? items[items.length - 1] : undefined;
  // No selection paragraphs (e.g. empty doc / detached caret): fall back to the
  // end of the body.
  if (!last) return doc.body.getRange(Word.RangeLocation.end);

  const table = last.parentTableOrNullObject;
  table.load("isNullObject");
  await context.sync();

  // In a table cell: anchor after the entire table, not after the in-cell
  // paragraph. Nested tables resolve to the innermost table here; that still
  // escapes the immediate cell, which is the corruption we care about.
  if (!table.isNullObject) {
    return table.getRange(Word.RangeLocation.after);
  }
  return last;
}
