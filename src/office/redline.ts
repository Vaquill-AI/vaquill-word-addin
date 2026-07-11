import { applyWordDiff, type DiffResult } from "office-word-diff";
import { runWord, OfficeError } from "./run";
import { findRanges } from "./search";
import type { RedlineSuggestion } from "@/api/types";

/**
 * Applies grounded redlines into the open document as native Word tracked
 * changes. The word-level diff (so only changed words show as insert/delete,
 * not the whole clause) is delegated to office-word-diff (Apache-2.0). This
 * module owns the Vaquill-specific parts: grounded anchoring of the verbatim
 * clause, change-tracking mode save/restore, and gating on grounding.
 *
 * Attribution constraint: Office.js cannot set the author of a tracked change,
 * so in-pane edits are attributed to the signed-in Word user. For edits stamped
 * "Vaquill AI Contract Review" regardless of the user, use the server export
 * path (exportCorrectedDocx) instead.
 */

// Word's body.search query is capped at 255 characters.
const WORD_SEARCH_LIMIT = 255;

export class AnchorNotFoundError extends OfficeError {
  constructor(clauseName: string) {
    super(`Could not locate "${clauseName}" verbatim in the document.`, "anchor_not_found");
    this.name = "AnchorNotFoundError";
  }
}

/**
 * True when a redline can be applied directly in the pane: it is grounded
 * verified (backend confirmed the anchor is a literal substring), short enough
 * to search, and does not span paragraph marks. Word search cannot match across
 * a paragraph mark, so a multi-paragraph clause can never be located in-pane and
 * must route to the export/copy path. Everything else routes to the server
 * export path too.
 */
export function canApplyInPane(r: RedlineSuggestion): boolean {
  const q = r.currentLanguage.trim();
  if (/[\r\n]/.test(q)) return false;
  return r.grounding === "verified" && q.length > 0 && q.length <= WORD_SEARCH_LIMIT;
}

export interface ApplyResult {
  strategy: DiffResult["strategyUsed"];
  insertions: number;
  deletions: number;
}

/**
 * Apply one verified redline as tracked changes.
 * Loads the matched range's own text as the diff baseline so the diff always
 * matches exactly, even if the search normalized incidental characters.
 */
export async function applyVerifiedRedline(
  r: RedlineSuggestion,
  opts: { tracked?: boolean } = {},
): Promise<ApplyResult> {
  // `tracked` (default) applies the edit as a reviewable tracked change. Passing
  // tracked:false performs a "clean" apply: change tracking is forced off for the
  // edit so the replacement lands directly in the text (Word's Undo still
  // reverses it). Prior tracking mode is always restored.
  const tracked = opts.tracked ?? true;
  const query = r.currentLanguage.trim();
  if (!query || query.length > WORD_SEARCH_LIMIT) {
    throw new OfficeError("This redline is too long to apply in place. Use Accept via Vaquill AI instead.");
  }

  return runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    const items = await findRanges(context, query);

    // Backend grounding only guarantees the clause is a literal substring, not
    // that it is unique. If it appears zero or multiple times we cannot safely
    // choose the occurrence to redline, so refuse rather than silently editing
    // the first match. This guard runs before we touch changeTrackingMode, so
    // there is no mode to restore on this path.
    if (items.length === 0) throw new AnchorNotFoundError(r.clauseName);
    if (items.length > 1) {
      throw new OfficeError(
        "The clause text appears multiple times; apply this change manually to the correct spot.",
        "anchor_ambiguous",
      );
    }

    const range = items[0];
    range.load("text");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = tracked ? Word.ChangeTrackingMode.trackAll : Word.ChangeTrackingMode.off;
    await context.sync();

    try {
      const diff = await applyWordDiff(context, range, range.text, r.proposedLanguage, {
        enableTracking: tracked,
        logLevel: "error",
      });
      return {
        strategy: diff.strategyUsed,
        insertions: diff.insertions,
        deletions: diff.deletions,
      };
    } finally {
      doc.changeTrackingMode = priorMode;
      await context.sync();
    }
  });
}
