import { useState } from "react";
import { Markdown } from "./markdown";
import { SaveAnswerToNotes } from "@/features/integration/SaveAnswerToNotes";
import type { AssistantMessage } from "./useAssistant";
import type { ChatSource } from "@/api/chat";

function sourceLabel(s: ChatSource): string {
  return (
    (s.caseName as string) ??
    (s.case_name as string) ??
    (s.title as string) ??
    (s.citation as string) ??
    "Source"
  );
}

function Sources({ sources }: { sources: ChatSource[] }) {
  return (
    <details className="msg__sources">
      <summary>
        {sources.length} source{sources.length === 1 ? "" : "s"}
      </summary>
      <ul>
        {sources.slice(0, 8).map((s, i) => (
          <li key={i}>{sourceLabel(s)}</li>
        ))}
      </ul>
    </details>
  );
}

/** Collapsible "Finished in N steps" reasoning trace. Labels are sanitized at
 *  the source (sanitizeStepLabel in api/chat.ts), so no vendor/MCP/URL leaks. */
function StepsTrace({ steps }: { steps: string[] }) {
  return (
    <details className="msg__steps">
      <summary>
        Finished in {steps.length} step{steps.length === 1 ? "" : "s"}
      </summary>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

function UserActions({
  message,
  onEdit,
}: {
  message: AssistantMessage;
  onEdit: (message: AssistantMessage) => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked; ignore (non-destructive).
    }
  }
  return (
    <div className="msg__actions msg__actions--user">
      <button type="button" className="msg__action" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        className="msg__action"
        onClick={() => onEdit(message)}
        title="Edit this question and ask again"
      >
        Edit
      </button>
    </div>
  );
}

export function MessageBubble({
  message,
  onEdit,
}: {
  message: AssistantMessage;
  /** Enables Copy/Edit on a user message (edit-and-re-run). */
  onEdit?: (message: AssistantMessage) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <p>{message.content}</p>
        {onEdit && <UserActions message={message} onEdit={onEdit} />}
      </div>
    );
  }

  return (
    <div className="msg msg--assistant">
      {message.content && (
        <div className="msg__body">
          <Markdown text={message.content} />
        </div>
      )}
      {message.pending && !message.content && <span className="msg__caret" aria-hidden />}
      {message.steps && message.steps.length > 0 && !message.pending && (
        <StepsTrace steps={message.steps} />
      )}
      {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
      {message.content && !message.pending && (
        <div className="msg__actions">
          <SaveAnswerToNotes content={message.content} />
        </div>
      )}
    </div>
  );
}
