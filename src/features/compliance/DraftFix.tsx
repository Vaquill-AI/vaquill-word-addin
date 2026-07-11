import { useState } from "react";
import { Banner, Button, LiveRegion, Spinner } from "@/ui/primitives";
import type { ComplianceRequirement } from "@/api/clause-tools";
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
  const { state, draft, insert, reset } = useDraftFix(req);
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by the host; the visible text is still there
      // for a manual copy, so fail silently rather than alarm the user.
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
            Try again
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
        <Button size="sm" onClick={() => void copy(state.text)}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>
          {state.inserted ? "Done" : "Discard"}
        </Button>
      </div>

      {state.inserted ? (
        <LiveRegion>
          <p className="draft-fix__hint small draft-fix__inserted">
            Inserted as a tracked change. Review and accept it in the document.
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
