import { postStream } from "./sse";
import { uuid } from "./ids";
import { ApiError } from "./errors";

/**
 * Grounded assistant chat over the open document.
 * Endpoint: POST /api/v1/stream/chat (SSE). The open contract is sent as
 * `context` so answers are grounded in it; `useRag` also brings in the US
 * corpus. Events: thinking -> sources -> chunk (delta) -> done. On `done` a
 * `corrected_content` may replace the streamed text (citation remap).
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSource {
  title?: string;
  caseName?: string;
  case_name?: string;
  citation?: string;
  /** Matter-document and open-contract sources label themselves by filename. */
  filename?: string;
  [k: string]: unknown;
}

export interface AssistantHandlers {
  onThinking?: (label: string) => void;
  onSources?: (sources: ChatSource[]) => void;
  onDelta: (text: string) => void;
  /**
   * The backend signals a regeneration / citation-correction by telling the
   * client to clear the answer streamed so far, before the corrected answer is
   * re-streamed. Without this, the re-streamed chunks append to the old text and
   * the answer shows twice.
   */
  onReplace?: () => void;
  onFinal?: (correctedContent: string | null) => void;
  signal?: AbortSignal;
}

/** Optional grounding/scoping for a chat request. */
export interface AssistantGrounding {
  /** Ground answers in a matter's workspace. */
  matterId?: string | null;
  /** Search the matter's uploaded documents (only meaningful with matterId). */
  enableMatterDocsSearch?: boolean;
  /**
   * Search the US case-law + statute corpus. This is the real corpus lever;
   * `useRag` is the backend master gate for ALL retrieval, so this must be sent
   * separately (overloading useRag as the corpus toggle disables matter-docs and
   * web retrieval too).
   */
  enableVaquillDbSearch?: boolean;
  /** Bring in current information from the web (Exa deep search on the backend). */
  enableWebSearch?: boolean;
  /** US jurisdiction scope: state codes and/or 'federal' (e.g. ['ca','federal']). */
  usStates?: string[];
}

export type AssistantOptions = { useRag?: boolean } & AssistantGrounding;

const CHAT = "/api/v1/stream/chat";
// Inline document context sent with each question. ~300k chars is roughly a
// 100-page single-spaced contract (~2.7k chars/page). The backend `context`
// field has no length limit and modern models take this comfortably; the cost
// is more input tokens + slightly slower first token on very large docs. Beyond
// this a document is truncated (front-of-doc), so genuinely huge agreements
// would want chunk-and-retrieve rather than a flat cap.
const CONTEXT_CAP = 300_000;

const STEP_LABELS: Record<string, string> = {
  analyzing: "Understanding your question",
  searching_documents: "Searching the document",
  retrieving: "Finding relevant passages",
  reranking: "Ranking the most relevant parts",
  generating: "Writing the answer",
  verifying: "Checking the answer",
};

function humanizeStep(step: string): string {
  return STEP_LABELS[step] ?? "Working on it";
}

// Third-party source / model / infra proper nouns and URLs must never surface in
// a customer-facing string (disclosure policy). The step trace is now PERSISTED
// and shown expandably, and the raw backend `message` is preferred over the safe
// fixed-map label, so this is the single choke point that guarantees a clean
// label whether it came from the map or the backend. Defense-in-depth: even if
// the server sanitizes, the client never relies on that.
const VENDOR_RE =
  /\b(openai|chatgpt|gpt[\w.-]*|anthropic|claude|qdrant|voyage\s?ai|voyage|pinecone|weaviate|cohere|hugging\s?face|huggingface|mcp|langchain|langgraph|azure\s?openai)\b/gi;
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

function sanitizeStepLabel(label: string): string {
  const cleaned = label
    .replace(URL_RE, "")
    .replace(VENDOR_RE, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // If stripping gutted the label, fall back to a safe neutral one.
  return cleaned.length >= 3 ? cleaned : "Working on it";
}

function safeParse(data: string): Record<string, unknown> | null {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function streamAssistant(
  messages: ChatMessage[],
  documentContext: string,
  handlers: AssistantHandlers,
  opts?: AssistantOptions,
): Promise<void> {
  // The StreamChatRequest reads camelCase (validation_alias). Only include the
  // optional scoping fields when set so defaults are left to the backend.
  const body: Record<string, unknown> = {
    messages,
    context: documentContext ? documentContext.slice(0, CONTEXT_CAP) : undefined,
    useRag: opts?.useRag ?? true,
    countryCode: "US",
    clientMessageId: uuid(),
  };
  if (opts?.matterId) body.matterId = opts.matterId;
  if (typeof opts?.enableMatterDocsSearch === "boolean") {
    body.enableMatterDocsSearch = opts.enableMatterDocsSearch;
  }
  if (typeof opts?.enableVaquillDbSearch === "boolean") {
    body.enableVaquillDbSearch = opts.enableVaquillDbSearch;
  }
  if (typeof opts?.enableWebSearch === "boolean") body.enableWebSearch = opts.enableWebSearch;
  if (opts?.usStates && opts.usStates.length > 0) body.usStates = opts.usStates;

  await postStream(CHAT, body, {
    signal: handlers.signal,
    onEvent: ({ event, data }) => {
      switch (event) {
        case "thinking": {
          const d = safeParse(data);
          const label = sanitizeStepLabel(
            (d?.message as string) ?? humanizeStep((d?.step as string) ?? ""),
          );
          handlers.onThinking?.(label);
          break;
        }
        case "sources": {
          const d = safeParse(data);
          const sources = (d?.sources as ChatSource[]) ?? [];
          if (sources.length) handlers.onSources?.(sources);
          break;
        }
        case "chunk": {
          const d = safeParse(data);
          if (typeof d?.content === "string") handlers.onDelta(d.content);
          break;
        }
        case "response_replace": {
          // Regeneration / citation-correction: clear what streamed so far so the
          // corrected answer that follows replaces it instead of doubling up.
          handlers.onReplace?.();
          break;
        }
        case "done": {
          const d = safeParse(data);
          const corrected = typeof d?.corrected_content === "string" ? d.corrected_content : null;
          handlers.onFinal?.(corrected);
          break;
        }
        case "error": {
          const d = safeParse(data);
          throw new ApiError("server", 0, (d?.message as string) ?? "The assistant could not respond.");
        }
        default:
          break; // thinking_complete, heartbeat, verification
      }
    },
  });
}
