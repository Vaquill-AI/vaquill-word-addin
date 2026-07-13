import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { IconButton } from "@/ui/primitives";
import { StopIcon, WandIcon } from "@/ui/icons";
import { FocusControl } from "./FocusControl";
import { PromptLibrary } from "./PromptLibrary";
import { ContextMenu, activeContextCount, type ContextConfig } from "./ContextMenu";
import { AttachmentChips } from "./AttachmentChips";
import type { AttachedFile } from "./useAttachments";
import type { Scope } from "./useAssistant";

export interface ComposerHandle {
  focus: () => void;
}

/** "+" add-context trigger (Harvey's composer language) — opens the sources menu. */
function PlusGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Send: an arrow-up glyph inside a circular black button (modern-chat pattern). */
function ArrowUpGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export type ComposerMode = "ask" | "edit";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled: boolean;
  /** Ask (chat) vs Edit (describe a change, get redlines). Tabs live in the
   *  composer so switching never leaves the input. */
  mode: ComposerMode;
  onMode: (mode: ComposerMode) => void;
  scope: Scope;
  onScope: (scope: Scope) => void;
  context: ContextConfig;
  onContextChange: (config: ContextConfig) => void;
  hasMatter: boolean;
  attachments: AttachedFile[];
  onAttach: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
  onOcrAttachment: (id: string) => void;
  atCap: boolean;
}

/**
 * Assistant composer. Text is controlled by the parent so other surfaces (the
 * prompt library, edit-and-re-run) can write into it. Exposes an imperative
 * `focus()` for callers that need to place the caret after setting the draft.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    value,
    onChange,
    onSend,
    onStop,
    disabled,
    mode,
    onMode,
    scope,
    onScope,
    context,
    onContextChange,
    hasMatter,
    attachments,
    onAttach,
    onRemoveAttachment,
    onOcrAttachment,
    atCap,
  },
  ref,
) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Ready attachments count toward the "+" badge alongside the toggled sources.
  const readyAttachments = attachments.filter((f) => f.status === "ready").length;
  const ctxCount = activeContextCount(context, hasMatter) + readyAttachments;

  function focusEnd() {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }

  useImperativeHandle(ref, () => ({ focus: focusEnd }), []);

  function submit() {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    onChange("");
  }

  function usePrompt(body: string) {
    onChange(body);
    requestAnimationFrame(focusEnd);
  }

  return (
    <div className="composer">
      {libraryOpen && (
        <PromptLibrary onClose={() => setLibraryOpen(false)} onUse={usePrompt} seedBody={value} />
      )}
      {contextOpen && (
        <ContextMenu
          config={context}
          onChange={onContextChange}
          hasMatter={hasMatter}
          attachments={attachments}
          onAttach={onAttach}
          onRemoveAttachment={onRemoveAttachment}
          onOcrAttachment={onOcrAttachment}
          atCap={atCap}
          onClose={() => setContextOpen(false)}
        />
      )}
      <div className="composer__box">
        <div
          role="tablist"
          aria-label="Assistant mode"
          style={{ display: "flex", gap: 4, marginBottom: 6 }}
        >
          {(["ask", "edit"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => onMode(m)}
              style={{
                border: "none",
                background: mode === m ? "var(--fill-subtle-hover)" : "transparent",
                color: mode === m ? "var(--text)" : "var(--text-muted)",
                fontWeight: 600,
                fontSize: 12,
                padding: "3px 10px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              {m === "ask" ? "Ask" : "Edit"}
            </button>
          ))}
        </div>
        {mode === "ask" && <FocusControl scope={scope} onScope={onScope} />}
        {attachments.length > 0 && (
          <AttachmentChips
            files={attachments}
            onRemove={onRemoveAttachment}
            onOcr={onOcrAttachment}
            compact
          />
        )}
        <textarea
          ref={taRef}
          value={value}
          aria-label={mode === "edit" ? "Describe a change to the document" : "Ask about this contract"}
          placeholder={
            mode === "edit" ? "Describe a change to the document..." : "Ask about this contract..."
          }
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer__actions">
          <span className="composer__ctx-trigger">
            <IconButton
              label={`Add context${ctxCount > 0 ? ` (${ctxCount} on)` : ""}`}
              onClick={() => setContextOpen((v) => !v)}
              active={contextOpen}
            >
              <PlusGlyph />
            </IconButton>
            {ctxCount > 0 && (
              <span className="composer__ctx-badge" aria-hidden>
                {ctxCount}
              </span>
            )}
          </span>
          <IconButton
            label="Prompt library"
            onClick={() => setLibraryOpen((v) => !v)}
            active={libraryOpen}
          >
            <WandIcon size={16} />
          </IconButton>
          <span className="composer__spacer" />
          {disabled && onStop ? (
            <button
              type="button"
              className="composer__send composer__send--stop"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop"
            >
              <StopIcon size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="composer__send"
              onClick={submit}
              disabled={disabled || !value.trim()}
              aria-label="Send"
              title="Send"
            >
              <ArrowUpGlyph />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
