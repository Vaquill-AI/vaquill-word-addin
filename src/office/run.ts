/**
 * Thin wrappers around Word.run with consistent error handling.
 * All document work goes through here so failures surface uniformly and never
 * block the UI thread long enough for Office to restart the add-in.
 */
export class OfficeError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "OfficeError";
    this.code = code;
  }
}

export function isWordHost(): boolean {
  return (
    typeof Office !== "undefined" &&
    Office.context?.host === Office.HostType.Word
  );
}

// Serializes operations that flip the document's change-tracking mode. Each such
// op saves the current mode, forces its own (trackAll for a redline, off for a
// clean edit/redact), then restores. If two overlapped, the second would capture
// the FIRST op's forced mode as its "prior" and, on restore, could leave the
// document with tracking OFF - so later edits would go untracked, which for a
// redline tool is a real correctness/safety hole. Running them one at a time
// guarantees each captures the true pre-op mode. Rejections are swallowed from
// the chain so a single failed op never wedges the queue.
let trackChain: Promise<unknown> = Promise.resolve();

export function serializeTrackChanges<T>(fn: () => Promise<T>): Promise<T> {
  const run = trackChain.then(fn, fn);
  trackChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Message shown when the document is protected or read-only. Office surfaces
// this as AccessDenied, or occasionally as a GeneralException whose message
// mentions permission/protection, so we match on both the code and the text.
const PROTECTED_DOC_MESSAGE =
  "This document is protected or read-only, so changes cannot be applied. Turn off editing restrictions in Word (Review > Restrict Editing) and try again.";

function looksProtected(code: string, message: string): boolean {
  if (code === "AccessDenied") return true;
  const haystack = `${code} ${message}`.toLowerCase();
  return (
    haystack.includes("accessdenied") ||
    haystack.includes("access denied") ||
    haystack.includes("permission") ||
    haystack.includes("protect") ||
    haystack.includes("read-only") ||
    haystack.includes("read only") ||
    haystack.includes("readonly")
  );
}

/**
 * True when an Office error indicates the document is protected/read-only. A
 * caller that swallows per-item failures (e.g. a redact/fill loop) can use this
 * to re-throw instead, so runWord surfaces the clean "Restrict Editing" message
 * rather than silently reporting the value as "not found" - which for a
 * redaction tool is a data-leak-grade wrong signal.
 */
export function isProtectionError(e: unknown): boolean {
  const err = e as { message?: string; code?: string } | null;
  return looksProtected(err?.code ?? "", err?.message ?? "");
}

export async function runWord<T>(fn: (context: Word.RequestContext) => Promise<T>): Promise<T> {
  try {
    return await Word.run(fn);
  } catch (e) {
    const err = e as { message?: string; code?: string };
    const code = err.code ?? "";
    const message = err.message ?? "";
    if (looksProtected(code, message)) {
      throw new OfficeError(PROTECTED_DOC_MESSAGE, err.code);
    }
    throw new OfficeError(message || "Word could not complete that action.", err.code);
  }
}
