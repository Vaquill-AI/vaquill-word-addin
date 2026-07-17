import type { ProviderId } from "./providers/types";

export type { ProviderId };

/**
 * BYOK key store for the community edition.
 *
 * Keys live in the add-in's own partitioned localStorage: on the user's machine,
 * sent only to the provider they chose. Office gives no encrypted store, so this
 * is the standard, accepted trust model for a bring-your-own-key tool. We never
 * write keys to Office document settings, which would travel inside the .docx.
 */
const PREFIX = "vaquill.byok";

export interface ModelOption {
  id: string;
  label: string;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/** A small curated list per provider. New models are a one-line add here. */
export const MODEL_OPTIONS: Record<ProviderId, ModelOption[]> = {
  openai: [
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini (fast, low cost)" },
    { id: "gpt-5.5", label: "GPT-5.5 (highest quality)" },
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 (recommended)" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8 (highest quality)" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast)" },
  ],
};

const DEFAULT_MODEL: Record<ProviderId, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-sonnet-5",
};

/** Partition the storage key per add-in instance where Office supports it. */
function partition(): string {
  try {
    const ctx = (typeof Office !== "undefined" ? Office.context : undefined) as
      | { partitionKey?: string }
      | undefined;
    return ctx?.partitionKey ? `${ctx.partitionKey}:` : "";
  } catch {
    return "";
  }
}

function keyName(suffix: string): string {
  return `${partition()}${PREFIX}.${suffix}`;
}

/**
 * Session fallback for when localStorage is unavailable (Office storage
 * partitioning, an InPrivate / third-party pane, or an enterprise cookie
 * policy). Without it a swallowed write meant `read` returned null immediately
 * after `setKey` "succeeded", so the key never took: Save looked like a dead
 * button and the user could never get past the BYOK screen. Mirrors the
 * in-memory fallback in lib/prefs.ts and lib/org.ts. Keys still never leave
 * this device.
 */
const memory = new Map<string, string>();

function read(suffix: string): string | null {
  const k = keyName(suffix);
  try {
    const v = localStorage.getItem(k);
    if (v !== null) return v;
  } catch {
    // storage blocked; fall through to the session fallback
  }
  return memory.get(k) ?? null;
}

/** Returns whether the value was PERSISTED (false = held in memory only, so it
 *  works for this session but will not survive a reload). */
function write(suffix: string, value: string | null): boolean {
  const k = keyName(suffix);
  if (value === null) memory.delete(k);
  else memory.set(k, value);
  try {
    if (value === null) localStorage.removeItem(k);
    else localStorage.setItem(k, value);
    return true;
  } catch {
    return false;
  }
}

export function getActiveProvider(): ProviderId {
  return read("provider") === "anthropic" ? "anthropic" : "openai";
}

export function setActiveProvider(p: ProviderId): void {
  write("provider", p);
}

export function getKey(p: ProviderId): string | null {
  const v = read(`${p}.key`);
  return v && v.trim() ? v : null;
}

/** Returns whether the key was PERSISTED (false = kept for this session only). */
export function setKey(p: ProviderId, key: string): boolean {
  return write(`${p}.key`, key.trim() || null);
}

export function removeKey(p: ProviderId): void {
  write(`${p}.key`, null);
}

export function getModel(p: ProviderId): string {
  return read(`${p}.model`) || DEFAULT_MODEL[p];
}

export function setModel(p: ProviderId, model: string): void {
  write(`${p}.model`, model);
}

/** True once the active provider has a key. Unlocks the AI features and the app. */
export function isConfigured(): boolean {
  return getKey(getActiveProvider()) !== null;
}

// --- CourtListener (optional BYO case-law token) ----------------------------
// Separate from the LLM providers: used only to verify that cited cases exist,
// browser-direct against the user's own free CourtListener account.
const CL_TOKEN = "courtlistener.token";

export function getCourtListenerToken(): string | null {
  const v = read(CL_TOKEN);
  return v && v.trim() ? v : null;
}

export function setCourtListenerToken(token: string): void {
  write(CL_TOKEN, token.trim() || null);
}

export function hasCourtListenerToken(): boolean {
  return getCourtListenerToken() !== null;
}
