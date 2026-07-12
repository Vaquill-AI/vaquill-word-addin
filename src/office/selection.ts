import { applyWordDiff } from "office-word-diff";
import { runWord, OfficeError, serializeTrackChanges } from "./run";

/**
 * Selection-scoped Word operations for the clause tools.
 * These act on whatever the user has highlighted in the document.
 */

/** Replace the current selection with new text as a tracked change (word-level diff). */
export async function replaceSelectionTracked(newText: string): Promise<void> {
  return serializeTrackChanges(() => runWord(async (context) => {
    const doc = context.document;
    const sel = doc.getSelection();
    sel.load("text");
    const selTables = sel.tables;
    selTables.load("items");
    doc.load("changeTrackingMode");
    await context.sync();

    const original = sel.text;
    // A collapsed cursor (nothing selected) reads as empty text. Replacing it
    // would produce a spurious tracked insertion at the cursor, so require a
    // real selection first.
    if (!original || !original.trim()) {
      throw new OfficeError("Select some text in the document first.", "no_selection");
    }
    // A selection that spans table structure carries inter-cell/row markers in
    // its text; word-diffing plain replacement text against that smears the diff
    // and can delete table structure. Refuse rather than corrupt the table.
    if (selTables.items.length > 0) {
      throw new OfficeError(
        "Your selection spans a table. Rewrite text within a single cell, or select text outside the table.",
        "selection_spans_table",
      );
    }

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    try {
      await applyWordDiff(context, sel, original, newText, { enableTracking: true, logLevel: "error" });
    } finally {
      // Best-effort restore so a broken context can't mask the original error.
      try {
        doc.changeTrackingMode = priorMode;
        await context.sync();
      } catch {
        // original error (if any) propagates
      }
    }
  }));
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
