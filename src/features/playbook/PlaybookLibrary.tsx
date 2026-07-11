import type { ReactNode } from "react";
import { Badge, Button } from "@/ui/primitives";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import type { PlaybookDetail } from "@/api/playbooks";

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PlaybookRow({ playbook, onOpen }: { playbook: PlaybookDetail; onOpen: () => void }) {
  const clauseCount = Object.keys(playbook.positions).length;
  return (
    <button type="button" className="playbook-row" role="listitem" onClick={onOpen}>
      <span className="playbook-row__name">
        {playbook.name}
        {playbook.isDefault && <Badge tone="brand">Default</Badge>}
      </span>
      <span className="playbook-row__meta small muted">
        {humanize(playbook.contractType)} · {clauseCount} clause{clauseCount === 1 ? "" : "s"}
      </span>
    </button>
  );
}

/**
 * Searchable list of the user's playbooks. Presentational shell over
 * ScopedSearchList (Agent 2's primitive); the caller owns selection + the "New"
 * action. Scope tabs / published / modified-time are intentionally omitted: the
 * playbook API exposes none of those yet (playbooks are per-user; `isDefault` is
 * the per-contract-type default, surfaced as a badge). Those are a backend
 * follow-up.
 */
export function PlaybookLibrary({
  playbooks,
  query,
  onQuery,
  onOpen,
  action,
}: {
  playbooks: PlaybookDetail[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
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
        <PlaybookRow key={p.id} playbook={p} onOpen={() => onOpen(p.id)} />
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
