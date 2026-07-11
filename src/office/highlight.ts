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

// Calm, neutral wash for coverage. A soft blue that reads clearly apart from the
// warm red/amber issue tints, so a reviewer can see at a glance which clauses the
// review actually touched without confusing coverage for severity.
const COVERAGE_COLOR = "#D6EAF8";

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

/**
 * Highlight every reviewed clause in one calm, neutral color so a reviewer can
 * see at a glance which clauses the review actually covered. This is a coverage
 * cue, not a severity cue: it deliberately ignores deal-breaker status and paints
 * all anchorable clauses the same soft blue, distinct from the warm issue tints.
 *
 * Word exposes a single highlightColor per range, so coverage and issue
 * highlights cannot layer on the same text: whichever is applied last wins. The
 * paired clear toggles let the reviewer reset either wash independently.
 *
 * Uses the same "exactly one match" guard as highlightIssues: zero matches means
 * we could not find the clause and multiple matches are ambiguous, so both are
 * skipped rather than risk painting the wrong text. Returns the count painted.
 */
export async function highlightCoverage(
  items: { currentLanguage: string }[],
): Promise<number> {
  return runWord(async (context) => {
    let highlighted = 0;
    for (const item of items) {
      const query = item.currentLanguage.trim();
      if (!query) continue;
      const ranges = await findRanges(context, query);
      // Only paint when exactly one range matches; zero or multiple are ambiguous.
      if (ranges.length !== 1) continue;
      ranges[0].font.highlightColor = COVERAGE_COLOR;
      highlighted += 1;
    }
    await context.sync();
    return highlighted;
  });
}

/**
 * Clear the coverage highlight from each reviewed clause. Each range is guarded
 * individually so a single lookup or sync failure does not abort clearing the
 * rest of the batch.
 */
export async function clearCoverageHighlights(
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
