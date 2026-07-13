import { Badge, Button } from "@/ui/primitives";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import { PlaybookIcon, PlayIcon } from "@/ui/icons";
import { formatRelativeTime } from "@/lib/relativeTime";
import { humanize } from "@/lib/strings";
import type { PlaybookDetail } from "@/api/playbooks";


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
  const modified = formatRelativeTime(playbook.updatedAt);
  return (
    <div className="playbook-row" role="listitem">
      <span className="playbook-row__badge" aria-hidden>
        <PlaybookIcon size={16} />
      </span>
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
        <Button variant="default" size="sm" onClick={onRun} title="Run this playbook against the open document">
          <PlayIcon size={12} /> Run
        </Button>
      )}
    </div>
  );
}

/**
 * Searchable list of the user's playbooks, as a PICKER for acting on the open
 * document: open one to insert a rung, or run it against the document. Playbook
 * MANAGEMENT - create, rename, set-default, delete, versioning, analytics -
 * lives in the Vaquill web app, which is a far richer surface than a 300px pane;
 * `manageHref` deep-links to it rather than reimplementing a worse copy here.
 *
 * Each row surfaces the real metadata the API emits: the per-contract-type
 * default (`isDefault`), an org-sharing flag (`organizationId` -> "Shared"
 * badge), the clause count, and the last-modified time.
 */
export function PlaybookLibrary({
  playbooks,
  query,
  onQuery,
  onOpen,
  onRun,
  manageHref,
}: {
  playbooks: PlaybookDetail[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
  /** When provided, each row gets a one-tap "Run against this document" button. */
  onRun?: (id: string) => void;
  /** Deep-link to playbook management (create / edit / delete) in the web app. */
  manageHref: string;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? playbooks.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || humanize(p.contractType).toLowerCase().includes(q),
      )
    : playbooks;

  const manageLink = (
    <a
      href={manageHref}
      target="_blank"
      rel="noreferrer"
      className="small"
      style={{ color: "var(--brand)" }}
    >
      Manage in Vaquill
    </a>
  );

  const emptySlot =
    playbooks.length === 0 ? (
      <div className="stack playbook-empty">
        <span className="playbook-empty__title">No playbooks yet</span>
        <span className="small muted">
          Create and edit playbooks in the Vaquill web app, then run them here against your document.
        </span>
        <div className="row playbook-empty__cta">
          <a className="btn btn--primary btn--sm" href={manageHref} target="_blank" rel="noreferrer">
            <PlaybookIcon size={14} /> Create a playbook in Vaquill
          </a>
        </div>
      </div>
    ) : (
      <span className="small muted">No playbooks match your search.</span>
    );

  return (
    <ScopedSearchList
      query={query}
      onQuery={onQuery}
      searchPlaceholder="Search playbooks..."
      ariaLabel="Your playbooks"
      action={manageLink}
      isEmpty={filtered.length === 0}
      empty={emptySlot}
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
