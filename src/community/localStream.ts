import { errorMessage } from "@/api/errors";
import type { StreamHandlers } from "@/api/sse";
import { getProvider } from "@/ai/providers/registry";
import type { ChatMessage } from "@/ai/providers/types";
import { assistantSystem } from "@/ai/prompts";
import { communityDraftFixStream, communityReviewStream } from "./reviewStream";

/**
 * Community replacement for the streaming endpoints. Dispatches by path and emits
 * the SAME SSE events the cloud streams do, so the consuming UIs (chat, review)
 * are untouched. Chat uses `thinking`/`chunk`/`done`; the legal-tool streams use
 * the type-in-JSON `init`/`progress`/`result`/`done` shape.
 */
async function chatStream(body: unknown, opts: StreamHandlers): Promise<void> {
  const b = (body ?? {}) as { messages?: { role?: string; content?: string }[]; context?: string };
  const messages: ChatMessage[] = (b.messages ?? [])
    .filter((m): m is { role?: string; content: string } => typeof m?.content === "string")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const system = assistantSystem(b.context ?? "");

  opts.onEvent({ event: "thinking", data: JSON.stringify({ step: "generating" }) });

  try {
    const provider = getProvider();
    await provider.stream({ system, messages, signal: opts.signal }, (delta) => {
      opts.onEvent({ event: "chunk", data: JSON.stringify({ content: delta }) });
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    opts.onEvent({ event: "error", data: JSON.stringify({ message: errorMessage(e) }) });
    return;
  }

  opts.onEvent({ event: "done", data: JSON.stringify({}) });
}

export async function communityStream(
  path: string,
  body: unknown,
  opts: StreamHandlers,
): Promise<void> {
  if (path.startsWith("/api/v1/stream/chat")) return chatStream(body, opts);
  if (path.startsWith("/api/v1/legal-tools/contract-review/redline/draft-fix")) {
    return communityDraftFixStream(body, opts);
  }
  if (path.startsWith("/api/v1/legal-tools/contract-review/stream")) {
    return communityReviewStream(body, opts);
  }
  opts.onEvent({
    event: "error",
    data: JSON.stringify({ message: "This streaming feature is not available in the community edition." }),
  });
}
