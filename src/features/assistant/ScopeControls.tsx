import { Field } from "@/ui/primitives";
import { MatterPicker } from "@/features/integration/MatterPicker";
import { US_JURISDICTIONS } from "./us-states";

/**
 * Optional grounding + jurisdiction scope for the assistant. Selecting a matter
 * grounds answers in that workspace (and, when its documents are searched, in
 * the uploaded files); the jurisdiction narrows statute + case-law retrieval to
 * a single US state (or Federal). Everything here is optional: with nothing
 * selected the assistant behaves exactly as before.
 */
export function ScopeControls({
  matterId,
  onMatterId,
  matterDocs,
  onMatterDocs,
  usState,
  onUsState,
}: {
  matterId: string;
  onMatterId: (id: string) => void;
  matterDocs: boolean;
  onMatterDocs: (on: boolean) => void;
  /** Single jurisdiction code, or "" for all US. */
  usState: string;
  onUsState: (code: string) => void;
}) {
  return (
    <div className="scope-bar stack">
      <MatterPicker value={matterId} onChange={onMatterId} label="Ground in matter (optional)" />

      {matterId && (
        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={matterDocs}
            onChange={(e) => onMatterDocs(e.target.checked)}
          />
          <span>Search this matter&rsquo;s documents</span>
        </label>
      )}

      <Field label="Jurisdiction">
        <select value={usState} onChange={(e) => onUsState(e.target.value)}>
          <option value="">All US</option>
          {US_JURISDICTIONS.map((j) => (
            <option key={j.code} value={j.code}>
              {j.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
