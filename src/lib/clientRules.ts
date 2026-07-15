/**
 * Per-client negotiation rules, stored locally (add-in-origin localStorage), so a
 * lawyer's standing positions for a client ("Governing law: Delaware", "Cap at 12
 * months' fees", "No arbitration") apply automatically on every review of that
 * client's paper. This is the "position profile" that compounds: the rules
 * accumulate per client and make each review more "us".
 *
 * v1 is local-only (mirrors prefs.ts / org.ts, sandboxed, does NOT travel with
 * the .docx). A later version persists the rules onto the client record so they
 * follow the user across devices and teammates.
 */
const STORAGE_KEY = "vaquill.clientRules";
const ACTIVE_KEY = "vaquill.activeClientId";
const MAX_RULES = 40;

type RulesMap = Record<string, string[]>;

let cache: RulesMap | null = null;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): RulesMap {
  if (!raw || typeof raw !== "object") return {};
  const out: RulesMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const rules = v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, MAX_RULES);
    if (rules.length) out[k] = rules;
  }
  return out;
}

function load(): RulesMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? sanitize(JSON.parse(raw)) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function getClientRules(clientId: string): string[] {
  if (!clientId) return [];
  return load()[clientId] ?? [];
}

export function setClientRules(clientId: string, rules: string[]): void {
  if (!clientId) return;
  const clean = rules.map((r) => r.trim()).filter(Boolean).slice(0, MAX_RULES);
  const next: RulesMap = { ...load() };
  if (clean.length) next[clientId] = clean;
  else delete next[clientId];
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / policy) - keep it in memory.
  }
  for (const l of listeners) l();
}

export function subscribeClientRules(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The client's rules formatted as a context block for the review / triage prompt,
 * or "" when the client has none. Framed so the classifier treats a violation as
 * a reject, which is what a standing client rule means.
 */
export function clientRulesContext(clientId: string): string {
  const rules = getClientRules(clientId);
  if (!rules.length) return "";
  return (
    "CLIENT RULES (standing positions for this client; treat a violation as reject):\n" +
    rules.map((r) => `- ${r}`).join("\n")
  );
}

// The client currently in focus for rules, shared between the rules editor, the
// counterparty-change triage, and the main review, so all three apply the same
// client's positions. Persisted locally; "" when none is chosen.
let activeCache: string | null = null;

export function getActiveClientId(): string {
  if (activeCache !== null) return activeCache;
  try {
    activeCache = localStorage.getItem(ACTIVE_KEY) ?? "";
  } catch {
    activeCache = "";
  }
  return activeCache;
}

export function setActiveClientId(clientId: string): void {
  const next = clientId || "";
  if (next === getActiveClientId()) return;
  activeCache = next;
  try {
    if (next) localStorage.setItem(ACTIVE_KEY, next);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // localStorage unavailable - keep it in memory.
  }
  for (const l of listeners) l();
}

/** The active client's rules context, or "" when none is chosen / it has none. */
export function activeClientRulesContext(): string {
  return clientRulesContext(getActiveClientId());
}
