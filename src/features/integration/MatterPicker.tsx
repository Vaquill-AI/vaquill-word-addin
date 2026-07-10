import { useEffect, useState } from "react";
import { Field } from "@/ui/primitives";
import { listMatters, type Matter } from "@/api/platform";

/**
 * Optional matter selector. Loads the user's matters lazily and hides itself if
 * there are none (or the call fails), so saving to Vaquill still works without a
 * matter. Selecting a matter scopes saved work to that matter's workspace.
 */
export function MatterPicker({
  value,
  onChange,
  label = "Save under matter (optional)",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
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

  if (!matters || matters.length === 0) return null;

  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No matter</option>
        {matters.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.clientName ? ` (${m.clientName})` : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
