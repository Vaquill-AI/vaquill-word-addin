import { useState } from "react";
import { Markdown } from "./markdown";
import { IconButton } from "@/ui/primitives";
import { OverflowMenu, type OverflowMenuItem } from "@/ui/OverflowMenu";
import { CopyIcon, EditIcon, CheckIcon } from "@/ui/icons";
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

/**
 * Overflow actions for an assistant answer (Copy / Insert into document), hidden
 * until the message is hovered so the transcript stays calm.
 */
function AssistantActions({ message }: { message: AssistantMessage }) {
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
  ];

  return (
    <div className="msg__actions msg__actions--assistant">
      <div className="msg__actions-row">
        <OverflowMenu items={items} label="Answer actions" />
        {note && <span className="small muted msg__actions-note">{note}</span>}
      </div>
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

// A source becomes a link only when the payload carries a real http(s) URL.
// Today the backend sends label-only sources (no URL), so these render as plain
// text; the moment it starts sending url/link, they light up as links with no
// further change here.
function sourceUrl(s: ChatSource): string | null {
  for (const c of [s.url, s.sourceUrl, s.source_url, s.link, s.href]) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

function Sources({ sources }: { sources: ChatSource[] }) {
  return (
    <details className="msg__sources">
      <summary>
        {sources.length} source{sources.length === 1 ? "" : "s"}
      </summary>
      <ul>
        {sources.slice(0, 8).map((s, i) => {
          const url = sourceUrl(s);
          const label = sourceLabel(s);
          return (
            <li key={i}>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  {label}
                </a>
              ) : (
                label
              )}
            </li>
          );
        })}
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
      <IconButton label={copied ? "Copied" : "Copy question"} onClick={copy}>
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </IconButton>
      <IconButton label="Edit this question and ask again" onClick={() => onEdit(message)}>
        <EditIcon size={14} />
      </IconButton>
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
      <div className="msg__ident">
        <img src="/assets/icon-80.png" className="msg__ident-avatar" alt="" aria-hidden />
        <span className="msg__ident-name">Vaquill AI</span>
      </div>
      {message.content && (
        <div className="msg__body">
          <Markdown text={message.content} />
          {/* Trailing type-cursor while the answer streams. Not shown before any
              content arrives (the "Searching..." spinner covers that phase), so
              there is no lone caret floating above the thinking line. */}
          {message.pending && <span className="msg__caret" aria-hidden />}
        </div>
      )}
      {message.steps && message.steps.length > 0 && !message.pending && (
        <StepsTrace steps={message.steps} />
      )}
      {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
      {message.content && !message.pending && <AssistantActions message={message} />}
    </div>
  );
}
