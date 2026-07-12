/**
 * Cross-reference integrity analysis (client-only, pure).
 *
 * Flags internal references that point at a section/schedule that does not exist
 * in the document, a classic drafting defect after clauses are cut or renumbered
 * ("as set out in Section 7.4" when there is no 7.4). Litera Contract Companion
 * and ContractKen ship this.
 *
 * It reads section numbers from BOTH typed headings and auto-numbering (the
 * caller passes each paragraph's computed `listString`), so it works on
 * auto-numbered contracts where the number is not in the text.
 *
 * Precision over recall:
 *  - It only checks when it has confidently mapped the document's numbering
 *    (>= MIN_SECTIONS section numbers found); otherwise it reports "not checked"
 *    rather than flag every reference.
 *  - A reference to a parent (Section 7) is satisfied by any child (7.1), so
 *    group references are not false-flagged.
 *  - Roman-numeral Articles are out of scope (neither mapped nor checked), so
 *    they are never wrongly flagged.
 */

export type XrefKind = "section" | "schedule";

export interface BrokenRef {
  kind: XrefKind;
  /** Display label, e.g. "Section 7.4" or "Exhibit C". */
  label: string;
  /** How many times this missing target is referenced. */
  count: number;
}

export interface CrossRefReport {
  /** Distinct numeric section numbers detected in the document. */
  sectionCount: number;
  /** Distinct schedules/exhibits/appendices/annexes detected. */
  scheduleCount: number;
  /** False when too few sections were found to trust a numbering check. */
  checkedSections: boolean;
  broken: BrokenRef[];
}

// Need at least this many mapped sections before trusting a "missing" verdict.
const MIN_SECTIONS = 3;
const MAX_BROKEN = 100;

const SCHEDULE_TYPES = ["Schedule", "Exhibit", "Appendix", "Annex"] as const;

// A schedule/exhibit label id is a single uppercase letter, a Roman numeral, or
// a number. Case-SENSITIVE on purpose: the type word is matched case-insensitively
// (so "SCHEDULE A" headings are found), but the id must look like a real label so
// ordinary prose ("the Schedule set forth in...") is not read as "Schedule set".
const SCHEDULE_ID = /^(?:[A-Z]|[IVXLCDM]{2,4}|\d{1,3})$/;

/** Strip trailing punctuation from a list number ("7.4." -> "7.4"). */
function cleanNumber(raw: string): string | null {
  const m = /^\s*(\d+(?:\.\d+)*)[.)\]]?\s*$/.exec(raw);
  return m ? m[1] : null;
}

/** Collect the numeric section ids that actually exist in the document. */
function collectSections(paragraphs: { text: string; listString: string | null }[]): Set<string> {
  const sections = new Set<string>();
  for (const p of paragraphs) {
    // Auto-numbered: the number lives in listString, not the text.
    if (p.listString) {
      const n = cleanNumber(p.listString);
      if (n) sections.add(n);
    }
    const text = p.text;
    if (!text) continue;
    // "Section 7.4" / "Article 4" / "Clause 7.4" heading.
    let m = /^(?:Section|Article|Clause)\s+(\d+(?:\.\d+)*)\b/i.exec(text);
    if (m) sections.add(m[1]);
    // Dotted multi-level heading typed at the start ("7.4 Indemnification").
    m = /^(\d+(?:\.\d+)+)\s+\S/.exec(text);
    if (m) sections.add(m[1]);
    // Single-integer manual heading ("7. Indemnification").
    m = /^(\d+)\.\s+[A-Z(]/.exec(text);
    if (m) sections.add(m[1]);
  }
  return sections;
}

/** Collect existing schedules/exhibits, keyed "TYPE:ID" (both upper-cased). */
function collectSchedules(paragraphs: { text: string }[]): Set<string> {
  const set = new Set<string>();
  const re = new RegExp(`^(${SCHEDULE_TYPES.join("|")})\\s+([A-Za-z0-9]{1,4})\\b`, "i");
  for (const p of paragraphs) {
    const m = re.exec(p.text);
    if (m && SCHEDULE_ID.test(m[2])) set.add(`${m[1].toUpperCase()}:${m[2].toUpperCase()}`);
  }
  return set;
}

/** A referenced section id is present if it exists exactly OR any child does
 *  (a reference to Section 7 is satisfied by 7.1), so group refs are not flagged. */
function hasSection(existing: Set<string>, id: string): boolean {
  if (existing.has(id)) return true;
  const prefix = id + ".";
  for (const e of existing) if (e.startsWith(prefix)) return true;
  return false;
}

export function analyzeCrossReferences(
  paragraphs: { text: string; listString: string | null }[],
): CrossRefReport {
  const sections = collectSections(paragraphs);
  const schedules = collectSchedules(paragraphs);
  const fullText = paragraphs.map((p) => p.text).join("\n");

  const checkedSections = sections.size >= MIN_SECTIONS;
  const checkedSchedules = schedules.size >= 1;

  // Missing target -> {label, count}. Keyed to dedupe repeated references.
  const missing = new Map<string, { kind: XrefKind; label: string; count: number }>();
  const bump = (key: string, kind: XrefKind, label: string) => {
    const prev = missing.get(key);
    if (prev) prev.count += 1;
    else missing.set(key, { kind, label, count: 1 });
  };

  // Section references: "Section 7.4" / "Clause 7.4" / "Paragraph 7.4" / "§ 7.4".
  if (checkedSections) {
    const secRe = /(?:\b(?:Sections?|Clauses?|Paragraphs?)\b|§)\s*(\d+(?:\.\d+)*)/gi;
    let m: RegExpExecArray | null;
    while ((m = secRe.exec(fullText)) !== null) {
      const id = m[1];
      if (!hasSection(sections, id)) bump(`section:${id}`, "section", `Section ${id}`);
    }
  }

  // Schedule/exhibit references: "Schedule A" / "Exhibit C" / "Appendix 1".
  if (checkedSchedules) {
    const schRe = new RegExp(`\\b(${SCHEDULE_TYPES.join("|")})\\s+([A-Za-z0-9]{1,4})\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = schRe.exec(fullText)) !== null) {
      const type = m[1];
      const id = m[2];
      if (!SCHEDULE_ID.test(id)) continue;
      const key = `${type.toUpperCase()}:${id.toUpperCase()}`;
      if (!schedules.has(key)) {
        const label = `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} ${id.toUpperCase()}`;
        bump(`schedule:${key}`, "schedule", label);
      }
    }
  }

  const broken = [...missing.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_BROKEN);

  return {
    sectionCount: sections.size,
    scheduleCount: schedules.size,
    checkedSections,
    broken,
  };
}
