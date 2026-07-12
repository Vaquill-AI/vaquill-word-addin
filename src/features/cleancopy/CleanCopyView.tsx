import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Button, Spinner, Toggle } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon, CleanIcon } from "@/ui/icons";
import { readDocumentChanges, acceptAllTrackedChanges } from "@/office/changes";
import { deleteAllComments, countDocumentComments } from "@/office/comments";
import "./clean-copy.css";

type Scan = { trackedChanges: number; comments: number };

type Phase =
  | { status: "scanning" }
  | { status: "ready"; scan: Scan }
  | { status: "confirm"; scan: Scan }
  | { status: "applying" }
  | { status: "done"; accepted: number; removed: number }
  | { status: "error"; error: string };

/**
 * Produce a clean copy before the document leaves the building, with a safety
 * guard. Sending a contract that still carries tracked changes or (worse)
 * internal comments is a named real-world hazard, lawyers have emailed their
 * redline strategy to opposing counsel. This surfaces exactly what the document
 * still contains and lets the user flatten it in one deliberate, confirmed step.
 *
 * "Clean" = accept all tracked changes (final text) + delete all comments (they
 * travel inside the .docx). Both are opt-out toggles. Residual metadata (author,
 * document properties, prior revisions Word did not surface) is out of scope
 * cross-platform, so the done state points the user at Word's Inspect Document.
 */
