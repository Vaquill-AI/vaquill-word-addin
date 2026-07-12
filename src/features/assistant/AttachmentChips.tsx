import { Spinner } from "@/ui/primitives";
import { CheckIcon, XIcon } from "@/ui/icons";
import type { AttachedFile } from "./useAttachments";
import "@/ui/attachments.css";

/**
 * Removable chips for attached context files, shared by the context menu (full,
 * with char counts) and the composer's always-visible row (compact). Each chip
 * shows extraction status: a spinner while reading, a check + size once ready, or
 * the error inline if extraction failed.
 */
export function AttachmentChips({
  files,
  onRemove,
  compact = false,
}: {
  files: AttachedFile[];
  onRemove: (id: string) => void;
  compact?: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <ul className={`attach__list${compact ? " attach__list--compact" : ""}`}>
      {files.map((f) => (
        <li key={f.id} className={`attach__chip attach__chip--${f.status}`}>
          <span className="attach__icon" aria-hidden>
            {f.status === "reading" ? (
              <Spinner />
            ) : f.status === "ready" ? (
              <CheckIcon size={12} />
            ) : (
              "!"
            )}
          </span>
          <span className="attach__text">
            <span className="attach__name" title={f.name}>
              {f.name}
            </span>
            {!compact && f.status === "reading" && <span className="small muted">Reading...</span>}
            {!compact && f.status === "ready" && typeof f.chars === "number" && (
              <span className="small muted">
                {f.chars.toLocaleString()} chars{f.truncated ? " (truncated)" : ""}
              </span>
            )}
            {f.status === "error" && (
              <span className="small attach__error">
                {f.error ?? "Could not read this file."}
              </span>
            )}
          </span>
          <button
            type="button"
            className="attach__remove"
            aria-label={`Remove ${f.name}`}
            onClick={() => onRemove(f.id)}
          >
            <XIcon size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
