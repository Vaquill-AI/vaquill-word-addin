import { useEffect, useState } from "react";
import { AutoTextarea } from "@/ui/AutoTextarea";
import { Button, Field, SegmentedControl, Toggle, Spinner } from "@/ui/primitives";
import { Combobox } from "@/ui/Combobox";
import { PlaybookPicker } from "./PlaybookPicker";
import { ClientRulesCard } from "@/features/integration/ClientRulesCard";
import {
  CONTRACT_TYPES,
  USER_SIDES,
  labelOf,
  type ReviewScope,
} from "./constants";
import { config } from "@/config";
import { isCommunity } from "@/community/edition";
import { ImproveButton } from "@/ui/ImproveButton";
import { useImprovePrompt } from "@/lib/useImprovePrompt";
import { improveLegalToolPrompt } from "@/api/improve-prompt";
import { getReviewPrefs } from "@/lib/prefs";
import { readDocumentText } from "@/office/document";
import { classifyContract } from "@/api/contract-review";
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

/** Below this length there is not enough text to classify; keep the default. */
const CLASSIFY_MIN_CHARS = 100;

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
  const focus = useImprovePrompt(improveLegalToolPrompt, instructions, setInstructions);
  const [includeExtras, setIncludeExtras] = useState(false);
  const [markupLevel, setMarkupLevel] = useState<MarkupLevel>("standard");
  const [paperSide, setPaperSide] = useState<PaperSide>("");

  // Zero-config entry: everything is inferred or defaulted, and the details live
  // under "Adjust". `detecting` gates the chip while we classify; `detected`
  // records the auto-detected type so we can show it was inferred, not guessed.
  const [showOptions, setShowOptions] = useState(false);
  const [detecting, setDetecting] = useState(!initial?.contractType);
  const [detected, setDetected] = useState<string | null>(null);

  // Auto-detect the contract type from the open document on mount, so the user
  // does not have to pick it. A "Run this playbook" handoff already carries the
  // type, so respect it and skip detection. Best-effort: any failure keeps the
  // remembered default.
  useEffect(() => {
    if (initial?.contractType) return;
    let alive = true;
    (async () => {
      try {
        const text = await readDocumentText();
        if (!alive) return;
        if (text.trim().length >= CLASSIFY_MIN_CHARS) {
          const { contractType: t, confidence } = await classifyContract(text);
          if (alive && t && confidence >= 0.5) {
            setContractType(t);
            setDetected(t);
          }
        }
      } catch {
        // Keep the default; detection is a convenience, not a requirement.
      } finally {
        if (alive) setDetecting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initial?.contractType]);

  const markupLabel = MARKUP_OPTIONS.find((o) => o.value === markupLevel)?.label ?? "Standard";

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
      {/* One-glance summary of what will be reviewed. Everything is inferred or
          defaulted; "Adjust" reveals the overrides. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "9px 11px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          background: "var(--fill-subtle)",
        }}
      >
        {detecting ? (
          <span className="row small muted" style={{ gap: 8, alignItems: "center", minWidth: 0 }}>
            <Spinner /> Detecting contract type...
          </span>
        ) : (
          <span className="small" style={{ minWidth: 0 }}>
            <strong>{labelOf(CONTRACT_TYPES, contractType)}</strong>
            <span className="muted">
              {" · representing "}
              {labelOf(USER_SIDES, userSide)}
              {" · "}
              {markupLabel.toLowerCase()} markup
            </span>
            {detected === contractType && (
              <span className="muted" style={{ marginLeft: 6, fontStyle: "italic" }}>
                (auto-detected)
              </span>
            )}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowOptions((v) => !v)}
          data-tour="rl-setup"
        >
          {showOptions ? "Done" : "Adjust"}
        </Button>
      </div>

      {/* Overrides, collapsed by default. Opening them is the rare case where the
          reviewer disagrees with an inferred value or wants a non-default. */}
      {showOptions && (
        <div className="stack" style={{ gap: 12 }}>
          <Field label="Contract type">
            <Combobox
              value={contractType}
              onChange={(v) => {
                setContractType(v);
                setDetected(null);
              }}
              options={CONTRACT_TYPES}
              ariaLabel="Contract type"
            />
          </Field>

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

          {/* The hosted playbook manager is an account surface. In BYOK playbooks
              live locally (edited from the Playbook tab), so hide this link. */}
          {!isCommunity() && (
            <p className="small muted" style={{ margin: 0 }}>
              <a href={`${config.appBase}/playbooks`} target="_blank" rel="noreferrer">
                Manage playbooks
              </a>{" "}
              in Vaquill AI.
            </p>
          )}

          <ClientRulesCard />

          <div className="field field--inline">
            <label>Scope</label>
            <SegmentedControl label="Scope" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
          </div>

          <div className="field field--inline">
            <label>Whose paper</label>
            <SegmentedControl
              label="Whose paper"
              options={PAPER_OPTIONS}
              value={paperSide}
              onChange={setPaperSide}
            />
            <span className="small muted">{PAPER_CAPTION[paperSide]}</span>
          </div>

          <div className="field field--inline">
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
        </div>
      )}

      <Field
        label="Focus (optional)"
        action={
          <ImproveButton
            improving={focus.improving}
            disabled={!focus.canImprove}
            onClick={() => void focus.improve()}
          />
        }
      >
        <AutoTextarea
          value={instructions}
          placeholder="e.g. Prioritize liability, indemnity, and termination."
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Field>
      {focus.note && <span className="small muted">{focus.note}</span>}

      <Button type="submit" variant="primary" className="btn--cta" loading={busy} data-tour="rl-run">
        Review this contract
      </Button>
    </form>
  );
}
