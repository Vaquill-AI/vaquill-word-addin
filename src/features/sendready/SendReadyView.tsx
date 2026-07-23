import { useCallback, useEffect, useState, type ReactNode } from "react";
import { errorMessage } from "@/api/errors";
import { ViewHeader } from "@/ui/ViewHeader";
import { RescanButton } from "@/ui/RescanButton";
import { Banner, Button, Spinner } from "@/ui/primitives";
import {
  CheckIcon,
  ArrowLeftIcon,
  EditIcon,
  CommentIcon,
  ShieldCheckIcon,
  TermsIcon,
  LinkIcon,
  HashIcon,
  ChecklistIcon,
} from "@/ui/icons";
import { TONE_COLOR, TONE_TINT, type StatusTone } from "@/ui/status";
import { useAppNav, type ToolKey } from "@/app/nav";
import { GovernanceView } from "@/features/governance/GovernanceView";
import { readDocumentChanges, acceptAllTrackedChanges } from "@/office/changes";
import { countDocumentComments, deleteAllComments } from "@/office/comments";
import { readDocumentText } from "@/office/document";
import { readNumberedParagraphs } from "@/office/structure";
import { readLedger } from "@/office/governance";
import { scanText } from "@/features/redact/detect";
import { CATEGORIES } from "@/features/redact/categories";
import { analyzeDefinedTerms } from "@/lib/defined-terms";
import { analyzeCrossReferences } from "@/lib/cross-references";
import { analyzeFigures } from "@/lib/figures";
import { ScrubMetadata } from "@/features/integration/ScrubMetadata";
import "./sendready.css";

// The regex-only redaction categories (structured PII). The pre-flight uses the
// cheap local scan for a count; the Redact tool runs the full AI pass on demand.
const ALL_REDACT_KEYS = new Set(CATEGORIES.map((c) => c.key));

interface Scan {
  trackedChanges: number;
  comments: number;
  redactCandidates: number;
  termIssues: number;
  xrefBroken: number;
  figureIssues: number;
  signoff: string;
}

type State =
  | { status: "scanning" }
  | { status: "ready"; scan: Scan }
  | { status: "error"; error: string };

/**
 * Send-ready: the pre-flight for the anxious "is this safe to send?" moment. One
 * screen that scans the open document for everything that should not leave the
 * building (unresolved tracked changes, comments carrying internal notes,
 * sensitive data, defined-term / cross-reference defects, and sign-off status),
 * fixes the two most common blockers inline (accept changes, remove comments),
 * and routes to the specialist tool for the rest. Chains pieces that already
 * exist rather than duplicating them.
 */
