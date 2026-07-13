/**
 * Lightweight, deterministic intent classifier for the assistant composer.
 *
 * Phase 1: detect when an Ask-mode message is really a document ACTION (redline
 * or navigate) so the assistant can offer to run it instead of just answering.
 * Deliberately conservative and client-side (no LLM): a false positive only ever
 * surfaces a dismissible "Do it / Just answer" chip, never a silent action, so
 * this errs toward offering rather than guessing wrong. Destructive actions
 * (accept/reject, clean copy, redact) are intentionally NOT auto-detected here;
 * they belong to a later phase behind explicit confirms.
 */

export type Intent =
  | { action: "ask" }
  | { action: "edit" }
  | { action: "navigate"; target: string }
  | { action: "comment"; target: string; note: string }
  // Destructive document actions -- always run behind an explicit confirm.
  | { action: "accept" }
  | { action: "cleanCopy" };

// Leading verbs that almost always mean "modify the open document".
const STRONG_EDIT = new Set([
  "redline",
  "rewrite",
  "reword",
  "revise",
  "redraft",
  "amend",
  "strike",
  "tighten",
  "soften",
  "strengthen",
  "weaken",
  "narrow",
  "broaden",
]);

// Verbs that mean edit only when clearly aimed at a clause / legal object, so
// "add a confidentiality clause" is an edit but "add up the fees" is not.
const OBJECTY_EDIT = new Set([
  "change",
  "edit",
  "modify",
  "cap",
  "update",
  "adjust",
  "add",
  "insert",
  "remove",
  "delete",
  "make",
  "limit",
  "extend",
  "shorten",
]);

// A clause / legal-object cue that disambiguates the object-y verbs above.
const LEGAL_OBJECT =
  /\b(clause|section|provision|paragraph|language|term|wording|indemn|liabilit|warrant|termination|confidential|non-?compete|non-?solicit|governing law|jurisdiction|carve-?out|cap|renewal|assignment|arbitration|indemnity)\b/i;

// Leading phrases that mean "jump to something in the document".
const NAV_CUE = /^\s*(take me to|go to|jump to|scroll to|find the|show me the|where is the|where is|locate)\b\s*/i;

// Clean copy: accept every change AND strip comments (send-ready).
const CLEAN_CUE =
  /\b(clean copy|clean version|send-?ready copy|finali[sz]e (?:the )?(?:document|contract|draft)|accept everything and (?:remove|strip|delete) (?:the )?comments)\b/i;

// Accept all tracked changes.
const ACCEPT_CUE = /\baccept (?:all|every|the) (?:tracked )?(?:changes|edits|revisions|redlines)\b/i;

// Comment: "comment on X: note", "add a note to X", "flag X".
const COMMENT_CUE =
  /^\s*(?:comment on|add a (?:note|comment) (?:to|on)|leave a (?:note|comment) (?:on|about)|flag(?: the)?)\s+/i;

function firstWord(text: string): string {
  return text.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z-]/g, "") ?? "";
}

export function classifyIntent(text: string): Intent {
  const t = text.trim();
  if (!t) return { action: "ask" };
  const lower = t.toLowerCase();

  // Clean copy is checked before accept (it also mentions accepting).
  if (CLEAN_CUE.test(lower)) return { action: "cleanCopy" };
  if (ACCEPT_CUE.test(lower)) return { action: "accept" };

  // Comment: "comment on <target>: <note>" / "flag <target>". A ":" splits the
  // anchor from the note; otherwise the whole remainder is the anchor and the
  // note defaults to a flag.
  const cm = t.match(COMMENT_CUE);
  if (cm) {
    const rest = t.slice(cm[0].length).trim();
    const colon = rest.indexOf(":");
    let target = colon >= 0 ? rest.slice(0, colon) : rest;
    const note = colon >= 0 ? rest.slice(colon + 1).trim() : "";
    target = target
      .replace(/^(the|a|an)\s+/i, "")
      .replace(/\s+(clause|section|provision|paragraph)\b/i, "")
      .replace(/[?.!]+\s*$/, "")
      .trim();
    // "flag any issues" / "flag the risks" are questions, not comment requests:
    // a vague target means the user wants an answer, not a comment on that text.
    const vague = /^(any|all)?\s*(issues?|problems?|risks?|concerns?|red flags?|anything|everything)$/i;
    if (target.length >= 3 && !vague.test(target)) {
      return { action: "comment", target, note: note || "Flagged for review." };
    }
  }

  // Navigate: a leading nav phrase, with the remainder as the target to find.
  const nav = t.match(NAV_CUE);
  if (nav) {
    const target = t
      .slice(nav[0].length)
      .replace(/^(the|a|an)\s+/i, "")
      .replace(/\s+(clause|section|provision|paragraph)\b/i, "")
      .replace(/[?.!]+\s*$/, "")
      .trim();
    if (target.length >= 3) return { action: "navigate", target };
  }

  // Edit: a strong leading verb, an object-y verb aimed at a legal object, or
  // "redline" anywhere near the front.
  const fw = firstWord(t);
  if (STRONG_EDIT.has(fw)) return { action: "edit" };
  if (OBJECTY_EDIT.has(fw) && LEGAL_OBJECT.test(lower)) return { action: "edit" };
  if (/\bredline\b/i.test(lower)) return { action: "edit" };

  return { action: "ask" };
}
