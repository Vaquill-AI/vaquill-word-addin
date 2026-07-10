import { runWord } from "./run";

/**
 * Notify a caller when the document body actually changes, so a review can be
 * marked stale and re-run. The preferred signal is Word's paragraph content
 * events (onParagraphAdded / onParagraphChanged / onParagraphDeleted, WordApi
 * 1.5), which fire on real edits rather than mere cursor movement. On a host
 * that lacks them we fall back to the selection-changed event, which at least
 * fires while the user is working in the document.
 *
 * Returns an unsubscribe function. It is guarded so calling it more than once is
 * a no-op, and its async removal work is best-effort (nothing to recover if the
 * host has already torn down).
 */
export async function onDocumentChanged(cb: () => void): Promise<() => void> {
  // A single no-arg handler is assignable to every paragraph-event handler type
  // (fewer parameters is compatible), so we reuse it for all three events.
  const handler = async (): Promise<void> => {
    cb();
  };

  try {
    await runWord(async (context) => {
      const doc = context.document;
      doc.onParagraphAdded.add(handler);
      doc.onParagraphChanged.add(handler);
      doc.onParagraphDeleted.add(handler);
      await context.sync();
    });
    return buildParagraphUnsubscribe(handler);
  } catch {
    return registerSelectionFallback(cb);
  }
}

/** Unsubscribe that removes the three paragraph handlers in a fresh Word.run. */
function buildParagraphUnsubscribe(handler: () => Promise<void>): () => void {
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void runWord(async (context) => {
      const doc = context.document;
      doc.onParagraphAdded.remove(handler);
      doc.onParagraphChanged.remove(handler);
      doc.onParagraphDeleted.remove(handler);
      await context.sync();
    }).catch(() => {
      // Removal is best-effort; nothing to recover if the host is gone.
    });
  };
}

/**
 * Fallback for hosts without paragraph events: listen for selection changes and
 * return a guarded unsubscribe that removes that handler.
 */
function registerSelectionFallback(cb: () => void): () => void {
  const selHandler = () => cb();
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
