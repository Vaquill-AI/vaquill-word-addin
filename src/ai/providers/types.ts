/**
 * Provider-agnostic chat interface.
 *
 * One shape for every provider so the rest of the community code never branches
 * on which vendor is active. OpenAI and Anthropic adapters implement it today;
 * a Gemini adapter (via the optional self-host proxy) can be added later without
 * touching callers.
 */
export type ProviderId = "openai" | "anthropic";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * A file sent to the provider AS A FILE (not pre-extracted text): a PDF or an
 * image. Both OpenAI and Anthropic accept these natively and extract text +
 * page images themselves, which is the only way scanned PDFs work with no
 * backend. Office binaries (.docx/.doc) are NOT accepted by either provider, so
 * those are still extracted to text upstream and arrive as normal message text.
 * `dataBase64` is the raw file bytes, base64-encoded, with NO data: URI prefix
 * and no newlines. Attached to the LAST user message by each provider adapter.
 */
export interface ChatAttachment {
  name: string;
  /** MIME type, e.g. "application/pdf", "image/png". */
  mediaType: string;
  dataBase64: string;
}

export interface ChatRequest {
  /** System instruction. Sent as a system message (OpenAI) or the top-level
   *  `system` field (Anthropic). */
  system?: string;
  messages: ChatMessage[];
  /** Files (PDF / images) to attach to the last user message and send directly
   *  to the provider, which extracts their text + images itself. */
  attachments?: ChatAttachment[];
  /** Ask the model for a single JSON object (no prose, no code fences). */
  json?: boolean;
  /** Upper bound on output tokens. Required by Anthropic; omitted for OpenAI,
   *  whose default budget is large and whose param name varies by model. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
}

export interface LlmProvider {
  id: ProviderId;
  chat(req: ChatRequest): Promise<ChatResult>;
  stream(req: ChatRequest, onDelta: (text: string) => void): Promise<ChatResult>;
}
