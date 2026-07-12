import type { ReactNode } from "react";
import { useState } from "react";
import { Badge, Banner, Button, ConfirmDialog, Field, Modal } from "@/ui/primitives";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import { OverflowMenu, type OverflowMenuItem } from "@/ui/OverflowMenu";
import { CheckIcon, EditIcon, PlaybookIcon, XIcon } from "@/ui/icons";
import { ApiError, friendlyMessage } from "@/api/errors";
import {
  deletePlaybook,
  renamePlaybook,
  setPlaybookDefault,
  type PlaybookDetail,
} from "@/api/playbooks";

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Compact relative-time label ("3d ago") from an ISO timestamp. Returns null for
 * a missing / unparseable value so the caller can omit the label. Tiny by design:
 * we do not pull in a date library for one string.
 */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 45_000) return "just now";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function PlaybookRow({
  playbook,
  onOpen,
  onRun,
  menuItems,
}: {
  playbook: PlaybookDetail;
  onOpen: () => void;
  onRun?: () => void;
  menuItems: OverflowMenuItem[];
}) {
  const clauseCount = Object.keys(playbook.positions).length;
  const modified = relativeTime(playbook.updatedAt);
  return (
    <div className="playbook-row" role="listitem">
      <button type="button" className="playbook-row__main" onClick={onOpen}>
        <span className="playbook-row__name">
          {playbook.name}
          {playbook.isDefault && <Badge tone="brand">Default</Badge>}
          {playbook.organizationId && <Badge tone="neutral">Shared</Badge>}
        </span>
        <span className="playbook-row__meta small muted">
          {humanize(playbook.contractType)} · {clauseCount} clause{clauseCount === 1 ? "" : "s"}
          {modified && ` · modified ${modified}`}
        </span>
      </button>
      {onRun && (
        <Button variant="ghost" size="sm" onClick={onRun}>
          Run
        </Button>
      )}
      <OverflowMenu label={`Actions for ${playbook.name}`} items={menuItems} />
    </div>
  );
}

/**
 * Searchable list of the user's playbooks. Presentational shell over
 * ScopedSearchList; the caller owns selection, the "New" action, and the
 * playbook data source (via `reload`).
 *
 * Each row surfaces the real metadata the API emits: the per-contract-type
 * default (`isDefault`), an org-sharing flag (`organizationId` -> "Shared"
 * badge), the clause count, and the last-modified time (`updatedAt`). Scope tabs
 * are deliberately NOT used: org-sharing is binary and almost always empty for a
 * solo user, so a "Shared" tab would usually render blank and read as broken. A
 * "Shared" badge conveys the same real distinction without that failure mode.
 *
 * Per-row secondary actions (open, rename, set default, delete) live behind a
 * single kebab `OverflowMenu` so the row stays a calm list, not an action bar.
 * Delete routes through a danger `ConfirmDialog`; rename opens a small modal.
 * Every mutation reloads the list on success. (Duplicate and org-share are
 * intentionally omitted: both need backend routes - a server-side /duplicate
 * that copies ALL position fields losslessly, and organization_id on update.)
 */
export function PlaybookLibrary({
  playbooks,
  query,
  onQuery,
  onOpen,
  onRun,
  onNew,
  reload,
  action,
}: {
  playbooks: PlaybookDetail[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
  /** When provided, each row gets a one-tap "Run against this document" button. */
  onRun?: (id: string) => void;
  /** Start the create-from-template flow (used by the empty state CTA). */
  onNew: () => void;
  /** Refetch the playbook list after a mutation so the UI reflects the change. */
  reload: () => void | Promise<void>;
  action?: ReactNode;
}) {
  const [confirmDelete, setConfirmDelete] = useState<PlaybookDetail | null>(null);
  const [renameTarget, setRenameTarget] = useState<PlaybookDetail | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? playbooks.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || humanize(p.contractType).toLowerCase().includes(q),
      )
    : playbooks;

  async function runMutation(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openRename(p: PlaybookDetail) {
    setRenameTarget(p);
    setRenameValue(p.name);
  }

  async function submitRename() {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    const ok = await runMutation(() => renamePlaybook(renameTarget.id, name));
    if (ok) setRenameTarget(null);
  }

  async function confirmDeletion() {
    if (!confirmDelete) return;
    const ok = await runMutation(() => deletePlaybook(confirmDelete.id));
    if (ok) setConfirmDelete(null);
  }

  function itemsFor(p: PlaybookDetail): OverflowMenuItem[] {
    const items: OverflowMenuItem[] = [
      { label: "Open", onSelect: () => onOpen(p.id) },
      { label: "Rename", icon: <EditIcon size={14} />, onSelect: () => openRename(p) },
    ];
    if (!p.isDefault) {
      items.push({
        label: "Set as default",
        icon: <CheckIcon size={14} />,
        onSelect: () => void runMutation(() => setPlaybookDefault(p.id)),
      });
    }
    items.push({
      label: "Delete",
      tone: "danger",
      icon: <XIcon size={14} />,
      onSelect: () => setConfirmDelete(p),
    });
    return items;
  }

  const noPlaybooks = playbooks.length === 0;
  const emptySlot = noPlaybooks ? (
    <div className="stack playbook-empty">
      <span className="playbook-empty__title">No playbooks yet</span>
      <span className="small muted">
        Create one from a starter template to browse each clause's fallback ladder.
      </span>
      <div className="row playbook-empty__cta">
        <Button variant="ghost" size="sm" onClick={onNew}>
          <PlaybookIcon size={14} /> New playbook from template
        </Button>
      </div>
    </div>
  ) : (
    <span className="small muted">No playbooks match your search.</span>
  );

  return (
    <div className="stack" style={{ gap: 8 }}>
      {error && <Banner tone="danger">{error}</Banner>}

      <ScopedSearchList
        query={query}
        onQuery={onQuery}
        searchPlaceholder="Search playbooks..."
        ariaLabel="Your playbooks"
        action={action}
        isEmpty={filtered.length === 0}
        empty={emptySlot}
      >
        {filtered.map((p) => (
          <PlaybookRow
            key={p.id}
            playbook={p}
            onOpen={() => onOpen(p.id)}
            onRun={onRun ? () => onRun(p.id) : undefined}
            menuItems={itemsFor(p)}
          />
        ))}
      </ScopedSearchList>

      {renameTarget && (
        <Modal
          open
          onClose={() => setRenameTarget(null)}
          title="Rename playbook"
          footer={
            <>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <Button
                variant="primary"
                size="sm"
                loading={busy}
                disabled={!renameValue.trim()}
                onClick={() => void submitRename()}
              >
                Save
              </Button>
            </>
          }
        >
          <Field label="Playbook name">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim()) {
                  e.preventDefault();
                  void submitRename();
                }
              }}
            />
          </Field>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete playbook?"
        body={
          <span>
            Delete <strong>{confirmDelete?.name}</strong>? This removes the playbook and its clause
            positions. This cannot be undone.
          </span>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => void confirmDeletion()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/** Re-export for callers that also want the New button styled consistently. */
export function NewPlaybookButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="primary" size="sm" onClick={onClick}>
      New
    </Button>
  );
}
