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

// Bits in DocumentProperties.security that mean the document blocks editing:
// 2 = always-open-read-only, 4 = read-only on disk, 8 = restrict-edit. (0 =
// read/write; bit 1 = encrypted, which alone does not block an open document.)
const SECURITY_EDIT_BLOCKED = 2 | 4 | 8;

/**
 * Best-effort, LANGUAGE-INDEPENDENT protection check: read the document's own
 * `security` state (WordApi 1.3, below our floor). The error-text match above is
 * English-only, so on a non-English Word a protected document throws a localized
 * GeneralException that "looksProtected" misses; this confirms it from the
 * document state instead. Reading a property is allowed even on a protected doc.
 * Never throws.
 */
async function documentLooksProtected(): Promise<boolean> {
  try {
    return await Word.run(async (context) => {
      const props = context.document.properties;
      props.load("security");
      await context.sync();
      return (props.security & SECURITY_EDIT_BLOCKED) !== 0;
    });
  } catch {
    return false;
  }
}

export async function runWord<T>(fn: (context: Word.RequestContext) => Promise<T>): Promise<T> {
  try {
    return await Word.run(fn);
  } catch (e) {
    // Preserve our own typed errors (AnchorNotFoundError, no_selection, etc.):
    // re-wrapping them would lose the subclass that callers switch on, and there
    // is no point probing the document's security state for an error we threw.
    if (e instanceof OfficeError) throw e;

    const err = e as { message?: string; code?: string };
    const code = err.code ?? "";
    const message = err.message ?? "";
    // Confirm protection from the error text, then (for a localized / opaque
    // GeneralException) from the document's own security state.
    if (looksProtected(code, message) || (await documentLooksProtected())) {
      throw new OfficeError(PROTECTED_DOC_MESSAGE, err.code);
    }
    throw new OfficeError(message || "Word could not complete that action.", err.code);
  }
}
