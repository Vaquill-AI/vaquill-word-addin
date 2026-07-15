/**
 * Persist which tours a user has completed, so the first-run walkthrough shows
 * once and the per-surface guides are opt-in afterward. Local to the add-in
 * origin (does NOT travel with the .docx), mirroring prefs.ts / clientRules.ts.
 */
const SEEN_KEY = "vaquill.toursSeen";

let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    cache = new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

export function hasSeenTour(id: string): boolean {
  return load().has(id);
}

export function markTourSeen(id: string): void {
  const set = load();
  if (set.has(id)) return;
  set.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage unavailable - keep it in memory for this session.
  }
}

/** Reset completion (e.g. a "replay onboarding" affordance in Settings). */
export function resetToursSeen(): void {
  cache = new Set();
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // ignore
  }
}
