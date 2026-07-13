import { runWord } from "./run";
import { findRanges } from "./search";

/**
 * Highlight review issues / coverage in the document so a reviewer can see, at a
 * glance, which clauses the playbook flagged or the review touched. Deal-breakers
 * get a warmer red tint, other issues a softer amber, coverage a calm blue.
 *
 * A clause is only highlighted when it resolves to a single unambiguous range:
 * zero matches means we could not find it, and multiple matches means we cannot
 * tell which occurrence was flagged, so both are skipped rather than risk
 * painting the wrong text.
 *
 * These are PERSISTED highlights (`font.highlightColor` saves into the .docx), so
 * clearing must be bulletproof or our marks would ship inside the client's
 * contract. We therefore TRACK the exact ranges we paint and clear those same
 * range objects (which follow the user's edits) rather than re-searching the
 * original text. The old re-search clear silently failed the moment a reviewer
 * edited a flagged clause and left the highlight baked into the saved file.
 */

// Warm highlight colors. Deal-breakers use a red tint, everything else amber.
const DEAL_BREAKER_COLOR = "#F6C5C0";
const ISSUE_COLOR = "#FFF2CC";

// Calm, neutral wash for coverage. A soft blue that reads clearly apart from the
// warm red/amber issue tints.
const COVERAGE_COLOR = "#D6EAF8";

// The tracked ranges we painted, per wash, so the paired clear removes exactly
// what we applied even after edits. Tracked proxies stay valid across the later
// clear's Word.run (see clearTracked), which is why re-search is not needed.
let issueRanges: Word.Range[] = [];
let coverageRanges: Word.Range[] = [];

interface HighlightItem {
  currentLanguage: string;
  isDealBreaker?: boolean;
}

async function paint(
  items: HighlightItem[],
  colorOf: (item: HighlightItem) => string,
): Promise<Word.Range[]> {
  return runWord(async (context) => {
    const painted: Word.Range[] = [];
    for (const item of items) {
      const query = item.currentLanguage.trim();
      if (!query) continue;
      const ranges = await findRanges(context, query);
      // Only paint when exactly one range matches; zero or multiple are ambiguous.
      if (ranges.length !== 1) continue;
      const range = ranges[0];
      range.font.highlightColor = colorOf(item);
      // Keep the proxy valid for the later clear, and let it follow edits.
      range.track();
      painted.push(range);
    }
    await context.sync();
    return painted;
  });
}

async function clearTracked(ranges: Word.Range[]): Promise<void> {
  if (ranges.length === 0) return;
  // Re-enter with the tracked ranges so their proxies are valid in this batch.
  await Word.run(ranges, async (context) => {
    for (const range of ranges) {
      try {
        // Assign null to remove the highlight; "#FFFFFF" would paint white.
        range.font.highlightColor = null as unknown as string;
      } catch {
        // The highlighted text was deleted with the highlight; nothing to clear.
      }
    }
    await context.sync();
    for (const range of ranges) {
      try {
        range.untrack();
      } catch {
        // Already released.
      }
    }
    await context.sync();
  }).catch(() => {
    // A clear must never throw; a stray highlight is recoverable, a crash is not.
  });
}

/** Highlight each issue's current language. Returns the count actually painted. */
export async function highlightIssues(
  items: { currentLanguage: string; isDealBreaker: boolean }[],
): Promise<number> {
  await clearTracked(issueRanges);
  issueRanges = [];
  issueRanges = await paint(items, (i) => (i.isDealBreaker ? DEAL_BREAKER_COLOR : ISSUE_COLOR));
  return issueRanges.length;
}

/** Remove the issue highlights we painted (by tracked reference, edit-proof). */
export async function clearIssueHighlights(): Promise<void> {
  const ranges = issueRanges;
  issueRanges = [];
  await clearTracked(ranges);
}

/** Highlight every reviewed clause in one calm color as a coverage cue. */
export async function highlightCoverage(
  items: { currentLanguage: string }[],
): Promise<number> {
  await clearTracked(coverageRanges);
  coverageRanges = [];
  coverageRanges = await paint(items, () => COVERAGE_COLOR);
  return coverageRanges.length;
}

/** Remove the coverage highlights we painted (by tracked reference). */
export async function clearCoverageHighlights(): Promise<void> {
  const ranges = coverageRanges;
  coverageRanges = [];
  await clearTracked(ranges);
}
