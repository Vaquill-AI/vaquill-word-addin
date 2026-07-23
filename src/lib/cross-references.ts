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

import { snippetAround, type ContextSnippet } from "./context-snippet";

export type XrefKind = "section" | "schedule";

export interface BrokenRef {
  kind: XrefKind;
  /** Display label, e.g. "Section 7.4" or "Exhibit C". */
  label: string;
  /** How many times this missing target is referenced. */
  count: number;
  /** Text around the first occurrence, for an in-context preview. */
  context?: ContextSnippet;
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

// A "§ N" (or "Section N") that belongs to a STATUTORY citation is an EXTERNAL
// code section, not an internal cross-reference, so it must never be flagged as
// a broken section. Examples: "6 Del. C. § 2001", "18 U.S.C. § 1030",
// "17 C.F.R. § 240", "Cal. Civ. Code § 1798", "§ 2001 et seq." We detect it two
// ways: a reporter/code token immediately BEFORE the symbol, or "et seq."
// immediately AFTER the number (a purely statutory tail).
const STATUTE_BEFORE =
  /(?:U\.?\s?S\.?\s?C\.?|C\.?\s?F\.?\s?R\.?|\bStat\.?|\bAnn\.?|\bCode\b|\bLaws?\b|\bReg(?:s|ulations?)?\.?|\btit\.?|\bch\.?|\bpt\.?|[A-Z][A-Za-z]{1,5}\.\s*C\.?)\s*$/;
const ET_SEQ_AFTER = /^\s*et\s+seq\b/i;
// The very common US-corporate form where the statutory signal FOLLOWS the
// number: "Section 251 of the Delaware General Corporation Law", "Section 409A
// of the Code", "Section 16 of the Securities Exchange Act". An optional letter
// suffix (409"A") may sit between the number and " of ". Note "Section 4 of the
// Agreement" is NOT matched (Agreement is not Act/Code/Law/...), so genuine
// internal references are still checked.
const OF_STATUTE_AFTER =
  /^[A-Za-z]{0,2}\s+of\s+(?:the\s+)?(?:[A-Z][\w.'&-]*\s+){0,6}(?:Act|Code|Law|Statute|Constitution|Regulations?)\b/;

/** True when a section-symbol match sits inside a statutory citation. */
function isStatutoryCitation(text: string, matchStart: number, matchEnd: number): boolean {
  const before = text.slice(Math.max(0, matchStart - 48), matchStart);
  if (STATUTE_BEFORE.test(before)) return true;
  const after = text.slice(matchEnd, matchEnd + 80);
  return ET_SEQ_AFTER.test(after) || OF_STATUTE_AFTER.test(after);
}

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
  const missing = new Map<string, BrokenRef>();
  const bump = (key: string, kind: XrefKind, label: string, context?: ContextSnippet) => {
    const prev = missing.get(key);
    if (prev) prev.count += 1;
    else missing.set(key, { kind, label, count: 1, context });
  };

  // Section references: "Section 7.4" / "Clause 7.4" / "Paragraph 7.4" / "§ 7.4".
  if (checkedSections) {
    const secRe = /(?:\b(?:Sections?|Clauses?|Paragraphs?)\b|§)\s*(\d+(?:\.\d+)*)/gi;
    let m: RegExpExecArray | null;
    while ((m = secRe.exec(fullText)) !== null) {
      const id = m[1];
      // A statutory citation ("6 Del. C. § 2001", "§ 1030 et seq.") is an
      // external code section, not an internal reference: never flag it.
      if (isStatutoryCitation(fullText, m.index, m.index + m[0].length)) continue;
      if (!hasSection(sections, id))
        bump(
          `section:${id}`,
          "section",
          `Section ${id}`,
          snippetAround(fullText, m.index, m.index + m[0].length),
        );
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
        bump(
          `schedule:${key}`,
          "schedule",
          label,
          snippetAround(fullText, m.index, m.index + m[0].length),
        );
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
