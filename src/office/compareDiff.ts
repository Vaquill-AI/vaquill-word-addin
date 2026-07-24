import { applyWordDiff, computeDiff, type DiffResult } from "office-word-diff";
import { OfficeError, runWord, serializeTrackChanges } from "./run";

/**
 * Client-side document compare for the community / BYOK edition.
 *
 * The hosted Compare tool uploads both sides to a server diff engine (Clippit /
 * LibreOffice) that produces an OOXML-fidelity redline. BYOK has no server, so
 * this does a TEXT-level compare entirely on-device: it diffs the open document
 * against a reference version's text using office-word-diff (the same engine the
 * redline tool already uses in the task pane).
 *
 * The compare is oriented "open document -> reference": a tracked DELETION is
 * text present only in the open document, a tracked INSERTION is text present
 * only in the reference. Accepting every change makes the open document match
 * the reference; rejecting keeps it as-is. The read-only preview
 * (`computeCompareOps`) uses the SAME direction so the on-screen marks and the
 * applied tracked changes always agree.
 *
 * Limits vs hosted: text only (formatting/structure differences are not shown),
 * .docx/.txt/.md references only (no PDF/.doc conversion), and no AI hunk triage.
 */

/** A single diff operation: -1 delete, 0 unchanged, 1 insert. */
export type CompareOp = [op: number, text: string];

/**
 * Compute the read-only diff between the open document and the reference, in the
 * same "open -> reference" direction the apply uses. Deletions are open-only
 * text; insertions are reference-only text.
 */
export function computeCompareOps(openText: string, referenceText: string): CompareOp[] {
  return computeDiff(openText, referenceText) as CompareOp[];
}

/**
 * Apply the open-document -> reference diff to the whole body as native Word
 * tracked changes. Non-destructive: the edit is a reviewable tracked change and
 * Word's Undo reverses it. Existing formatting is preserved because the diff
 * touches only the words that differ, not the whole body.
 *
 * The diff baseline is read from the body AT apply time (not a value passed in),
 * so it always matches the range's real content even if the document changed
 * since the preview was computed.
 */
export async function applyCompareDiff(referenceText: string): Promise<DiffResult> {
  return serializeTrackChanges(() =>
    runWord(async (context) => {
      const doc = context.document;
      doc.load("changeTrackingMode");
      const range = doc.body.getRange();
      // Read the live baseline after the sync, immediately before diffing, so a
      // late edit cannot smear the tracked change (same discipline as the
      // single-clause redline path).
      const priorMode = doc.changeTrackingMode;
      doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
      range.load("text");
      await context.sync();

      if (!range.text.trim()) {
        try {
          doc.changeTrackingMode = priorMode;
          await context.sync();
        } catch {
          // fall through to the throw
        }
        throw new OfficeError("The open document has no text to compare.");
      }

      try {
        return await applyWordDiff(context, range, range.text, referenceText, {
          enableTracking: true,
          logLevel: "error",
        });
      } finally {
        try {
          doc.changeTrackingMode = priorMode;
          await context.sync();
        } catch {
          // original error (if any) propagates
        }
      }
    }),
  );
}
