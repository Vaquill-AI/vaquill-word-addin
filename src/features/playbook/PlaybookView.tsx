import { useState } from "react";
import { Banner, Spinner, Button, Field } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { usePlaybookDetails } from "./usePlaybookDetails";
import { LadderCard } from "./LadderCard";
import { TemplatePicker } from "./TemplatePicker";
import "./playbook.css";

const PRIORITY_ORDER: Record<string, number> = { must_have: 0, should_have: 1, nice_to_have: 2 };

export function PlaybookView() {
  const state = usePlaybookDetails();
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("");
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

  const picker = showPicker && (
    <TemplatePicker
      onClose={() => setShowPicker(false)}
      onCreated={(p) => {
        setSelectedId(p.id);
        setShowPicker(false);
        void state.reload();
      }}
    />
  );

  const playbooks = state.playbooks;
  const playbook = playbooks.find((p) => p.id === selectedId) ?? playbooks[0];
  const q = filter.trim().toLowerCase();
  const entries = playbook
    ? Object.entries(playbook.positions)
        .filter(([k]) => k.replace(/_/g, " ").toLowerCase().includes(q))
        .sort((a, b) => {
          const pa = PRIORITY_ORDER[a[1].priority ?? ""] ?? 3;
          const pb = PRIORITY_ORDER[b[1].priority ?? ""] ?? 3;
          return pa - pb || a[0].localeCompare(b[0]);
        })
    : [];

  return (
    <div className="stack playbook-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <h1 className="view-title">Playbook</h1>
            <InfoTip side="left" text="Your negotiation positions per clause: the preferred position, a fallback ladder to step down to, and the walk-away floor you should not go below. Insert any rung into the document as a tracked change. Positions are guidance, not legal advice; confirm the deal-specific terms." />
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Insert your preferred position, or step down the fallback ladder, as a tracked change.
          </p>
        </div>
        {!showPicker && (
          <Button variant="default" size="sm" onClick={() => setShowPicker(true)}>
            New
          </Button>
        )}
      </div>

      {picker}

      {playbooks.length === 0 ? (
        !showPicker && (
          <Banner tone="info">
            You have no playbooks yet. Create one from a starter template to browse each clause's
            fallback ladder and insert any rung as a tracked change.
          </Banner>
        )
      ) : (
        <>
          {playbooks.length > 1 && (
            <Field label="Playbook">
              <select value={playbook?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
                {playbooks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <input
            className="playbook-filter"
            type="search"
            aria-label="Filter clauses"
            placeholder="Filter clauses..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
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
        </>
      )}
    </div>
  );
}
