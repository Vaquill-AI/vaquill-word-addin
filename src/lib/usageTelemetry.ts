/**
 * Anonymous BYOK usage ping: the ONLY way to count unique bring-your-own-key
 * users, because they run on their own AI key with no Vaquill account and never
 * authenticate to our backend (every AI call goes through the local shim). So
 * there is no server-side identity to count them by.
 *
 * What this does: mint a random anonymous install id (a UUID in the add-in's own
 * sandboxed localStorage, which never travels with the .docx), and POST it to
 * the backend at most once a day. The ping carries NO account, NO API key, NO
 * document content, NO prompt -- only the anon id, edition, version, and Office
 * platform. The backend records the distinct id in PostHog for unique-user counts.
 *
 * Guardrails that keep this honest for an open-source, privacy-first tool:
 *  - It runs ONLY in the HOSTED build's BYOK mode. The open-source self-hosted
 *    build (VITE_EDITION=community) NEVER pings -- there is nothing to phone home.
 *  - It honors a local opt-out (see {@link isUsageOptedOut} / {@link setUsageOptOut}).
 *  - It is fire-and-forget and swallows all errors: telemetry must never affect
 *    the user's experience.
 */
import { config } from "@/config";
import { isBuildCommunity, isCommunity } from "@/community/edition";

const ANON_ID_KEY = "vaquill.byok.anonId";
const OPT_OUT_KEY = "vaquill.byok.usageOptOut";
const LAST_PING_KEY = "vaquill.byok.lastPingAt";
const PING_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day is enough to count uniques

// Session fallback for panes whose localStorage is blocked (Office storage
// partitioning, InPrivate, enterprise policy). The id is then per-session only,
// which slightly over-counts, but is better than not counting at all.
let anonIdMemory: string | null = null;

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked; ignore
  }
}

/** Get-or-create the anonymous install id. Stable across sessions when storage
 *  is available; per-session otherwise. */
function getAnonId(): string {
  const existing = readLS(ANON_ID_KEY) ?? anonIdMemory;
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : // Fallback for very old webviews without crypto.randomUUID.
        `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  anonIdMemory = id;
  writeLS(ANON_ID_KEY, id);
  return id;
}

/** True when the anonymous ping is active for this build + mode: the HOSTED
 *  build running in BYOK. The open-source self-hosted build never pings, so an
 *  opt-out control is only meaningful (and only shown) when this is true. */
export function isUsagePingActive(): boolean {
  return !isBuildCommunity() && isCommunity();
}

/** True when the user has opted out of the anonymous usage ping. */
export function isUsageOptedOut(): boolean {
  return readLS(OPT_OUT_KEY) === "1";
}

/** Turn the anonymous usage ping off (true) or back on (false). */
export function setUsageOptOut(optedOut: boolean): void {
  try {
    if (optedOut) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // storage blocked; opt-out cannot persist, but nothing to do here
  }
}

/** Best-effort Office platform label for the ping (coarse, non-identifying). */
function platformLabel(): string {
  try {
    const p = Office?.context?.platform;
    const T = Office?.PlatformType;
    if (!p || !T) return "unknown";
    switch (p) {
      case T.OfficeOnline:
        return "OfficeOnline";
      case T.PC:
        return "PC";
      case T.Mac:
        return "Mac";
      case T.iOS:
        return "iOS";
      case T.Universal:
        return "Universal";
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
}

/**
 * Send the anonymous BYOK install ping, at most once a day. No-op unless we are
 * in the HOSTED build's BYOK mode and the user has not opted out. Safe to call
 * on every boot; the throttle and gates make repeat calls cheap.
 */
export function maybePingUsage(): void {
  // Gate 1: only the HOSTED build's BYOK mode. The open-source self-hosted build
  // never phones home.
  if (!isUsagePingActive()) return;
  // Gate 2: user opt-out.
  if (isUsageOptedOut()) return;
  // Gate 3: at most once per day.
  const last = Number(readLS(LAST_PING_KEY) ?? 0);
  const now = Date.now();
  if (Number.isFinite(last) && now - last < PING_INTERVAL_MS) return;

  // Record the attempt first so a slow/failing network can't cause a burst of
  // retries within the day.
  writeLS(LAST_PING_KEY, String(now));

  const body = JSON.stringify({
    anonId: getAnonId(),
    edition: "byok",
    version: config.appVersion,
    platform: platformLabel(),
  });

  void fetch(`${config.apiBase}/api/v1/telemetry/ping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Fire-and-forget: never surface a telemetry failure to the user.
  });
}
