/**
 * Community (bring-your-own-key) edition flag.
 *
 * The community build is produced with VITE_EDITION=community. In that build the
 * add-in talks to the user's OWN AI provider directly (see src/ai) instead of the
 * Vaquill backend: the network layer (api/http, api/sse) routes every call through
 * the local shim in src/community. The default cloud build leaves VITE_EDITION
 * unset, and every path behaves exactly as it does today. This is the single
 * switch that keeps the two editions isolated.
 */
export function isCommunity(): boolean {
  return import.meta.env.VITE_EDITION === "community";
}
