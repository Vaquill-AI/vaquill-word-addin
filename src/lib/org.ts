/**
 * Active-organization store for the add-in.
 *
 * The backend scopes matters, drafts, playbooks, clients, templates, and notes
 * by organization, read from the `X-Organization-ID` request header (highest
 * priority; see app/core/security.py). The add-in never set it, so it silently
 * operated in whatever org the server resolved from the user's saved
 * preference, with no way to see or change it. This store holds the chosen org
 * id (persisted in add-in-origin localStorage, which is sandboxed and does NOT
 * travel with the .docx), and http.ts stamps it on every request.
 *
 * A null active org means "let the backend resolve the default" (no header).
 */
const STORAGE_KEY = "vaquill.activeOrgId";

type Listener = (orgId: string | null) => void;

let activeOrgId: string | null = null;
const listeners = new Set<Listener>();

/** Read the persisted selection once at startup. */
export function initActiveOrg(): void {
  try {
    activeOrgId = localStorage.getItem(STORAGE_KEY);
  } catch {
    activeOrgId = null;
  }
}

export function getActiveOrgId(): string | null {
  return activeOrgId;
}

export function setActiveOrgId(id: string | null): void {
  if (id === activeOrgId) return;
  activeOrgId = id;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode / policy) -- keep it in memory.
  }
  for (const l of listeners) l(id);
}

export function subscribeActiveOrg(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
