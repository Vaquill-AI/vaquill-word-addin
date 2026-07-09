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
  a.click();
  URL.revokeObjectURL(url);
}
