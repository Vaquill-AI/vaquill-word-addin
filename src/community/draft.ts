import { uuid } from "@/api/ids";
import { draftGeneratePrompt } from "@/ai/prompts";
import { runJson } from "./llm";

/**
 * Community draft generation: a degraded, single-pass draft against the user's
 * key. It has no corpus or case-law grounding and no quality score (those are
 * the parts that need the hosted backend), but it produces a full, template-shaped
 * first draft. It mimics the durable queue-and-poll flow the UI expects: the
 * generation runs synchronously here, and the resulting row is stored in memory
 * so the poll immediately returns "completed".
 *
 * Grounding uses full document context, not client-side RAG: an uploaded
 * reference is injected whole into the prompt (modern context windows hold it).
 */
interface Section {
  title: string;
  content: string;
}
interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
}

const rows = new Map<string, Record<string, unknown>>();
const references = new Map<string, { text: string; fileName: string; wordCount: number }>();

export function storeReference(
  text: string,
  fileName: string,
): { id: string; fileName: string; wordCount: number } {
  const id = uuid();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  references.set(id, { text, fileName, wordCount });
  return { id, fileName, wordCount };
}

function referenceText(ids: string[]): string {
  return ids
    .map((id) => references.get(id)?.text ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function buildTiptap(title: string, sections: Section[]): TiptapNode {
  const content: TiptapNode[] = [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title.toUpperCase() }] },
  ];
  for (const s of sections) {
    if (s.title) {
      content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: s.title }] });
    }
    if (s.content) {
      content.push({ type: "paragraph", content: [{ type: "text", text: s.content }] });
    }
  }
  return { type: "doc", content };
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export async function startDraft(body: Record<string, unknown>): Promise<{ draftId: string; status: string }> {
  const category = str(body.category, "custom");
  const title = str(body.title, "Untitled draft");
  const refIds = Array.isArray(body.reference_document_ids)
    ? body.reference_document_ids.filter((x): x is string => typeof x === "string")
    : [];

  const p = draftGeneratePrompt(
    category,
    title,
    str(body.tone, "balanced"),
    str(body.governing_law_state),
    str(body.special_instructions),
    referenceText(refIds),
  );
  const raw = (await runJson(p.system, p.user)) as { sections?: unknown };
  const sections: Section[] = Array.isArray(raw.sections)
    ? raw.sections.map((s) => {
        const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        return { title: str(o.title), content: str(o.content) };
      })
    : [];

  const draftId = uuid();
  rows.set(draftId, {
    id: draftId,
    title,
    category,
    content: buildTiptap(title, sections),
    metadata: {},
    generationStatus: "completed",
    generationProgress: { status: "completed", stepIndex: sections.length, totalSteps: sections.length },
    generationError: null,
  });
  return { draftId, status: "completed" };
}

export function getDraftRow(id: string): Record<string, unknown> | undefined {
  return rows.get(id);
}
