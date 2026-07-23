import { applyWordDiff, type DiffResult } from "office-word-diff";
import { runWord, OfficeError, serializeTrackChanges } from "./run";
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

// Word's body.search query is capped at 255 characters and cannot match across a
// paragraph mark. Short single-line clauses are located with one search; longer
// or multi-paragraph clauses are anchored by their head + tail windows (each a
// searchable <=255 single-line slice) and the span between them.
const WORD_SEARCH_LIMIT = 255;

export class AnchorNotFoundError extends OfficeError {
  constructor(clauseName: string) {
    super(
      `Could not locate "${clauseName}" verbatim in the document. If this clause is inside a text box or shape, it cannot be located automatically; apply it manually.`,
      "anchor_not_found",
    );
    this.name = "AnchorNotFoundError";
  }
}

/**
 * True when we should OFFER to apply a redline in the pane: it quotes original
 * text to anchor on. Nothing else is disqualifying:
 *  - length / paragraph breaks: {@link applyVerifiedRedline} anchors long and
 *    multi-paragraph clauses by their head + tail windows, not one 255-char search;
 *  - a backend "unverified" grounding: the backend's exact-match check is stricter
 *    than the client's tolerant search (which reconciles smart quotes, dashes, and
 *    spacing), so gating on it produced false "can't apply" on clauses the client
 *    can actually locate.
 * The apply path RE-VERIFIES the located span before replacing, so a clause that
 * genuinely is not in the document (or lives in a text box / shape) fails
 * gracefully with the copy/manual fallback one click away -- anti-hallucination is
 * preserved, just enforced at apply time by the more capable check.
 */
export function canApplyInPane(r: RedlineSuggestion): boolean {
  return r.currentLanguage.trim().length > 0;
}

export interface ApplyResult {
  strategy: DiffResult["strategyUsed"];
  insertions: number;
  deletions: number;
}

/** True when the clause is short enough and free of paragraph marks to locate
 *  with a single search. Otherwise we anchor by head + tail windows. */
function isSimpleAnchor(q: string): boolean {
  return q.length <= WORD_SEARCH_LIMIT && !/[\r\n]/.test(q);
}

/** First searchable slice: a <=255 char, word-boundary-trimmed prefix. */
function headWindow(s: string): string {
  const t = s.trim();
  if (t.length <= WORD_SEARCH_LIMIT) return t;
  const slice = t.slice(0, WORD_SEARCH_LIMIT);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
}

/** Last searchable slice: a <=255 char, word-boundary-trimmed suffix. */
function tailWindow(s: string): string {
  const t = s.trim();
  if (t.length <= WORD_SEARCH_LIMIT) return t;
  const slice = t.slice(t.length - WORD_SEARCH_LIMIT);
  const firstSpace = slice.indexOf(" ");
  return firstSpace >= 0 && firstSpace < slice.length - 40 ? slice.slice(firstSpace + 1) : slice;
}

/** Compare two spans ignoring incidental punctuation / whitespace / case, so a
 *  span assembled from head + tail anchors is confirmed to BE the clause before
 *  it is replaced (search variants can differ from the model's text by quotes,
 *  dashes, or spacing). */
function anchorMatches(found: string, expected: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return norm(found) === norm(expected);
}

const AMBIGUOUS = new OfficeError(
  "The clause text appears multiple times; apply this change manually to the correct spot.",
  "anchor_ambiguous",
);

/** Throw the right "not found" error. A clause carrying unaccepted tracked
 *  changes won't match its own clean anchor (search sees the marked-up text), so
 *  detect that common case and tell the user the one-click fix. */
async function throwAnchorNotFound(
  context: Word.RequestContext,
  doc: Word.Document,
  clauseName: string,
): Promise<never> {
  const pending = doc.body.getTrackedChanges();
  pending.load("items/type");
  await context.sync();
  if (pending.items.length > 0) {
    throw new OfficeError(
      `Could not locate "${clauseName}" to redline. The document still has unaccepted tracked changes, and a clause cannot be matched while its edits are pending. Accept or reject them (Word: Review > Accept), then run this again.`,
      "anchor_not_found_tracked",
    );
  }
  throw new AnchorNotFoundError(clauseName);
}

/**
 * Resolve the single Word range covering the whole clause.
 *
 * Backend grounding guarantees the clause is a literal substring, not that it is
 * unique, so a zero/multiple match refuses rather than editing the wrong spot.
 * Short single-line clauses use one search. Longer or multi-paragraph clauses
 * search their head and tail windows (each searchable) and take the span between
 * them; the caller re-verifies that span before replacing anything.
 */
async function locateClauseRange(
  context: Word.RequestContext,
  doc: Word.Document,
  query: string,
  clauseName: string,
): Promise<Word.Range> {
  if (isSimpleAnchor(query)) {
    const items = await findRanges(context, query);
    if (items.length === 0) await throwAnchorNotFound(context, doc, clauseName);
    if (items.length > 1) throw AMBIGUOUS;
    return items[0]!;
  }

  const lines = query.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  const head = headWindow(lines[0] ?? query);
  const tail = tailWindow(lines[lines.length - 1] ?? query);

  const heads = await findRanges(context, head);
  if (heads.length === 0) await throwAnchorNotFound(context, doc, clauseName);
  if (heads.length > 1) throw AMBIGUOUS;
  const tails = await findRanges(context, tail);
  if (tails.length === 0) throw new AnchorNotFoundError(clauseName);
  if (tails.length > 1) throw AMBIGUOUS;

  // expandTo returns the smallest range covering both anchors, i.e. head.start
  // through tail.end -- the whole clause.
  return heads[0]!.expandTo(tails[0]!);
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
  if (!query) throw new OfficeError("This redline has no anchor text to locate.");

  return serializeTrackChanges(() => runWord(async (context) => {
    const doc = context.document;
    doc.load("changeTrackingMode");
    const range = await locateClauseRange(context, doc, query, r.clauseName);

    const priorMode = doc.changeTrackingMode;
    doc.changeTrackingMode = tracked ? Word.ChangeTrackingMode.trackAll : Word.ChangeTrackingMode.off;
    // Load the diff baseline AFTER the mode flip and immediately before diffing.
    // Reading it earlier and diffing after two more syncs would let a co-author
    // edit inside the range in between, so applyWordDiff would diff against stale
    // text and smear the insert/delete ops into a garbled tracked change.
    range.load("text");
    await context.sync();

    // Confirm the located span really is the clause before replacing it. This is
    // the safety net for the head + tail path: if the two anchors bracketed the
    // wrong region (e.g. a non-unique tail), the assembled text will not match
    // and we abort cleanly instead of mangling an unrelated span.
    if (!anchorMatches(range.text, query)) {
      try {
        doc.changeTrackingMode = priorMode;
        await context.sync();
      } catch {
        // fall through to the throw below
      }
      throw new AnchorNotFoundError(r.clauseName);
    }

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
