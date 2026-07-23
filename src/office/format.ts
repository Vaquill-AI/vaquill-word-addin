import { runWord, serializeTrackChanges } from "./run";

/**
 * Proper Format: make ordinary body prose internally consistent without touching
 * anything that carries meaning. The tool unifies the base font family, size, and
 * paragraph spacing of PLAIN body paragraphs toward the document's own dominant
 * value. It deliberately does NOT change indentation, alignment, emphasis, case,
 * numbering, tables, or fields, because in a negotiated contract those encode
 * clause hierarchy and cross-references. Do-no-harm is the whole design.
 *
 * Protected zones (never formatted):
 *  - paragraphs inside a table (`parentTableOrNullObject`)
 *  - paragraphs inside a content control (clause anchors)
 *  - native Word list items (`isListItem`)
 *  - heading / title / TOC styles
 *  - centered or right-aligned paragraphs (titles, dates, signature layout)
 *  - non-Latin script paragraphs (a font swap would produce missing glyphs)
 *  - everything from the first Exhibit/Schedule marker or signature block onward
 * Headers, footers, footnotes, endnotes, and text boxes are separate stories and
 * are already excluded because `body.paragraphs` is the main story only.
 *
 * If the document has tracked changes, the scan is BLOCKED: reflowing formatting
 * over a live redline can corrupt revision marks, so the user must accept or
 * reject first. All APIs used are WordApi 1.6 or below (our floor).
 */

export type FormatScope = "document" | "selection";
export type FixKey = "font" | "size" | "spacing";

export interface FormatSkips {
  tables: number;
  lists: number;
  headings: number;
  aligned: number;
  controls: number;
  nonLatin: number;
  protectedZone: number;
}

export interface FormatReport {
  scope: FormatScope;
  /** Non-empty body paragraphs considered. */
  bodyParagraphs: number;
  /** Plain body paragraphs eligible for formatting. */
  eligible: number;
  targetFont: string | null;
  targetSize: number | null;
  fontsFound: number;
  sizesFound: number;
  /** Eligible paragraphs that differ from the target, per fix. */
  counts: Record<FixKey, number>;
  skips: FormatSkips;
  blocked: null | "tracked-changes" | "empty";
}

// A paragraph is a heading (leave its font alone) when it carries one of these
// built-in styles. Values are the enum's string form ("Heading1".."Heading9").
const HEADING_STYLE = /^(Heading[1-9]|Title|Subtitle|Toc\d?)$/;
// Cyrillic, Hebrew, Arabic, CJK, Hangul: swapping the font could drop glyphs.
const NON_LATIN = /[Ѐ-ۿ֐-׿　-鿿가-힯]/;
// Attachment markers: everything from here on is its own mini-document.
const EXHIBIT_MARKER = /^\s*(exhibit|schedule|annex|appendix)\s+[A-Za-z0-9]/i;
const WITNESS_MARKER = /^\s*in witness whereof/i;
// Signature-block lines: "By:", "Name:", underscored fill-in lines.
const SIGNATURE_LINE = /^\s*(by|name|title|its|date|witness|attest|signature|signed)\s*:?\s*_*\s*$/i;
const UNDERSCORE_RUN = /_{3,}/;

// Value tolerance (points) so float noise is not read as an inconsistency.
const TOLERANCE = 0.6;
const CHUNK = 200;

interface ParaRec {
  p: Word.Paragraph;
  eligible: boolean;
  font?: string;
  size?: number;
  lineSpacing?: number;
  spaceBefore?: number;
  spaceAfter?: number;
}

interface Analysis {
  records: ParaRec[];
  report: FormatReport;
  targetLine: number | null;
  targetBefore: number | null;
  targetAfter: number | null;
}

function round1(n: number): number {
  return Math.round(n * 2) / 2;
}

