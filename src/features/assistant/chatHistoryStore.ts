import type { AssistantMessage } from "./useAssistant";

/**
 * Local chat history for the assistant.
 *
 * Persisted in add-in-origin localStorage (sandboxed, never travels with the
 * .docx), mirroring prefs/session. This is DEVICE-LOCAL history: it gives the
 * user History + New chat in the pane without depending on the web app's heavy
 * chat-persistence system (which the add-in's lightweight `/stream/chat` does
 * not write to). A future enhancement can sync to the server once that stream
 * persists; this store is additive and does not block that.
 */
export interface Conversation {
  id: string;
  title: string;
  messages: AssistantMessage[];
  /** Epoch ms of the last update, for sort + relative-time display. */
  updatedAt: number;
}

const KEY = "vaquill.chatHistory";
const MAX = 30; // keep the most recent; older conversations are trimmed.
// Cap each stored message body so a few long transcripts can't blow the ~5MB
// localStorage quota (which would silently stop history persisting).
const MSG_CHARS = 4000;

function capMessages(list: Conversation[]): Conversation[] {
  return list.slice(0, MAX).map((c) => ({
    ...c,
    messages: c.messages.map((m) =>
      m.content.length > MSG_CHARS ? { ...m, content: `${m.content.slice(0, MSG_CHARS)}...` } : m,
    ),
  }));
}

function read(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Conversation[]) : [];
  } catch {
    return [];
  }
}

function write(list: Conversation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(capMessages(list)));
  } catch {
    // localStorage unavailable (private mode / policy): history just won't persist.
  }
}

/** Most-recent-first. */
export function listConversations(): Conversation[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | null {
  return read().find((c) => c.id === id) ?? null;
}

/** Upsert a conversation (moves it to the top by updatedAt). */
export function saveConversation(conv: Conversation): void {
  const rest = read().filter((c) => c.id !== conv.id);
  write([conv, ...rest].sort((a, b) => b.updatedAt - a.updatedAt));
}

export function deleteConversation(id: string): void {
  write(read().filter((c) => c.id !== id));
}

/** Derive a short title from the first user message. */
export function deriveTitle(messages: AssistantMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser?.content.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "New chat";
  return text.length > 60 ? `${text.slice(0, 60)}...` : text;
}
