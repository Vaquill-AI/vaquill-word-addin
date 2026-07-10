import { Markdown } from "./markdown";
import { SaveAnswerToNotes } from "@/features/integration/SaveAnswerToNotes";
import type { AssistantMessage } from "./useAssistant";
import type { ChatSource } from "@/api/chat";

function sourceLabel(s: ChatSource): string {
  return (s.caseName as string) ?? (s.case_name as string) ?? (s.title as string) ?? (s.citation as string) ?? "Source";
}

function Sources({ sources }: { sources: ChatSource[] }) {
  return (
    <details className="msg__sources">
      <summary>{sources.length} source{sources.length === 1 ? "" : "s"}</summary>
      <ul>
        {sources.slice(0, 8).map((s, i) => (
          <li key={i}>{sourceLabel(s)}</li>
        ))}
      </ul>
    </details>
  );
}

export function MessageBubble({ message }: { message: AssistantMessage }) {
  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <p>{message.content}</p>
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
      {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
      {message.content && !message.pending && (
        <div className="msg__actions">
          <SaveAnswerToNotes content={message.content} />
        </div>
      )}
    </div>
  );
}
