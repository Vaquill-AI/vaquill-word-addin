import { useEffect, useRef, useState } from "react";
import { Badge, Button, IconButton } from "@/ui/primitives";
import { LocateIcon, CheckIcon, XIcon, UndoIcon, CopyIcon } from "@/ui/icons";
import { GroundingBadge } from "./GroundingBadge";
import { InlineDiff } from "./InlineDiff";
import { SeverityBadge } from "./SeverityBadge";
import { severityOf } from "@/lib/severity";
import {
  applyVerifiedRedline,
  insertMissingClause,
  canApplyInPane,
  AnchorNotFoundError,
} from "@/office/redline";
import { selectClauseInDocument } from "@/office/navigate";
import type { RedlineSuggestion } from "@/api/types";
import type { Decision } from "./decisions";

const APPROVAL_LABEL: Record<string, string> = { manager: "Manager", partner: "Partner", gc: "GC" };

export function RedlineCard({
  redline,
  index,
  decision,
  onDecision,
}: {
  redline: RedlineSuggestion;
  index: number;
  decision: Decision;
  onDecision: (index: number, decision: Decision) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Keep keyboard focus in the card after it resolves/restores instead of
  // dropping to <body> (WCAG 2.4.3). `actedRef` ensures we only move focus for
  // a decision the user made here, not for a bulk "Apply all" from the action bar.
  const focusRef = useRef<HTMLDivElement>(null);
  const actedRef = useRef(false);
  useEffect(() => {
    if (!actedRef.current) return;
    actedRef.current = false;
    focusRef.current?.focus();
  }, [decision]);

  const isInsertion = redline.grounding === "insertion";
  const applicable = isInsertion || canApplyInPane(redline);
  const style = { animationDelay: `${Math.min(index, 10) * 28}ms` };

  function decide(next: Decision) {
    actedRef.current = true;
    onDecision(index, next);
  }

  async function locate() {
    if (isInsertion) return;
    setNote(null);
    try {
      const found = await selectClauseInDocument(redline.currentLanguage);
      if (!found) setNote("Could not locate this clause in the document.");
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function accept() {
    setBusy(true);
    setNote(null);
    try {
      if (isInsertion) await insertMissingClause(redline);
      else await applyVerifiedRedline(redline);
      decide("accepted");
    } catch (e) {
      setNote(
        e instanceof AnchorNotFoundError
          ? "Could not find this clause verbatim. Use Download redlined copy instead."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyProposed() {
    try {
      await navigator.clipboard.writeText(redline.proposedLanguage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote("Could not copy.");
    }
  }

  // Collapsed states keep resolved items calm and out of the way.
  if (decision === "accepted") {
    return (
      <div className="card redline redline--accepted" ref={focusRef} tabIndex={-1}>
        <span className="redline__resolved-icon redline__resolved-icon--ok">
          <CheckIcon />
        </span>
        <span className="redline__resolved-name">{redline.clauseName}</span>
        <span className="small muted">Applied</span>
        {!isInsertion && (
          <IconButton label="Find in document" onClick={locate}>
            <LocateIcon size={14} />
          </IconButton>
        )}
      </div>
    );
  }

  if (decision === "rejected") {
    return (
      <div className="card redline redline--rejected" ref={focusRef} tabIndex={-1}>
        <span className="redline__resolved-name muted">{redline.clauseName}</span>
        <span className="small muted">Dismissed</span>
        <Button variant="ghost" size="sm" onClick={() => decide("pending")}>
          <UndoIcon size={13} /> Restore
        </Button>
      </div>
    );
  }

  return (
    <div className="card redline redline--enter" style={style} ref={focusRef} tabIndex={-1}>
      <div className="redline__head">
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="redline__num">{index + 1}</span>
          <strong>{redline.clauseName}</strong>
        </div>
        {!isInsertion && (
          <IconButton label="Find in document" onClick={locate}>
            <LocateIcon size={14} />
          </IconButton>
        )}
      </div>

      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        <SeverityBadge severity={severityOf(redline)} />
        {redline.isDealBreaker && <Badge tone="red">Deal-breaker</Badge>}
        {redline.approvalLevel && redline.approvalLevel !== "none" && (
          <Badge tone="yellow">{APPROVAL_LABEL[redline.approvalLevel] ?? redline.approvalLevel}</Badge>
        )}
        <GroundingBadge grounding={redline.grounding} />
      </div>

      {redline.sectionReference && <p className="small muted redline__ref">{redline.sectionReference}</p>}

      {isInsertion ? (
        <p className="redline__text redline__text--ins">{redline.proposedLanguage}</p>
      ) : (
        <InlineDiff before={redline.currentLanguage} after={redline.proposedLanguage} />
      )}

      {redline.rationale && <p className="small muted" style={{ margin: 0 }}>{redline.rationale}</p>}

      <div className="redline__actions">
        {applicable ? (
          <Button variant="primary" size="sm" onClick={accept} loading={busy}>
            <CheckIcon size={14} /> {isInsertion ? "Insert clause" : "Accept"}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={copyProposed}>
            {copied ? (
              <>
                <CheckIcon size={14} /> Copied
              </>
            ) : (
              <>
                <CopyIcon size={14} /> Copy proposed
              </>
            )}
          </Button>
        )}
        <IconButton label="Dismiss" tone="red" onClick={() => decide("rejected")}>
          <XIcon size={14} />
        </IconButton>
        {!applicable && <span className="small muted">Verify manually</span>}
        {note && (
          <span className={`small ${note.includes("Could not") ? "redline__note--err" : "muted"}`}>
            {note}
          </span>
        )}
      </div>
    </div>
  );
}
