import { runWord } from "./run";
import { findBestRange } from "./search";

/**
 * Bookmark clauses so the reviewer can jump between them from the pane. Bookmarks
 * survive edits (they move with their anchored range), which makes them a stable
 * navigation target across a review session. insertBookmark is WordApi 1.5.
 *
 * Bookmark names must be valid Word bookmark identifiers (letters, digits, and
 * underscores, no spaces). Callers are responsible for passing safe names.
 */

/**
 * Create a bookmark for each clause, anchored on the first match of its query.
 * Returns the count of bookmarks created.
 */
export async function bookmarkClauses(
  items: { name: string; query: string }[],
): Promise<number> {
  return runWord(async (context) => {
    let created = 0;
    for (const item of items) {
      const query = item.query.trim();
      if (!query) continue;
      // Disambiguate duplicated clause text so the bookmark lands on the operative
      // occurrence, not a coincidental phrase match in the Definitions section.
      const range = await findBestRange(context, query);
      if (!range) continue;
      range.insertBookmark(item.name);
      created += 1;
    }
    await context.sync();
    return created;
  });
}

/**
 * Select the range of a bookmark, scrolling it into view. Returns false when no
 * bookmark of that name exists (getBookmarkRangeOrNullObject yields a null
 * object rather than throwing), so the UI can degrade gracefully.
 */
export async function goToBookmark(name: string): Promise<boolean> {
  return runWord(async (context) => {
    const range = context.document.getBookmarkRangeOrNullObject(name);
    range.load("isNullObject");
    await context.sync();
    if (range.isNullObject) return false;
    range.select();
    await context.sync();
    return true;
  });
}
