import { useState } from "react";
import { Banner, Spinner, Button } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { ArrowLeftIcon } from "@/ui/icons";
import { usePlaybookDetails } from "./usePlaybookDetails";
import { LadderCard } from "./LadderCard";
import { TemplatePicker } from "./TemplatePicker";
import { PlaybookLibrary, NewPlaybookButton } from "./PlaybookLibrary";
import type { PlaybookDetail } from "@/api/playbooks";
import "./playbook.css";
import "./playbook-library.css";

const PRIORITY_ORDER: Record<string, number> = { must_have: 0, should_have: 1, nice_to_have: 2 };

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PlaybookView({
  onRunPlaybook,
}: {
  /** Hand a playbook off to the Review tab to run against the open document. */
  onRunPlaybook?: (playbook: PlaybookDetail) => void;
} = {}) {
  const state = usePlaybookDetails();
  // null = library list; an id = that playbook's detail (its fallback ladders).
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [clauseFilter, setClauseFilter] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  if (state.status === "loading") {
    return (
      <div className="stack playbook-view">
        <div className="row" style={{ gap: 8 }}>
          <Spinner />
          <span className="small muted">Loading your playbooks...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack playbook-view">
        <Banner tone="danger">{state.error}</Banner>
      </div>
    );
  }

  const playbooks = state.playbooks;
  const open = openId ? playbooks.find((p) => p.id === openId) ?? null : null;

  if (showPicker) {
    return (
      <div className="stack playbook-view">
        <TemplatePicker
          onClose={() => setShowPicker(false)}
          onCreated={(p) => {
            setShowPicker(false);
            setOpenId(p.id);
            void state.reload();
          }}
        />
      </div>
    );
  }

  // ---- Detail: one playbook's clause ladders -----------------------------
  if (open) {
    const q = clauseFilter.trim().toLowerCase();
    const entries = Object.entries(open.positions)
      .filter(([k]) => k.replace(/_/g, " ").toLowerCase().includes(q))
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a[1].priority ?? ""] ?? 3;
        const pb = PRIORITY_ORDER[b[1].priority ?? ""] ?? 3;
        return pa - pb || a[0].localeCompare(b[0]);
      });

    return (
      <div className="stack playbook-view">
        <div className="row" style={{ gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpenId(null);
              setClauseFilter("");
            }}
            aria-label="Back to playbooks"
          >
            <ArrowLeftIcon size={14} /> Playbooks
          </Button>
          {onRunPlaybook && (
            <Button variant="primary" size="sm" onClick={() => onRunPlaybook(open)}>
              Run against document
            </Button>
          )}
        </div>
        <div className="stack" style={{ gap: 2 }}>
          <h1 className="view-title">{open.name}</h1>
          <p className="small muted" style={{ margin: 0 }}>
            {humanize(open.contractType)} · insert your preferred position or a fallback rung as a
            tracked change.
          </p>
        </div>

        <input
          className="playbook-filter"
          type="search"
          aria-label="Filter clauses"
          placeholder="Filter clauses..."
          value={clauseFilter}
          onChange={(e) => setClauseFilter(e.target.value)}
        />

        {entries.length === 0 ? (
          <p className="small muted">No clauses match your filter.</p>
        ) : (
          <div className="stack">
            {entries.map(([clauseType, position]) => (
              <LadderCard key={clauseType} clauseType={clauseType} position={position} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Library: searchable list of playbooks -----------------------------
  return (
    <div className="stack playbook-view">
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Playbooks</h1>
          <InfoTip side="left" text="Your negotiation playbooks: per-clause preferred positions, a fallback ladder to step down to, and the walk-away floor. Open one to insert any rung into the document as a tracked change. Guidance, not legal advice." />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Open a playbook to browse its clause positions and insert them as tracked changes.
        </p>
      </div>

      {playbooks.length === 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <Banner tone="info">
            You have no playbooks yet. Create one from a starter template to browse each clause's
            fallback ladder.
          </Banner>
          <Button variant="primary" size="sm" onClick={() => setShowPicker(true)}>
            New playbook
          </Button>
        </div>
      ) : (
        <PlaybookLibrary
          playbooks={playbooks}
          query={query}
          onQuery={setQuery}
          onOpen={setOpenId}
          onRun={
            onRunPlaybook
              ? (id) => {
                  const pb = playbooks.find((p) => p.id === id);
                  if (pb) onRunPlaybook(pb);
                }
              : undefined
          }
          action={<NewPlaybookButton onClick={() => setShowPicker(true)} />}
        />
      )}
    </div>
  );
}
