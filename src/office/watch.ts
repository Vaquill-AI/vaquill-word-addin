import { runWord } from "./run";

export interface WatchOptions {
  /**
   * Also fire on comment add / change / delete (WordApi 1.4+, registered through
   * a guarded cast since not every host exposes them). Default true. Turn off for
   * consumers that only care about body content (e.g. a body-hash freshness check),
   * where comment events would just trigger wasted re-reads.
   */
  comments?: boolean;
  /**
   * On a host without paragraph events, fall back to the selection-changed event
   * (which at least fires while the user works in the document) instead of
   * degrading to no auto-refresh. Default false: callers with their own fallback
   * (e.g. a window focus listener) opt out.
   */
  selectionFallback?: boolean;
}

// Comment events are absent from some @types/office-js versions; this is the
// shape we need from the ones a host does expose.
type CommentEvent = { add: (h: () => Promise<void>) => { remove: () => void } };

/**
 * Call `onChange` whenever the document's paragraphs (and, by default, comments)
 * change, so a view can keep a live scan fresh while the user edits in Word
 * rather than showing stale state until they navigate away and back.
 *
 * The single office-layer document-change watcher: paragraph events (WordApi
 * 1.5) catch real text edits including tracked changes; comment events (WordApi
 * 1.4+) are added when `options.comments` is set. On a host that lacks paragraph
 * events, registration fails and we either register the selection-changed
 * fallback (`options.selectionFallback`) or return a no-op cleanup so the caller
 * can rely on its own refresh path.
 *
 * Returns a guarded cleanup (safe to call more than once). These events fire
 * frequently during typing, so the caller MUST debounce.
 */
export async function watchDocumentChanges(
  onChange: () => void,
  options: WatchOptions = {},
): Promise<() => void> {
  const { comments = true, selectionFallback = false } = options;
  // A single no-arg handler is assignable to every paragraph/comment handler
  // type (fewer parameters is compatible), so we reuse it for all events.
  const handler = async (): Promise<void> => {
    onChange();
  };
  const handles: Array<{ remove: () => void }> = [];

  try {
    await runWord(async (context) => {
      const doc = context.document;
      // Paragraph events (typed) catch text edits, including tracked changes.
      handles.push(doc.onParagraphChanged.add(handler));
      handles.push(doc.onParagraphAdded.add(handler));
      handles.push(doc.onParagraphDeleted.add(handler));
      if (comments) {
        const evented = doc as unknown as {
          onCommentAdded?: CommentEvent;
          onCommentChanged?: CommentEvent;
          onCommentDeleted?: CommentEvent;
        };
        if (evented.onCommentAdded) handles.push(evented.onCommentAdded.add(handler));
        if (evented.onCommentChanged) handles.push(evented.onCommentChanged.add(handler));
        if (evented.onCommentDeleted) handles.push(evented.onCommentDeleted.add(handler));
      }
      await context.sync();
    });
  } catch {
    // Unsupported host or registration failure: use the selection fallback if
    // the caller opted in, else degrade to no auto-refresh.
    return selectionFallback ? registerSelectionFallback(onChange) : () => {};
  }

  return guardedRemoveAll(handles);
}

/** A guarded cleanup that removes every registered handle exactly once. */
function guardedRemoveAll(handles: Array<{ remove: () => void }>): () => void {
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void runWord(async (context) => {
      for (const h of handles) {
        try {
          h.remove();
        } catch {
          // A handle that cannot be removed just stops mattering once the
          // caller guards against post-unmount updates.
        }
      }
      await context.sync();
    }).catch(() => {
      // Cleanup best-effort; nothing actionable if it fails.
    });
  };
}

/**
 * Fallback for hosts without paragraph events: listen for selection changes and
 * return a guarded unsubscribe that removes that handler.
 */
function registerSelectionFallback(onChange: () => void): () => void {
  const selHandler = () => onChange();
  Office.context.document.addHandlerAsync(
    Office.EventType.DocumentSelectionChanged,
    selHandler,
  );
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    Office.context.document.removeHandlerAsync(
      Office.EventType.DocumentSelectionChanged,
      { handler: selHandler },
    );
  };
}
