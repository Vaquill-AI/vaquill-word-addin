import { useState } from "react";
import { Banner, Button, Field, Spinner, LiveRegion } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { RedlineCard } from "@/features/review/RedlineCard";
import { editDocument, type EditItem } from "@/api/edit";
import { readDocumentText } from "@/office/document";
import { ApiError, friendlyMessage } from "@/api/errors";
import type { RedlineSuggestion } from "@/api/types";
import type { Decision } from "@/features/review/decisions";

/** Map a backend edit to the RedlineSuggestion the review card renders + applies.
 *  The backend already verified current_language is a literal substring, so the
 *  grounding is "verified" (RedlineCard can apply it in place). */
function toRedline(e: EditItem): RedlineSuggestion {
  return {
    clauseName: e.label,
    sectionReference: e.sectionReference || undefined,
    currentLanguage: e.currentLanguage,
    proposedLanguage: e.proposedLanguage,
    rationale: e.rationale,
    grounding: "verified",
    isDealBreaker: false,
  };
}

type State =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "review"; redlines: RedlineSuggestion[] }
  | { status: "error"; error: string };

/**
 * Whole-document edit mode: describe a change in plain English, get grounded
 * redlines across the document, accept/reject each. Reuses the review
 * RedlineCard for rendering + tracked-change apply.
 */
export function EditView() {
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});

  const decisionOf = (i: number): Decision => decisions[i] ?? "pending";
  const setDecision = (i: number, d: Decision) => setDecisions((p) => ({ ...p, [i]: d }));

  async function generate() {
    const instr = instruction.trim();
    if (!instr) return;
    setState({ status: "generating" });
    setDecisions({});
    try {
      const text = await readDocumentText();
      const edits = await editDocument(text, instr);
      setState({ status: "review", redlines: edits.map(toRedline) });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }

  return (
    <div className="stack">
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Edit document</h1>
          <InfoTip text="Describe a change in plain English and get grounded redlines across the whole document. Each edit is anchored to real text in the document and applied as a tracked change you accept or reject." />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Describe the changes you want. Vaquill AI proposes redlines you can accept or reject.
        </p>
      </div>

      <Field label="Instruction">
        <textarea
          value={instruction}
          rows={3}
          placeholder="e.g. Make this more favorable to the customer: cap liability, soften payment penalties, add a termination-for-convenience right."
          onChange={(e) => setInstruction(e.target.value)}
        />
      </Field>
      <Button
        variant="primary"
        block
        onClick={generate}
        loading={state.status === "generating"}
        disabled={!instruction.trim() || state.status === "generating"}
      >
        Generate edits
      </Button>

      {state.status === "generating" && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <LiveRegion>
            <span className="small muted">Reading the document and drafting edits...</span>
          </LiveRegion>
        </div>
      )}

      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}

      {state.status === "review" &&
        (state.redlines.length === 0 ? (
          <Banner tone="info">
            No grounded edits were proposed for that instruction. Try being more specific.
          </Banner>
        ) : (
          <div className="stack">
            <span className="small muted">
              {state.redlines.length} proposed edit{state.redlines.length === 1 ? "" : "s"}
            </span>
            {state.redlines.map((r, i) => (
              <RedlineCard
                key={`${r.clauseName}-${i}`}
                redline={r}
                index={i}
                decision={decisionOf(i)}
                onDecision={setDecision}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
