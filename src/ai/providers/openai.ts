import { ApiError } from "@/api/errors";
import { readSse } from "./sse";
import type { ChatRequest, LlmProvider } from "./types";

/**
 * OpenAI adapter, browser-direct (BYOK). Uses the Chat Completions API.
 * The user's key is sent straight to api.openai.com and nowhere else.
 *
 * We deliberately do NOT send max_tokens or temperature: the param name and the
 * accepted temperature range differ across the current model families, and the
 * default budget is ample for our short structured prompts. Keeping the request
 * minimal avoids "unsupported parameter" rejections across models.
 */
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

function mapError(status: number, body: string): ApiError {
  if (status === 401)
    return new ApiError(
      "unauthorized",
      401,
      "Your OpenAI API key was rejected. Check it in Settings.",
      "INVALID_KEY",
    );
  if (status === 429)
    return new ApiError("rate_limited", 429, "OpenAI rate-limited this request. Wait a moment and try again.");
  if (status >= 500)
    return new ApiError("server", status, "OpenAI is unavailable right now. Please try again.");
  return new ApiError("invalid", status, body.slice(0, 300) || "OpenAI rejected the request.");
}

function messagesFor(req: ChatRequest): { role: string; content: string }[] {
  const out: { role: string; content: string }[] = [];
  if (req.system) out.push({ role: "system", content: req.system });
  for (const m of req.messages) out.push({ role: m.role, content: m.content });
  return out;
}

export function makeOpenAI(apiKey: string, model: string): LlmProvider {
  async function post(req: ChatRequest, stream: boolean): Promise<Response> {
    const body: Record<string, unknown> = { model, messages: messagesFor(req), stream };
    if (req.json) body.response_format = { type: "json_object" };
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ApiError("network", 0, "Cannot reach OpenAI. Check your connection.");
    }
    if (!res.ok) throw mapError(res.status, await res.text().catch(() => ""));
    return res;
  }

  return {
    id: "openai",
    async chat(req) {
      const res = await post(req, false);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return { text: data.choices?.[0]?.message?.content ?? "" };
    },
    async stream(req, onDelta) {
      const res = await post(req, true);
      if (!res.body) throw new ApiError("server", res.status, "OpenAI returned an empty stream.");
      let full = "";
      await readSse(res.body, (data) => {
        if (data === "[DONE]") return;
        try {
          const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
          const piece = j.choices?.[0]?.delta?.content;
          if (piece) {
            full += piece;
            onDelta(piece);
          }
        } catch {
          // Keepalive or partial frame; ignore.
        }
      });
      return { text: full };
    },
  };
}