function numOrU(v: number | null | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function bump<K>(tally: Map<K, number>, key: K): void {
  tally.set(key, (tally.get(key) ?? 0) + 1);
}

/** The most common key in a tally, or null when empty. Ties favor the first seen. */
function modeKey<K>(tally: Map<K, number>): K | null {
  let best: K | null = null;
  let bestCount = 0;
  for (const [k, count] of tally) {
    if (count > bestCount) {
      best = k;
      bestCount = count;
    }
  }
  return best;
}

function isLeftish(alignment: string | null | undefined): boolean {
  // Unreadable alignment (null) is treated as NOT leftish, so the paragraph is
  // protected rather than risking a change we cannot classify.
  if (!alignment) return false;
  return alignment === "Left" || alignment.startsWith("Justif");
}

function near(a: number | undefined, b: number): boolean {
  return a != null && Math.abs(a - b) <= TOLERANCE;
}

/**
 * Read every paragraph in `source`, classify each as eligible or protected, and
 * compute the document's dominant font / size / spacing. Runs one sync. The live
 * paragraph proxies are returned so `applyProperFormat` can mutate the eligible
 * ones in the same Word.run.
 */
async function analyze(
  context: Word.RequestContext,
  source: Word.Body | Word.Range,
  scope: FormatScope,
): Promise<Analysis> {
  const paras = source.paragraphs;
  paras.load(
    "text,styleBuiltIn,alignment,isListItem,lineSpacing,spaceBefore,spaceAfter," +
      "font/name,font/size," +
      "parentTableOrNullObject/isNullObject,parentContentControlOrNullObject/isNullObject",
  );
  await context.sync();

  // Tracked-change detection runs in its OWN guarded sync, separate from the
  // paragraph load above. getTrackedChanges() is host/version fragile -- on some
  // Word builds it throws an internal null dereference ("reading 'Ocd'") from
  // inside office.js, which previously sank the entire scan when it shared the
  // paragraph sync. A failure here must not crash Rescan: the apply step
  // re-checks change tracking independently before it writes anything, so at
  // worst we skip the "resolve your redline first" banner instead of failing.
  let hasTrackedChanges = false;
  try {
    const tracked = source.getTrackedChanges();
    tracked.load("items");
    await context.sync();
    hasTrackedChanges = tracked.items.length > 0;
  } catch {
    // Degrade gracefully: treat as "cannot confirm tracked changes here".
    hasTrackedChanges = false;
  }

  const items = paras.items;
  const isSelection = scope === "selection";

  // Cut point: the first Exhibit/Schedule marker or "IN WITNESS WHEREOF". A
  // user-chosen selection is trusted, so only apply the cut for whole-document.
  let cut = Number.POSITIVE_INFINITY;
  if (!isSelection) {
    for (let i = 0; i < items.length; i++) {
      const t = (items[i].text ?? "").trim();
      if (EXHIBIT_MARKER.test(t) || WITNESS_MARKER.test(t)) {
        cut = i;
        break;
      }
    }
  }

  const skips: FormatSkips = {
    tables: 0,
    lists: 0,
    headings: 0,
    aligned: 0,
    controls: 0,
    nonLatin: 0,
    protectedZone: 0,
  };
  const records: ParaRec[] = [];
  const fontTally = new Map<string, number>();
  const sizeTally = new Map<number, number>();
  const lineTally = new Map<number, number>();
  const beforeTally = new Map<number, number>();
  const afterTally = new Map<number, number>();
  let bodyParagraphs = 0;

  items.forEach((p, i) => {
    const text = (p.text ?? "").trim();
    if (!text) {
      records.push({ p, eligible: false });
      return;
    }
    bodyParagraphs++;

    const reason = skipReason(p, text, i, cut);
    if (reason) {
      skips[reason]++;
      records.push({ p, eligible: false });
      return;
    }

    const font = p.font.name || undefined;
    const rec: ParaRec = {
      p,
      eligible: true,
      font,
      size: numOrU(p.font.size),
      lineSpacing: numOrU(p.lineSpacing),
      spaceBefore: numOrU(p.spaceBefore),
      spaceAfter: numOrU(p.spaceAfter),
    };
    records.push(rec);
    if (font) bump(fontTally, font);
    if (rec.size != null) bump(sizeTally, round1(rec.size));
    if (rec.lineSpacing != null) bump(lineTally, round1(rec.lineSpacing));
    if (rec.spaceBefore != null) bump(beforeTally, round1(rec.spaceBefore));
    if (rec.spaceAfter != null) bump(afterTally, round1(rec.spaceAfter));
  });

  const targetFont = modeKey(fontTally);
  const targetSize = modeKey(sizeTally);
  const targetLine = modeKey(lineTally);
  const targetBefore = modeKey(beforeTally);
  const targetAfter = modeKey(afterTally);

  const counts = countOffenders(records, {
    font: targetFont,
    size: targetSize,
    line: targetLine,
    before: targetBefore,
    after: targetAfter,
  });

  const blocked: FormatReport["blocked"] =
    hasTrackedChanges ? "tracked-changes" : bodyParagraphs === 0 ? "empty" : null;

  const eligible = records.reduce((n, r) => n + (r.eligible ? 1 : 0), 0);
  const report: FormatReport = {
    scope,
    bodyParagraphs,
    eligible,
    targetFont: targetFont ?? null,
    targetSize: targetSize ?? null,
    fontsFound: fontTally.size,
    sizesFound: sizeTally.size,
    counts,
    skips,
    blocked,
  };

  return {
    records,
    report,
    targetLine: targetLine ?? null,
    targetBefore: targetBefore ?? null,
    targetAfter: targetAfter ?? null,
  };
}

/** Which protected zone a paragraph belongs to, or null when it is plain prose. */
function skipReason(
  p: Word.Paragraph,
  text: string,
  index: number,
  cut: number,
): keyof FormatSkips | null {
  if (!p.parentTableOrNullObject.isNullObject) return "tables";
  if (!p.parentContentControlOrNullObject.isNullObject) return "controls";
  if (p.isListItem) return "lists";
  if (HEADING_STYLE.test((p.styleBuiltIn as unknown as string) ?? "")) return "headings";
  if (!isLeftish(p.alignment as unknown as string)) return "aligned";
  if (NON_LATIN.test(text)) return "nonLatin";
  if (index >= cut || SIGNATURE_LINE.test(text) || UNDERSCORE_RUN.test(text)) return "protectedZone";
  return null;
}

interface Targets {
  font: string | null;
  size: number | null;
  line: number | null;
  before: number | null;
  after: number | null;
}

/** Count eligible paragraphs that differ from the target, per fix. */
function countOffenders(records: ParaRec[], t: Targets): Record<FixKey, number> {
  let font = 0;
  let size = 0;
  let spacing = 0;
  for (const r of records) {
    if (!r.eligible) continue;
    if (t.font && r.font && r.font !== t.font) font++;
    if (t.size != null && r.size != null && round1(r.size) !== t.size) size++;
    const lineOff = t.line != null && !near(r.lineSpacing, t.line);
    const beforeOff = t.before != null && !near(r.spaceBefore, t.before);
    const afterOff = t.after != null && !near(r.spaceAfter, t.after);
    if (lineOff || beforeOff || afterOff) spacing++;
  }
  return { font, size, spacing };
}

function sourceFor(context: Word.RequestContext, scope: FormatScope): Word.Body | Word.Range {
  return scope === "selection" ? context.document.getSelection() : context.document.body;
}

/** Analyze the document (or selection) and return the consistency report. */
export async function scanFormatting(scope: FormatScope): Promise<FormatReport> {
  return runWord(async (context) => {
    const { report } = await analyze(context, sourceFor(context, scope), scope);
    return report;
  });
}

/**
 * Apply the selected fixes to eligible paragraphs, normalizing toward the
 * document's dominant value. Change tracking is toggled off around the pass and
 * restored, so the result never depends on undocumented formatting-revision
 * behavior and never clutters a redline. Batched so the UI thread is never
 * blocked for long. Returns the number of paragraphs changed.
 */
export async function applyProperFormat(
  fixes: ReadonlySet<FixKey>,
  scope: FormatScope,
  onProgress?: (done: number, total: number) => void,
): Promise<{ changed: number }> {
  return serializeTrackChanges(() =>
    runWord(async (context) => {
      const doc = context.document;
      doc.load("changeTrackingMode");
      const { records, report, targetLine, targetBefore, targetAfter } = await analyze(
        context,
        sourceFor(context, scope),
        scope,
      );
      if (report.blocked) return { changed: 0 };

      const eligible = records.filter((r) => r.eligible);
      const total = eligible.length;

      // Commit the tracking-off flip on its own sync BEFORE editing, so the
      // formatting pass is never recorded as revisions (mirrors the redline path).
      const priorMode = doc.changeTrackingMode;
      doc.changeTrackingMode = Word.ChangeTrackingMode.off;
      await context.sync();

      let changed = 0;
      try {
        for (let i = 0; i < eligible.length; i += CHUNK) {
          const slice = eligible.slice(i, i + CHUNK);
          for (const r of slice) {
            if (applyToParagraph(r, fixes, report, targetLine, targetBefore, targetAfter)) {
              changed++;
            }
          }
          await context.sync();
          onProgress?.(Math.min(i + CHUNK, total), total);
        }
      } finally {
        doc.changeTrackingMode = priorMode;
        await context.sync();
      }
      return { changed };
    }),
  );
}

/** Set the requested properties on one paragraph. Returns true if it changed. */
function applyToParagraph(
  r: ParaRec,
  fixes: ReadonlySet<FixKey>,
  report: FormatReport,
  targetLine: number | null,
  targetBefore: number | null,
  targetAfter: number | null,
): boolean {
  let touched = false;
  if (fixes.has("font") && report.targetFont && r.font !== report.targetFont) {
    r.p.font.name = report.targetFont;
    touched = true;
  }
  if (fixes.has("size") && report.targetSize != null && !near(r.size, report.targetSize)) {
    r.p.font.size = report.targetSize;
    touched = true;
  }
  if (fixes.has("spacing")) {
    if (targetLine != null && !near(r.lineSpacing, targetLine)) {
      r.p.lineSpacing = targetLine;
      touched = true;
    }
    if (targetBefore != null && !near(r.spaceBefore, targetBefore)) {
      r.p.spaceBefore = targetBefore;
      touched = true;
    }
    if (targetAfter != null && !near(r.spaceAfter, targetAfter)) {
      r.p.spaceAfter = targetAfter;
      touched = true;
    }
  }
  return touched;
}
