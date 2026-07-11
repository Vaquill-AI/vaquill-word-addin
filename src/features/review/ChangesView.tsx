import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Banner, Spinner, Badge, IconButton, Field, LiveRegion } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { LocateIcon, CheckIcon, XIcon } from "@/ui/icons";
import {
  readDocumentChanges,
  resolveTrackedChangeAt,
  resolveTrackedChangesByAuthor,
  acceptTrackedChanges,
  type DocChanges,
} from "@/office/changes";
import { selectClauseInDocument } from "@/office/navigate";
import { triageChanges, positionsSummary, type Verdict, type VerdictMap } from "./triage";
import { usePlaybookDetails } from "@/features/playbook/usePlaybookDetails";
import { ApiError, friendlyMessage } from "@/api/errors";

type LoadStatus = "loading" | "ready" | "error";
type TriageStatus = "idle" | "running" | "done" | "error";

function changeTypeBadge(type: string) {
  const t = type.toLowerCase();
  if (t.includes("add") || t.includes("insert")) return <Badge tone="green">Added</Badge>;
  if (t.includes("delet") || t.includes("remov")) return <Badge tone="red">Deleted</Badge>;
  return <Badge tone="neutral">{type || "Change"}</Badge>;
}

function verdictBadge(v: Verdict) {
  if (v === "accept") return <Badge tone="green">Accept</Badge>;
  if (v === "reject") return <Badge tone="red">Reject</Badge>;
  return <Badge tone="yellow">Review</Badge>;
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

  const abortRef = useRef<AbortController | null>(null);

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
      setLoadError((e as Error).message);
      setLoad("error");
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => abortRef.current?.abort();
  }, [reload]);

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
      setTriageError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
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
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function locate(text: string) {
    setActionError(null);
    try {
      await selectClauseInDocument(text);
    } catch (e) {
      setActionError((e as Error).message);
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
      setActionError((e as Error).message);
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
      setActionError((e as Error).message);
    } finally {
      setBulk(null);
    }
  }

  const suggested = tcs.filter((c) => verdicts[c.text]?.verdict === "accept" && c.text.trim()).length;
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
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Counterparty changes</h1>
          <InfoTip text="Shows the other side's tracked changes and comments. AI triage classifies each change against your playbook as Accept, Review, or Reject with a reason, so you can auto-accept the safe ones and focus on the rest. Every action here edits Word's real tracked changes, so review before you accept in bulk." />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Triage the other side's tracked changes: accept the acceptable ones, reject the rest.
        </p>
      </div>

      {tcs.length === 0 && comments.length === 0 && (
        <Banner tone="info">This document has no tracked changes or comments.</Banner>
      )}

      {tcs.length > 0 && (
        <>
          {(() => {
            const hasPlaybooks = pb.status === "ready" && pb.playbooks.length > 0;
            return (
              <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                {hasPlaybooks && (
                  <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                    <Field label="Triage against">
                      <select
                        value={pbId}
                        onChange={(e) => setPbId(e.target.value)}
                        disabled={anyBusy}
                      >
                        <option value="">General legal judgment</option>
                        {pb.playbooks.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
                <Button
                  variant="primary"
                  block={!hasPlaybooks}
                  onClick={runTriage}
                  loading={triage === "running"}
                  disabled={anyBusy}
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
              const v = verdicts[c.text];
              const canResolve = c.text.trim().length > 0;
              return (
                <div key={`${i}-${c.text.slice(0, 24)}`} className="card change-item">
                  <div className="change-item__head">
                    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      {changeTypeBadge(c.type)}
                      {v && verdictBadge(v.verdict)}
                    </div>
                    {canResolve && (
                      <IconButton label="Find in document" onClick={() => void locate(c.text)}>
                        <LocateIcon size={13} />
                      </IconButton>
                    )}
                  </div>
                  <p className="change-item__text">
                    {c.author ? <strong>{c.author}: </strong> : null}
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
                      >
                        <XIcon size={13} /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
        <div className="stack" style={{ gap: 6 }}>
          <h2 className="small muted">Comments ({comments.length})</h2>
          {comments.map((c, i) => (
            <div key={i} className="card change-item">
              <p className="change-item__text">
                {c.author ? <strong>{c.author}: </strong> : null}
                {c.text}
                {c.resolved ? <span className="small muted"> (resolved)</span> : null}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
