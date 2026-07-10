import { runWord } from "./run";

/**
 * Read the document's tracked changes and comments so the assistant can
 * summarize what the counterparty changed. Tracked-change enumeration is
 * WordApi 1.6 (GA); comments are WordApi 1.4 (GA).
 */
export interface DocChanges {
  trackedChanges: { author: string; type: string; text: string }[];
  comments: { author: string; text: string; resolved: boolean }[];
}

export async function readDocumentChanges(): Promise<DocChanges> {
  return runWord(async (context) => {
    const body = context.document.body;
    const changes = body.getTrackedChanges();
    changes.load("author,type,text");
    const comments = body.getComments();
    comments.load("authorName,content,resolved");
    await context.sync();

    return {
      trackedChanges: changes.items.map((c) => ({ author: c.author, type: c.type, text: c.text })),
      comments: comments.items.map((c) => ({
        author: c.authorName,
        text: c.content,
        resolved: c.resolved,
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

/** Accept or reject every tracked change in the document. WordApi 1.6. */
export async function resolveAllTrackedChanges(action: "accept" | "reject"): Promise<void> {
  return runWord(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    if (action === "accept") changes.acceptAll();
    else changes.rejectAll();
    await context.sync();
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
