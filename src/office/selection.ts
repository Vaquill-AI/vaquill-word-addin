import { applyWordDiff } from "office-word-diff";
import { runWord, OfficeError } from "./run";

/**
 * Selection-scoped Word operations for the clause tools.
 * These act on whatever the user has highlighted in the document.
 */

/** Replace the current selection with new text as a tracked change (word-level diff). */
export async function replaceSelectionTracked(newText: string): Promise<void> {
  return runWord(async (context) => {
    const doc = context.document;
    const sel = doc.getSelection();
    sel.load("text");
    doc.load("changeTrackingMode");
    await context.sync();

    const original = sel.text;
    // A collapsed cursor (nothing selected) reads as empty text. Replacing it
    // would produce a spurious tracked insertion at the cursor, so require a
    // real selection first.
    if (!original || !original.trim()) {
      throw new OfficeError("Select some text in the document first.", "no_selection");
    }

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    try {
      await applyWordDiff(context, sel, original, newText, { enableTracking: true, logLevel: "error" });
    } finally {
      doc.changeTrackingMode = priorMode;
      await context.sync();
    }
  });
}

/** Attach a comment to the current selection (WordApi 1.4+). */
export async function insertCommentOnSelection(text: string): Promise<void> {
  return runWord(async (context) => {
    const sel = context.document.getSelection();
    sel.load("text");
    await context.sync();

    // A collapsed cursor would produce a zero-length comment anchor; require a
    // real selection first.
    if (!sel.text || !sel.text.trim()) {
      throw new OfficeError("Select some text in the document first.", "no_selection");
    }

    sel.insertComment(text);
    await context.sync();
  });
}

/**
 * Subscribe to selection changes in the document. Returns an unsubscribe fn.
 * Powers the live, selection-aware tools pane.
 */
export function onSelectionChanged(cb: () => void): () => void {
  const handler = () => cb();
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, handler);
  return () => {
    Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler });
  };
}
