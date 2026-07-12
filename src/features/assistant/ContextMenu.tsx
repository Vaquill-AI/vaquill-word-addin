import { useEffect } from "react";
import { CheckIcon } from "@/ui/icons";
import { ATTACH_ACCEPT } from "@/api/context";
import { AttachmentChips } from "./AttachmentChips";
import { MAX_ATTACHMENTS, type AttachedFile } from "./useAttachments";
import "./context-menu.css";

/**
 * Which grounding sources the assistant should draw on for the next question.
 * Each maps to a real backend lever on StreamChatRequest:
 *   web       -> enableWebSearch (Exa deep search)
 *   matterDocs-> enableMatterDocsSearch (the active matter's uploaded documents)
 *   corpus    -> useRag (the US case-law + statute corpus)
 * The open document / selection is always in scope (handled by FocusControl).
 */
export interface ContextConfig {
  web: boolean;
  matterDocs: boolean;
  corpus: boolean;
}

interface Source {
  key: keyof ContextConfig;
  label: string;
  blurb: string;
  /** Only offered when the user has an active matter. */
  needsMatter?: boolean;
}

const SOURCES: Source[] = [
  { key: "corpus", label: "US case law & statutes", blurb: "Ground answers in Vaquill's US legal corpus." },
  { key: "matterDocs", label: "My matter's documents", blurb: "Search the documents in your active matter.", needsMatter: true },
  { key: "web", label: "Web search", blurb: "Bring in current information from the web." },
];

/** Count of active sources, for the trigger badge. */
export function activeContextCount(config: ContextConfig, hasMatter: boolean): number {
  let n = 0;
  if (config.corpus) n += 1;
  if (config.web) n += 1;
  if (hasMatter && config.matterDocs) n += 1;
  return n;
}

/**
 * Popover for choosing the assistant's grounding sources. Renders as a small
 * sheet above the composer with a click-away backdrop and Escape-to-close.
 */
export function ContextMenu({
  config,
  onChange,
  hasMatter,
  attachments,
  onAttach,
  onRemoveAttachment,
  atCap,
  onClose,
}: {
  config: ContextConfig;
  onChange: (config: ContextConfig) => void;
  hasMatter: boolean;
  /** Files attached as ad-hoc context (uploaded + extracted server-side). */
  attachments: AttachedFile[];
  onAttach: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  /** True when the attachment count cap is reached (attach control disabled). */
  atCap: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = SOURCES.filter((s) => !s.needsMatter || hasMatter);

  return (
    <>
      <button
        type="button"
        className="ctx-menu__backdrop"
        aria-label="Close context sources"
        onClick={onClose}
      />
      <div className="ctx-menu" role="dialog" aria-modal="true" aria-label="Context sources">
        <div className="ctx-menu__head">
          <strong className="small">Add context</strong>
          <span className="small muted">What the assistant draws on</span>
        </div>
        {rows.map((s) => {
          const on = config[s.key];
          return (
            <button
              key={s.key}
              type="button"
              className={`ctx-source${on ? " ctx-source--on" : ""}`}
              role="switch"
              aria-checked={on}
              onClick={() => onChange({ ...config, [s.key]: !on })}
            >
              <span className="ctx-source__check" aria-hidden>
                {on && <CheckIcon size={12} />}
              </span>
              <span className="ctx-source__text">
                <span className="ctx-source__label">{s.label}</span>
                <span className="ctx-source__blurb small muted">{s.blurb}</span>
              </span>
            </button>
          );
        })}
        {!hasMatter && (
          <p className="ctx-menu__note small muted">
            Set an active matter in Settings to search its documents.
          </p>
        )}

        <div className="attach ctx-attach">
          <div className="attach__head">
            <span className="ctx-source__label">Attach files</span>
            <span className="small muted">Upload documents to ground this question</span>
          </div>

          <AttachmentChips files={attachments} onRemove={onRemoveAttachment} />

          <label className={`attach__add${atCap ? " attach__add--disabled" : ""}`}>
            <input
              type="file"
              accept={ATTACH_ACCEPT}
              multiple
              disabled={atCap}
              className="attach__input"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                for (const file of picked) onAttach(file);
                // Reset so re-picking the same file after removal fires onChange.
                e.target.value = "";
              }}
            />
            <span aria-hidden>+</span> Attach file
          </label>
          <p className="attach__hint small muted">
            {atCap
              ? `Attachment limit reached (${MAX_ATTACHMENTS} files).`
              : `PDF, Word, or text. Up to ${MAX_ATTACHMENTS} files.`}
          </p>
        </div>
      </div>
    </>
  );
}
