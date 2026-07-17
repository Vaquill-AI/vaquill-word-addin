import { useEffect, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { isCommunity } from "@/community/edition";
import { UpgradeGate } from "@/ui/UpgradeGate";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { Dropzone } from "@/ui/Dropzone";
import {
  CheckIcon,
  DownloadIcon,
  CompareIcon,
  AlertTriangleIcon,
  PlusIcon,
  RefreshIcon,
} from "@/ui/icons";
import { errorMessage } from "@/api/errors";
import { downloadDocx, replaceDocumentWithDocx } from "@/office/export";
import { useAppNav } from "@/app/nav";
import { useCompare, type CompareDirection } from "./useCompare";
import "./compare.css";

// A comparison side must be one of these (the backend SourceRef accepts only
// docx/doc/pdf; rtf/odt would upload but then fail the run).
const ACCEPT = ".docx,.doc,.pdf";

/**
 * Document Compare: diff the open document against a reference version and get a
 * native tracked-changes redline. Serves the negotiation loop, "the counterparty
 * sent this back, what changed since the version I sent?". The heavy lifting is
 * the existing `/compare/*` backend; the pane reads the open .docx, uploads both
 * sides, and offers the produced redline to download or apply.
 */
export function CompareView() {
  // Document compare runs on the hosted service. In the community edition, show
  // a locked upsell instead of the tool.
  if (isCommunity()) {
    return (
      <div className="stack">
        <ViewHeader
          title="Compare"
          info="Compare the open document against a reference version and get a native tracked-changes redline."
        />
        <UpgradeGate title="Document compare is on the hosted plan">
          Compare the open document against a reference version and get a native tracked-changes
          redline. This runs on Vaquill AI's hosted service.
        </UpgradeGate>
      </div>
    );
  }
  const { navigate } = useAppNav();
  const { state, start, cancel, reset, fetchRedline } = useCompare();
  const [direction, setDirection] = useState<CompareDirection>("docIsRevised");
  const [busy, setBusy] = useState<null | "download" | "replace">(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [replaced, setReplaced] = useState(false);

  // These post-result locals (replaced/note/confirm/busy) are not owned by the
  // hook, so a "New comparison" (reset) would otherwise leave them stale and, on
  // the next result, show a false "redline replaced" banner and hide the Replace
  // button. Clear them whenever we leave the ready state.
  useEffect(() => {
    if (state.phase !== "ready") {
      setReplaced(false);
      setNote(null);
      setConfirmReplace(false);
      setBusy(null);
    }
  }, [state.phase]);

  const busyPhase =
    state.phase === "reading" ||
    state.phase === "uploading" ||
    state.phase === "queuing" ||
    state.phase === "processing";

  async function download() {
    setBusy("download");
    setNote(null);
    try {
      const { base64, filename } = await fetchRedline();
      if (!downloadDocx(base64, filename)) {
        setNote("Could not start the download in this version of Word.");
      }
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function replace() {
    setBusy("replace");
    setNote(null);
    try {
      const { base64 } = await fetchRedline();
      await replaceDocumentWithDocx(base64);
      setReplaced(true);
      setConfirmReplace(false);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <ViewHeader
        title="Compare"
        info="Compare the open document against another version to see what changed as native tracked changes. Useful when a counterparty sends a contract back: pick the version you sent as the reference to see exactly what they changed."
        subtitle="See what changed between this document and another version."
      />
  );

  if (state.phase === "ready" && state.comparison) {
    const c = state.comparison;
    return (
      <div className="stack compare-view">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="view-title">Compare</h1>
          <Button variant="ghost" size="sm" onClick={reset}>
            <PlusIcon size={13} /> New comparison
          </Button>
        </div>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Badge tone={c.hunkCount > 0 ? "brand" : "green"}>
            {c.hunkCount > 0 ? <CompareIcon size={11} /> : <CheckIcon size={11} />}
            {c.hunkCount} change{c.hunkCount === 1 ? "" : "s"}
          </Badge>
          {c.substantiveCount > 0 && (
            <Badge tone="yellow">
              <AlertTriangleIcon size={11} /> {c.substantiveCount} substantive
            </Badge>
          )}
        </div>

        {c.hunkCount === 0 && (
          <Banner tone="info">
            No differences were found between the two versions.
          </Banner>
        )}

        {state.hiddenRevisions && (
          <Banner tone="warn">
            The {state.hiddenRevisions.side} already contained{" "}
            {state.hiddenRevisions.count > 0
              ? `${state.hiddenRevisions.count} tracked change${state.hiddenRevisions.count === 1 ? "" : "s"}`
              : "tracked changes or comments"}
            . Those were compared as-is.
          </Banner>
        )}

        {c.aiSummaryBullets && c.aiSummaryBullets.length > 0 ? (
          <div className="stack" style={{ gap: 4 }}>
            <h3 className="small muted">What changed</h3>
            <ul className="compare-summary stack" style={{ gap: 4 }}>
              {c.aiSummaryBullets.map((b, i) => (
                <li key={i} className="small">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ) : c.aiSummary ? (
          <div className="stack" style={{ gap: 4 }}>
            <h3 className="small muted">What changed</h3>
            <p className="small" style={{ margin: 0 }}>
              {c.aiSummary}
            </p>
          </div>
        ) : null}

        {c.hunkCount > 0 && (
          <div className="compare-actions stack" style={{ gap: 8 }}>
            <Button
              variant="primary"
              className="btn--cta"
              onClick={() => void download()}
              loading={busy === "download"}
              disabled={!!busy}
            >
              <DownloadIcon size={14} /> Download redline
            </Button>

            {replaced ? (
              <div className="stack" style={{ gap: 6 }}>
                <Banner tone="info">
                  <CheckIcon size={13} /> The redline replaced the open document. Use Word's Undo
                  (Ctrl+Z) to revert.
                </Banner>
                {/* Compare -> Changes loop: the redline's tracked changes are now
                    in the open document, so hand them to the triage view. */}
                <Button
                  variant="default"
                  size="sm"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => navigate("review", { kind: "openReviewSub", sub: "changes" })}
                >
                  Triage these changes
                </Button>
              </div>
            ) : confirmReplace ? (
              <div className="stack compare-confirm" style={{ gap: 6 }}>
                <p className="small" style={{ margin: 0 }}>
                  This replaces everything in the open document with the redline. Your current
                  content is not merged. Word's Undo reverses it.
                </p>
                <div className="row" style={{ gap: 6 }}>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void replace()}
                    loading={busy === "replace"}
                    disabled={!!busy}
                  >
                    Replace document
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmReplace(false)}
                    disabled={!!busy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => setConfirmReplace(true)}
                disabled={!!busy}
              >
                Replace open document with redline
              </Button>
            )}
          </div>
        )}

        {note && <Banner tone="danger">{note}</Banner>}
      </div>
    );
  }

  if (busyPhase) {
    return (
      <div className="stack compare-view">
        {header}
        <div className="stack compare-loading" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <Spinner />
            <span className="small muted">{state.step || "Working"}...</span>
          </div>
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // idle / error
  return (
    <div className="stack compare-view">
      {header}

      <Dropzone
        accept={ACCEPT}
        label="Reference version to compare against"
        hint="Word or PDF."
        onFile={(f) => void start(f, direction)}
      />

      {/* The common case (open doc = the newer version the counterparty sent back)
          is assumed, so we do not make the user affirm it. A quiet swap covers the
          reverse case. */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span className="small muted">
          {direction === "docIsRevised"
            ? "This document is the newer version; attach the one you sent."
            : "This document is the older version; attach the newer one."}
        </span>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() =>
            setDirection(direction === "docIsRevised" ? "docIsOriginal" : "docIsRevised")
          }
        >
          Swap direction
        </Button>
      </div>

      {state.phase === "error" && state.error && (
        <div className="stack" style={{ gap: 8 }}>
          <Banner tone="danger">{state.error}</Banner>
          <Button variant="ghost" size="sm" onClick={reset} style={{ alignSelf: "flex-start" }}>
            <RefreshIcon size={13} /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}
