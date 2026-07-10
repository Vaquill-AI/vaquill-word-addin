import { config } from "@/config";
import { getAccessToken, refresh } from "@/auth/session";
import { ApiError, errorFromResponse } from "./errors";

/**
 * POST + Server-Sent-Events reader for the Vaquill streaming endpoints.
 *
 * The backend streams `init -> progress -> result -> done` (plus `error`).
 * EventSource cannot POST or set Authorization, so we read the body stream
 * ourselves. Parsing is CRLF-safe because Office often runs on Windows behind
 * proxies that deliver `\r\n` and buffer output.
 */
export interface SseEvent {
  event: string;
  data: string;
}

export interface StreamHandlers {
  onEvent: (evt: SseEvent) => void;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function openStream(path: string, body: unknown, bearer: string, opts: StreamHandlers): Promise<Response> {
  try {
    return await fetch(`${config.apiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        ...opts.headers,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("network", 0, "Network request failed.");
  }
}

export async function postStream(path: string, body: unknown, opts: StreamHandlers): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new ApiError("unauthorized", 401, "Not signed in.");

  let res = await openStream(path, body, token, opts);
  if (res.status === 401) {
    const fresh = await refresh();
    if (!fresh) throw new ApiError("unauthorized", 401, "Session expired.");
    res = await openStream(path, body, fresh, opts);
  }
  // Quota / size gates return a non-200 before the stream begins.
  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) throw new ApiError("server", res.status, "Empty response stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  const flushBlock = (block: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const raw of block.split("\n")) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (line.startsWith(":")) continue; // comment / heartbeat
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (dataLines.length === 0) return;
    if (event === "done") sawDone = true;
    opts.onEvent({ event, data: dataLines.join("\n") });
  };

  // The read loop can exit via a truncation throw (or an event-driven throw in
  // a consuming callback). Any of those paths must still release the stream
  // reader, otherwise res.body stays locked and the connection cannot be reused
  // or cleanly cancelled. The try/finally below guarantees release without
  // changing the truncation-throw behavior or any event/callback timing.
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      // Events are separated by a blank line; tolerate \n\n and \r\n\r\n.
      while ((sep = indexOfBlankLine(buffer)) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sepEnd(buffer, sep));
        flushBlock(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) flushBlock(buffer);

    // A stream that ends without `done` is a truncation (proxy buffering, drop).
    if (!sawDone && !opts.signal?.aborted) {
      throw new ApiError("network", 0, "The response ended before it completed. Please retry.");
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader may already be closed/errored; cancellation is best-effort.
    }
    try {
      reader.releaseLock();
    } catch {
      // Lock may already be released; ignore.
    }
  }
}

function indexOfBlankLine(s: string): number {
  const a = s.indexOf("\n\n");
  const b = s.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function sepEnd(s: string, idx: number): number {
  return s.startsWith("\r\n\r\n", idx) ? idx + 4 : idx + 2;
}
