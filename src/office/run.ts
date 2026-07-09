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

export async function runWord<T>(fn: (context: Word.RequestContext) => Promise<T>): Promise<T> {
  try {
    return await Word.run(fn);
  } catch (e) {
    const err = e as { message?: string; code?: string };
    throw new OfficeError(err.message ?? "Word could not complete that action.", err.code);
  }
}
