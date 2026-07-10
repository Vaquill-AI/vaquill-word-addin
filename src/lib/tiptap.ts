/**
 * Convert plain document text into a minimal TipTap document, the shape the
 * platform's drafting editor and the /drafting/import endpoint expect. Lines that
 * match a known section title become H2 headings so the imported draft reads like
 * an AI-generated one rather than an undifferentiated wall of paragraphs.
 */
interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

function heading(text: string, level: number): TipTapNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function paragraph(text: string): TipTapNode {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

export function textToTiptap(
  fullText: string,
  opts?: { title?: string; sectionTitles?: string[] },
): { type: "doc"; content: TipTapNode[] } {
  const sections = new Set((opts?.sectionTitles ?? []).map((s) => s.trim().toLowerCase()));
  const content: TipTapNode[] = [];
  if (opts?.title?.trim()) content.push(heading(opts.title.trim(), 1));

  for (const block of fullText.split(/\n{2,}/)) {
    const t = block.trim();
    if (!t) continue;
    content.push(sections.has(t.toLowerCase()) ? heading(t, 2) : paragraph(t));
  }
  if (content.length === 0) content.push(paragraph(""));
  return { type: "doc", content };
}
