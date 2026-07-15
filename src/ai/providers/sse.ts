/**
 * Minimal Server-Sent-Events body reader shared by the provider adapters.
 *
 * Both OpenAI and Anthropic stream `data:` lines (Anthropic also emits `event:`
 * lines, which we ignore because the payload type is inside the JSON). We invoke
 * `onData` with each `data:` payload, trimmed. CRLF-safe for Office on Windows.
 */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (line.startsWith("data:")) onData(line.slice(5).trim());
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Best effort; the reader may already be closed.
    }
  }
}
