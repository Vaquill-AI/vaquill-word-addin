import { useCallback, useRef, useState } from "react";
import { uuid } from "@/api/ids";
import { ApiError, friendlyMessage } from "@/api/errors";

/**
 * One file the user attached as ad-hoc context. Upload/extraction happens on the
 * backend (the add-in can't parse PDF/DOCX), so a file moves reading -> ready or
 * reading -> error. What "ready" carries depends on the uploader: chat attaches
 * inline `text`; drafting uploads a reference doc and keeps its `refId`.
 */
export interface AttachedFile {
  id: string;
  name: string;
  status: "reading" | "ready" | "error";
  /** Character/word count to show on the chip (ready only). */
  chars?: number;
  truncated?: boolean;
  /** Extracted inline text (chat context). */
  text?: string;
  /** Uploaded reference-document id (drafting grounding). */
  refId?: string;
  error?: string;
}

/** What an uploader resolves to once a file has been processed on the backend. */
export type UploadResult = Pick<AttachedFile, "text" | "chars" | "truncated" | "refId">;
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
export function useAttachments(upload: Uploader) {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  // Track name+size keys already added so a repeat pick is ignored, without
  // waiting on a state read.
  const seen = useRef<Set<string>>(new Set());

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
      setFiles((list) => [...list, { id, name: file.name, status: "reading" }]);
      try {
        const res = await upload(file);
        patch(id, { status: "ready", ...res });
      } catch (e) {
        const error = e instanceof ApiError ? friendlyMessage(e) : (e as Error).message;
        patch(id, { status: "error", error });
      }
    },
    [patch, upload],
  );

  const remove = useCallback((id: string) => {
    setFiles((list) => {
      const gone = list.find((f) => f.id === id);
      if (gone) seen.current.delete(`${gone.name}`); // best-effort; size unknown here
      return list.filter((f) => f.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    seen.current.clear();
    setFiles([]);
  }, []);

  /** Ready files with inline text, in attach order (chat send context). */
  const contextFiles = useCallback(
    (): { name: string; text: string }[] =>
      files
        .filter((f) => f.status === "ready" && f.text)
        .map((f) => ({ name: f.name, text: f.text as string })),
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
    contextFiles,
    refIds,
    readyCount,
    atCap: files.length >= MAX_ATTACHMENTS,
  };
}
