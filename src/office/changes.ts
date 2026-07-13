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
      trackedChanges: changes.items.map((c) => ({
        author: c.author,
        type: c.type,
        text: c.text,
        createdAt: toIso((c as unknown as { date?: unknown }).date),
      })),
      comments: comments.items.map((c) => ({
        id: c.id,
        author: c.authorName,
        text: c.content,
        resolved: c.resolved,
        createdAt: toIso((c as unknown as { creationDate?: unknown }).creationDate),
        replies: c.replies.items.map((r) => ({
          author: r.authorName,
          text: r.content,
          createdAt: toIso((r as unknown as { creationDate?: unknown }).creationDate),
        })),
      })),
    };
  });
}

/**
 * Accept or reject the tracked change at the given position in document order.
 * Resolving by index (not by text) is what makes this correct when two changes
 * share identical text (e.g. the counterparty deleted the same word twice):
 * a text match would always hit the FIRST occurrence and resolve the wrong one.
 * The index is the change's position in the list read by readDocumentChanges,
 * which enumerates getTrackedChanges() in the same document order. Returns false
 * when the index is out of range (the list changed under us). WordApi 1.6.
 */
export async function resolveTrackedChangeAt(
  index: number,
  action: "accept" | "reject",
): Promise<boolean> {
  return runWord(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("text");
    await context.sync();
    const match = changes.items[index];
    if (!match) return false;
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
