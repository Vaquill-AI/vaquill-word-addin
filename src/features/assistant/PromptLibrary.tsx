import { useEffect, useState } from "react";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { Badge, Banner, Button, Field, IconButton, Spinner } from "@/ui/primitives";
import { XIcon, EditIcon, TrashIcon } from "@/ui/icons";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import type { SegOption } from "@/ui/primitives";
import { getActiveOrgId } from "@/lib/org";
import { errorMessage } from "@/api/errors";
import {
  createPrompt,
  deletePrompt,
  updatePrompt,
  listPrompts,
  type Prompt,
  type PromptInput,
  type PromptScope,
} from "@/api/prompts";
import "./prompt-library.css";

type ScopeTab = "all" | "mine" | "shared";

type Load =
  | { status: "loading" }
  | { status: "ready"; prompts: Prompt[] }
  | { status: "error"; message: string };

function errMessage(e: unknown): string {
  return errorMessage(e);
}

/**
 * Saved-prompt picker for the assistant composer. Lists the user's own prompts
 * plus org-shared ones, filterable by scope + search, and lets the user save a
 * new prompt (seeded with the current draft). Picking a prompt inserts its body
 * into the composer. Renders as a sheet above the composer with a click-away
 * backdrop.
 */
export function PromptLibrary({
  onClose,
  onUse,
  seedBody,
}: {
  onClose: () => void;
  onUse: (body: string) => void;
  /** Prefill for a new prompt's body, e.g. the current composer draft. */
  seedBody?: string;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [scope, setScope] = useState<ScopeTab>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // The prompt being edited (its own form), or null when not editing.
  const [editing, setEditing] = useState<Prompt | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listPrompts(controller.signal)
      .then((prompts) => setLoad({ status: "ready", prompts }))
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setLoad({ status: "error", message: errMessage(e) });
      });
    return () => controller.abort();
  }, []);

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prompts = load.status === "ready" ? load.prompts : [];
  const counts = {
    all: prompts.length,
    mine: prompts.filter((p) => p.isOwner).length,
    shared: prompts.filter((p) => p.scope === "org").length,
  };
  const scopes: SegOption<ScopeTab>[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "mine", label: "Mine", count: counts.mine },
    { value: "shared", label: "Shared", count: counts.shared },
  ];

  const byScope = prompts.filter((p) =>
    scope === "all" ? true : scope === "mine" ? p.isOwner : p.scope === "org",
  );
  const q = query.trim().toLowerCase();
  const filtered = q
    ? byScope.filter(
        (p) => p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
      )
    : byScope;

  async function handleCreate(input: PromptInput) {
    const created = await createPrompt(input);
    setLoad((l) => (l.status === "ready" ? { status: "ready", prompts: [created, ...l.prompts] } : l));
    setCreating(false);
  }

  async function handleUpdate(id: string, input: PromptInput) {
    const updated = await updatePrompt(id, input);
    setLoad((l) =>
      l.status === "ready"
        ? { status: "ready", prompts: l.prompts.map((p) => (p.id === id ? updated : p)) }
        : l,
    );
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const prev = load;
    // Optimistic remove; restore on failure.
    setLoad((l) =>
      l.status === "ready" ? { status: "ready", prompts: l.prompts.filter((p) => p.id !== id) } : l,
    );
    try {
      await deletePrompt(id);
    } catch {
      setLoad(prev);
    }
  }

  return (
    <>
      <button
        type="button"
        className="prompt-lib__backdrop"
        aria-label="Close prompt library"
        onClick={onClose}
      />
      <div className="prompt-lib" role="dialog" aria-modal="true" aria-label="Prompt library">
        <div className="prompt-lib__head">
          <strong className="small">Prompt library</strong>
          <IconButton label="Close" onClick={onClose}>
            <XIcon size={14} />
          </IconButton>
        </div>

        {load.status === "loading" && (
          <div className="row" style={{ gap: 8, padding: "12px 0" }}>
            <Spinner />
            <span className="small muted">Loading your prompts...</span>
          </div>
        )}

        {load.status === "error" && <Banner tone="danger">{load.message}</Banner>}

        {load.status === "ready" &&
          (creating || editing ? (
            <PromptForm
              seedBody={editing ? undefined : seedBody}
              initial={editing ?? undefined}
              submitLabel={editing ? "Save changes" : "Save prompt"}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
              onSubmit={editing ? (input) => handleUpdate(editing.id, input) : handleCreate}
            />
          ) : (
            <ScopedSearchList
              scopes={scopes}
              activeScope={scope}
              onScope={setScope}
              scopeLabel="Prompt scope"
              query={query}
              onQuery={setQuery}
              searchPlaceholder="Search prompts..."
              ariaLabel="Saved prompts"
              action={
                <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                  New
                </Button>
              }
              isEmpty={filtered.length === 0}
              empty={
                <div className="stack" style={{ gap: 8, alignItems: "center" }}>
                  <span>{q ? "No prompts match your search." : "No saved prompts yet."}</span>
                  {!q && (
                    <Button variant="default" size="sm" onClick={() => setCreating(true)}>
                      Save your first prompt
                    </Button>
                  )}
                </div>
              }
            >
              {filtered.map((p) => (
                <PromptRow
                  key={p.id}
                  prompt={p}
                  onUse={() => {
                    onUse(p.body);
                    onClose();
                  }}
                  onEdit={() => setEditing(p)}
                  onDelete={() => handleDelete(p.id)}
                />
              ))}
            </ScopedSearchList>
          ))}
      </div>
    </>
  );
}

