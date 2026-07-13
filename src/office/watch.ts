import { runWord } from "./run";

/**
 * Call `onChange` whenever the document's paragraphs or comments change, so a
 * view can keep a live scan fresh while the user edits in Word (rather than
 * showing stale counts until they navigate away and back).
 *
 * Returns a cleanup that removes the handlers. Best-effort: if the host does not
 * support these events, registration fails quietly and a no-op cleanup is
 * returned, so the caller can keep its manual refresh as a fallback. The events
 * (paragraph + comment) are WordApi 1.5 / 1.4 and available at our 1.6 floor.
 *
 * These events fire frequently during typing, so the caller MUST debounce.
 */
export async function watchDocumentChanges(onChange: () => void): Promise<() => void> {
  const handles: Array<{ remove: () => void }> = [];
  try {
    await runWord(async (context) => {
      const doc = context.document;
      const handler = async () => {
        onChange();
      };
      // Paragraph events (typed) catch text edits, including tracked changes.
      handles.push(doc.onParagraphChanged.add(handler));
      handles.push(doc.onParagraphAdded.add(handler));
      handles.push(doc.onParagraphDeleted.add(handler));
      // Comment events are not in every @types/office-js; register through a
      // guarded cast so hosts that expose them (WordApi 1.4+) also refresh when
      // a comment is added, edited, or deleted. Absent ones are simply skipped
      // (the focus fallback still catches those on return to the pane).
      type CommentEvent = { add: (h: () => Promise<void>) => { remove: () => void } };
      const evented = doc as unknown as {
        onCommentAdded?: CommentEvent;
        onCommentChanged?: CommentEvent;
        onCommentDeleted?: CommentEvent;
      };
      if (evented.onCommentAdded) handles.push(evented.onCommentAdded.add(handler));
      if (evented.onCommentChanged) handles.push(evented.onCommentChanged.add(handler));
      if (evented.onCommentDeleted) handles.push(evented.onCommentDeleted.add(handler));
      await context.sync();
    });
  } catch {
    // Unsupported host or registration failure: degrade to no auto-refresh.
    return () => {};
  }

  return () => {
    void runWord(async (context) => {
      for (const h of handles) {
        try {
          h.remove();
        } catch {
          // A handler that cannot be removed just stops mattering once the
          // caller guards against post-unmount updates.
        }
      }
      await context.sync();
    }).catch(() => {
      // Cleanup best-effort; nothing actionable if it fails.
    });
  };
}
