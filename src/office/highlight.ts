import { runWord } from "./run";
import { findRanges } from "./search";

/**
 * Highlight review issues in the document so a reviewer can see, at a glance,
 * which clauses the playbook flagged. Deal-breakers get a warmer red tint, other
 * issues a softer amber. A clause is only highlighted when it resolves to a
 * single unambiguous range: zero matches means we could not find it, and
 * multiple matches means we cannot tell which occurrence was flagged, so both
 * are skipped rather than risk painting the wrong text.
 */

// Warm highlight colors. Deal-breakers use a red tint, everything else amber.
const DEAL_BREAKER_COLOR = "#F6C5C0";
const ISSUE_COLOR = "#FFF2CC";

/**
 * Highlight each issue's current language. Returns the count actually painted.
 * A single context.sync() at the end flushes every queued color assignment.
 */
export async function highlightIssues(
  items: { currentLanguage: string; isDealBreaker: boolean }[],
): Promise<number> {
  return runWord(async (context) => {
    let highlighted = 0;
    for (const item of items) {
      const query = item.currentLanguage.trim();
      if (!query) continue;
      const ranges = await findRanges(context, query);
      // Only paint when exactly one range matches; zero or multiple are ambiguous.
      if (ranges.length !== 1) continue;
      ranges[0].font.highlightColor = item.isDealBreaker ? DEAL_BREAKER_COLOR : ISSUE_COLOR;
      highlighted += 1;
    }
    await context.sync();
    return highlighted;
  });
}

/**
 * Clear the highlight from each issue's current language. Each range is guarded
 * individually so a single lookup or sync failure does not abort clearing the
 * rest of the batch.
 */
export async function clearIssueHighlights(
  items: { currentLanguage: string }[],
): Promise<void> {
  return runWord(async (context) => {
    for (const item of items) {
      try {
        const query = item.currentLanguage.trim();
        if (!query) continue;
        const ranges = await findRanges(context, query);
        if (ranges.length !== 1) continue;
        // Clearing a highlight uses null per the Office API. Setting "#FFFFFF"
        // would apply a white highlight rather than remove it, so we assign null
        // (typed as string in the Office typings) to reset to no highlight.
        ranges[0].font.highlightColor = null as unknown as string;
        await context.sync();
      } catch {
        // One clause failing to clear must not stop the rest.
        continue;
      }
    }
  });
}
