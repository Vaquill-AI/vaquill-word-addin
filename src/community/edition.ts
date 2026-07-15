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

function byokFlag(): boolean {
  try {
    return localStorage.getItem(BYOK_FLAG) === "1";
  } catch {
    return false;
  }
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

/** Turn runtime BYOK mode on or off in the hosted build. The community build is
 *  always community regardless. Callers reload the pane after changing this so
 *  the app re-boots cleanly into the chosen mode. */
export function setByokMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(BYOK_FLAG, "1");
    else localStorage.removeItem(BYOK_FLAG);
  } catch {
    // localStorage unavailable; BYOK mode just will not persist.
  }
}
