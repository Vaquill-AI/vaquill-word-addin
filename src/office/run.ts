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
