import { errorMessage } from "@/api/errors";
import type { StreamHandlers } from "@/api/sse";
import { getProvider } from "@/ai/providers/registry";
import type { ChatAttachment, ChatMessage } from "@/ai/providers/types";
import { assistantSystem } from "@/ai/prompts";
import { communityDraftFixStream, communityReviewStream } from "./reviewStream";
import { communityEditDocument } from "./localRouter";

/**
 * Community replacement for the streaming endpoints. Dispatches by path and emits
 * the SAME SSE events the cloud streams do, so the consuming UIs (chat, review)
 * are untouched. Chat uses `thinking`/`chunk`/`done`; the legal-tool streams use
 * the type-in-JSON `init`/`progress`/`result`/`done` shape.
 */
async function chatStream(body: unknown, opts: StreamHandlers): Promise<void> {
  const b = (body ?? {}) as {
    messages?: { role?: string; content?: string }[];
    context?: string;
    attachments?: ChatAttachment[];
  };
  const messages: ChatMessage[] = (b.messages ?? [])
    .filter((m): m is { role?: string; content: string } => typeof m?.content === "string")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const system = assistantSystem(b.context ?? "");
  // Files (PDFs) the user attached, sent straight to the provider as a document.
  const attachments = Array.isArray(b.attachments) ? b.attachments : undefined;

  opts.onEvent({ event: "thinking", data: JSON.stringify({ step: "generating" }) });

  try {
    const provider = getProvider();
    await provider.stream({ system, messages, attachments, signal: opts.signal }, (delta) => {
      opts.onEvent({ event: "chunk", data: JSON.stringify({ content: delta }) });
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    opts.onEvent({ event: "error", data: JSON.stringify({ message: errorMessage(e) }) });
    return;
  }

  opts.onEvent({ event: "done", data: JSON.stringify({}) });
}

/**
 * Community edit stream. BYOK is a single model with no server fan-out, so this
 * runs the one grounded edit call and then emits the same `meta` / `edit` /
 * `summary` events the cloud stream does, so the Assistant Edit UI is identical.
 * Not token-incremental (the cloud isn't either -- it streams per SECTION), but
 * it satisfies the contract and keeps the spinner honest.
 */
async function editStream(body: unknown, opts: StreamHandlers): Promise<void> {
  opts.onEvent({ event: "meta", data: JSON.stringify({ sections: 0 }) });
  try {
    const result = await communityEditDocument((body ?? {}) as Record<string, unknown>);
    for (const edit of result.edits) {
      if (opts.signal?.aborted) return;
      opts.onEvent({ event: "edit", data: JSON.stringify({ edit }) });
    }
    opts.onEvent({
      event: "summary",
      data: JSON.stringify({
        overview: result.overview,
        summary: result.summary,
        count: result.edits.length,
      }),
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
  if (path.startsWith("/api/v1/drafting/edit-document/stream")) return editStream(body, opts);
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
