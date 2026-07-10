/**
 * Structured fields and clause locking via tagged Word content controls.
 *
 * Every control we create carries the same tag (VAQUILL_TAG) so we can find,
 * lock, and clean up only our own controls without touching content controls
 * the author or another add-in placed. Tagging key fields (dates, amounts,
 * defined terms) makes them navigable, and cannotEdit lets sign-off physically
 * lock the reviewed clauses.
 */
import { runWord } from "./run";
import { findRanges } from "./search";

export const VAQUILL_TAG = "vaquill";

export interface TagFieldsResult {
  dates: number;
  amounts: number;
  terms: number;
}

// Word's body.search query is capped at 255 characters, and unbounded tagging
// on a huge contract would be slow, so we bound both.
const WORD_SEARCH_LIMIT = 255;
const MAX_PER_TYPE = 50;
const SYNC_BATCH = 10;

const DATE_PATTERNS: readonly RegExp[] = [
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
];
const AMOUNT_PATTERNS: readonly RegExp[] = [/\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g];
const TERM_PATTERNS: readonly RegExp[] = [/“[^”]{1,40}”/g, /"[^"]{1,40}"/g];

/**
 * Collect distinct, search-safe match strings for one field type. Patterns are
 * cloned so the shared module-level regex lastIndex is never mutated.
 */
function collectMatches(text: string, patterns: readonly RegExp[]): string[] {
  const seen = new Set<string>();
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const match = m[0];
      if (match.length > 0 && match.length <= WORD_SEARCH_LIMIT) {
        seen.add(match);
        if (seen.size >= MAX_PER_TYPE) return Array.from(seen);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Wrap each match string in a tagged content control when it resolves to
 * exactly one range. Failures on a single match are swallowed so one bad wrap
 * never aborts the rest. Syncs in batches to bound round-trips.
 */
async function wrapMatches(
  context: Word.RequestContext,
  matches: string[],
  title: string,
): Promise<number> {
  let created = 0;
  let pending = 0;
  for (const match of matches) {
    try {
      const ranges = await findRanges(context, match);
      if (ranges.length !== 1) continue;
      const cc = ranges[0].insertContentControl();
      cc.tag = VAQUILL_TAG;
      cc.title = title;
      cc.appearance = Word.ContentControlAppearance.tags;
      created += 1;
      pending += 1;
      if (pending >= SYNC_BATCH) {
        await context.sync();
        pending = 0;
      }
    } catch {
      continue;
    }
  }
  if (pending > 0) await context.sync();
  return created;
}

/**
 * Scan the document for key fields (dates, amounts, defined terms) and wrap each
 * uniquely locatable match in a tagged content control.
 */
export async function tagKeyFields(): Promise<TagFieldsResult> {
  return runWord(async (context) => {
    const body = context.document.body;
    body.load("text");
    await context.sync();
    const text = body.text;

    const dates = await wrapMatches(context, collectMatches(text, DATE_PATTERNS), "Date");
    const amounts = await wrapMatches(context, collectMatches(text, AMOUNT_PATTERNS), "Amount");
    const terms = await wrapMatches(context, collectMatches(text, TERM_PATTERNS), "Defined term");

    return { dates, amounts, terms };
  });
}

/**
 * Lock (or unlock) every Vaquill-tagged content control. This is how sign-off
 * physically prevents further edits to the reviewed clauses. Returns the count.
 */
export async function lockVaquillControls(lock: boolean): Promise<number> {
  return runWord(async (context) => {
    const controls = context.document.contentControls;
    controls.load("tag");
    await context.sync();

    const ours = controls.items.filter((cc) => cc.tag === VAQUILL_TAG);
    for (const cc of ours) {
      cc.cannotEdit = lock;
    }
    await context.sync();
    return ours.length;
  });
}
