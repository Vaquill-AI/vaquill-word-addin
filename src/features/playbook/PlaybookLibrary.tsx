import type { ReactNode } from "react";
import { Badge, Button } from "@/ui/primitives";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import type { PlaybookDetail } from "@/api/playbooks";

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
}: {
  playbook: PlaybookDetail;
  onOpen: () => void;
  onRun?: () => void;
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
        <Button variant="default" size="sm" onClick={onRun}>
          Run
        </Button>
      )}
    </div>
  );
}

/**
 * Searchable list of the user's playbooks. Presentational shell over
 * ScopedSearchList (Agent 2's primitive); the caller owns selection + the "New"
 * action.
 *
 * Each row surfaces the real metadata the API emits: the per-contract-type
 * default (`isDefault`), an org-sharing flag (`organizationId` -> "Shared"
 * badge), the clause count, and the last-modified time (`updatedAt`). Scope tabs
 * are deliberately NOT used: org-sharing is binary and almost always empty for a
 * solo user, so a "Shared" tab would usually render blank and read as broken. A
 * "Shared" badge conveys the same real distinction without that failure mode.
 * There is no published / approval status on a playbook row, so no such badge.
 */
export function PlaybookLibrary({
  playbooks,
  query,
  onQuery,
  onOpen,
  onRun,
  action,
}: {
  playbooks: PlaybookDetail[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
  /** When provided, each row gets a one-tap "Run against this document" button. */
  onRun?: (id: string) => void;
  action?: ReactNode;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? playbooks.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || humanize(p.contractType).toLowerCase().includes(q),
      )
    : playbooks;

  return (
    <ScopedSearchList
      query={query}
      onQuery={onQuery}
      searchPlaceholder="Search playbooks..."
      ariaLabel="Your playbooks"
      action={action}
      isEmpty={filtered.length === 0}
      empty={<span className="small muted">No playbooks match your search.</span>}
    >
      {filtered.map((p) => (
        <PlaybookRow
          key={p.id}
          playbook={p}
          onOpen={() => onOpen(p.id)}
          onRun={onRun ? () => onRun(p.id) : undefined}
        />
      ))}
    </ScopedSearchList>
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
