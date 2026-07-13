/**
 * Font matching for inserted content.
 *
 * Word inherits the surrounding font for `insertText` / `insertParagraph`, but
 * `insertHtml` brings the HTML default (typically Calibri 11) instead of the
 * document's font. So a clause dropped into a Times New Roman contract lands in
 * the wrong typeface. These helpers sample the document's font before an HTML
 * insert and stamp it onto the inserted range afterwards, so generated content
 * adopts the user's font family + size rather than our default.
 */

export interface DocFont {
  name?: string;
  size?: number;
}

function clean(name: string | undefined, size: number | undefined): DocFont {
  const out: DocFont = {};
  // A mixed-format selection returns "" for name and 0/null for size; treat
  // those as "unknown" so we never stamp a meaningless value.
  if (name && name.trim()) out.name = name;
  if (typeof size === "number" && size > 0) out.size = size;
  return out;
}

/**
 * Read the font (family + size) to match inserted content to. Prefers the font
 * at the current selection/cursor (what the user is typing in right now), and
 * falls back to the document body's base font. Best-effort: returns {} when
 * nothing readable (empty doc, mixed fonts, unsupported host). Call inside an
 * active Word.run, before the insert.
 */
export async function sampleInsertionFont(context: Word.RequestContext): Promise<DocFont> {
  try {
    const selFont = context.document.getSelection().font;
    selFont.load("name,size");
    await context.sync();
    const fromSelection = clean(selFont.name, selFont.size);
    if (fromSelection.name) return fromSelection;
  } catch {
    // Fall through to the body sample.
  }
  try {
    const bodyFont = context.document.body.font;
    bodyFont.load("name,size");
    await context.sync();
    return clean(bodyFont.name, bodyFont.size);
  } catch {
    return {};
  }
}

/**
 * Stamp `font` onto a just-inserted range: the family across the whole range,
 * and the size on body paragraphs only, so inserted headings keep their size
 * hierarchy (an <h2> clause heading stays a heading, just in the doc's family).
 * A no-op when the sample read nothing.
 */
export async function matchInsertedFont(
  context: Word.RequestContext,
  range: Word.Range,
  font: DocFont,
): Promise<void> {
  if (!font.name && !font.size) return;

  if (font.name) range.font.name = font.name;

  if (font.size) {
    const paras = range.paragraphs;
    paras.load("items/styleBuiltIn");
    await context.sync();
    for (const p of paras.items) {
      const style = String(p.styleBuiltIn ?? "");
      const isHeading = /heading/i.test(style) || /title/i.test(style);
      if (!isHeading) p.font.size = font.size;
    }
  }

  await context.sync();
}
