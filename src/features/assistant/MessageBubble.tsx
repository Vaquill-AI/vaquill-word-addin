import { useState } from "react";
import { Markdown } from "./markdown";
import { SaveAnswerToNotes } from "@/features/integration/SaveAnswerToNotes";
import { OverflowMenu, type OverflowMenuItem } from "@/ui/OverflowMenu";
import { CopyIcon, UndoIcon } from "@/ui/icons";
import { insertClauseTracked } from "@/office/richInsert";
import type { AssistantMessage } from "./useAssistant";
import type { ChatSource } from "@/api/chat";

/** Insert-into-document glyph (page with a down arrow). */
function InsertGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" />
    </svg>
  );
}

/** Save-to-notes glyph (bookmark). */
function NoteGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * Overflow actions for an assistant answer (Copy / Insert into document /
 * Regenerate / Save to notes), hidden until the message is hovered. Replaces the
 * lone always-visible "Save to notes" link so the transcript stays calm.
 */
function AssistantActions({
  message,
  onRegenerate,
}: {
  message: AssistantMessage;
  onRegenerate?: () => void;
}) {
  const [savingNotes, setSavingNotes] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setNote("Copied");
      setTimeout(() => setNote(null), 1200);
    } catch {
      // Clipboard blocked; ignore (non-destructive).
    }
  }

  async function insert() {
    try {
      await insertClauseTracked(message.content);
      setNote("Inserted as tracked change");
      setTimeout(() => setNote(null), 1800);
    } catch {
      setNote("Could not insert");
      setTimeout(() => setNote(null), 1800);
    }
  }

  const items: OverflowMenuItem[] = [
    { label: "Copy", icon: <CopyIcon size={14} />, onSelect: copy },
    { label: "Insert into document", icon: <InsertGlyph />, onSelect: insert },
    ...(onRegenerate
      ? [{ label: "Regenerate", icon: <UndoIcon size={14} />, onSelect: onRegenerate }]
      : []),
    { label: "Save to notes", icon: <NoteGlyph />, onSelect: () => setSavingNotes(true) },
  ];

  return (
    <div className="msg__actions msg__actions--assistant">
      <div className="msg__actions-row">
        <OverflowMenu items={items} label="Answer actions" />
        {note && <span className="small muted msg__actions-note">{note}</span>}
      </div>
      {savingNotes && (
        <SaveAnswerToNotes content={message.content} defaultOpen onClose={() => setSavingNotes(false)} />
      )}
    </div>
  );
}

function sourceLabel(s: ChatSource): string {
  return (
    s.caseName ??
    s.case_name ??
    s.title ??
    s.citation ??
    s.filename ??
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
  onRegenerate,
}: {
  message: AssistantMessage;
  /** Enables Copy/Edit on a user message (edit-and-re-run). */
  onEdit?: (message: AssistantMessage) => void;
  /** Re-runs the question that produced this assistant answer. */
  onRegenerate?: (message: AssistantMessage) => void;
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
        <AssistantActions
          message={message}
          onRegenerate={onRegenerate ? () => onRegenerate(message) : undefined}
        />
      )}
    </div>
  );
}