function truncate(text: string, max = 140): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine;
}

function PromptRow({
  prompt,
  onUse,
  onEdit,
  onDelete,
}: {
  prompt: Prompt;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="prompt-row" role="listitem">
      <button type="button" className="prompt-row__main" onClick={onUse} title="Insert into the composer">
        <span className="prompt-row__title">
          {prompt.title}
          {prompt.scope === "org" && <Badge tone="neutral">Shared</Badge>}
        </span>
        <span className="prompt-row__preview small muted">{truncate(prompt.body)}</span>
      </button>
      {prompt.isOwner &&
        (confirming ? (
          <div className="row" style={{ gap: 4, flexShrink: 0 }}>
            <Button variant="default" size="sm" onClick={onDelete}>
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="row" style={{ gap: 4, flexShrink: 0 }}>
            <IconButton label="Edit prompt" onClick={onEdit}>
              <EditIcon size={14} />
            </IconButton>
            <IconButton label="Delete prompt" tone="red" onClick={() => setConfirming(true)}>
              <TrashIcon size={14} />
            </IconButton>
          </div>
        ))}
    </div>
  );
}

function PromptForm({
  seedBody,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  seedBody?: string;
  /** When set, the form edits this prompt (fields pre-filled) instead of creating. */
  initial?: Prompt;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: PromptInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? seedBody?.trim() ?? "");
  const [scope, setScope] = useState<PromptScope>(initial?.scope ?? "private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOrg = !!getActiveOrgId();

  async function save() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), body: body.trim(), scope });
    } catch (e) {
      setError(errMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="stack prompt-form">
      <Field label="Title">
        <input
          value={title}
          placeholder="e.g. Customer-favorable SaaS review"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Prompt">
        <AutoTextarea
          value={body}
          rows={4}
          placeholder="The reusable instruction to insert into the composer."
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <Field label="Visibility">
        <select value={scope} onChange={(e) => setScope(e.target.value as PromptScope)}>
          <option value="private">Private (only me)</option>
          <option value="org" disabled={!hasOrg}>
            Shared with my organization{hasOrg ? "" : " (no organization)"}
          </option>
        </select>
      </Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="row" style={{ gap: 8 }}>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          onClick={save}
          disabled={!title.trim() || !body.trim()}
        >
          {submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
