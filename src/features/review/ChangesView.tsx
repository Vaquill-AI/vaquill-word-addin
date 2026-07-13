import { useCallback, useEffect, useRef, useState } from "react";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { ViewHeader } from "@/ui/ViewHeader";
import { Button, Banner, Spinner, Badge, IconButton, Field, LiveRegion } from "@/ui/primitives";
import { LocateIcon, CheckIcon, XIcon, CopyIcon, PlusIcon, MinusIcon, EditIcon, AlertTriangleIcon } from "@/ui/icons";
import {
  readDocumentChanges,
  resolveTrackedChangeAt,
  resolveTrackedChangesByAuthor,
  acceptTrackedChanges,
  type DocChanges,
} from "@/office/changes";
import {
  resolveComment,
  replyToComment,
  insertCommentAnchored,
  locateComment,
} from "@/office/comments";
import { locateInDocument } from "@/office/navigate";
import { Avatar } from "@/ui/Avatar";
import { formatRelativeTime, formatExactTime } from "@/lib/relativeTime";
import { CommentCard } from "./CommentCard";
import { triageChanges, positionsSummary, type Verdict, type VerdictMap } from "./triage";
import { draftCounterReply } from "./counter";
import { usePlaybookDetails } from "@/features/playbook/usePlaybookDetails";
import { errorMessage } from "@/api/errors";

type LoadStatus = "loading" | "ready" | "error";
type TriageStatus = "idle" | "running" | "done" | "error";

function changeTypeBadge(type: string) {
  const t = type.toLowerCase();
  if (t.includes("add") || t.includes("insert"))
    return (
      <Badge tone="green">
        <PlusIcon size={11} /> Added
      </Badge>
    );
  if (t.includes("delet") || t.includes("remov"))
    return (
      <Badge tone="red">
        <MinusIcon size={11} /> Deleted
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <EditIcon size={11} /> {type || "Change"}
    </Badge>
  );
}

function verdictBadge(v: Verdict) {
  if (v === "accept")
    return (
      <Badge tone="green">
        <CheckIcon size={11} /> Accept
      </Badge>
    );
  if (v === "reject")
    return (
      <Badge tone="red">
        <XIcon size={11} /> Reject
      </Badge>
    );
  return (
    <Badge tone="yellow">
      <AlertTriangleIcon size={11} /> Review
    </Badge>
  );
}

