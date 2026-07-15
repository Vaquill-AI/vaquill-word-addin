import { useEffect, type ReactNode } from "react";
import { CheckIcon, FolderIcon, GlobeIcon, ScaleIcon, UploadIcon } from "@/ui/icons";
import { ATTACH_ACCEPT } from "@/api/context";
import { isCommunity } from "@/community/edition";
import { HOSTED_URL, LockIcon } from "@/ui/UpgradeGate";
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
  icon: ReactNode;
  /** Only offered when the user has an active matter. */
  needsMatter?: boolean;
}

const SOURCES: Source[] = [
  { key: "corpus", label: "US case law & statutes", icon: <ScaleIcon size={16} /> },
  { key: "matterDocs", label: "Matter documents", icon: <FolderIcon size={16} />, needsMatter: true },
  { key: "web", label: "Web search", icon: <GlobeIcon size={16} /> },
];

/** Count of active sources, for the trigger badge. */
export function activeContextCount(config: ContextConfig, hasMatter: boolean): number {
  // In the community/BYOK edition these sources are locked and never contribute,
  // so the "+" badge must not advertise them.
  if (isCommunity()) return 0;
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
  onOcrAttachment,
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
  /** Run the opt-in OCR pass for a scanned attachment. */
  onOcrAttachment: (id: string) => void;
  /** True when the attachment count cap is reached (attach control disabled). */
  atCap: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // These three sources (US corpus, matter documents, web search) all run on the
  // Vaquill AI backend/account. In the community/BYOK edition none of them apply,
  // so show them locked (rather than as live toggles that would silently do
  // nothing) and keep the attach-file section below, which works on-device.
  const community = isCommunity();
  const rows = community ? SOURCES : SOURCES.filter((s) => !s.needsMatter || hasMatter);

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
        </div>
        {rows.map((s) => {
          if (community) {
            return (
              <a
                key={s.key}
                className="ctx-source ctx-source--locked"
                href={HOSTED_URL}
                target="_blank"
                rel="noreferrer"
                title="Available on the Vaquill AI hosted plan"
              >
                <span className="ctx-source__icon" aria-hidden>
                  {s.icon}
                </span>
                <span className="ctx-source__label">{s.label}</span>
                <span className="ctx-source__check" aria-hidden>
                  <LockIcon size={13} />
                </span>
              </a>
            );
          }
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
              <span className="ctx-source__icon" aria-hidden>
                {s.icon}
              </span>
              <span className="ctx-source__label">{s.label}</span>
              <span className="ctx-source__check" aria-hidden>
                {on && <CheckIcon size={12} />}
              </span>
            </button>
          );
        })}
        {community ? (
          <p className="ctx-menu__note small muted">
            Case law, matter documents, and web search are on the Vaquill AI hosted plan. Attach a
            file below to add your own context.
          </p>
        ) : (
          !hasMatter && (
            <p className="ctx-menu__note small muted">Set an active matter to search its documents.</p>
          )
        )}

        <div className="ctx-attach">
          <AttachmentChips files={attachments} onRemove={onRemoveAttachment} onOcr={onOcrAttachment} />
          <div className="ctx-attach__row">
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
              <UploadIcon size={14} /> Attach file
            </label>
            <span className="small muted">
              {atCap ? `Limit reached (${MAX_ATTACHMENTS})` : `PDF, Word, text · up to ${MAX_ATTACHMENTS}`}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
