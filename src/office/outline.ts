import { runWord } from "./run";

/**
 * Build a lightweight document outline for pane navigation. Word has no native
 * "structure" object usable from the add-in, so we derive one from the paragraph
 * collection: a paragraph is treated as an outline node when it carries a
 * built-in heading style, or when its text reads like a legal clause start
 * ("Article", "Section", or a numbered "1.", "1.2", "3.1.4)" prefix).
 */

export interface OutlineItem {
  index: number;
  text: string;
  level: number;
}

// Cap so a very long document does not build an unusable, thousand-item pane.
const MAX_ITEMS = 300;
const TEXT_MAX = 80;

// "Article ..." / "Section ..." clause starts.
const ARTICLE_SECTION = /^(article|section)\b/i;
// Numbered clause starts: "1 ", "1. ", "1.2 ", "3.1.4) " with trailing content.
const NUMBERED = /^\d+(\.\d+){0,3}[.)]?\s+\S/;

/**
 * Return the heading level 1-9 when styleBuiltIn is Heading1..Heading9, else 0.
 * The built-in style enum values are the strings "Heading1".."Heading9".
 */
function headingLevel(styleBuiltIn: string): number {
  const match = /^Heading([1-9])$/.exec(styleBuiltIn);
  return match ? Number(match[1]) : 0;
}

/** True when a paragraph should appear as an outline node. */
function isOutlineNode(text: string, level: number): boolean {
  return level > 0 || ARTICLE_SECTION.test(text) || NUMBERED.test(text);
}

/**
 * Read the document body into a flat outline. Blank paragraphs are skipped and
 * the result is capped at MAX_ITEMS.
 */
export async function readOutline(): Promise<OutlineItem[]> {
  return runWord(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("text, styleBuiltIn");
    await context.sync();

    const items: OutlineItem[] = [];
    paragraphs.items.forEach((p, index) => {
      if (items.length >= MAX_ITEMS) return;
      const text = (p.text ?? "").trim();
      if (!text) return;
      const level = headingLevel(p.styleBuiltIn as unknown as string);
      if (!isOutlineNode(text, level)) return;
      items.push({
        index,
        text: text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text,
        level: level > 0 ? level : 1,
      });
    });
    return items;
  });
}

/**
 * Scroll to and select the paragraph at the given collection index. Out-of-range
 * indices are ignored so a stale outline click cannot throw.
 */
export async function goToOutlineItem(index: number): Promise<void> {
  return runWord(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("text");
    await context.sync();
    const target = paragraphs.items[index];
    if (!target) return;
    target.getRange().select();
    await context.sync();
  });
}
