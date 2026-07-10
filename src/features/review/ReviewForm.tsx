import { useState } from "react";
import { Button, Field } from "@/ui/primitives";
import { PlaybookPicker } from "./PlaybookPicker";
import { MatterPicker } from "@/features/integration/MatterPicker";
import { CONTRACT_TYPES, USER_SIDES, JURISDICTIONS, type ReviewScope } from "./constants";
import type { RunParams } from "./useReview";

export function ReviewForm({ onRun, busy }: { onRun: (p: RunParams) => void; busy: boolean }) {
  const [contractType, setContractType] = useState("nda");
  const [userSide, setUserSide] = useState("customer");
  const [jurisdiction, setJurisdiction] = useState("US");
  const [scope, setScope] = useState<ReviewScope>("document");
  const [playbookId, setPlaybookId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [includeExtras, setIncludeExtras] = useState(false);
  const [matterId, setMatterId] = useState("");

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        onRun({
          contractType,
          userSide,
          jurisdiction,
          scope,
          playbookId: playbookId || undefined,
          reviewInstructions: instructions,
          includeExtras: scope === "document" ? includeExtras : false,
          matterId: matterId || undefined,
        });
      }}
    >
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

      <Field label="Governing law">
        <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
          {JURISDICTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <PlaybookPicker contractType={contractType} value={playbookId} onChange={setPlaybookId} />

      <MatterPicker value={matterId} onChange={setMatterId} label="Matter (optional)" />

      <Field label="Scope">
        <select value={scope} onChange={(e) => setScope(e.target.value as ReviewScope)}>
          <option value="document">Whole document</option>
          <option value="selection">Selected text only</option>
        </select>
      </Field>

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

      <Button type="submit" variant="primary" block loading={busy}>
        Review this contract
      </Button>
    </form>
  );
}
