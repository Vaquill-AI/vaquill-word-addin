import { runWord } from "./run";

/**
 * Read the document's tracked changes and comments so the assistant can
 * summarize what the counterparty changed. Tracked-change enumeration is
 * WordApi 1.6 (GA); comments are WordApi 1.4 (GA).
 */
export interface DocCommentReply {
  author: string;
  text: string;
  /** ISO timestamp, when the runtime reports it (WordApi 1.4+). */
  createdAt?: string;
}

export interface DocComment {
  id: string;
  author: string;
  text: string;
  resolved: boolean;
  /** ISO timestamp, when the runtime reports it (WordApi 1.4+). */
  createdAt?: string;
  replies: DocCommentReply[];
}

export interface DocTrackedChange {
  author: string;
  type: string;
  text: string;
  /** ISO timestamp, when the runtime reports it (WordApi 1.6+). */
  createdAt?: string;
}

export interface DocChanges {
  trackedChanges: DocTrackedChange[];
  comments: DocComment[];
}

/** Office.js returns creationDate as a Date; normalize to an ISO string (or
 *  undefined if the runtime does not populate it). */
function toIso(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value) return value;
  return undefined;
}

export async function readDocumentChanges(): Promise<DocChanges> {
  return runWord(async (context) => {
    const body = context.document.body;
    const changes = body.getTrackedChanges();
    changes.load("author,type,text,date");
    const comments = body.getComments();
    comments.load(
      "id,authorName,content,resolved,creationDate,replies/authorName,replies/content,replies/creationDate",
    );
    await context.sync();

    return {
      trackedChanges: (changes.items ?? []).map((c) => ({
        author: c.author,
        type: c.type,
        text: c.text,
        createdAt: toIso((c as unknown as { date?: unknown }).date),
      })),
      comments: (comments.items ?? []).map((c) => {
        const author = c.authorName;
        const content = c.content;
        // Reading the reply collection is fragile: on some hosts a comment whose
        // `replies` navigation was not materialized dereferences an internal null
        // inside Office.js and throws, which previously blanked the entire Changes
        // tab. Read it best-effort and fall back to no replies.
        let replies: DocCommentReply[] = [];
        try {
          replies = (c.replies?.items ?? [])
            .map((r) => ({
              author: r.authorName,
              text: r.content,
              createdAt: toIso((r as unknown as { creationDate?: unknown }).creationDate),
            }))
            // Word surfaces a programmatically-inserted comment's OWN text back as
            // a phantom self-reply (there is no such reply in the document), which
            // showed the comment body duplicated under itself. Drop any reply that
            // exactly duplicates the parent comment (same author + same text); a
            // genuine reply repeating the full comment verbatim does not happen.
            .filter((r) => !(r.author === author && (r.text ?? "").trim() === (content ?? "").trim()));
        } catch {
          replies = [];
        }
        return {
          id: c.id,
          author,
          text: content,
          resolved: c.resolved,
          createdAt: toIso((c as unknown as { creationDate?: unknown }).creationDate),
          replies,
        };
      }),
    };
  });
}

/**
 * Accept or reject the tracked change at the given position in document order.
 * Resolving by index (not by text) is what makes this correct when two changes
 * share identical text (e.g. the counterparty deleted the same word twice):
 * a text match would always hit the FIRST occurrence and resolve the wrong one.
 * The index is the change's position in the list read by readDocumentChanges,
 * which enumerates getTrackedChanges() in the same document order. WordApi 1.6.
 *
 * `expected` is the identity of the row the user actually clicked, and the index
 * alone is NOT safe without it: if anything resolved a change since the list was
 * read (the user accepted one from Word's own Review ribbon, a co-author edit
 * synced), every later index shifts by one and this would accept/reject a
 * DIFFERENT change while reporting success. An out-of-range check cannot catch
 * that, because a shifted index is still in range. So confirm the change sitting
 * at `index` is still the one that was clicked, and bail out otherwise: the
 * caller already reports that it could not locate the change and reloads, which
 * re-syncs the list.
 *
 * Returns false when the index is out of range OR the change there is not the
 * expected one.
 */
export async function resolveTrackedChangeAt(
  index: number,
  action: "accept" | "reject",
  expected?: { text: string; author?: string },
): Promise<boolean> {
  return runWord(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("text,author");
    await context.sync();
    const match = changes.items[index];
    if (!match) return false;
    if (expected) {
      if (match.text !== expected.text) return false;
      if (expected.author !== undefined && match.author !== expected.author) return false;
    }
    if (action === "accept") match.accept();
    else match.reject();
    await context.sync();
    return true;
  });
}

/**
 * Accept every tracked change whose text is in the given set, in a single pass
 * (for AI-approved bulk accept). Accepting ALL matches of a text is correct
 * here: when a text was flagged "accept", every identical change should be
 * accepted, so duplicates are handled rather than silently skipped. Returns the
 * number actually accepted so the caller can report a partial result.
 */
export async function acceptTrackedChanges(texts: string[]): Promise<number> {
  const wanted = new Set(texts);
  return runWord(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("text");
    await context.sync();
    const targets = changes.items.filter((c) => wanted.has(c.text));
    for (const t of targets) t.accept();
    await context.sync();
    return targets.length;
  });
}

/**
 * Accept EVERY tracked change in the document in one pass, to produce a clean
 * copy. Done by iterating `getTrackedChanges()` and calling `.accept()` on each
 * (cross-platform), because `document.body.acceptAllRevisions` is desktop-only.
 * Returns the number accepted. Word's native Undo still reverses it. WordApi 1.6.
 */
export async function acceptAllTrackedChanges(): Promise<number> {
  return runWord(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("type");
    await context.sync();
    const items = changes.items;
    for (const c of items) c.accept();
    await context.sync();
    return items.length;
  });
}

/**
 * Accept or reject every tracked change made by a specific author (e.g. bulk
 * accept or reject all of the counterparty's edits in one action). All matching
 * changes are queued and flushed with a single final sync. Returns the number
 * of changes acted on. WordApi 1.6.
 */
export async function resolveTrackedChangesByAuthor(
  author: string,
  action: "accept" | "reject",
): Promise<number> {
  return runWord(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("author");
    await context.sync();
    const targets = changes.items.filter((c) => c.author === author);
    for (const t of targets) {
      if (action === "accept") t.accept();
      else t.reject();
    }
    await context.sync();
    return targets.length;
  });
}

/** Format changes into a compact text blob for the summarizer (as chat context). */
export function formatChanges(c: DocChanges): string {
  const lines: string[] = [];
  if (c.trackedChanges.length) {
    lines.push("TRACKED CHANGES:");
    for (const t of c.trackedChanges) {
      lines.push(`- [${t.type}] by ${t.author || "unknown"}: ${t.text}`);
    }
  }
  if (c.comments.length) {
    lines.push("", "COMMENTS:");
    for (const cm of c.comments) {
      lines.push(`- ${cm.author || "unknown"}${cm.resolved ? " (resolved)" : ""}: ${cm.text}`);
    }
  }
  return lines.join("\n");
}
