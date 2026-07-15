import { useCallback, useEffect, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { readReviewSnapshot } from "@/office/reviewState";
import {
  readNegotiationState,
  writeNegotiationState,
  type ClauseStatus,
} from "@/office/negotiationState";
import { redlineKey } from "@/features/review/decisions";
import { useAppNav } from "@/app/nav";
import { errorMessage } from "@/api/errors";
import "./cockpit.css";

interface Row {
  key: string;
  name: string;
  dealBreaker: boolean;
  decision: "pending" | "accepted" | "rejected";
}

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "empty" }
  | { status: "ready"; rows: Row[]; statusMap: Record<string, ClauseStatus> };

const STATUS_OPTIONS: { value: ClauseStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "agreed", label: "Agreed" },
  { value: "conceded", label: "Conceded" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_TONE: Record<ClauseStatus, "green" | "yellow" | "red" | "neutral"> = {
  open: "yellow",
  agreed: "green",
  conceded: "neutral",
  rejected: "red",
};

/**
 * Deal cockpit: where the negotiation stands, clause by clause. It reads the last
 * contract review (for the clause list) and a negotiation-status part stored in
 * the document, and lets the reviewer mark each clause open / agreed / conceded /
 * rejected. The status is saved into the .docx, so it travels with the file
 * across rounds. This is the client-only seed of a full per-matter ledger.
 */
export function DealCockpitView() {
  const { navigate } = useAppNav();
  const [state, setState] = useState<State>({ status: "loading" });
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setNote(null);
    try {
      const [snap, neg] = await Promise.all([readReviewSnapshot(), readNegotiationState()]);
      const redlines = snap?.result?.redlines ?? [];
      if (redlines.length === 0) {
        setState({ status: "empty" });
        return;
      }
      const seen = new Set<string>();
      const rows: Row[] = [];
      for (const r of redlines) {
        const key = redlineKey(r);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          key,
          name: r.clauseName || "Clause",
          dealBreaker: !!r.isDealBreaker,
          decision: snap?.decisions?.[key] ?? "pending",
        });
      }
      setState({ status: "ready", rows, statusMap: neg?.status ?? {} });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(current: Extract<State, { status: "ready" }>, key: string, value: ClauseStatus) {
    const statusMap = { ...current.statusMap, [key]: value };
    setState({ ...current, statusMap });
    setNote(null);
    try {
      await writeNegotiationState({ savedAt: new Date().toISOString(), status: statusMap });
    } catch (e) {
      setNote(`Could not save status: ${errorMessage(e)}`);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="stack cockpit">
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Reading the deal status...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack cockpit">
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="ghost" size="sm" onClick={() => void load()} style={{ alignSelf: "flex-start" }}>
          Retry
        </Button>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="stack cockpit">
        <ViewHeader title="Deal cockpit" subtitle="Track where each clause stands across the negotiation." />
        <Banner tone="info">
          Run a contract review first. The cockpit then tracks each reviewed clause as you negotiate.
        </Banner>
        <Button
          variant="primary"
          onClick={() => navigate("review", { kind: "reviewContract" })}
          style={{ alignSelf: "flex-start" }}
        >
          Go to review
        </Button>
      </div>
    );
  }

  const { rows, statusMap } = state;
  const counts: Record<ClauseStatus, number> = { open: 0, agreed: 0, conceded: 0, rejected: 0 };
  rows.forEach((r) => (counts[statusMap[r.key] ?? "open"] += 1));
  const openDealBreakers = rows.filter(
    (r) => r.dealBreaker && (statusMap[r.key] ?? "open") === "open",
  ).length;

  return (
    <div className="stack cockpit">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="view-title">Deal cockpit</h1>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <p className="small muted" style={{ margin: 0 }} data-tour="cockpit-summary">
        {counts.agreed} of {rows.length} clause{rows.length === 1 ? "" : "s"} agreed. Status is saved
        in the document and travels with it across rounds.
      </p>

      <div className="cockpit-chips" data-tour="cockpit-status-chips">
        <Badge tone="green">{counts.agreed} agreed</Badge>
        <Badge tone="yellow">{counts.open} open</Badge>
        <Badge tone="neutral">{counts.conceded} conceded</Badge>
        <Badge tone="red">{counts.rejected} rejected</Badge>
      </div>

      {openDealBreakers > 0 && (
        <Banner tone="warn">
          {openDealBreakers} deal-breaker clause{openDealBreakers === 1 ? "" : "s"} still open.
        </Banner>
      )}

      {note && <Banner tone="warn">{note}</Banner>}

      <div className="stack">
        {rows.map((r) => {
          const status = statusMap[r.key] ?? "open";
          return (
            <div key={r.key} className="card cockpit-row">
              <div className="cockpit-row__head">
                <span className="small" style={{ fontWeight: 600, minWidth: 0 }}>
                  {r.name}
                </span>
                <div className="row" style={{ gap: 4, alignItems: "center", flex: "none" }}>
                  {r.dealBreaker && <Badge tone="red">Deal-breaker</Badge>}
                  <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                </div>
              </div>
              <select
                className="cockpit-status"
                data-tour="cockpit-status-select"
                aria-label={`Status of ${r.name}`}
                value={status}
                onChange={(e) => void setStatus(state, r.key, e.target.value as ClauseStatus)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
