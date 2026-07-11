/**
 * User review preferences store for the add-in.
 *
 * Holds the user's DEFAULT review jurisdiction (a US state code such as "CA" /
 * "NY", or "" for general US / federal) and DEFAULT contract type (an enum value
 * such as "nda"; "" means unset). These seed the review form so a returning user
 * does not re-pick the same options every time.
 *
 * Mirrors the pattern in ./org.ts: a single in-memory value, persisted in
 * add-in-origin localStorage (sandboxed, does NOT travel with the .docx), with
 * get / set / subscribe and a startup init. Values are treated immutably; set()
 * builds a new object rather than mutating the current one.
 */
const STORAGE_KEY = "vaquill.reviewPrefs";

export interface ReviewPrefs {
  /** US state code (e.g. "CA") or "" for general US. */
  jurisdiction: string;
  /** Contract-type enum value (e.g. "nda") or "" when unset. */
  contractType: string;
}

type Listener = (prefs: ReviewPrefs) => void;

const DEFAULT_PREFS: ReviewPrefs = { jurisdiction: "", contractType: "" };

let prefs: ReviewPrefs = DEFAULT_PREFS;
const listeners = new Set<Listener>();

function sanitize(raw: unknown): ReviewPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const obj = raw as Record<string, unknown>;
  return {
    jurisdiction: typeof obj.jurisdiction === "string" ? obj.jurisdiction : "",
    contractType: typeof obj.contractType === "string" ? obj.contractType : "",
  };
}

/** Read the persisted preferences once at startup. */
export function initReviewPrefs(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    prefs = stored ? sanitize(JSON.parse(stored)) : DEFAULT_PREFS;
  } catch {
    prefs = DEFAULT_PREFS;
  }
}

export function getReviewPrefs(): ReviewPrefs {
  return prefs;
}

/** Merge a partial update, persist, and notify subscribers. No-op if unchanged. */
export function setReviewPrefs(update: Partial<ReviewPrefs>): void {
  const next: ReviewPrefs = { ...prefs, ...update };
  if (next.jurisdiction === prefs.jurisdiction && next.contractType === prefs.contractType) {
    return;
  }
  prefs = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / policy) -- keep it in memory.
  }
  for (const l of listeners) l(next);
}

export function subscribeReviewPrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
