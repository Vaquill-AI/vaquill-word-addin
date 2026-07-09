/**
 * Typed API errors mapped from the Vaquill backend error contract.
 * Lets the UI show precise states (quota, document too large, no access)
 * instead of a generic failure.
 */
export type ApiErrorKind =
  | "unauthorized" // 401, triggers one refresh + retry
  | "quota" // 402 quota / subscription
  | "too_large" // 413 document_too_large
  | "not_found" // 404 (matter access or missing)
  | "invalid" // 400 / 422
  | "rate_limited" // 429
  | "server" // 5xx
  | "network" // fetch threw / offline
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly detail?: unknown;

  constructor(kind: ApiErrorKind, status: number, message: string, code?: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function kindFor(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return "unauthorized";
    case 402:
      return "quota";
    case 413:
      return "too_large";
    case 404:
      return "not_found";
    case 400:
    case 422:
      return "invalid";
    case 429:
      return "rate_limited";
    default:
      return status >= 500 ? "server" : "unknown";
  }
}

/** Build an ApiError from a non-2xx Response, reading the JSON detail once. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown = undefined;
  let code: string | undefined;
  let message = `Request failed (${res.status})`;
  try {
    body = await res.json();
    const detail = (body as { detail?: unknown })?.detail ?? body;
    if (detail && typeof detail === "object") {
      code = (detail as { error_code?: string }).error_code;
      const m = (detail as { message?: string; error?: string }).message ??
        (detail as { error?: string }).error;
      if (m) message = m;
    } else if (typeof detail === "string") {
      message = detail;
    }
  } catch {
    // Body was not JSON; keep the default message.
  }
  return new ApiError(kindFor(res.status), res.status, message, code, body);
}

export function friendlyMessage(err: ApiError): string {
  switch (err.kind) {
    case "quota":
      return "You have reached your usage limit for this plan. Open Vaquill to upgrade or wait for your quota to reset.";
    case "too_large":
      return "This document is too large to review in full. Try selecting the section you want reviewed.";
    case "not_found":
      return "You do not have access to that matter, or it no longer exists.";
    case "rate_limited":
      return "Too many requests right now. Please wait a moment and try again.";
    case "network":
      return "Cannot reach Vaquill. Check your connection and try again.";
    case "server":
      return "Vaquill had a problem completing that. Please try again.";
    default:
      return err.message || "Something went wrong. Please try again.";
  }
}
