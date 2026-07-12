/**
 * Read the entire open document as a .docx via the Office getFileAsync slice
 * API. Used to hand the actual Word file to the backend (save-as-template,
 * document compare), preserving tables, numbering, footnotes, and formatting
 * that `body.text` drops. Reads in slices and concatenates, so it works for
 * large documents.
 */

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Read the compressed (.docx) bytes of the open document as a single Uint8Array.
 * Shared by the base64 and Blob readers below so the slice-stitching logic lives
 * in one place.
 */
function readCompressedBytes(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(
      Office.FileType.Compressed,
      { sliceSize: 65536 },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error(result.error?.message ?? "Could not read the document file."));
          return;
        }
        const file = result.value;
        const slices: Uint8Array[] = new Array(file.sliceCount);
        let done = false;

        const fail = (message: string) => {
          if (done) return;
          done = true;
          file.closeAsync(() => {});
          reject(new Error(message));
        };

        const finish = () => {
          const total = slices.reduce((n, s) => n + s.length, 0);
          const all = new Uint8Array(total);
          let offset = 0;
          for (const s of slices) {
            all.set(s, offset);
            offset += s.length;
          }
          file.closeAsync(() => {});
          done = true;
          resolve(all);
        };

        // Fetch slices sequentially to keep memory and host load predictable.
        const getSlice = (index: number) => {
          if (done) return;
          file.getSliceAsync(index, (sliceResult) => {
            if (sliceResult.status !== Office.AsyncResultStatus.Succeeded) {
              fail(sliceResult.error?.message ?? "Could not read a slice of the document.");
              return;
            }
            const data = sliceResult.value.data as number[];
            slices[sliceResult.value.index] = new Uint8Array(data);
            if (index + 1 < file.sliceCount) getSlice(index + 1);
            else finish();
          });
        };
        getSlice(0);
      },
    );
  });
}

/** Read the open document as base64 .docx (for base64 insert / persist paths). */
export async function readDocumentBase64(): Promise<{ base64: string; filename: string }> {
  const all = await readCompressedBytes();
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < all.length; i += chunk) {
    binary += String.fromCharCode(...all.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), filename: "document.docx" };
}

/**
 * Read the open document as a .docx Blob, for multipart upload to the backend
 * (e.g. the compare `/uploads` endpoint). `filename` defaults to the open
 * document's own name where the host exposes it, falling back to "document.docx".
 */
export async function readDocumentBlob(): Promise<{ blob: Blob; filename: string }> {
  const all = await readCompressedBytes();
  // Copy into a fresh ArrayBuffer so the Blob does not alias the typed array's
  // backing store (which may be a larger pooled buffer on some hosts).
  const copy = new Uint8Array(all.length);
  copy.set(all);
  return { blob: new Blob([copy], { type: DOCX_MIME }), filename: openDocumentName() };
}

/** Best-effort name of the open document, ".docx"-normalized. Falls back safely. */
function openDocumentName(): string {
  const url = Office.context.document.url || "";
  const base = url.split(/[\\/]/).pop() || "";
  const name = base.trim();
  if (!name) return "document.docx";
  return /\.docx$/i.test(name) ? name : `${name.replace(/\.[^.]+$/, "")}.docx`;
}
