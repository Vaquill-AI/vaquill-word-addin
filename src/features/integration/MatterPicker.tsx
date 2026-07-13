import { useEffect, useState } from "react";
import { Field } from "@/ui/primitives";
import { listMatters, type Matter } from "@/api/platform";

/**
 * Matter selector. Loads the user's matters lazily. The empty value ("") is the
 * general workspace: in the optional save flow it reads "No matter" and the whole
 * control hides when there are none (saving still works without a matter). In
 * Settings it is the always-present "General matter" default, so pass
 * `showWhenEmpty` + `emptyLabel="General matter"` there. Selecting a specific
 * matter scopes work to that matter's workspace.
 */
export function MatterPicker({
  value,
  onChange,
  label = "Save under matter (optional)",
  emptyLabel = "No matter",
  showWhenEmpty = false,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** Label for the empty ("") option. "General matter" in Settings. */
  emptyLabel?: string;
  /** Keep the control visible (with just the empty option) even before any
   *  matters load or when the user has none. Used in Settings so the default is
   *  always shown; the save flow leaves this false and hides instead. */
  showWhenEmpty?: boolean;
}) {
  const [matters, setMatters] = useState<Matter[] | null>(null);

  useEffect(() => {
    let alive = true;
    listMatters()
      .then((m) => alive && setMatters(m))
      .catch(() => alive && setMatters([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!showWhenEmpty && (!matters || matters.length === 0)) return null;

  const list = matters ?? [];
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {list.map((m) => {
          // The auto-created "General" matter carries the user's own name as its
          // client, which reads as noise ("General (Jane Doe)"), so drop the
          // client suffix for it. Real named matters keep it for disambiguation.
          const isGeneral = m.name.trim().toLowerCase() === "general";
          return (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.clientName && !isGeneral ? ` (${m.clientName})` : ""}
            </option>
          );
        })}
      </select>
    </Field>
  );
}
