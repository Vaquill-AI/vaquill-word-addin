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
  [k: string]: unknown;
}

export interface AssistantHandlers {
  onThinking?: (label: string) => void;
  onSources?: (sources: ChatSource[]) => void;
  onDelta: (text: string) => void;
  onFinal?: (correctedContent: string | null) => void;
  signal?: AbortSignal;
}

/** Optional grounding/scoping for a chat request. */
export interface AssistantGrounding {
  /** Ground answers in a matter's workspace. */
  matterId?: string | null;
  /** Search the matter's uploaded documents (only meaningful with matterId). */
  enableMatterDocsSearch?: boolean;
  /** US jurisdiction scope: state codes and/or 'federal' (e.g. ['ca','federal']). */
  usStates?: string[];
}

export type AssistantOptions = { useRag?: boolean } & AssistantGrounding;

const CHAT = "/api/v1/stream/chat";
const CONTEXT_CAP = 50_000;

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
  if (opts?.usStates && opts.usStates.length > 0) body.usStates = opts.usStates;

  await postStream(CHAT, body, {
    signal: handlers.signal,
    onEvent: ({ event, data }) => {
      switch (event) {
        case "thinking": {
          const d = safeParse(data);
          const label = (d?.message as string) ?? humanizeStep((d?.step as string) ?? "");
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
