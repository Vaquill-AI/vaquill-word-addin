import { runWord } from "./run";
import { findBestRange, findExactOccurrences, findRanges } from "./search";

/**
 * Scroll the document to a clause and select it. This is the bidirectional link
 * that makes the pane feel native: click an issue in the pane, Word jumps to and
 * highlights the exact text. Returns false when the clause cannot be located
 * (e.g. whitespace-normalized differently), so the UI can degrade gracefully.
 *
 * Use this when the caller then ACTS on the selection (e.g. attach a comment to
 * it). For a pure "show me where this is" jump, prefer `locateInDocument`, which
 * flashes a temporary highlight without leaving the text selected.
 */
export async function selectClauseInDocument(text: string): Promise<boolean> {
  const q = text.trim();
  if (!q) return false;

  return runWord(async (context) => {
    // Pass the full clause: findBestRange windows the search internally and uses
    // the full text to land on the right occurrence of duplicated boilerplate.
    const range = await findBestRange(context, q);
    if (!range) return false;

    // Selecting a range scrolls it into view and highlights it in Word.
    range.select(Word.SelectionMode.select);
    await context.sync();
    return true;
  });
}

// range.highlight()/unhighlight() are WordApi 1.8; our floor is 1.6, so gate.
let highlightSupported: boolean | null = null;
function canHighlight(): boolean {
  if (highlightSupported === null) {
    try {
      highlightSupported = Office.context.requirements.isSetSupported("WordApi", "1.8");
    } catch {
      highlightSupported = false;
    }
  }
  return highlightSupported;
}

// A range's highlight persists until unhighlight(), so we track the one live
// highlight and clear it before painting the next (never let them accumulate).
let activeHighlight: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

interface Highlightable {
  highlight(): void;
  unhighlight(): void;
}

async function clearActiveHighlight(): Promise<void> {
  const text = activeHighlight;
  activeHighlight = null;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = undefined;
  }
  if (!text) return;
  await runWord(async (context) => {
    // Unhighlight EVERY match of the tracked text, not just findBestRange's one.
    // Occurrence-cycling can highlight a non-"best" match, so clearing all of
    // them guarantees the live highlight is gone before the next is painted.
    const ranges = await findRanges(context, text);
    for (const range of ranges) (range as unknown as Highlightable).unhighlight();
    if (ranges.length > 0) await context.sync();
  }).catch(() => {
    // Best-effort: a lingering highlight is cosmetic and the next locate clears it.
  });
}

/**
 * Locate text and flash a TEMPORARY highlight on it, scrolling it into view
 * WITHOUT leaving it selected (the cursor lands at its start, so the user can't
 * accidentally overtype the located clause and does not lose their own
 * selection). The highlight auto-clears after `holdMs`. Falls back to a plain
 * select on hosts below WordApi 1.8. Returns false when the text is not found.
 */
export async function locateInDocument(text: string, holdMs = 2600): Promise<boolean> {
  const q = text.trim();
  if (!q) return false;
  if (!canHighlight()) return selectClauseInDocument(text);

  await clearActiveHighlight();

  const found = await runWord(async (context) => {
    const range = await findBestRange(context, q);
    if (!range) return false;
    (range as unknown as Highlightable).highlight();
    // Collapse the selection to the start: scrolls the range into view but leaves
    // nothing selected (the highlight is the visual cue).
    range.select(Word.SelectionMode.start);
    await context.sync();
    return true;
  }).catch(() => false);

  // findBestRange can miss cross-region / normalized text; fall back to select.
  if (!found) return selectClauseInDocument(text);

  activeHighlight = q;
  clearTimer = setTimeout(() => {
    void clearActiveHighlight();
  }, holdMs);
  return true;
}

/**
 * Locate the Nth occurrence of `text` (0-based; wraps), flashing a temporary
 * highlight and scrolling it into view without leaving it selected. Unlike
 * `locateInDocument` (which always lands on the single BEST match), this walks
 * EVERY occurrence in document order, so a caller can advance the index on each
 * click to step through all of them. Returns the total occurrence count and the
 * wrapped index actually selected (`count` 0 = not found).
 */
export async function locateOccurrence(
  text: string,
  index: number,
  opts: { variants?: readonly string[]; holdMs?: number } = {},
): Promise<{ count: number; index: number }> {
  const { variants = [], holdMs = 2600 } = opts;
  const q = text.trim();
  if (!q) return { count: 0, index: -1 };

  await clearActiveHighlight();

  const result = await runWord(async (context) => {
    // Exact whole-word, case-sensitive matches so the count agrees with the
    // "N uses" / "N times" badge (findRanges would over-count via fuzzy fallback).
    const ranges = await findExactOccurrences(context, q, variants);
    if (ranges.length === 0) return { count: 0, index: -1 };
    const i = ((index % ranges.length) + ranges.length) % ranges.length;
    const target = ranges[i];
    if (canHighlight()) {
      (target as unknown as Highlightable).highlight();
      // Collapse to the start so the highlight is the cue and nothing is left
      // selected (consistent with locateInDocument).
      target.select(Word.SelectionMode.start);
    } else {
      target.select(Word.SelectionMode.select);
    }
    await context.sync();
    return { count: ranges.length, index: i };
  }).catch(() => ({ count: 0, index: -1 }));

  if (result.count > 0 && canHighlight()) {
    activeHighlight = q;
    clearTimer = setTimeout(() => {
      void clearActiveHighlight();
    }, holdMs);
  }
  return result;
}
