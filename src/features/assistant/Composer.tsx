import { useId, useState } from "react";
import { Button } from "@/ui/primitives";
import { StopIcon } from "@/ui/icons";
import type { Scope } from "./useAssistant";

export function Composer({
  onSend,
  onStop,
  disabled,
  scope,
  onScope,
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled: boolean;
  scope: Scope;
  onScope: (s: Scope) => void;
}) {
  const [text, setText] = useState("");
  const scopeId = useId();

  function submit() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="composer">
      <div className="composer__scope">
        <label className="small muted" htmlFor={scopeId}>
          Ask about
        </label>
        <select id={scopeId} value={scope} onChange={(e) => onScope(e.target.value as Scope)}>
          <option value="document">Whole document</option>
          <option value="selection">Selected text</option>
        </select>
      </div>
      <div className="composer__input">
        <textarea
          value={text}
          aria-label="Ask about this contract"
          placeholder="Ask about this contract..."
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {disabled && onStop ? (
          <Button variant="default" size="sm" onClick={onStop}>
            <StopIcon size={13} /> Stop
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={submit} disabled={disabled || !text.trim()}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
