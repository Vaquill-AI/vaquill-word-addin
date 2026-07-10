import { applyWordDiff, type DiffResult } from "office-word-diff";
import { runWord, OfficeError } from "./run";
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
 * verified (backend confirmed the anchor is a literal substring) and short
 * enough to search. Everything else routes to the server export path.
 */
export function canApplyInPane(r: RedlineSuggestion): boolean {
  const q = r.currentLanguage.trim();
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
export async function applyVerifiedRedline(r: RedlineSuggestion): Promise<ApplyResult> {
  const query = r.currentLanguage.trim();
  if (!query || query.length > WORD_SEARCH_LIMIT) {
    throw new OfficeError("This redline is too long to apply in place. Use Accept via Vaquill instead.");
  }

  return runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    const results = doc.body.search(query, { matchCase: true, ignorePunct: false });
    results.load("items");
    await context.sync();

    // Backend grounding only guarantees the clause is a literal substring, not
    // that it is unique. If it appears zero or multiple times we cannot safely
    // choose the occurrence to redline, so refuse rather than silently editing
    // the first match. This guard runs before we touch changeTrackingMode, so
    // there is no mode to restore on this path.
    if (results.items.length === 0) throw new AnchorNotFoundError(r.clauseName);
    if (results.items.length > 1) {
      throw new OfficeError(
        "The clause text appears multiple times; apply this change manually to the correct spot.",
        "anchor_ambiguous",
      );
    }

    const range = results.items[0];
    range.load("text");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
    await context.sync();

    try {
      const diff = await applyWordDiff(context, range, range.text, r.proposedLanguage, {
        enableTracking: true,
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

/**
 * Insert a missing clause (grounding === "insertion") at the end of the
 * document as a tracked insertion. There is no anchor to replace.
 */
export async function insertMissingClause(r: RedlineSuggestion): Promise<void> {
  return runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    await context.sync();

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;

    // try/finally so a failed insert or sync always restores the prior mode.
    // Without this, a throw here would leave the document stuck in track-all.
    try {
      const heading = r.clauseName ? `${r.clauseName}\n` : "";
      doc.body.insertParagraph(`${heading}${r.proposedLanguage}`, Word.InsertLocation.end);
      await context.sync();
    } finally {
      doc.changeTrackingMode = priorMode;
      await context.sync();
    }
  });
}
