import { runWord } from "./run";

/**
 * Replace the open document with the server-generated tracked-changes .docx.
 * Used for the "Accept via Vaquill AI" and "Accept all" paths, where authorship
 * is stamped "Vaquill AI Contract Review" and revisions are written natively so
 * the recipient can Accept/Reject in Word's Review tab.
 */
export async function replaceDocumentWithDocx(base64: string): Promise<void> {
  return runWord(async (context) => {
    context.document.body.insertFileFromBase64(base64, Word.InsertLocation.replace);
    await context.sync();
  });
}

/**
 * Insert a .docx (base64) at the user's cursor, preserving its formatting, and
 * select it so Word scrolls it into view. Used to drop a firm template into the
 * open document. Inserted as clean content (not a tracked change): a template is
 * new authored material, not an edit to review.
 */
export async function insertDocxAtCursor(base64: string): Promise<void> {
  return runWord(async (context) => {
    const range = context.document
      .getSelection()
      .insertFileFromBase64(base64, Word.InsertLocation.after);
    range.select();
    await context.sync();
  });
}

/**
 * Insert a .docx at the cursor, falling back to a browser download when the host
 * cannot insert a file in place. insertFileFromBase64 is not supported on all
 * hosts (notably Word on the web), where it throws; rather than surface a raw
 * error and leave the user with nothing, we hand them the file as a download.
 * Returns how the template was delivered so the UI can message it.
 */
export async function insertDocxAtCursorOrDownload(
  base64: string,
  filename: string,
): Promise<"inserted" | "downloaded"> {
  try {
    await insertDocxAtCursor(base64);
    return "inserted";
  } catch {
    // Host cannot insert a file in place (e.g. Word on the web). Deliver the
    // template as a download instead of failing outright.
    downloadDocx(base64, filename);
    return "downloaded";
  }
}

/** Trigger a browser download of the returned .docx as a fallback to inserting it. */
export function downloadDocx(base64: string, filename: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // The anchor must be in the DOM for the click to register in some hosts, and
  // in Office's Edge WebView2 host a synchronous revokeObjectURL after click
  // can abort the download stream. Defer cleanup to the next tick so the host
  // has picked up the blob first.
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Nothing to recover: revoking is best-effort cleanup.
    }
    try {
      a.remove();
    } catch {
      // Anchor may already be detached; ignore.
    }
  }, 0);
}
