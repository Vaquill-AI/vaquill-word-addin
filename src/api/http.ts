import { config } from "@/config";
import { getAccessToken, refresh } from "@/auth/session";
import { getActiveOrgId } from "@/lib/org";
import { ApiError, errorFromResponse } from "./errors";

/**
 * Authenticated JSON fetch against the Vaquill backend.
 * Attaches the Supabase bearer, and on a 401 does a single silent
 * refresh-and-retry before surfacing an unauthorized error.
 */
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Extra headers, e.g. X-Organization-ID for org selection. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * Abort the request if it runs longer than this many milliseconds. Defaults
   * to {@link DEFAULT_TIMEOUT_MS}. Pass 0 to disable the timeout entirely (e.g.
   * a long-running upload). Composed with any caller-supplied `signal`, so
   * either the caller aborting or the deadline elapsing cancels the fetch.
   */
  timeoutMs?: number;
}

/** Default per-request wall-clock budget. Generous enough for the multi-LLM
 *  synchronous draft/review endpoints, short enough to fail fast when the
 *  network stalls. Callers can override per request via `timeoutMs`. */
export const DEFAULT_TIMEOUT_MS = 120_000;

interface ComposedAbort {
  signal: AbortSignal;
  cleanup: () => void;
  /** True once the internal deadline fired (vs a caller-initiated abort). */
  timedOut: () => boolean;
}

/**
 * Merge a caller signal with an internal timeout into a single AbortSignal.
 * Aborting either source aborts the returned signal. `cleanup()` must be called
 * once the request settles so the timer and listener never leak.
 */
function composeAbort(caller: AbortSignal | undefined, timeoutMs: number): ComposedAbort {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;

  const onCallerAbort = () => controller.abort();

  if (caller) {
    if (caller.aborted) {
      controller.abort();
    } else {
      caller.addEventListener("abort", onCallerAbort, { once: true });
    }
  }
  if (timeoutMs > 0 && !controller.signal.aborted) {
    timer = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer !== undefined) clearTimeout(timer);
      caller?.removeEventListener("abort", onCallerAbort);
    },
    timedOut: () => didTimeout,
  };
}

async function buildHeaders(token: string, extra?: Record<string, string>): Promise<HeadersInit> {
  const orgId = getActiveOrgId();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    // Scope every request to the chosen organization (matters, drafts,
    // playbooks, clients, templates). Omitted when no org is selected, letting
    // the backend resolve the user's default.
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
    ...extra,
  };
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError("unauthorized", 401, "Not signed in.");

  // One deadline spans the whole call, including a possible refresh-and-retry.
  const abort = composeAbort(opts.signal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const doFetch = async (bearer: string): Promise<Response> => {
    try {
      return await fetch(`${config.apiBase}${path}`, {
        method: opts.method ?? "GET",
        headers: await buildHeaders(bearer, opts.headers),
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: abort.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ApiError("network", 0, "Network request failed.");
    }
  };

  try {
    let res = await doFetch(token);
    if (res.status === 401) {
      const fresh = await refresh();
      if (!fresh) throw new ApiError("unauthorized", 401, "Session expired.");
      res = await doFetch(fresh);
    }

    if (!res.ok) throw await errorFromResponse(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (e) {
    // A deadline abort surfaces as an AbortError; translate it into a clear,
    // pass-through message. A caller-initiated abort keeps its AbortError so
    // callers can still detect their own cancellation.
    if ((e as Error).name === "AbortError" && abort.timedOut()) {
      throw new ApiError("unknown", 0, "The request timed out. Please try again.", "TIMEOUT");
    }
    throw e;
  } finally {
    abort.cleanup();
  }
}

/**
 * Authenticated multipart POST (e.g. uploading a .docx to become a template).
 * The browser sets the multipart Content-Type + boundary, so we must NOT set it.
 * Same single 401 refresh-and-retry as request().
 */
export async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError("unauthorized", 401, "Not signed in.");

  const doFetch = async (bearer: string): Promise<Response> => {
    try {
      const orgId = getActiveOrgId();
      return await fetch(`${config.apiBase}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          ...(orgId ? { "X-Organization-ID": orgId } : {}),
        },
        body: form,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ApiError("network", 0, "Network request failed.");
    }
  };

  let res = await doFetch(token);
  if (res.status === 401) {
    const fresh = await refresh();
    if (!fresh) throw new ApiError("unauthorized", 401, "Session expired.");
    res = await doFetch(fresh);
  }
  if (!res.ok) throw await errorFromResponse(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function filenameFromDisposition(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  return m ? m[1] : fallback;
}

/**
 * Authenticated fetch for a binary body (e.g. a returned .docx), returned as
 * base64 for Office.js insertFileFromBase64. Same 401 refresh-and-retry.
 */
export async function requestBinary(
  path: string,
  opts: RequestOptions = {},
): Promise<{ base64: string; filename: string }> {
  const token = await getAccessToken();
  if (!token) throw new ApiError("unauthorized", 401, "Not signed in.");

  const doFetch = async (bearer: string): Promise<Response> => {
    try {
      return await fetch(`${config.apiBase}${path}`, {
        method: opts.method ?? "POST",
        headers: await buildHeaders(bearer, opts.headers),
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ApiError("network", 0, "Network request failed.");
    }
  };

  let res = await doFetch(token);
  if (res.status === 401) {
    const fresh = await refresh();
    if (!fresh) throw new ApiError("unauthorized", 401, "Session expired.");
    res = await doFetch(fresh);
  }
  if (!res.ok) throw await errorFromResponse(res);

  const buf = await res.arrayBuffer();
  return {
    base64: arrayBufferToBase64(buf),
    filename: filenameFromDisposition(res, "vaquill-redlined.docx"),
  };
}
