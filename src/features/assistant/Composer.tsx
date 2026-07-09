import { useState } from "react";
import { Button } from "@/ui/primitives";
import type { Scope } from "./useAssistant";

export function Composer({
  onSend,
  disabled,
  scope,
  onScope,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  scope: Scope;
  onScope: (s: Scope) => void;
}) {
  const [text, setText] = useState("");

  function submit() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="composer">
      <div className="composer__scope">
        <label className="small muted">Ask about</label>
        <select value={scope} onChange={(e) => onScope(e.target.value as Scope)}>
          <option value="document">Whole document</option>
          <option value="selection">Selected text</option>
        </select>
      </div>
      <div className="composer__input">
        <textarea
          value={text}
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
        <Button variant="primary" size="sm" onClick={submit} disabled={disabled || !text.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