export function CleanCopyView() {
  const [phase, setPhase] = useState<Phase>({ status: "scanning" });
  const [acceptChanges, setAcceptChanges] = useState(true);
  const [removeComments, setRemoveComments] = useState(true);

  const scan = useCallback(async () => {
    setPhase({ status: "scanning" });
    try {
      // Comment count is read whole-document (countDocumentComments) so the badge
      // matches deleteAllComments' scope; getTrackedChanges is body-scoped, which
      // is where tracked changes live.
      const [c, comments] = await Promise.all([readDocumentChanges(), countDocumentComments()]);
      setPhase({
        status: "ready",
        scan: { trackedChanges: c.trackedChanges.length, comments },
      });
    } catch (e) {
      setPhase({ status: "error", error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  async function apply() {
    setPhase({ status: "applying" });
    // Track progress outside the try so a failure after accepting changes can
    // still tell the user the document was already partially modified (they need
    // to know to Ctrl+Z), rather than dropping that fact on the floor.
    let accepted = 0;
    try {
      if (acceptChanges) accepted = await acceptAllTrackedChanges();
      const removed = removeComments ? await deleteAllComments() : 0;
      setPhase({ status: "done", accepted, removed });
    } catch (e) {
      const partial =
        accepted > 0
          ? ` Note: ${accepted} change${accepted === 1 ? "" : "s"} were already accepted; use Ctrl+Z to undo if needed.`
          : "";
      setPhase({ status: "error", error: `${(e as Error).message}${partial}` });
    }
  }

  const header = (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 className="view-title">Clean copy</h1>
        <InfoTip text="Prepare a send-ready copy: accept every tracked change and remove every comment, so no internal note or unresolved edit travels with the file. Word's Undo (Ctrl+Z) reverses it." />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Flatten changes and strip comments before you send this document.
      </p>
    </div>
  );

  if (phase.status === "scanning") {
    return (
      <div className="stack cleancopy-view">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Scanning the document...</span>
        </div>
      </div>
    );
  }

  if (phase.status === "error") {
    return (
      <div className="stack cleancopy-view">
        {header}
        <Banner tone="danger">{phase.error}</Banner>
        <Button variant="ghost" size="sm" onClick={() => void scan()} style={{ alignSelf: "flex-start" }}>
          Rescan
        </Button>
      </div>
    );
  }

  if (phase.status === "applying") {
    return (
      <div className="stack cleancopy-view">
        {header}
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Producing the clean copy...</span>
        </div>
      </div>
    );
  }

  if (phase.status === "done") {
    return (
      <div className="stack cleancopy-view">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="view-title">Clean copy</h1>
          <Button variant="ghost" size="sm" onClick={() => void scan()}>
            Rescan
          </Button>
        </div>
        <Banner tone="success">
          <CheckIcon size={13} /> Clean copy ready. Accepted {phase.accepted} change
          {phase.accepted === 1 ? "" : "s"} and removed {phase.removed} comment
          {phase.removed === 1 ? "" : "s"}. Word's Undo (Ctrl+Z) reverses this.
        </Banner>
        <Banner tone="warn">
          Before sending, run Word's <strong>File &gt; Info &gt; Inspect Document</strong> to strip
          residual metadata (author names, document properties) that this cannot reach.
        </Banner>
      </div>
    );
  }

  // ready | confirm
  const scanData = phase.scan;
  const isClean = scanData.trackedChanges === 0 && scanData.comments === 0;
  const nothingSelected = !acceptChanges && !removeComments;

  return (
    <div className="stack cleancopy-view">
      {header}

      <div className="stack cleancopy-scan" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Badge tone={scanData.trackedChanges > 0 ? "yellow" : "green"}>
            {scanData.trackedChanges} tracked change{scanData.trackedChanges === 1 ? "" : "s"}
          </Badge>
          <Badge tone={scanData.comments > 0 ? "red" : "green"}>
            {scanData.comments} comment{scanData.comments === 1 ? "" : "s"}
          </Badge>
        </div>

        {isClean ? (
          <Banner tone="success">
            This document has no tracked changes or comments. It is already clean.
          </Banner>
        ) : (
          <>
            {scanData.comments > 0 && (
              <Banner tone="warn">
                Comments travel inside the .docx. Any internal note would be visible to whoever you
                send this to.
              </Banner>
            )}

            <div className="stack cleancopy-options" style={{ gap: 8 }}>
              <div className="row cleancopy-option">
                <Toggle
                  checked={acceptChanges}
                  onChange={setAcceptChanges}
                  label="Accept all tracked changes"
                />
                <div className="stack" style={{ gap: 0 }}>
                  <span className="small" style={{ fontWeight: 600 }}>
                    Accept all tracked changes
                  </span>
                  <span className="small muted">Turn every edit into final text.</span>
                </div>
              </div>
              <div className="row cleancopy-option">
                <Toggle
                  checked={removeComments}
                  onChange={setRemoveComments}
                  label="Remove all comments"
                />
                <div className="stack" style={{ gap: 0 }}>
                  <span className="small" style={{ fontWeight: 600 }}>
                    Remove all comments
                  </span>
                  <span className="small muted">Delete every comment and reply.</span>
                </div>
              </div>
            </div>

            {phase.status === "confirm" ? (
              <div className="stack cleancopy-confirm" style={{ gap: 6 }}>
                <p className="small" style={{ margin: 0 }}>
                  {acceptChanges && removeComments
                    ? `Accept ${scanData.trackedChanges} change${scanData.trackedChanges === 1 ? "" : "s"} and remove ${scanData.comments} comment${scanData.comments === 1 ? "" : "s"}?`
                    : acceptChanges
                      ? `Accept ${scanData.trackedChanges} change${scanData.trackedChanges === 1 ? "" : "s"}?`
                      : `Remove ${scanData.comments} comment${scanData.comments === 1 ? "" : "s"}?`}{" "}
                  Word's Undo reverses it.
                </p>
                <div className="row" style={{ gap: 6 }}>
                  <Button variant="danger" size="sm" onClick={() => void apply()}>
                    <CleanIcon size={14} /> Produce clean copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPhase({ status: "ready", scan: scanData })}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                className="btn--cta"
                onClick={() => setPhase({ status: "confirm", scan: scanData })}
                disabled={nothingSelected}
              >
                <CleanIcon size={14} /> Produce clean copy
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
