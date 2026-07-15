import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { IconButton, SegmentedControl, Spinner } from "@/ui/primitives";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { StopIcon, WandIcon } from "@/ui/icons";
import { useImprovePrompt } from "@/lib/useImprovePrompt";
import { improveChatPrompt, improveDraftingPrompt } from "@/api/improve-prompt";
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

/** Sparkles glyph for the "Improve" affordance (distinct from the prompt-library
 *  wand). Signals an AI rewrite of the current input. 14px to match the sibling
 *  Prompts glyph in the same labeled-tool row. */
function SparklesGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6 12 3z" />
      <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  );
}

/** Microphone glyph for voice dictation. */
function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
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
  // Improve is mode-aware: an Edit turn is a drafting-style instruction, an Ask
  // turn is a research question, so each routes to its own improver.
  const improve = useImprovePrompt(
    mode === "edit" ? improveDraftingPrompt : improveChatPrompt,
    value,
    onChange,
  );
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

  // Voice dictation: transcript is appended after whatever the user already
  // typed (captured when recording starts), so speaking never wipes the draft.
  const micBaseRef = useRef("");
  const voice = useVoiceInput((t) => {
    const base = micBaseRef.current;
    onChange(base ? `${base} ${t}` : t);
  });
  function toggleMic() {
    if (voice.listening) {
      voice.stop();
      return;
    }
    micBaseRef.current = value.trim();
    voice.start();
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
      <div className="composer__box" data-tour="composer">
        {improve.note && <span className="composer__improve-note small muted">{improve.note}</span>}
        {attachments.length > 0 && (
          <AttachmentChips
            files={attachments}
            onRemove={onRemoveAttachment}
            onOcr={onOcrAttachment}
            compact
          />
        )}
        <AutoTextarea
          ref={taRef}
          value={value}
          aria-label={mode === "edit" ? "Describe a change to the document" : "Ask about this contract"}
          placeholder={
            mode === "edit" ? "Describe a change to the document..." : "Ask about this contract..."
          }
          rows={2}
          style={{ minHeight: 44 }}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer__actions">
          <span data-tour="composer-modes" style={{ display: "inline-flex" }}>
            <SegmentedControl<ComposerMode>
              label="Assistant mode"
              options={[
                { value: "ask", label: "Ask" },
                { value: "edit", label: "Edit" },
              ]}
              value={mode}
              onChange={onMode}
            />
          </span>
          <span className="composer__ctx-trigger" data-tour="add-context">
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
          <button
            type="button"
            className={`composer__tool${libraryOpen ? " composer__tool--on" : ""}`}
            onClick={() => setLibraryOpen((v) => !v)}
            aria-pressed={libraryOpen}
            title="Saved prompts"
            data-tour="prompts"
          >
            <WandIcon size={14} /> Prompts
          </button>
          {improve.canImprove && !disabled && (
            <button
              type="button"
              className="composer__tool"
              onClick={() => void improve.improve()}
              disabled={improve.improving}
              title="Improve this with AI"
            >
              {improve.improving ? <Spinner /> : <SparklesGlyph />}
              {improve.improving ? "Improving" : "Improve"}
            </button>
          )}
          <span className="composer__spacer" />
          {mode === "ask" && <FocusControl scope={scope} onScope={onScope} />}
          {voice.supported && !disabled && (
            <button
              type="button"
              className={`composer__mic${voice.listening ? " composer__mic--on" : ""}`}
              onClick={toggleMic}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? "Stop dictation" : "Dictate with your voice"}
              title={voice.listening ? "Stop dictation" : "Dictate with your voice"}
            >
              <MicGlyph />
            </button>
          )}
          {disabled && onStop ? (
            <button
              type="button"
              className="composer__send composer__send--stop"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop"
            >
              <StopIcon size={16} />
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
