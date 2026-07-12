import { useEffect, useState, type ReactNode } from "react";
import { Badge, Spinner } from "@/ui/primitives";
import {
  ReviewIcon,
  DraftIcon,
  AssistantIcon,
  ShieldCheckIcon,
  CheckIcon,
} from "@/ui/icons";
import { useAppNav } from "@/app/nav";
import { getDocumentStats } from "@/office/document";
import { readDocumentChanges } from "@/office/changes";
import { readLedger } from "@/office/governance";
import type { GovernanceStatus } from "@/lib/governance";
import "./home.css";

interface DocSignals {
  words: number;
  trackedChanges: number;
  openComments: number;
  signoff: GovernanceStatus | null;
}

const SIGNOFF_LABEL: Record<GovernanceStatus, string> = {
  cleared: "No sign-off needed",
  pending_signoff: "Sign-off pending",
  signed_off: "Signed off",
};

const SIGNOFF_TONE: Record<GovernanceStatus, "green" | "yellow" | "neutral"> = {
  cleared: "neutral",
  pending_signoff: "yellow",
  signed_off: "green",
};

/**
 * Cockpit. Instead of six equal tabs, this orients the user: it reads the live
 * state of the open document (length, counterparty tracked changes, open
 * comments, sign-off status) and offers next-best-actions that route into the
 * right surface with context pre-filled. It never blocks on the document read;
 * signals fill in when they resolve and degrade quietly if the host cannot read.
 */
export function HomeView() {
  const { navigate, setTab, setReviewSub } = useAppNav();
  const [signals, setSignals] = useState<DocSignals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [stats, changes, ledger] = await Promise.all([
          getDocumentStats().catch(() => ({ chars: 0, words: 0 })),
          readDocumentChanges().catch(() => ({ trackedChanges: [], comments: [] })),
          readLedger().catch(() => null),
        ]);
        if (!alive) return;
        setSignals({
          words: stats.words,
          trackedChanges: changes.trackedChanges.length,
          openComments: changes.comments.filter((c) => !c.resolved).length,
          signoff: ledger?.status ?? null,
        });
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const hasDoc = (signals?.words ?? 0) > 0;

  return (
    <div className="stack home">
      <div className="home__greeting">
        <p className="home__title">What do you want to do with this contract?</p>
        <p className="home__sub small muted">
          Pick an action, or check the state of the open document below.
        </p>
      </div>

      {/* Live document state, each with a jump into the surface that resolves it. */}
      <div className="card card--pad stack home__state">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="small" style={{ fontWeight: 600 }}>
            This document
          </span>
          {loading && <Spinner />}
        </div>
        {!loading && !hasDoc ? (
          <p className="small muted" style={{ margin: 0 }}>
            No text detected in the open document yet.
          </p>
        ) : (
          <div className="home__signals">
            <div className="home__signal">
              <span className="home__signal-val">{signals?.words ?? 0}</span>
              <span className="small muted">words</span>
            </div>
            <button
              type="button"
              className="home__signal home__signal--btn"
              onClick={() => {
                setReviewSub("changes");
                setTab("review");
              }}
            >
              <span className="home__signal-val">{signals?.trackedChanges ?? 0}</span>
              <span className="small muted">counterparty changes</span>
            </button>
            <div className="home__signal">
              <span className="home__signal-val">{signals?.openComments ?? 0}</span>
              <span className="small muted">open comments</span>
            </div>
            <button
              type="button"
              className="home__signal home__signal--btn"
              onClick={() => navigate("tools", { kind: "openTool", tool: "sendready" })}
            >
              {signals?.signoff ? (
                <Badge tone={SIGNOFF_TONE[signals.signoff]}>{SIGNOFF_LABEL[signals.signoff]}</Badge>
              ) : (
                <span className="small muted">Sign-off not set</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Next-best-actions. */}
      <div className="stack home__actions">
        <ActionRow
          icon={<ReviewIcon size={18} />}
          title="Review this contract"
          desc="Grounded redlines from your side, as tracked changes."
          onClick={() => navigate("review", { kind: "reviewContract" })}
        />
        <ActionRow
          icon={<CheckIcon size={18} />}
          title="Check citations"
          desc="Verify every case and statute cite against the US corpus."
          onClick={() => navigate("review", { kind: "checkCitations" })}
        />
        <ActionRow
          icon={<ShieldCheckIcon size={18} />}
          title="Check compliance"
          desc="Test the document against a regulation or your guidelines."
          onClick={() => navigate("review", { kind: "reviewPreset", preset: "compliance" })}
        />
        <ActionRow
          icon={<DraftIcon size={18} />}
          title="Draft a document"
          desc="Generate a first-draft agreement into this file."
          onClick={() => navigate("draft")}
        />
        <ActionRow
          icon={<AssistantIcon size={18} />}
          title="Ask the assistant"
          desc="Ask anything about the open contract, grounded in US law."
          onClick={() => navigate("assistant")}
        />
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="home__action" onClick={onClick}>
      <span className="home__action-icon" aria-hidden>
        {icon}
      </span>
      <span className="home__action-body">
        <span className="home__action-title">{title}</span>
        <span className="home__action-desc small muted">{desc}</span>
      </span>
    </button>
  );
}
