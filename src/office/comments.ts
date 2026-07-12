import { runWord } from "./run";
import { findBestRange } from "./search";

/**
 * Insert the playbook rationale for each flagged issue as a native Word comment
 * anchored on the clause text. This gives the reviewer the "why" inline, next to
 * the clause, rather than only in the pane. Comments are WordApi 1.4 (GA).
 */

export interface RationaleCommentOutcome {
  /** Comments successfully attached. */
  inserted: number;
  /** Clauses LOCATED but where a comment could not be attached - Word forbids
   *  comments in some regions (footnotes/headers/footers). Reported so the UI can
   *  tell the reviewer rather than silently under-counting. */
  skipped: number;
  /** Clauses whose text could not be located anywhere in the document. */
  notFound: number;
}

/**
 * Insert a rationale comment for each item that has one. Locates the clause with
 * findBestRange (disambiguates duplicated boilerplate), and separates a genuine
 * "not found" from a "found but cannot comment here" (footnote/header) so the
 * caller can report both. Each successful insert is flushed with its own sync so
 * a later failure cannot discard an already-queued comment.
 */
export async function insertRationaleComments(
  items: { currentLanguage: string; rationale: string }[],
): Promise<RationaleCommentOutcome> {
  return runWord(async (context) => {
    let inserted = 0;
    let skipped = 0;
    let notFound = 0;
    for (const item of items) {
      const rationale = item.rationale.trim();
      const query = item.currentLanguage.trim();
      if (!rationale || !query) continue;
      const range = await findBestRange(context, query);
      if (!range) {
        notFound += 1;
        continue;
      }
      try {
        range.insertComment(rationale);
        await context.sync();
        inserted += 1;
      } catch {
        // The clause was located but sits in a region where Word forbids
        // comments (footnote/header/footer). Count it so we can tell the user.
        skipped += 1;
      }
    }
    return { inserted, skipped, notFound };
  });
}

/**
 * Anchor a comment on the best match of `anchorText` (disambiguating duplicated
 * text via findBestRange) and insert it. Used to attach a negotiation reply to
 * the counterparty's tracked change. Returns a precise outcome so the caller can
 * message it: "not_found" (the change text could not be located) vs
 * "unsupported_region" (located, but Word forbids comments there, e.g. a
 * footnote).
 */
export async function insertCommentAnchored(
  anchorText: string,
  comment: string,
): Promise<"inserted" | "not_found" | "unsupported_region"> {
  const anchor = anchorText.trim();
  const body = comment.trim();
  if (!anchor || !body) return "not_found";
  return runWord(async (context) => {
    const range = await findBestRange(context, anchor);
    if (!range) return "not_found";
    try {
      range.insertComment(body);
      await context.sync();
      return "inserted";
    } catch {
      return "unsupported_region";
    }
  });
}

/**
 * Locate a comment by its stable id in the document's comment collection. Ids
 * (not list indices) survive comments being added/resolved between a read and an
 * action, so they are the safe handle for resolve/reply. Comments are WordApi
 * 1.4 (GA). Returns null when the comment is gone (already deleted).
 */
async function findComment(
  context: Word.RequestContext,
  id: string,
): Promise<Word.Comment | null> {
  const comments = context.document.comments;
  comments.load("id");
  await context.sync();
  return comments.items.find((c) => c.id === id) ?? null;
}

/**
 * Mark a counterparty comment resolved (or reopen it). Resolving is a native
 * Word state that travels with the .docx. Returns false when the comment no
 * longer exists.
 */
export async function resolveComment(id: string, resolved = true): Promise<boolean> {
  return runWord(async (context) => {
    const comment = await findComment(context, id);
    if (!comment) return false;
    comment.resolved = resolved;
    await context.sync();
    return true;
  });
}

/**
 * Count every comment in the document (whole-document scope: main story plus
 * headers, footers, and footnotes). Matches the scope of `deleteAllComments` so
 * a pre-scan count and the delete count agree, unlike `body.getComments()` which
 * only sees the main story. Comments are WordApi 1.4 (GA).
 */
export async function countDocumentComments(): Promise<number> {
  return runWord(async (context) => {
    const comments = context.document.comments;
    comments.load("id");
    await context.sync();
    return comments.items.length;
  });
}

/**
 * Delete EVERY comment in the document, to produce a send-ready clean copy.
 * Comments (and their replies) travel inside the .docx, so any internal note
 * would otherwise reach the counterparty. Returns the number deleted. Word's
 * native Undo still reverses it. Comments are WordApi 1.4 (GA).
 */
export async function deleteAllComments(): Promise<number> {
  return runWord(async (context) => {
    const comments = context.document.comments;
    comments.load("id");
    await context.sync();
    const items = comments.items;
    for (const c of items) c.delete();
    await context.sync();
    return items.length;
  });
}

/**
 * Add a reply to the end of a comment thread. Returns false when the comment no
 * longer exists or the reply is empty.
 */
export async function replyToComment(id: string, text: string): Promise<boolean> {
  const body = text.trim();
  if (!body) return false;
  return runWord(async (context) => {
    const comment = await findComment(context, id);
    if (!comment) return false;
    comment.reply(body);
    await context.sync();
    return true;
  });
}
