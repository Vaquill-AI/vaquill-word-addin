import { useState } from "react";
import { Button, Field } from "@/ui/primitives";
import { PlaybookPicker } from "./PlaybookPicker";
import {
  CONTRACT_TYPES,
  USER_SIDES,
  JURISDICTIONS,
  MARKUP_LEVELS,
  PAPER_SIDES,
  labelOf,
  type ReviewScope,
} from "./constants";
import { getReviewPrefs } from "@/lib/prefs";
import type { RunParams } from "./useReview";

export function ReviewForm({ onRun, busy }: { onRun: (p: RunParams) => void; busy: boolean }) {
  const prefs = getReviewPrefs();
  const [contractType, setContractType] = useState(prefs.contractType || "nda");
  const [userSide, setUserSide] = useState("customer");
  const [scope, setScope] = useState<ReviewScope>("document");
  const [playbookId, setPlaybookId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [includeExtras, setIncludeExtras] = useState(false);
  const [markupLevel, setMarkupLevel] = useState<"light" | "standard" | "firm">("standard");
  const [paperSide, setPaperSide] = useState("");

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        // Jurisdiction + matter are the user's standing context, set once in
        // Settings. Read them fresh at submit so an edit in Settings applies
        // without re-mounting this form.
        const { jurisdiction, matterId } = getReviewPrefs();
        onRun({
          contractType,
          userSide,
          jurisdiction,
          scope,
          playbookId: playbookId || undefined,
          reviewInstructions: instructions,
          includeExtras: scope === "document" ? includeExtras : false,
          matterId: matterId || undefined,
          markupLevel,
          paperSide: (paperSide as "own" | "counterparty") || undefined,
        });
      }}
    >
      {/* Short selects flow into 2+ columns as the pane widens; single column
          when narrow. */}
      <div className="form-grid">
        <Field label="Contract type">
          <select value={contractType} onChange={(e) => setContractType(e.target.value)}>
            {CONTRACT_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="I represent the">
          <select value={userSide} onChange={(e) => setUserSide(e.target.value)}>
            {USER_SIDES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Scope">
          <select value={scope} onChange={(e) => setScope(e.target.value as ReviewScope)}>
            <option value="document">Whole document</option>
            <option value="selection">Selected text only</option>
          </select>
        </Field>

        <PlaybookPicker contractType={contractType} value={playbookId} onChange={setPlaybookId} />

        <Field label="Markup level">
          <select
            value={markupLevel}
            onChange={(e) => setMarkupLevel(e.target.value as "light" | "standard" | "firm")}
          >
            {MARKUP_LEVELS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Whose paper">
          <select value={paperSide} onChange={(e) => setPaperSide(e.target.value)}>
            {PAPER_SIDES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {scope === "document" && (
        <label className="row" style={{ gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={includeExtras}
            onChange={(e) => setIncludeExtras(e.target.checked)}
          />
          <span className="small">Include footnotes and headers/footers</span>
        </label>
      )}

      <Field label="Focus (optional)">
        <textarea
          value={instructions}
          placeholder="e.g. Prioritize liability, indemnity, and termination."
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Field>

      <p className="small muted" style={{ margin: 0 }}>
        Reviewing as {labelOf(JURISDICTIONS, prefs.jurisdiction)}
        {prefs.matterId ? " · grounded in your matter" : ""}. Change in Settings.
      </p>

      <Button type="submit" variant="primary" block loading={busy}>
        Review this contract
      </Button>
    </form>
  );
}
