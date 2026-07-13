import { useRef, useState } from "react";
import { Markdown, type CitationCtx } from "./markdown";
import { IconButton } from "@/ui/primitives";
import { CopyIcon, EditIcon, CheckIcon } from "@/ui/icons";
import { insertClauseTracked } from "@/office/richInsert";
import { config } from "@/config";
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
 * Primary actions for an assistant answer. Copy and Insert are first-class
 * buttons (not hidden behind a kebab) so the two things a user most wants to do
 * with an answer are one click away.
 */
function AssistantActions({ message }: { message: AssistantMessage }) {
  const [note, setNote] = useState<string | null>(null);
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

  return (
    <div className="msg__actions msg__actions--assistant">
      <button type="button" className="msg__action-btn" onClick={copy} title="Copy answer">
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        className="msg__action-btn"
        onClick={insert}
        title="Insert into the document as a tracked change"
      >
        <InsertGlyph />
        Insert
      </button>
      {note && <span className="small muted msg__actions-note">{note}</span>}
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

// Resolve a source to a clickable URL. Absolute http(s) links (external case-law
// mirrors, signed file URLs) open directly; relative viewer paths (the corpus
// pdf_url the backend rewrites relative) are resolved against the web app origin
// so they open the document viewer in a browser. Backend keys vary by source
// type (external_url / url / file_url / pdf_url), so we check them all.
function sourceUrl(s: ChatSource): string | null {
  const absolute = [s.external_url, s.url, s.sourceUrl, s.source_url, s.link, s.href, s.file_url];
  for (const c of absolute) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
  }
  // Relative viewer/file paths -> resolve against the web app.
  for (const c of [s.pdf_url, s.file_url]) {
    if (typeof c === "string" && c.startsWith("/")) return `${config.appBase}${c}`;
  }
  return null;
}

function Sources({
  sources,
  open,
  onToggle,
  anchorId,
}: {
  sources: ChatSource[];
  open: boolean;
  onToggle: (open: boolean) => void;
  /** DOM id for the Nth source (1-based), so an inline [N] can scroll to it. */
  anchorId: (n: number) => string;
}) {
  return (
    <details
      className="msg__sources"
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        {sources.length} source{sources.length === 1 ? "" : "s"}
      </summary>
      {/* Numbered so an inline [N] maps to a visible item. The backend orders
          sources by citation number (citation N == source N), so a plain 1..N
          ordered list is the correct mapping. */}
      <ol className="msg__source-list">
        {sources.map((s, i) => {
          const url = sourceUrl(s);
          const label = sourceLabel(s);
          return (
            <li key={i} id={anchorId(i + 1)} className="msg__source">
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
      </ol>
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
  // Sources panel open state + a wrapper ref, so an inline [N] click can open the
  // panel and scroll its item into view.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  if (message.role === "user") {
    return (
      <div className="msg msg--user">
        <p>{message.content}</p>
        {onEdit && <UserActions message={message} onEdit={onEdit} />}
      </div>
    );
  }

  const sources = message.sources ?? [];
  const anchorId = (n: number) => `cite-${message.id}-${n}`;
  const citations: CitationCtx | undefined = sources.length
    ? {
        labelOf: (n) => (sources[n - 1] ? sourceLabel(sources[n - 1]) : undefined),
        onCite: (n) => {
          if (n < 1 || n > sources.length) return;
          setSourcesOpen(true);
          requestAnimationFrame(() => {
            const el = bodyRef.current?.querySelector<HTMLElement>(`#${CSS.escape(anchorId(n))}`);
            el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            el?.classList.add("msg__source--flash");
            setTimeout(() => el?.classList.remove("msg__source--flash"), 1200);
          });
        },
      }
    : undefined;

  return (
    <div className="msg msg--assistant" ref={bodyRef}>
      <div className="msg__ident">
        <img src="/assets/icon-80.png" className="msg__ident-avatar" alt="" aria-hidden />
        <span className="msg__ident-name">Vaquill AI</span>
      </div>
      {message.content && (
        <div className="msg__body">
          <Markdown text={message.content} citations={citations} />
          {/* Trailing type-cursor while the answer streams. Not shown before any
              content arrives (the "Searching..." spinner covers that phase), so
              there is no lone caret floating above the thinking line. */}
          {message.pending && <span className="msg__caret" aria-hidden />}
        </div>
      )}
      {message.steps && message.steps.length > 0 && !message.pending && (
        <StepsTrace steps={message.steps} />
      )}
      {sources.length > 0 && (
        <Sources
          sources={sources}
          open={sourcesOpen}
          onToggle={setSourcesOpen}
          anchorId={anchorId}
        />
      )}
      {message.content && !message.pending && <AssistantActions message={message} />}
    </div>
  );
}
