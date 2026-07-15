import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { createClause } from "@/api/clauses";
import { toClauseTypeKey } from "@/lib/strings";

/**
 * Capture a redline's proposed language into the personal clause library in one
 * tap, so a position you just took becomes reusable next time. This is the
 * "deposit on accept" that makes the library compound: every accepted redline
 * can leave a reusable clause behind, instead of the decision evaporating.
 */
export function SaveAsClause({ name, content }: { name: string; content: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const text = content.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await createClause({
        name: name.trim() || "Saved clause",
        clauseType: toClauseTypeKey(name || "custom_clause", "custom_clause"),
        content: text,
      });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="small muted">Saved to clause library.</span>;
  if (!content.trim()) return null;
  return (
    <button
      type="button"
      className="linkaction"
      onClick={() => void save()}
      disabled={busy}
      title="Save this language to your clause library for reuse"
    >
      {busy ? "Saving..." : error ? "Retry save to library" : "Save to library"}
    </button>
  );
}
