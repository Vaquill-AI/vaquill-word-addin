/**
 * Figures check (client-only, pure): flag places where a number written in words
 * disagrees with the numeral beside it, e.g. "thirty (40) days" or "ten thousand
 * dollars ($15,000)". A classic, expensive drafting defect - courts have split on
 * which figure controls. Precision over recall: it only flags a "words (numeral)"
 * pair when it can confidently parse BOTH sides, so unusual phrasings are skipped
 * rather than mis-flagged.
 */

import { snippetAround, type ContextSnippet } from "./context-snippet";

export interface FigureMismatch {
  /** The spelled-out phrase, e.g. "thirty". */
  words: string;
  wordsValue: number;
  /** The numeral as written, e.g. "40" or "15,000". */
  numeral: string;
  numeralValue: number;
  /** Verbatim matched text, used to locate it in the document. */
  anchor: string;
  context?: ContextSnippet;
}

export interface FiguresReport {
  /** Number of "words (numeral)" pairs checked. */
  checked: number;
  mismatches: FigureMismatch[];
}

const MAX_MISMATCHES = 100;

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000 };

const NUMBER_WORDS = new Set<string>([
  ...Object.keys(UNITS),
  ...Object.keys(TENS),
  ...Object.keys(SCALES),
  "and",
]);

// A run of letters / spaces / hyphens (up to 60 chars) immediately before a
// parenthesized numeral. Greedy so it captures the full spelled-out number; the
// trailing number-word run is isolated afterward.
const PAIR = /([A-Za-z][A-Za-z\s-]{0,60})\(\s*\$?\s*(\d[\d,]*)\s*(?:[A-Za-z%.]{1,12})?\s*\)/g;

/** Parse a spelled-out number, or null if any token is not a recognized number
 *  word (so we never guess). Handles units, teens, tens, hundred/thousand/etc. */
function wordsToNumber(phrase: string): number | null {
  const tokens = phrase.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  let current = 0;
  let total = 0;
  let any = false;
  for (const t of tokens) {
    if (t === "and") continue;
    if (t in UNITS) {
      current += UNITS[t];
      any = true;
    } else if (t in TENS) {
      current += TENS[t];
      any = true;
    } else if (t === "hundred") {
      current = (current || 1) * 100;
      any = true;
    } else if (t in SCALES) {
      total += (current || 1) * SCALES[t];
      current = 0;
      any = true;
    } else {
      return null; // unrecognized token: bail rather than mis-parse
    }
  }
  return any ? total + current : null;
}

// A unit / currency word that sits BETWEEN the spelled-out number and the
// parenthetical numeral in the standard "amount (numeral)" form. Without
// stepping over it, the trailing number run is empty and the pair is skipped --
// which silently dropped every "Fifty Thousand Dollars ($60,000)" /
// "twelve percent (10%)" mismatch, the highest-stakes figures to catch.
const TRAILING_UNIT_WORD =
  /^(?:dollars?|usd|cents?|percent|pct|shares?|units?|days?|weeks?|months?|years?|installments?)$/;

/** The trailing run of number words in a captured phrase ("for a period of
 *  thirty" -> "thirty", "Fifty Thousand Dollars" -> "fifty thousand"), or ""
 *  when it does not contain a spelled-out number. */
function trailingNumberPhrase(words: string): string {
  const toks = words.toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  let end = toks.length;
  // Step over a single trailing unit word ("Dollars", "percent", "days") so the
  // number run before it is still isolated.
  if (end > 0 && TRAILING_UNIT_WORD.test(toks[end - 1])) end--;
  let i = end;
  while (i > 0 && NUMBER_WORDS.has(toks[i - 1])) i--;
  const run = toks.slice(i, end);
  // Drop a dangling leading "and" ("... and (30)").
  while (run.length && run[0] === "and") run.shift();
  return run.join(" ");
}

export function analyzeFigures(text: string): FiguresReport {
  const mismatches: FigureMismatch[] = [];
  let checked = 0;
  PAIR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAIR.exec(text)) !== null) {
    const phrase = trailingNumberPhrase(m[1]);
    if (!phrase) continue;
    const wordsValue = wordsToNumber(phrase);
    if (wordsValue === null) continue;
    const numeralValue = Number.parseInt(m[2].replace(/,/g, ""), 10);
    if (!Number.isFinite(numeralValue)) continue;
    checked += 1;
    if (wordsValue !== numeralValue && mismatches.length < MAX_MISMATCHES) {
      const anchor = `${phrase} (${m[2]})`;
      mismatches.push({
        words: phrase,
        wordsValue,
        numeral: m[2],
        numeralValue,
        anchor,
        context: snippetAround(text, m.index, m.index + m[0].length),
      });
    }
  }
  return { checked, mismatches };
}
