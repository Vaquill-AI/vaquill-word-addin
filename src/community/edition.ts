/**
 * Community (bring-your-own-key) edition flag.
 *
 * The app runs the community experience (own AI key, community feature set, no
 * hosted backend) in two cases:
 *  - Build time: the open-source community build sets VITE_EDITION=community. It
 *    has no hosted login at all.
 *  - Run time: in the hosted build, a user can choose "Bring your own key" on the
 *    login screen. That sets a local flag and the same community experience runs,
 *    with no account.
 *
 * When community (either way), api/http and api/sse route every call through the
 * local shim in src/community instead of the Vaquill AI backend.
 */
const BYOK_FLAG = "vaquill.byokMode";

/**
 * Session fallback for a pane whose localStorage is blocked (Office storage
 * partitioning, InPrivate, enterprise cookie policy). Without it, choosing BYOK
 * silently failed to stick and the user bounced straight back to the login
 * screen with no way through.
 */
let byokMemory = false;

function byokFlag(): boolean {
  try {
    if (localStorage.getItem(BYOK_FLAG) === "1") return true;
  } catch {
    // storage blocked; fall through to the session fallback
  }
  return byokMemory;
}

/** True only for the open-source community build (which has no hosted login). */
export function isBuildCommunity(): boolean {
  return import.meta.env.VITE_EDITION === "community";
}

/** True when the community (BYOK) experience should run: the community build, or
 *  the hosted build with BYOK chosen at runtime. */
export function isCommunity(): boolean {
  return isBuildCommunity() || byokFlag();
}

/**
 * Turn runtime BYOK mode on or off in the hosted build. The community build is
 * always community regardless.
 *
 * Returns whether the flag was PERSISTED. Callers normally reload the pane so
 * the app re-boots cleanly into the chosen mode, but they MUST NOT reload when
 * this returns false: the flag is then only in memory, and a reload would wipe
 * it and bounce the user back to where they started.
 */
export function setByokMode(on: boolean): boolean {
  byokMemory = on;
  try {
    if (on) localStorage.setItem(BYOK_FLAG, "1");
    else localStorage.removeItem(BYOK_FLAG);
    return true;
  } catch {
    return false;
  }
}
