import type { NumberedParagraph } from "@/office/structure";

/**
 * Resolve a cross-reference in a selection ("Section 7.2", "Exhibit C", "§ 4.1")
 * to the target it points at, so a reader can see what a reference means without
 * scrolling away. Pure client-side; reuses the numbered-paragraph read the
 * cross-reference hygiene check already uses (auto-numbered sections carry their
 * number in `listString`, not the text).
 */

export interface ResolvedRef {
  /** Display label, e.g. "Section 7.2" or "Exhibit C". */
  label: string;
  /** The target paragraph text (with its number when auto-numbered). */
  targetText: string;
  /** Text to locate/jump to in the document (the target paragraph body). */
  anchor: string;
}

const SECTION_RE = /(?:\b(?:Sections?|Clauses?|Paragraphs?|Articles?)\b|§)\s*(\d+(?:\.\d+)*)/i;
const SCHEDULE_RE = /\b(Schedule|Exhibit|Appendix|Annex)\s+([A-Za-z0-9]{1,4})\b/i;
const TARGET_MAX = 400;
const ANCHOR_MAX = 160;

/** Strip trailing punctuation from a list number ("7.4." -> "7.4"). */
function cleanNumber(raw: string): string | null {
  const m = /^\s*(\d+(?:\.\d+)*)[.)\]]?\s*$/.exec(raw);
  return m ? m[1] : null;
}

function escapeId(id: string): string {
  return id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function findSection(paras: NumberedParagraph[], id: string): string | null {
  const esc = escapeId(id);
  const headingRe = new RegExp(`^(?:Section|Article|Clause)\\s+${esc}\\b`, "i");
  const typedRe = new RegExp(`^${esc}[.)]?\\s+\\S`);
  for (const p of paras) {
    if (!p.text) continue;
    // Auto-numbered heading: the number is in listString, not the text.
    if (p.listString && cleanNumber(p.listString) === id) {
      return `${id} ${p.text}`.slice(0, TARGET_MAX);
    }
    if (headingRe.test(p.text) || typedRe.test(p.text)) return p.text.slice(0, TARGET_MAX);
  }
  return null;
}

function findSchedule(paras: NumberedParagraph[], type: string, id: string): string | null {
  const re = new RegExp(`^${type}\\s+${escapeId(id)}\\b`, "i");
  for (const p of paras) {
    if (p.text && re.test(p.text)) return p.text.slice(0, TARGET_MAX);
  }
  return null;
}

/**
 * Resolve the first cross-reference found in `selection` to its target, or null
 * when the selection is not a cross-reference or the target does not exist (a
 * broken reference, which the Cross-references tool reports).
 */
export function resolveReference(paras: NumberedParagraph[], selection: string): ResolvedRef | null {
  const sel = selection.trim();
  if (!sel) return null;

  const sec = SECTION_RE.exec(sel);
  if (sec) {
    const id = sec[1];
    const target = findSection(paras, id);
    return target ? { label: `Section ${id}`, targetText: target, anchor: target.slice(0, ANCHOR_MAX) } : null;
  }

  const sch = SCHEDULE_RE.exec(sel);
  if (sch) {
    const target = findSchedule(paras, sch[1], sch[2]);
    return target
      ? { label: `${cap(sch[1])} ${sch[2].toUpperCase()}`, targetText: target, anchor: target.slice(0, ANCHOR_MAX) }
      : null;
  }

  return null;
}

/** True when a selection looks like a cross-reference (used to shape the miss copy). */
export function looksLikeReference(selection: string): boolean {
  return SECTION_RE.test(selection) || SCHEDULE_RE.test(selection);
}
