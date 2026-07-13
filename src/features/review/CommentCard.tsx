import { useState } from "react";
import { Button, IconButton } from "@/ui/primitives";
import { Avatar } from "@/ui/Avatar";
import { LocateIcon, CheckIcon, SendIcon, UndoIcon } from "@/ui/icons";
import { formatRelativeTime, formatExactTime } from "@/lib/relativeTime";
import type { DocComment } from "@/office/changes";
import "./comment-card.css";

export interface CommentCardProps {
  comment: DocComment;
  /** Resolve or reopen the comment. Parent reloads the thread on success. */
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  /** Post a reply. Returns true on success so the card can close + clear. */
  onReply: (id: string, text: string) => Promise<boolean>;
  /** Select the comment's anchor in the document. */
  onLocate: (id: string) => void;
}

/**
 * One counterparty comment with its reply thread. Each card owns its own reply
 * box and busy state, so acting on one comment never disables the others.
 */
export function CommentCard({ comment, onResolve, onReply, onLocate }: CommentCardProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);

  const author = comment.author || "Unknown";
  const time = formatRelativeTime(comment.createdAt);

  async function submitReply() {
    const text = replyText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onReply(comment.id, text);
      if (ok) {
        setReplyText("");
        setReplyOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleResolve() {
    if (resolving) return;
    setResolving(true);
    try {
      await onResolve(comment.id, !comment.resolved);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className={`cc${comment.resolved ? " cc--resolved" : ""}`}>
      <div className="cc__head">
        <Avatar name={author} />
        <div className="author-line">
          <span className="author-name">{author}</span>
          {time && (
            <span className="author-time" title={formatExactTime(comment.createdAt)}>
              {time}
            </span>
          )}
        </div>
        {comment.resolved && (
          <span className="cc__badge">
            <CheckIcon size={11} /> Resolved
          </span>
        )}
        <IconButton label="Find in document" onClick={() => onLocate(comment.id)}>
          <LocateIcon size={13} />
        </IconButton>
      </div>

      <p className="cc__text">{comment.text}</p>

      {comment.replies.length > 0 && (
        <div className="cc__thread">
          {comment.replies.map((r, i) => {
            const rAuthor = r.author || "Unknown";
            const rTime = formatRelativeTime(r.createdAt);
            return (
              <div key={i} className="cc__reply">
                <Avatar name={rAuthor} size={20} />
                <div className="cc__reply-body">
                  <div className="cc__reply-meta">
                    <span className="author-name">{rAuthor}</span>
                    {rTime && (
                      <span className="author-time" title={formatExactTime(r.createdAt)}>
                        {rTime}
                      </span>
                    )}
                  </div>
                  <p className="cc__reply-text">{r.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="cc__actions">
        <Button variant="ghost" size="sm" onClick={() => void toggleResolve()} loading={resolving}>
          {comment.resolved ? (
            <>
              <UndoIcon size={13} /> Reopen
            </>
          ) : (
            <>
              <CheckIcon size={13} /> Resolve
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setReplyOpen((v) => !v)}
          aria-expanded={replyOpen}
        >
          Reply
        </Button>
      </div>

      {replyOpen && (
        <div className="cc__reply-box">
          <input
            type="text"
            className="cc__reply-input"
            value={replyText}
            aria-label={`Reply to ${author}`}
            placeholder="Write a reply..."
            autoFocus
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && replyText.trim()) {
                e.preventDefault();
                void submitReply();
              } else if (e.key === "Escape") {
                setReplyOpen(false);
              }
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void submitReply()}
            loading={submitting}
            disabled={!replyText.trim()}
            aria-label="Send reply"
          >
            <SendIcon size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
