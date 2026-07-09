import { useMemo } from "react";
import { Field } from "@/ui/primitives";
import { usePlaybooks } from "./usePlaybooks";

/**
 * Playbook selector for the review form. Playbooks matching the chosen contract
 * type are surfaced first. Selecting one sends its id as playbookId, so the
 * review runs against the firm's positions instead of the defaults.
 */
export function PlaybookPicker({
  contractType,
  value,
  onChange,
}: {
  contractType: string;
  value: string;
  onChange: (playbookId: string) => void;
}) {
  const state = usePlaybooks();

  const sorted = useMemo(() => {
    const matches = state.playbooks.filter((p) => p.contractType === contractType);
    const rest = state.playbooks.filter((p) => p.contractType !== contractType);
    return [...matches, ...rest];
  }, [state.playbooks, contractType]);

  if (state.status === "loading") {
    return (
      <Field label="Playbook">
        <select disabled>
          <option>Loading playbooks...</option>
        </select>
      </Field>
    );
  }

  if (state.status === "error" || state.playbooks.length === 0) {
    return (
      <Field label="Playbook">
        <select disabled>
          <option>Vaquill AI default positions</option>
        </select>
        <span className="small muted">
          {state.status === "error"
            ? "Could not load your playbooks. The review will use default positions."
            : "No playbooks yet. Reviews use Vaquill AI's default positions."}
        </span>
      </Field>
    );
  }

  return (
    <Field label="Playbook">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Vaquill AI default positions</option>
        {sorted.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.contractType !== contractType ? ` (${p.contractType})` : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
