import { useEffect, useState } from "react";
import { readSelectionText } from "@/office/document";
import { onSelectionChanged } from "@/office/selection";

/**
 * Tracks the current document selection live. The tools pane reacts to whatever
 * the lawyer highlights, so it always operates on what they are looking at.
 */
export function useSelection() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      readSelectionText()
        .then((t) => {
          if (alive) {
            setText(t);
            setLoading(false);
          }
        })
        .catch(() => {
          if (alive) setLoading(false);
        });

    refresh();
    const off = onSelectionChanged(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const trimmed = text.trim();
  return {
    text: trimmed,
    loading,
    hasSelection: trimmed.length > 0,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
  };
}
