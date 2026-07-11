import { useEffect, useState } from "react";
import { Button, IconButton } from "@/ui/primitives";
import { XIcon } from "@/ui/icons";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import { deleteConversation, listConversations, type Conversation } from "./chatHistoryStore";
import "./chat-history.css";

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

/**
 * Past-conversation picker (device-local history). Reuses ScopedSearchList for
 * search + list chrome. Renders as a sheet from the top of the assistant with a
 * click-away backdrop.
 */
export function ChatHistory({
  activeId,
  onPick,
  onClose,
}: {
  activeId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Conversation[]>(() => listConversations());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((c) => c.title.toLowerCase().includes(q)) : items;

  function remove(id: string) {
    deleteConversation(id);
    setItems(listConversations());
  }

  return (
    <>
      <button
        type="button"
        className="chat-history__backdrop"
        aria-label="Close history"
        onClick={onClose}
      />
      <div className="chat-history" role="dialog" aria-modal="true" aria-label="Chat history">
        <div className="chat-history__head">
          <strong className="small">History</strong>
          <IconButton label="Close" onClick={onClose}>
            <XIcon size={14} />
          </IconButton>
        </div>
        <ScopedSearchList
          query={query}
          onQuery={setQuery}
          searchPlaceholder="Search chats..."
          ariaLabel="Past chats"
          isEmpty={filtered.length === 0}
          empty={q ? "No chats match your search." : "No past chats yet."}
        >
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`chat-history__row${c.id === activeId ? " chat-history__row--active" : ""}`}
              role="listitem"
            >
              <button
                type="button"
                className="chat-history__main"
                onClick={() => onPick(c.id)}
                title="Open this chat"
              >
                <span className="chat-history__title">{c.title}</span>
                <span className="chat-history__meta small muted">{relTime(c.updatedAt)}</span>
              </button>
              <Button variant="ghost" size="sm" onClick={() => remove(c.id)}>
                Delete
              </Button>
            </div>
          ))}
        </ScopedSearchList>
      </div>
    </>
  );
}
