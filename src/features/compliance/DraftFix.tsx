import { useState } from "react";
import { copyPlain } from "@/lib/clipboard";
import { Banner, Button, IconButton, LiveRegion, Spinner } from "@/ui/primitives";
import { CheckIcon, CopyIcon, RefreshIcon } from "@/ui/icons";
import type { ComplianceRequirement } from "@/api/clause-tools";
import { useAppNav } from "@/app/nav";
import { useDraftFix } from "./useDraftFix";

/**
 * "Draft a fix" for a compliance gap. Generates suggested contract language that
 * would satisfy the requirement, shows it inline, then lets the reviewer Copy it
 * or Insert it into the document as a tracked change. Nothing is inserted until
 * the user clicks Insert (propose-then-confirm).
 *
 * Rendered only for gaps (non_compliant / partially_compliant) by RequirementCard.
 * Collapsed by default: the idle state is a single button, so the card stays
 * dense until the reviewer asks for a draft.
 */
export function DraftFix({ req }: { req: ComplianceRequirement }) {
  const { navigate } = useAppNav();
  const { state, draft, insert, reset } = useDraftFix(req);
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    // copyPlain falls back to execCommand when the async clipboard API is
    // blocked, so this succeeds in hosts where the bare call did nothing. Only
    // show the tick on a real copy: the text stays on screen for a manual copy.
    if (await copyPlain(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  if (state.status === "idle") {
    return (
      <Button variant="default" size="sm" className="draft-fix__cta" onClick={() => void draft()}>
        Draft a fix
      </Button>
    );
  }

  if (state.status === "drafting") {
    return (
      <div className="draft-fix__loading row">
        <Spinner />
        <span className="small muted">Drafting suggested language...</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="draft-fix stack">
        <Banner tone="danger">{state.error}</Banner>
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" onClick={() => void draft()}>
            <RefreshIcon size={13} /> Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  // ---- Ready: show the draft with Copy / Insert actions --------------------
  return (
    <div className="draft-fix stack">
      <div className="draft-fix__label small muted">Suggested language</div>
      <div className="draft-fix__text">{state.text}</div>

      {state.insertError && <Banner tone="danger">{state.insertError}</Banner>}

      <div className="draft-fix__actions row">
        <Button
          variant="primary"
          size="sm"
          loading={state.inserting}
          disabled={state.inserted}
          onClick={() => void insert(state.text)}
        >
          {state.inserted ? "Inserted" : "Insert into document"}
        </Button>
        <div className="row" style={{ gap: 4, marginLeft: "auto", alignItems: "center" }}>
          <IconButton label={copied ? "Copied" : "Copy"} onClick={() => void copy(state.text)}>
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </IconButton>
          <Button variant="ghost" size="sm" onClick={reset}>
            {state.inserted ? "Done" : "Discard"}
          </Button>
        </div>
      </div>

      {state.inserted ? (
        <LiveRegion>
          <p className="draft-fix__hint small draft-fix__inserted">
            Inserted as a tracked change. Review and accept it in the document.{" "}
            <button
              type="button"
              className="linkaction"
              onClick={() => navigate("review", { kind: "reviewContract" })}
            >
              Review the updated contract
            </button>
          </p>
        </LiveRegion>
      ) : (
        <p className="draft-fix__hint small muted">
          Inserts as a tracked change for your review. Guidance, not legal advice: confirm before
          you rely on it.
        </p>
      )}
    </div>
  );
}
