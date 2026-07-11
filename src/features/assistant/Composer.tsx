import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Button, IconButton } from "@/ui/primitives";
import { StopIcon } from "@/ui/icons";
import { FocusControl } from "./FocusControl";
import { PromptLibrary } from "./PromptLibrary";
import { ContextMenu, activeContextCount, type ContextConfig } from "./ContextMenu";
import type { Scope } from "./useAssistant";

export interface ComposerHandle {
  focus: () => void;
}

function LibraryGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SourcesGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled: boolean;
  scope: Scope;
  onScope: (scope: Scope) => void;
  context: ContextConfig;
  onContextChange: (config: ContextConfig) => void;
  hasMatter: boolean;
}

/**
 * Assistant composer. Text is controlled by the parent so other surfaces (the
 * prompt library, edit-and-re-run) can write into it. Exposes an imperative
 * `focus()` for callers that need to place the caret after setting the draft.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { value, onChange, onSend, onStop, disabled, scope, onScope, context, onContextChange, hasMatter },
  ref,
) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const ctxCount = activeContextCount(context, hasMatter);

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
          onClose={() => setContextOpen(false)}
        />
      )}
      <FocusControl scope={scope} onScope={onScope} />
      <div className="composer__input">
        <textarea
          ref={taRef}
          value={value}
          aria-label="Ask about this contract"
          placeholder="Ask about this contract..."
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
              label={`Context sources${ctxCount > 0 ? ` (${ctxCount} on)` : ""}`}
              onClick={() => setContextOpen((v) => !v)}
              active={contextOpen}
            >
              <SourcesGlyph />
            </IconButton>
            {ctxCount > 0 && (
              <span className="composer__ctx-badge" aria-hidden>
                {ctxCount}
              </span>
            )}
          </span>
          <span className="composer__lib-trigger">
            <IconButton
              label="Prompt library"
              onClick={() => setLibraryOpen((v) => !v)}
              active={libraryOpen}
            >
              <LibraryGlyph />
            </IconButton>
          </span>
          {disabled && onStop ? (
            <Button variant="default" size="sm" onClick={onStop}>
              <StopIcon size={13} /> Stop
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={submit} disabled={disabled || !value.trim()}>
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
