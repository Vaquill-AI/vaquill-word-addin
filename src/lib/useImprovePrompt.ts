import { useState } from "react";
import { errorMessage } from "@/api/errors";
import type { ImprovePromptResult } from "@/api/improve-prompt";

/**
 * Shared "Improve with AI" behavior for a free-text field: sends the current
 * value to the given improver, writes the sharpened text back in place, and
 * reports a one-line note. The improver is chosen by the caller to match what
 * the field is (drafting brief / steering note / research question), so this
 * hook stays generic. Never throws; a failure becomes a note the UI can show.
 */
export function useImprovePrompt(
  improver: (prompt: string) => Promise<ImprovePromptResult>,
  value: string,
  onChange: (next: string) => void,
) {
  const [improving, setImproving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function improve() {
    const base = value.trim();
    if (!base || improving) return;
    setImproving(true);
    setNote(null);
    try {
      const r = await improver(base);
      if (r.changed && r.improved.trim()) {
        onChange(r.improved.trim());
        setNote(r.notes?.trim() || "Sharpened. Review any bracketed placeholders.");
      } else {
        setNote("This is already clear. No changes made.");
      }
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setImproving(false);
    }
  }

  return { improving, note, improve, canImprove: value.trim().length > 0 };
}
