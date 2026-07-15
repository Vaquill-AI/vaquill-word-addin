/**
 * Shared string helpers. Consolidated here to remove the copies that had
 * accumulated across feature files (a `humanize` in six views, two near-identical
 * clause-type slug helpers).
 */

/** "limitation_of_liability" / "msa_vendor" -> "Limitation Of Liability". */
export function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalize a free-text clause name into a snake_case clause-type key
 * ("Limitation of Liability" -> "limitation_of_liability"). Starts with a letter
 * (the backend clause-type CHECK requires `^[a-z]`) and is capped so it never
 * overflows the column. Returns `fallback` when nothing usable remains.
 */
export function toClauseTypeKey(name: string, fallback = "general"): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/g, "")
    .slice(0, 64);
  return key || fallback;
}

/**
 * Strip Markdown syntax to clean, readable plain text: headings, emphasis,
 * inline code, links/images (kept as their text), list markers, blockquotes, and
 * table pipes. Used for the plain-text side of a copy so pasting into a plain
 * target never shows literal `##` / `**`.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "") // headings
        .replace(/^\s*>\s?/, "") // blockquote marker
        .replace(/^(\s*)[-*+]\s+/, "$1• ") // bullets
        .replace(/^(\s*)(\d+)[.)]\s+/, "$1$2. "), // numbered
    )
    .join("\n")
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, "") // drop table separator rows
    .replace(/ *\| */g, "  ") // table cell pipes -> spacing
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*\n]+)\*/g, "$1") // italic
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
