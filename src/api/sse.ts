import { config } from "@/config";
import { getAccessToken, refresh } from "@/auth/session";
import { getActiveOrgId } from "@/lib/org";
import { ApiError, errorFromResponse } from "./errors";
import { isCommunity } from "@/community/edition";

/**
 * POST + Server-Sent-Events reader for the Vaquill AI streaming endpoints.
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
        ...(getActiveOrgId() ? { "X-Organization-ID": getActiveOrgId() as string } : {}),
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

// No bytes at all (not even a heartbeat) for this long means the connection has
// gone half-open (Wi-Fi/cellular handoff, sleep/resume, a proxy holding the
// socket). Without this, reader.read() below can hang forever and leave the
// review/chat UI stuck "streaming" with no error. The backend sends `:`
// heartbeats well inside this window, so a healthy stream never trips it.
const STREAM_IDLE_TIMEOUT_MS = 60_000;

/** reader.read() raced against an idle deadline. On timeout the outer finally
 *  cancels the reader, settling the still-pending read. */
function readWithIdleTimeout<T>(read: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ApiError("network", 0, "The response stalled. Please retry.")),
      ms,
    );
    read.then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function postStream(path: string, body: unknown, opts: StreamHandlers): Promise<void> {
  if (isCommunity()) {
    const { communityStream } = await import("@/community/localStream");
    return communityStream(path, body, opts);
  }
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
    const data = dataLines.join("\n");
    // The legal-tool streams (contract-review, etc.) do NOT emit an SSE
    // `event:` line - they carry the event name inside the JSON payload as
    // `{"type": "...", ...}` (see backend legal_tools_streaming._sse_event). When
    // no explicit event line was present, recover the event from the payload so
    // consumers can dispatch and `done` is detected. The chat stream sends real
    // `event:` lines, so this only affects the type-in-data streams.
    if (event === "message") {
      try {
        const parsed = JSON.parse(data) as { type?: unknown };
        if (typeof parsed.type === "string") event = parsed.type;
      } catch {
        // Not JSON (or not a typed payload); leave as "message".
      }
    }
    if (event === "done") sawDone = true;
    opts.onEvent({ event, data });
  };

  // The read loop can exit via a truncation throw (or an event-driven throw in
  // a consuming callback). Any of those paths must still release the stream
  // reader, otherwise res.body stays locked and the connection cannot be reused
  // or cleanly cancelled. The try/finally below guarantees release without
  // changing the truncation-throw behavior or any event/callback timing.
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await readWithIdleTimeout(reader.read(), STREAM_IDLE_TIMEOUT_MS);
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