export function ChangesView() {
  const [changes, setChanges] = useState<DocChanges | null>(null);
  const [load, setLoad] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const pb = usePlaybookDetails();
  const [pbId, setPbId] = useState("");

  const [verdicts, setVerdicts] = useState<VerdictMap>({});
  const [triage, setTriage] = useState<TriageStatus>("idle");
  const [triageError, setTriageError] = useState<string | null>(null);

  const [busy, setBusy] = useState<{ index: number; action: "accept" | "reject" } | null>(null);
  // A free-form key identifying the in-flight bulk action ("accept-suggested" or
  // `${action}:${author}`), so the right button shows its spinner.
  const [bulk, setBulk] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  // Per-comment resolve/reply busy state lives inside each CommentCard, so acting
  // on one comment never disables the others.

  // Draft-a-reply (the "respond" half of negotiation): one change's reply panel
  // is open at a time. `draftText` is editable before it is inserted as a comment.
  const [draftFor, setDraftFor] = useState<number | null>(null);
  const [draftText, setDraftText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [insertingReply, setInsertingReply] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const draftAbortRef = useRef<AbortController | null>(null);

  // Focus management: after a single Accept/Reject, the resolved card leaves the
  // list; move focus to the change that slid into its slot (or the container)
  // instead of dropping to <body>.
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusIdxRef = useRef<number | null>(null);

  const reload = useCallback(async () => {
    setLoad("loading");
    setLoadError(null);
    try {
      setChanges(await readDocumentChanges());
      setLoad("ready");
    } catch (e) {
      setLoadError(errorMessage(e));
      setLoad("error");
    }
  }, []);

  async function onResolveComment(id: string, resolved: boolean): Promise<void> {
    setActionError(null);
    try {
      const ok = await resolveComment(id, resolved);
      if (!ok) setActionError("Could not update that comment (it may have been deleted).");
      else await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  function onLocateComment(id: string) {
    setActionError(null);
    void (async () => {
      try {
        const ok = await locateComment(id);
        if (!ok) setActionError("Could not locate that comment (it may have been deleted).");
      } catch (e) {
        setActionError(errorMessage(e));
      }
    })();
  }

  async function onReplyComment(id: string, text: string): Promise<boolean> {
    const t = text.trim();
    if (!t) return false;
    setActionError(null);
    try {
      const ok = await replyToComment(id, t);
      if (ok) {
        await reload();
        return true;
      }
      setActionError("Could not reply to that comment (it may have been deleted).");
      return false;
    } catch (e) {
      setActionError(errorMessage(e));
      return false;
    }
  }

  useEffect(() => {
    void reload();
    return () => {
      abortRef.current?.abort();
      draftAbortRef.current?.abort();
    };
  }, [reload]);

  // Compact playbook context for the drafter (same source triage uses).
  const currentPositions = useCallback(() => {
    const selected = pb.playbooks.find((p) => p.id === pbId);
    return selected ? positionsSummary(selected.positions) : null;
  }, [pb.playbooks, pbId]);

  async function startDraft(index: number, changeText: string) {
    draftAbortRef.current?.abort();
    const controller = new AbortController();
    draftAbortRef.current = controller;
    setDraftFor(index);
    setDraftText("");
    setDraftError(null);
    setDrafting(true);
    try {
      const reply = await draftCounterReply(changeText, currentPositions(), controller.signal);
      setDraftText(reply);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setDraftError(errorMessage(e));
    } finally {
      setDrafting(false);
    }
  }

  function closeDraft() {
    draftAbortRef.current?.abort();
    setDraftFor(null);
    setDraftText("");
    setDraftError(null);
  }

  async function insertReply(changeText: string) {
    const body = draftText.trim();
    if (!body) return;
    setInsertingReply(true);
    setDraftError(null);
    try {
      const outcome = await insertCommentAnchored(changeText, body);
      if (outcome === "inserted") {
        closeDraft();
        setActionNote("Reply added as a comment on the change.");
        await reload();
      } else if (outcome === "not_found") {
        setDraftError("Could not locate that change to attach the comment. Use Copy and paste it manually.");
      } else {
        setDraftError("Word does not allow comments in that region. Use Copy and paste it manually.");
      }
    } catch (e) {
      setDraftError(errorMessage(e));
    } finally {
      setInsertingReply(false);
    }
  }

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(draftText);
      setActionNote("Reply copied.");
    } catch {
      setDraftError("Could not copy.");
    }
  }

  // After a resolve reloads the list, land focus on the next actionable change.
  useEffect(() => {
    const idx = focusIdxRef.current;
    if (idx === null) return;
    focusIdxRef.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-tc-accept]");
    if (buttons && buttons.length > 0) {
      buttons[Math.min(idx, buttons.length - 1)]?.focus();
    } else {
      rootRef.current?.focus();
    }
  }, [changes]);

  const tcs = changes?.trackedChanges ?? [];
  const comments = changes?.comments ?? [];
  const authors = [...new Set(tcs.map((c) => c.author))];
  const anyBusy = !!busy || !!bulk || triage === "running";

  async function runTriage() {
    if (!tcs.length) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTriage("running");
    setTriageError(null);
    try {
      const selected = pb.playbooks.find((p) => p.id === pbId);
      const positions = selected ? positionsSummary(selected.positions) : null;
      const map = await triageChanges(tcs.map((c) => c.text), positions, controller.signal);
      setVerdicts(map);
      setTriage("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setTriageError(errorMessage(e));
      setTriage("error");
    }
  }

  async function resolveAt(index: number, action: "accept" | "reject") {
    setBusy({ index, action });
    setActionError(null);
    setActionNote(null);
    try {
      const ok = await resolveTrackedChangeAt(index, action);
      if (!ok) setActionError("Could not locate that change (it may have already been resolved).");
      focusIdxRef.current = index;
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function locate(text: string) {
    setActionError(null);
    try {
      await locateInDocument(text);
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function resolveAuthor(author: string, action: "accept" | "reject") {
    setBulk(`${action}:${author}`);
    setActionError(null);
    setActionNote(null);
    try {
      const n = await resolveTrackedChangesByAuthor(author, action);
      await reload();
      const who = author || "unknown author";
      setActionNote(
        `${action === "accept" ? "Accepted" : "Rejected"} ${n} change${n === 1 ? "" : "s"} from ${who}.`,
      );
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBulk(null);
    }
  }

  async function acceptSuggested() {
    const wanted = new Set(
      tcs.filter((c) => verdicts[c.text]?.verdict === "accept" && c.text.trim()).map((c) => c.text),
    );
    const expected = tcs.filter((c) => wanted.has(c.text)).length;
    if (!expected) return;
    setBulk("accept-suggested");
    setActionError(null);
    setActionNote(null);
    try {
      const accepted = await acceptTrackedChanges([...wanted]);
      await reload();
      if (accepted < expected) {
        setActionError(
          `Accepted ${accepted} of ${expected}. The rest could not be located, so handle them individually.`,
        );
      } else {
        setActionNote(`Accepted ${accepted} approved change${accepted === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBulk(null);
    }
  }

  const suggested = tcs.filter((c) => verdicts[c.text]?.verdict === "accept" && c.text.trim()).length;
  // Formatting-only tracked changes (no reviewable text) are hidden from the list.
  const formattingOnly = tcs.filter((c) => c.text.trim().length === 0).length;
  const counts = { accept: 0, review: 0, reject: 0 };
  for (const c of tcs) {
    const v = verdicts[c.text]?.verdict;
    if (v) counts[v] += 1;
  }

  if (load === "loading") {
    return (
      <div className="stack changes-view">
        <div className="row" style={{ gap: 8 }}>
          <Spinner />
          <LiveRegion>
            <span className="small muted">Reading tracked changes and comments...</span>
          </LiveRegion>
        </div>
      </div>
    );
  }

  if (load === "error") {
    return (
      <div className="stack changes-view">
        <Banner tone="danger">{loadError}</Banner>
      </div>
    );
  }

  return (
    <div className="stack changes-view" ref={rootRef} tabIndex={-1}>
      <ViewHeader
        title="Counterparty changes"
        info="Shows the other side's tracked changes and comments. AI triage classifies each change against your playbook as Accept, Review, or Reject with a reason, so you can auto-accept the safe ones and focus on the rest. Every action here edits Word's real tracked changes, so review before you accept in bulk."
        subtitle="Accept, reject, or reply to the other side's tracked changes."
      />

      {tcs.length === 0 && (
        <Banner tone="info">
          {comments.length === 0
            ? "No tracked changes or comments yet. "
            : "No tracked changes yet. "}
          They appear here when the other side returns the contract.
        </Banner>
      )}

      {tcs.length > 0 && (
        <>
          {(() => {
            const hasPlaybooks = pb.status === "ready" && pb.playbooks.length > 0;
            return (
              <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                {hasPlaybooks && (
                  <div style={{ flex: "1 1 100%", minWidth: 0 }}>
                    <Field label="Playbook to triage against">
                      <select
                        value={pbId}
                        onChange={(e) => setPbId(e.target.value)}
                        disabled={anyBusy}
                      >
                        <option value="">General legal judgment (no playbook)</option>
                        {pb.playbooks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <span className="small muted" style={{ display: "block", marginTop: 4 }}>
                      A playbook is your saved set of negotiation positions. Each change is graded
                      against it, or against general legal judgment if none is chosen.
                    </span>
                  </div>
                )}
                <Button
                  variant="primary"
                  block={!hasPlaybooks}
                  onClick={runTriage}
                  loading={triage === "running"}
                  disabled={anyBusy}
                  style={{ marginLeft: "auto" }}
                >
                  {triage === "done" ? "Re-run AI triage" : "AI triage the changes"}
                </Button>
              </div>
            );
          })()}

          {triage === "done" && (
            <div className="triage-summary">
              <span className="small muted">
                AI: {counts.accept} accept - {counts.review} review - {counts.reject} reject
              </span>
              {suggested > 0 && (
                <Button variant="default" size="sm" onClick={acceptSuggested} loading={bulk === "accept-suggested"} disabled={anyBusy}>
                  <CheckIcon size={13} /> Accept the {suggested} approved
                </Button>
              )}
            </div>
          )}

          {triageError && <Banner tone="danger">{triageError}</Banner>}
          {actionError && <Banner tone="warn">{actionError}</Banner>}
          {actionNote && (
            <LiveRegion>
              <Banner tone="info">{actionNote}</Banner>
            </LiveRegion>
          )}

          <div className="stack" ref={listRef}>
            {tcs.map((c, i) => {
              // Formatting-only tracked changes carry no reviewable text (they
              // render as "(formatting change)" with no action) and just clutter
              // the list. Skip them, but keep the original index `i` intact so
              // accept/reject still target the right change in the document.
              if (c.text.trim().length === 0) return null;
              const v = verdicts[c.text];
              const canResolve = c.text.trim().length > 0;
              const author = c.author || "Unknown";
              const tcTime = formatRelativeTime(c.createdAt);
              return (
                <div key={`${i}-${c.text.slice(0, 24)}`} className="card change-item">
                  <div className="change-item__head">
                    <div
                      className="row"
                      style={{ gap: 8, alignItems: "center", minWidth: 0, flex: 1 }}
                    >
                      <Avatar name={author} size={22} />
                      <div className="author-line">
                        <span className="author-name">{author}</span>
                        {tcTime && (
                          <span className="author-time" title={formatExactTime(c.createdAt)}>
                            {tcTime}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                      {changeTypeBadge(c.type)}
                      {v && verdictBadge(v.verdict)}
                      {canResolve && (
                        <IconButton label="Find in document" onClick={() => void locate(c.text)}>
                          <LocateIcon size={13} />
                        </IconButton>
                      )}
                    </div>
                  </div>
                  <p className="change-item__text">
                    {c.text.trim() || "(formatting change)"}
                  </p>
                  {v?.reason && <p className="small muted" style={{ margin: 0 }}>{v.reason}</p>}
                  {canResolve && (
                    <div className="row" style={{ gap: 8 }}>
                      <Button
                        variant="primary"
                        size="sm"
                        data-tc-accept={i}
                        onClick={() => resolveAt(i, "accept")}
                        loading={busy?.index === i && busy.action === "accept"}
                        disabled={anyBusy && busy?.index !== i}
                      >
                        <CheckIcon size={13} /> Accept
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => resolveAt(i, "reject")}
                        loading={busy?.index === i && busy.action === "reject"}
                        disabled={anyBusy && busy?.index !== i}
                        aria-label="Reject"
                        title="Reject"
                      >
                        <XIcon size={13} />
                      </Button>
                      {draftFor !== i && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void startDraft(i, c.text)}
                          disabled={anyBusy || drafting}
                          style={{ marginLeft: "auto" }}
                        >
                          Draft reply
                        </Button>
                      )}
                    </div>
                  )}
                  {canResolve && draftFor === i && (
                    <div className="stack" style={{ gap: 6 }}>
                        {drafting ? (
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <Spinner />
                            <span className="small muted">Drafting a reply...</span>
                          </div>
                        ) : (
                          <>
                            <AutoTextarea
                              value={draftText}
                              aria-label="Draft reply to the counterparty"
                              rows={3}
                              onChange={(e) => setDraftText(e.target.value)}
                              style={{ width: "100%", resize: "vertical", font: "inherit" }}
                            />
                            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                              <Button
                                size="sm"
                                onClick={() => void insertReply(c.text)}
                                loading={insertingReply}
                                disabled={!draftText.trim()}
                              >
                                <CheckIcon size={13} /> Insert as comment
                              </Button>
                              <div className="row" style={{ gap: 4, marginLeft: "auto" }}>
                                <IconButton label="Copy" onClick={() => void copyReply()}>
                                  <CopyIcon size={14} />
                                </IconButton>
                                <IconButton label="Close" tone="red" onClick={closeDraft}>
                                  <XIcon size={14} />
                                </IconButton>
                              </div>
                            </div>
                          </>
                        )}
                        {draftError && <Banner tone="warn">{draftError}</Banner>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {formattingOnly > 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              {formattingOnly} formatting-only change{formattingOnly === 1 ? "" : "s"} hidden. Bulk
              accept/reject by author still includes them.
            </p>
          )}

          <div className="stack" style={{ gap: 6 }}>
            <h2 className="small muted" style={{ margin: 0 }}>Accept or reject in bulk by author</h2>
            {authors.map((a) => {
              const n = tcs.filter((c) => c.author === a).length;
              return (
                <div key={a || "unknown"} className="card change-item" style={{ gap: 6 }}>
                  <span className="small" style={{ fontWeight: 600 }}>
                    {a || "Unknown author"} <span className="muted">({n})</span>
                  </span>
                  <div className="row" style={{ gap: 8 }}>
                    <Button
                      variant="default"
                      size="sm"
                      block
                      onClick={() => resolveAuthor(a, "accept")}
                      loading={bulk === `accept:${a}`}
                      disabled={anyBusy}
                    >
                      <CheckIcon size={13} /> Accept all
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      block
                      onClick={() => resolveAuthor(a, "reject")}
                      loading={bulk === `reject:${a}`}
                      disabled={anyBusy}
                    >
                      <XIcon size={13} /> Reject all
                    </Button>
                  </div>
                </div>
              );
            })}
            <p className="small muted" style={{ margin: 0 }}>
              Grouped by author so a bulk action never touches your own applied redlines by mistake.
            </p>
          </div>
        </>
      )}

      {comments.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h2 className="small muted">Comments ({comments.length})</h2>
          {comments.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              onResolve={onResolveComment}
              onReply={onReplyComment}
              onLocate={onLocateComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
