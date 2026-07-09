import { config } from "@/config";
import { getAccessToken, refresh } from "@/auth/session";
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
}

async function buildHeaders(token: string, extra?: Record<string, string>): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    ...extra,
  };
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError("unauthorized", 401, "Not signed in.");

  const doFetch = async (bearer: string): Promise<Response> => {
    try {
      return await fetch(`${config.apiBase}${path}`, {
        method: opts.method ?? "GET",
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