export function SendReadyView() {
  const nav = useAppNav();
  const [state, setState] = useState<State>({ status: "scanning" });
  const [busy, setBusy] = useState<null | "changes" | "comments">(null);
  const [note, setNote] = useState<string | null>(null);
  // Accept-all and Remove-all destroy work irreversibly from one click (every
  // tracked change flattened, every comment thread deleted, including the
  // counterparty's). Clean copy gates the same two operations behind a confirm;
  // this one did not. `confirmKey` is the pending destructive action.
  const [confirmKey, setConfirmKey] = useState<"changes" | "comments" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Sign-off is the final send step, so it lives here rather than as its own
  // sub-tab: the row opens the governance view inline.
  const [showSignoff, setShowSignoff] = useState(false);

  const scan = useCallback(async () => {
    setNote(null);
    setState({ status: "scanning" });
    try {
      // Sequential, not Promise.all: overlapping Word.run reads can conflict on
      // some hosts (Word on the web), and this scan must be reliable. Each read
      // is cheap and this runs once per open, so the latency is not felt.
      const changes = await readDocumentChanges();
      const comments = await countDocumentComments();
      const text = await readDocumentText();
      const paragraphs = await readNumberedParagraphs();
      const ledger = await readLedger();
      setState({
        status: "ready",
        scan: {
          trackedChanges: changes.trackedChanges.length,
          comments,
          redactCandidates: scanText(text, ALL_REDACT_KEYS).length,
          termIssues: analyzeDefinedTerms(text).findings.length,
          xrefBroken: analyzeCrossReferences(paragraphs).broken.length,
          figureIssues: analyzeFigures(text).mismatches.length,
          signoff: ledger?.status ?? "none",
        },
      });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  async function acceptChanges() {
    setBusy("changes");
    setNote(null);
    setDone(null);
    try {
      const n = await acceptAllTrackedChanges();
      setConfirmKey(null);
      // Say what happened and that it is reversible, like Clean copy does.
      setDone(`Accepted ${n} tracked change${n === 1 ? "" : "s"}. Word's Undo (Ctrl+Z) reverses it.`);
      await scan();
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeComments() {
    setBusy("comments");
    setNote(null);
    setDone(null);
    try {
      const n = await deleteAllComments();
      setConfirmKey(null);
      setDone(`Removed ${n} comment${n === 1 ? "" : "s"}. Word's Undo (Ctrl+Z) reverses it.`);
      await scan();
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const openTool = (tool: ToolKey) => nav.navigate("tools", { kind: "openTool", tool });
  // Returning from the inline sign-off view re-scans, so a just-recorded sign-off
  // updates the checklist row.
  const closeSignoff = () => {
    setShowSignoff(false);
    void scan();
  };

  const header = (
    <ViewHeader
        title="Send-ready"
        info="A pre-send check: what still needs attention before this document leaves the building. Fixes the common blockers here (accept changes, remove comments) and opens the right tool for the rest. It cannot strip author names / hidden metadata cross-platform, so it points you at Word's Inspect Document for that."
        subtitle="Check what still needs fixing before you send this document."
      />
  );

  if (showSignoff) {
    return (
      <div className="stack sendready-view">
        <Button
          variant="ghost"
          size="sm"
          onClick={closeSignoff}
          style={{ alignSelf: "flex-start" }}
          aria-label="Back to Send-ready"
        >
          <ArrowLeftIcon size={14} /> Send-ready
        </Button>
        <GovernanceView />
      </div>
    );
  }

  if (state.status === "scanning") {
    return (
      <div className="stack sendready-view">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Checking the document...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack sendready-view">
        {header}
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="default" size="sm" onClick={() => void scan()} style={{ alignSelf: "flex-start" }}>
          Try again
        </Button>
      </div>
    );
  }

  const s = state.scan;
  const blockers =
    (s.comments > 0 ? 1 : 0) +
    (s.xrefBroken > 0 ? 1 : 0) +
    (s.figureIssues > 0 ? 1 : 0) +
    (s.signoff === "pending_signoff" ? 1 : 0);

  return (
    <div className="stack sendready-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="view-title">Send-ready</h1>
        <span data-tour="sr-rescan">
          <RescanButton onClick={() => void scan()} />
        </span>
      </div>

      {blockers > 0 ? (
        <Banner tone="danger">
          Not ready to send: {blockers} item{blockers === 1 ? "" : "s"} to resolve. Review the list
          below.
        </Banner>
      ) : (
        <Banner tone="success">
          <CheckIcon size={13} /> This document looks ready to send. Clear any advisories below if
          they apply.
        </Banner>
      )}

      {note && <Banner tone="danger">{note}</Banner>}
      {done && <Banner tone="info">{done}</Banner>}
      {confirmKey === "changes" && (
        <Banner tone="warn">
          This flattens every tracked change in the document, including the counterparty's. Word's
          Undo (Ctrl+Z) reverses it.
        </Banner>
      )}
      {confirmKey === "comments" && (
        <Banner tone="warn">
          This deletes every comment thread in the document, including the counterparty's and any
          internal notes you have not actioned. Word's Undo (Ctrl+Z) reverses it.
        </Banner>
      )}

      <div className="stack sendready-list" data-tour="sr-checklist">
        <Row
          tone={s.trackedChanges > 0 ? "yellow" : "green"}
          icon={<EditIcon size={15} />}
          label="Tracked changes"
          detail={
            s.trackedChanges > 0
              ? `${s.trackedChanges} change${s.trackedChanges === 1 ? "" : "s"}. Accept them for a clean copy, or send as a redline.`
              : "None. The text is final."
          }
          action={
            s.trackedChanges > 0 ? (
              confirmKey === "changes" ? (
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="danger" loading={busy === "changes"} disabled={!!busy} onClick={() => void acceptChanges()}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmKey(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="default" disabled={!!busy} onClick={() => setConfirmKey("changes")}>
                  Accept all
                </Button>
              )
            ) : null
          }
        />
        <Row
          tone={s.comments > 0 ? "red" : "green"}
          icon={<CommentIcon size={15} />}
          label="Comments"
          detail={
            s.comments > 0
              ? `${s.comments} comment${s.comments === 1 ? "" : "s"}. These travel in the file, an internal note would reach the recipient.`
              : "None. No notes will travel with the file."
          }
          action={
            s.comments > 0 ? (
              confirmKey === "comments" ? (
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="danger" loading={busy === "comments"} disabled={!!busy} onClick={() => void removeComments()}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setConfirmKey(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="default" disabled={!!busy} onClick={() => setConfirmKey("comments")}>
                  Remove all
                </Button>
              )
            ) : null
          }
        />
        <Row
          tone={s.redactCandidates > 0 ? "neutral" : "green"}
          icon={<ShieldCheckIcon size={15} />}
          label="Sensitive data"
          detail={
            s.redactCandidates > 0
              ? `${s.redactCandidates} possible item${s.redactCandidates === 1 ? "" : "s"} (emails, IDs, amounts). Review before sending externally.`
              : "No structured sensitive data detected."
          }
          action={
            s.redactCandidates > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => openTool("redact")}>
                Redact
              </Button>
            ) : null
          }
        />
        <Row
          tone={s.termIssues > 0 ? "yellow" : "green"}
          icon={<TermsIcon size={15} />}
          label="Defined terms"
          detail={s.termIssues > 0 ? `${s.termIssues} issue${s.termIssues === 1 ? "" : "s"} to review.` : "No defined-term issues."}
          action={
            s.termIssues > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => openTool("terms")}>
                Review
              </Button>
            ) : null
          }
        />
        <Row
          tone={s.xrefBroken > 0 ? "red" : "green"}
          icon={<LinkIcon size={15} />}
          label="Cross-references"
          detail={s.xrefBroken > 0 ? `${s.xrefBroken} broken reference${s.xrefBroken === 1 ? "" : "s"}.` : "All references resolve."}
          action={
            s.xrefBroken > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => openTool("xref")}>
                Review
              </Button>
            ) : null
          }
        />
        <Row
          tone={s.figureIssues > 0 ? "red" : "green"}
          icon={<HashIcon size={15} />}
          label="Figures"
          detail={
            s.figureIssues > 0
              ? `${s.figureIssues} number${s.figureIssues === 1 ? "" : "s"} written in words that do not match the numeral beside it.`
              : "Words and numerals agree."
          }
          action={
            s.figureIssues > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => openTool("figures")}>
                Review
              </Button>
            ) : null
          }
        />
        <Row
          tone={signoffTone(s.signoff)}
          icon={<ChecklistIcon size={15} />}
          label="Sign-off"
          detail={signoffDetail(s.signoff)}
          action={
            <Button size="sm" variant="ghost" onClick={() => setShowSignoff(true)}>
              {s.signoff === "pending_signoff" ? "Sign off" : "Open"}
            </Button>
          }
        />
      </div>

      <ScrubMetadata />
    </div>
  );
}

function signoffTone(status: string): StatusTone {
  if (status === "signed_off" || status === "cleared") return "green";
  if (status === "pending_signoff") return "red";
  return "neutral";
}

function signoffDetail(status: string): string {
  if (status === "signed_off") return "Signed off and recorded in the file.";
  if (status === "cleared") return "No sign-off required.";
  if (status === "pending_signoff") return "Sign-off is required before sending.";
  return "No sign-off record yet. Run a review to create one.";
}

function Row({
  tone,
  icon,
  label,
  detail,
  action,
}: {
  tone: StatusTone;
  icon: ReactNode;
  label: string;
  detail: string;
  action: ReactNode;
}) {
  // A passed check (green) reads best as a check; anything needing attention
  // keeps its category icon so the row is identifiable at a glance.
  const passed = tone === "green";
  return (
    <div className={`sendready-row${passed ? " sendready-row--ok" : ""}`}>
      <span
        className="sendready-row__badge"
        style={{ background: TONE_TINT[tone], color: TONE_COLOR[tone] }}
        aria-hidden
      >
        {passed ? <CheckIcon size={15} /> : icon}
      </span>
      <div className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
        <span className="sendready-row__label">{label}</span>
        <span className="small muted">{detail}</span>
      </div>
      {action}
    </div>
  );
}
