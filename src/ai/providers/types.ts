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

export interface ChatRequest {
  /** System instruction. Sent as a system message (OpenAI) or the top-level
   *  `system` field (Anthropic). */
  system?: string;
  messages: ChatMessage[];
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
