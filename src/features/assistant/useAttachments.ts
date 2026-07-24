import { useCallback, useRef, useState } from "react";
import { uuid } from "@/api/ids";
import { errorMessage } from "@/api/errors";

/**
 * One file the user attached as ad-hoc context. Upload/extraction happens on the
 * backend (the add-in can't parse PDF/DOCX), so a file moves reading -> ready or
 * reading -> error. What "ready" carries depends on the uploader: chat attaches
 * inline `text`; drafting uploads a reference doc and keeps its `refId`.
 */
export interface AttachedFile {
  id: string;
  name: string;
  /** File size in bytes. Kept so `remove` can rebuild the exact `name:size`
   *  dedupe key; without it, re-adding a previously removed file was silently
   *  ignored (the key was added as `name:size` but deleted as `name`). */
  size?: number;
  /** `needs_ocr` = extraction found no text but the file can be OCR'd on demand;
   *  `ocr` = an OCR pass is running. */
  status: "reading" | "ready" | "error" | "needs_ocr" | "ocr";
  /** Character/word count to show on the chip (ready only). */
  chars?: number;
  truncated?: boolean;
  /** Extracted inline text (chat context). */
  text?: string;
  /** Community edition: a file (PDF) sent straight to the LLM provider instead
   *  of extracted to text -- raw bytes base64-encoded plus MIME type. When set,
   *  `text` is empty and the file rides the request as a provider attachment. */
  fileData?: string;
  mediaType?: string;
  /** Uploaded reference-document id (drafting grounding). */
  refId?: string;
  error?: string;
}

/** What an uploader resolves to once a file has been processed on the backend.
 *  `needsOcr` signals the file extracted to nothing but can be recovered with an
 *  opt-in OCR pass (the caller must supply an `onOcr` resolver). */
export type UploadResult = Pick<
  AttachedFile,
  "text" | "chars" | "truncated" | "refId" | "fileData" | "mediaType"
> & {
  needsOcr?: boolean;
};
export type Uploader = (file: File) => Promise<UploadResult>;

/** Cap on how many files can be attached at once (matches competitor limits). */
export const MAX_ATTACHMENTS = 5;

/**
 * Manage attached-file context: add (process on the backend via the injected
 * `upload`), remove, and clear. Enforces the count cap and dedupes by name+size
 * so the same file is not attached twice. The list is the single source of
 * truth; callers read `ready` files via `contextFiles()` (inline text) or
 * `refIds()` (reference-doc ids) at send time.
 */
export function useAttachments(upload: Uploader, onOcr?: Uploader) {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  // Track name+size keys already added so a repeat pick is ignored, without
  // waiting on a state read.
  const seen = useRef<Set<string>>(new Set());
  // Retain the File for any attachment that reported needsOcr, so an opt-in OCR
  // pass can run later without re-picking. Kept out of render state and cleared
  // once resolved or removed.
  const pending = useRef<Map<string, File>>(new Map());

  const patch = useCallback((id: string, next: Partial<AttachedFile>) => {
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...next } : f)));
  }, []);

  const add = useCallback(
    async (file: File) => {
      const key = `${file.name}:${file.size}`;
      if (seen.current.has(key)) return;
      // Enforce the cap against the live list length + already-queued adds.
      let rejected = false;
      setFiles((list) => {
        if (list.length >= MAX_ATTACHMENTS) {
          rejected = true;
          return list;
        }
        return list;
      });
      if (rejected) return;
      seen.current.add(key);

      const id = uuid();
      setFiles((list) => [...list, { id, name: file.name, size: file.size, status: "reading" }]);
      try {
        const res = await upload(file);
        // Empty extraction on an OCR-able file: hold the File and let the user
        // opt into OCR from the chip, rather than silently attaching nothing.
        if (res.needsOcr && onOcr) {
          pending.current.set(id, file);
          patch(id, { status: "needs_ocr" });
        } else {
          patch(id, { status: "ready", ...res });
        }
      } catch (e) {
        const error = errorMessage(e);
        patch(id, { status: "error", error });
      }
    },
    [patch, upload, onOcr],
  );

  // Run the opt-in OCR pass for an attachment the extractor could not read.
  const ocr = useCallback(
    async (id: string) => {
      const file = pending.current.get(id);
      if (!file || !onOcr) return;
      patch(id, { status: "ocr", error: undefined });
      try {
        const res = await onOcr(file);
        pending.current.delete(id);
        if (res.text?.trim()) patch(id, { status: "ready", ...res });
        else patch(id, { status: "error", error: "OCR could not read this document." });
      } catch (e) {
        const error = errorMessage(e);
        patch(id, { status: "error", error });
      }
    },
    [patch, onOcr],
  );

  const remove = useCallback((id: string) => {
    pending.current.delete(id);
    setFiles((list) => {
      const gone = list.find((f) => f.id === id);
      // Rebuild the SAME `name:size` key that `add` registered, so removing a
      // file also frees it to be re-added later.
      if (gone) seen.current.delete(`${gone.name}:${gone.size}`);
      return list.filter((f) => f.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    seen.current.clear();
    pending.current.clear();
    setFiles([]);
  }, []);

  /** Ready files for the next chat turn, in attach order. Each is either inline
   *  text (docx / txt / md, extracted) or a provider file (a PDF carried as raw
   *  bytes). A file with neither is not ready context, so it is excluded. */
  const contextFiles = useCallback(
    (): { name: string; text: string; fileData?: string; mediaType?: string }[] =>
      files
        .filter((f) => f.status === "ready" && (f.text || f.fileData))
        .map((f) => ({
          name: f.name,
          text: f.text ?? "",
          fileData: f.fileData,
          mediaType: f.mediaType,
        })),
    [files],
  );

  /** Ready reference-document ids, in attach order (drafting grounding). */
  const refIds = useCallback(
    (): string[] =>
      files.filter((f) => f.status === "ready" && f.refId).map((f) => f.refId as string),
    [files],
  );

  const readyCount = files.filter((f) => f.status === "ready").length;

  return {
    files,
    add,
    remove,
    clear,
    ocr,
    contextFiles,
    refIds,
    readyCount,
    atCap: files.length >= MAX_ATTACHMENTS,
  };
}
