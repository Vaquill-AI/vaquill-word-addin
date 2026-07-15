import { hasCourtListenerToken } from "@/ai/keys";
import { isCommunity } from "./edition";

/**
 * Edition gating helpers for the UI.
 *
 * The request shim (localRouter) already gates BEHAVIOR: any feature that needs
 * Vaquill's hosted data or account throws REQUIRES_ACCOUNT. These helpers let the
 * UI gate PRESENTATION too, so the community build hides account-only surfaces
 * (usage/quota, org switcher) rather than showing something that would only error.
 */
export const REQUIRES_ACCOUNT_NOTE = "Requires a Vaquill AI account";

/** Surfaces that only make sense with a hosted Vaquill account. */
export function showsAccountSurfaces(): boolean {
  return !isCommunity();
}

/**
 * Case citation existence checking is available in the community build when the
 * user has added their own CourtListener token (checked browser-direct against
 * CourtListener). Statute resolution still needs Vaquill's corpus and stays off.
 */
export function citationAuthorityAvailable(): boolean {
  return !isCommunity() || hasCourtListenerToken();
}
