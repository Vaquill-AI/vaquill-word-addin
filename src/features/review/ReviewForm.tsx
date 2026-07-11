import { useState } from "react";
import { Button, Field, SegmentedControl, Toggle } from "@/ui/primitives";
import { Combobox } from "@/ui/Combobox";
import { PlaybookPicker } from "./PlaybookPicker";
import {
  CONTRACT_TYPES,
  USER_SIDES,
  JURISDICTIONS,
  labelOf,
  type ReviewScope,
} from "./constants";
import { getReviewPrefs } from "@/lib/prefs";
import type { RunParams } from "./useReview";

type MarkupLevel = "light" | "standard" | "firm";
type PaperSide = "" | "counterparty" | "own";

/** Scale of markup, ordered light to firm for the segmented control. */
const MARKUP_OPTIONS: { value: MarkupLevel; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "standard", label: "Standard" },
  { value: "firm", label: "Firm" },
];

/** Live named-level caption shown under the markup segmented control. */
const MARKUP_CAPTION: Record<MarkupLevel, string> = {
  light: "Light: only flag escalation triggers.",
  standard: "Standard: mark gaps to your preferred position.",
  firm: "Firm: hard-line every deviation.",
};

const PAPER_OPTIONS: { value: PaperSide; label: string }[] = [
  { value: "", label: "Not sure" },
  { value: "counterparty", label: "Their paper" },
  { value: "own", label: "Our paper" },
];

/** Aggressiveness nuance, moved off the segment labels into helper text. */
const PAPER_CAPTION: Record<PaperSide, string> = {
  "": "We infer whose paper it is and mark up accordingly.",
  counterparty: "Their paper: mark up assertively.",
  own: "Our template: defend our positions.",
};

const SCOPE_OPTIONS: { value: ReviewScope; label: string }[] = [
  { value: "document", label: "Whole doc" },
  { value: "selection", label: "Selection" },
];

export function ReviewForm({
  onRun,
  busy,
  initial,
}: {
  onRun: (p: RunParams) => void;
  busy: boolean;
  /** Pre-fill from a "Run this playbook" handoff (contract type + playbook). */
  initial?: { contractType?: string; playbookId?: string };
}) {
  const prefs = getReviewPrefs();
  const [contractType, setContractType] = useState(initial?.contractType || prefs.contractType || "nda");
  const [userSide, setUserSide] = useState("customer");
  const [scope, setScope] = useState<ReviewScope>("document");
  const [playbookId, setPlaybookId] = useState(initial?.playbookId ?? "");
  const [instructions, setInstructions] = useState("");
  const [includeExtras, setIncludeExtras] = useState(false);
  const [markupLevel, setMarkupLevel] = useState<MarkupLevel>("standard");
  const [paperSide, setPaperSide] = useState<PaperSide>("");

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
      {/* Contract type is the document's identity: full-width, top slot. A
          searchable combobox since the list is long (37 types). */}
      <Field label="Contract type">
        <Combobox
          value={contractType}
          onChange={setContractType}
          options={CONTRACT_TYPES}
          ariaLabel="Contract type"
        />
      </Field>

      {/* Two genuinely long lists, paired 2-col; they flow to one column when
          the pane is narrow. */}
      <div className="form-grid">
        <Field label="I represent the">
          <Combobox
            value={userSide}
            onChange={setUserSide}
            options={USER_SIDES}
            ariaLabel="I represent the"
          />
        </Field>

        <PlaybookPicker contractType={contractType} value={playbookId} onChange={setPlaybookId} />
      </div>

      {/* Short enumerations: segmented, full-width rows (not dropdowns). */}
      <div className="field">
        <label>Scope</label>
        <SegmentedControl
          label="Scope"
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={setScope}
        />
      </div>

      <div className="field">
        <label>Whose paper</label>
        <SegmentedControl
          label="Whose paper"
          options={PAPER_OPTIONS}
          value={paperSide}
          onChange={setPaperSide}
        />
        <span className="small muted">{PAPER_CAPTION[paperSide]}</span>
      </div>

      <div className="field">
        <label>Markup level</label>
        <SegmentedControl
          label="Markup level"
          options={MARKUP_OPTIONS}
          value={markupLevel}
          onChange={setMarkupLevel}
        />
        <span className="small muted">{MARKUP_CAPTION[markupLevel]}</span>
      </div>

      {scope === "document" && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Toggle
            checked={includeExtras}
            onChange={setIncludeExtras}
            label="Include footnotes and headers/footers"
            size="sm"
          />
          <span className="small">Include footnotes and headers/footers</span>
        </div>
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
