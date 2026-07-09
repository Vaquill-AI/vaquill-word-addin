import { useState } from "react";
import { Badge, Button } from "@/ui/primitives";
import { CheckIcon, ChevronIcon } from "@/ui/icons";
import { replaceSelectionTracked } from "@/office/selection";
import type { PlaybookPosition } from "@/api/playbooks";

function humanize(clauseType: string): string {
  return clauseType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function priorityBadge(priority?: string | null) {
  if (priority === "must_have") return <Badge tone="red">Must-have</Badge>;
  if (priority === "should_have") return <Badge tone="yellow">Should-have</Badge>;
  if (priority === "nice_to_have") return <Badge tone="neutral">Nice-to-have</Badge>;
  return null;
}

type RungTone = "green" | "amber" | "red";

function Rung({
  label,
  tone,
  text,
  insertable,
}: {
  label: string;
  tone: RungTone;
  text: string;
  insertable: boolean;
}) {
  const [inserting, setInserting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function insert() {
    setInserting(true);
    setErr(null);
    try {
      await replaceSelectionTracked(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setInserting(false);
    }
  }

  return (
    <div className="rung">
      <div className="rung__head">
        <span className={`rung__dot rung__dot--${tone}`} aria-hidden />
        <span className="rung__label">{label}</span>
        {insertable && (
          <Button variant="ghost" size="sm" onClick={insert} loading={inserting}>
            {done ? (
              <>
                <CheckIcon size={13} /> Inserted
              </>
            ) : (
              "Insert"
            )}
          </Button>
        )}
      </div>
      <p className="rung__text">{text}</p>
      {err && <span className="small redline__note--err">{err}</span>}
    </div>
  );
}

export function LadderCard({
  clauseType,
  position,
}: {
  clauseType: string;
  position: PlaybookPosition;
}) {
  return (
    <details className="card ladder">
      <summary className="ladder__summary">
        <span className="ladder__chevron" aria-hidden>
          <ChevronIcon size={14} />
        </span>
        <span className="ladder__title">{humanize(clauseType)}</span>
        {priorityBadge(position.priority)}
      </summary>

      <div className="ladder__body">
        {position.acceptableRange && (
          <p className="small muted" style={{ margin: 0 }}>
            Acceptable range: {position.acceptableRange}
          </p>
        )}

        <div className="ladder__rungs">
          <Rung label="Preferred" tone="green" text={position.standardPosition} insertable />
          {position.fallbackLadder.map((f, i) => (
            <Rung key={i} label={`Fallback ${i + 1}`} tone="amber" text={f} insertable />
          ))}
          {position.dealBreaker && (
            <Rung
              label="Walk-away - do not accept below"
              tone="red"
              text={position.dealBreaker}
              insertable={false}
            />
          )}
        </div>

        {position.escalationTriggers && position.escalationTriggers.length > 0 && (
          <div className="ladder__triggers">
            <span className="small muted">Escalate if:</span>
            {position.escalationTriggers.map((t, i) => (
              <span key={i} className="ladder__trigger small">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
