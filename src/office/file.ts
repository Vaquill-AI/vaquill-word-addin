/**
 * Read the entire open document as a .docx, base64-encoded, via the Office
 * getFileAsync slice API. Used to hand the actual Word file to the platform
 * (e.g. save the open document as a template). This reads the file in slices and
 * concatenates them, so it works for large documents.
 */
export async function readDocumentBase64(): Promise<{ base64: string; filename: string }> {
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
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < all.length; i += chunk) {
            binary += String.fromCharCode(...all.subarray(i, i + chunk));
          }
          done = true;
          resolve({ base64: btoa(binary), filename: "document.docx" });
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
