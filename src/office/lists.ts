/**
 * List-numbering inheritance for inserted clauses.
 *
 * `insertParagraph` inherits a paragraph's character/paragraph formatting but NOT
 * its list membership, so a clause inserted into a numbered contract lands as an
 * UN-numbered paragraph in the middle of the outline, and the following clauses
 * keep their old numbers. Attaching each inserted paragraph to the anchor's list
 * makes Word renumber natively (insert "Force Majeure" as clause 14 and 15, 16...
 * follow). WordApi 1.3, cross-platform; best-effort so an unusual/absent
 * numbering scheme just keeps the plain insert.
 */

export async function inheritListNumbering(
  context: Word.RequestContext,
  anchor: Word.Paragraph | Word.Range,
  inserted: Word.Paragraph[],
): Promise<void> {
  if (inserted.length === 0) return;
  try {
    // Only a Paragraph anchor carries list membership; a Range anchor (after a
    // table / at the body end) has none, and reading these throws for it — caught
    // below, leaving the plain insert intact.
    const para = anchor as Word.Paragraph;
    const item = para.listItemOrNullObject;
    item.load("level");
    const list = para.listOrNullObject;
    list.load("id");
    await context.sync();

    if (item.isNullObject || list.isNullObject) return; // anchor is not in a list
    const level = item.level ?? 0;
    const listId = list.id;
    for (const p of inserted) {
      p.attachToList(listId, level);
    }
    await context.sync();
  } catch {
    // A Range anchor, an atypical list, or a host quirk: keep the plain insert.
  }
}
