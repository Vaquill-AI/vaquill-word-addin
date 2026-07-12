import { useEffect, useState } from "react";
import { Badge, Banner, Button, Spinner, SegmentedControl } from "@/ui/primitives";
import { Dropzone } from "@/ui/Dropzone";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon, DownloadIcon } from "@/ui/icons";
import { ApiError, friendlyMessage } from "@/api/errors";
import { downloadDocx, replaceDocumentWithDocx } from "@/office/export";
import { useCompare, type CompareDirection } from "./useCompare";
import "./compare.css";

// A comparison side must be one of these (the backend SourceRef accepts only
// docx/doc/pdf; rtf/odt would upload but then fail the run).
const ACCEPT = ".docx,.doc,.pdf";

const DIRECTION_OPTIONS: { value: CompareDirection; label: string }[] = [
  { value: "docIsRevised", label: "Newer" },
  { value: "docIsOriginal", label: "Older" },
];

/**
 * Document Compare: diff the open document against a reference version and get a
 * native tracked-changes redline. Serves the negotiation loop, "the counterparty
 * sent this back, what changed since the version I sent?". The heavy lifting is
 * the existing `/compare/*` backend; the pane reads the open .docx, uploads both
 * sides, and offers the produced redline to download or apply.
 */
export function CompareView() {
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
      downloadDocx(base64, filename);
    } catch (e) {
      setNote(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
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
      setNote(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 className="view-title">Compare</h1>
        <InfoTip text="Compare the open document against another version to see what changed as native tracked changes. Useful when a counterparty sends a contract back: pick the version you sent as the reference to see exactly what they changed." />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        See what changed between this document and another version.
      </p>
    </div>
  );

  if (state.phase === "ready" && state.comparison) {
    const c = state.comparison;
    return (
      <div className="stack compare-view">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="view-title">Compare</h1>
          <Button variant="ghost" size="sm" onClick={reset}>
            New comparison
          </Button>
        </div>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Badge tone={c.hunkCount > 0 ? "brand" : "green"}>
            {c.hunkCount} change{c.hunkCount === 1 ? "" : "s"}
          </Badge>
          {c.substantiveCount > 0 && (
            <Badge tone="yellow">{c.substantiveCount} substantive</Badge>
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
              <Banner tone="info">
                <CheckIcon size={13} /> The redline replaced the open document. Use Word's Undo
                (Ctrl+Z) to revert.
              </Banner>
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

      <div className="stack" style={{ gap: 6 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          This document is the...
        </span>
        <SegmentedControl<CompareDirection>
          label="Which version is the open document"
          options={DIRECTION_OPTIONS}
          value={direction}
          onChange={setDirection}
        />
        <span className="small muted">
          {direction === "docIsRevised"
            ? "The redline shows what changed from the reference to this document."
            : "The redline shows what changed from this document to the reference."}
        </span>
      </div>

      <Dropzone
        accept={ACCEPT}
        label="Reference version to compare against"
        hint="Word or PDF."
        onFile={(f) => void start(f, direction)}
      />

      {state.phase === "error" && state.error && (
        <div className="stack" style={{ gap: 8 }}>
          <Banner tone="danger">{state.error}</Banner>
          <Button variant="ghost" size="sm" onClick={reset} style={{ alignSelf: "flex-start" }}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
