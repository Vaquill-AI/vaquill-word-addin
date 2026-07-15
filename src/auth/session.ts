import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { isCommunity, setByokMode } from "@/community/edition";
import { isConfigured, removeKey } from "@/ai/keys";

/**
 * In-memory session store. Holds the Supabase access + refresh tokens for the
 * life of the task pane. Refreshes the access token before it expires so every
 * backend request carries a fresh bearer.
 *
 * Persistence (U5): we persist ONLY the refresh token, in add-in-origin
 * localStorage. Access tokens stay in memory and are NEVER written anywhere.
 * localStorage is sandboxed to the add-in's own origin and does NOT serialize
 * into the .docx, so the token never travels with the file (unlike Office
 * Settings, which we deliberately never use for auth). On a pane reload we
 * rehydrate the session from that one refresh token (see rehydrateSession),
 * exchanging it for a fresh access token silently, so the user does not have to
 * re-authenticate through the dialog every time. The refresh token is rotated
 * by Supabase on each use, so we rewrite storage on every successful refresh
 * and clear it on sign-out. All localStorage access is guarded (it can throw
 * under private-mode / policy restrictions), matching lib/org.ts + lib/prefs.ts.
 */
type Listener = (user: User | null) => void;

const REFRESH_SKEW_SECONDS = 60;
const REFRESH_TOKEN_STORAGE_KEY = "vaquill.refreshToken";

let session: Session | null = null;
const listeners = new Set<Listener>();

// Kick off startup rehydration exactly once, on the first subscribe (the pane's
// mount signal). Guarded so React StrictMode's double-mount cannot fire it twice.
let rehydrateStarted = false;

/** Read the persisted refresh token. Guarded: localStorage can throw. */
function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist (or clear) the refresh token. Guarded: localStorage can throw. */
function writeStoredRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode / policy) -- session stays in
    // memory only, exactly as before this change.
  }
}

// Single-flight guard for refresh(). Supabase rotates the refresh token on each
// use, so two concurrent refreshes would send the same (now consumed) token and
// the second would fail, clearing the session mid-operation. While a refresh is
// in flight every caller awaits the same promise; the memo is cleared when it
// settles.
let inFlightRefresh: Promise<string | null> | null = null;

function notify(): void {
  const user = session?.user ?? null;
  for (const l of listeners) l(user);
}

// --- Community edition -------------------------------------------------------
// The BYOK build has no Supabase account. "Signed in" simply means a working key
// is configured, so we synthesize a minimal local user and re-notify listeners
// whenever the key changes (the setup wizard / Settings call notifyCommunityAuth).
function communityUser(): User | null {
  if (!isConfigured()) return null;
  return {
    id: "local",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as User;
}

export function notifyCommunityAuth(): void {
  const user = communityUser();
  for (const l of listeners) l(user);
}

export function subscribe(listener: Listener): () => void {
  if (isCommunity()) {
    listeners.add(listener);
    listener(communityUser());
    return () => listeners.delete(listener);
  }
  listeners.add(listener);
  listener(session?.user ?? null);
  // main.tsx (not editable here) owns the other startup inits; the first
  // subscribe is our only in-file hook that fires on pane mount but never in the
  // auth-callback relay path (App, the sole subscriber, is not rendered there).
  if (!rehydrateStarted) {
    rehydrateStarted = true;
    void rehydrateSession();
  }
  return () => listeners.delete(listener);
}

export function getUser(): User | null {
  if (isCommunity()) return communityUser();
  return session?.user ?? null;
}

export function isAuthenticated(): boolean {
  return !!session?.access_token;
}

/** Seed the store from tokens handed back by the auth dialog. */
export async function setSessionFromTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const { data, error } = await getSupabase().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  session = data.session;
  writeStoredRefreshToken(session?.refresh_token ?? null);
  notify();
}

export function clearSession(): void {
  if (isCommunity()) {
    removeKey("openai");
    removeKey("anthropic");
    // Leaving BYOK mode returns the hosted build to the sign-in screen; the
    // community build stays in the key wizard (isBuildCommunity keeps it there).
    setByokMode(false);
    try {
      window.location.reload();
    } catch {
      notifyCommunityAuth();
    }
    return;
  }
  session = null;
  writeStoredRefreshToken(null);
  void getSupabase().auth.signOut({ scope: "local" });
  notify();
}

function isExpiringSoon(s: Session): boolean {
  if (!s.expires_at) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return s.expires_at - nowSeconds <= REFRESH_SKEW_SECONDS;
}

/**
 * Return a valid access token, refreshing first if it is close to expiry.
 * Returns null when there is no session or refresh failed (caller re-auths).
 */
export async function getAccessToken(): Promise<string | null> {
  if (isCommunity()) return isConfigured() ? "community" : null;
  if (!session) return null;
  if (isExpiringSoon(session)) {
    return refresh();
  }
  return session.access_token;
}

/**
 * Perform the actual token refresh against Supabase. Only clears the session on
 * a genuine terminal auth error, exactly as before.
 */
async function doRefresh(): Promise<string | null> {
  if (!session?.refresh_token) return null;
  const { data, error } = await getSupabase().auth.refreshSession({
    refresh_token: session.refresh_token,
  });
  if (error || !data.session) {
    clearSession();
    return null;
  }
  session = data.session;
  // Supabase rotates the refresh token on every use, so persist the new one or
  // the stored copy would be stale (already consumed) on the next reload.
  writeStoredRefreshToken(session.refresh_token ?? null);
  notify();
  return session.access_token;
}

/**
 * Force a refresh (used on a 401 as a one-shot retry). Returns the new token.
 * Single-flight: concurrent callers share one in-flight refresh so a rotated
 * refresh token is never spent twice.
 */
export async function refresh(): Promise<string | null> {
  if (isCommunity()) return isConfigured() ? "community" : null;
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = (async () => {
    try {
      return await doRefresh();
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

/**
 * Restore the session on pane startup from the persisted refresh token, without
 * the interactive dialog. No-op when a session already exists (e.g. a login
 * completed first) or nothing was persisted. On a terminal auth error the stale
 * token is cleared; on a transient (network) error it is kept so a later reload
 * can retry. Never throws -- a failed rehydrate simply leaves the pane signed
 * out, exactly as before persistence existed.
 */
export async function rehydrateSession(): Promise<void> {
  if (isCommunity()) return; // No Supabase session to restore in the BYOK build.
  if (session) return;
  const refreshToken = readStoredRefreshToken();
  if (!refreshToken) return;
  try {
    const { data, error } = await getSupabase().auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      // Genuine terminal auth error: the token is dead, drop it.
      writeStoredRefreshToken(null);
      return;
    }
    // A login may have completed while this request was in flight; do not
    // clobber a fresher, already-persisted session.
    if (session) return;
    session = data.session;
    writeStoredRefreshToken(session.refresh_token ?? null);
    notify();
  } catch {
    // Transient failure (offline, etc.): keep the token for a later retry.
  }
}
