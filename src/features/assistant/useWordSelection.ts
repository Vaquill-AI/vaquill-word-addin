import { useEffect, useRef, useState } from "react";
import { readSelectionText } from "@/office/document";

/**
 * Track the current Word selection text (trimmed), updated on selection change.
 * Lets the assistant offer "ask about the selected clause" when the user has
 * highlighted something. Best-effort: reads are debounced, and any Office error
 * (host not ready, no selection) yields "" rather than throwing.
 */
export function useWordSelection(): string {
  const [selection, setSelection] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    let removeHandler: (() => void) | null = null;

    const read = () => {
      readSelectionText()
        .then((t) => {
          if (alive) setSelection(t.trim());
        })
        .catch(() => {
          if (alive) setSelection("");
        });
    };

    const onChange = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(read, 300);
    };

    try {
      Office.context.document.addHandlerAsync(
        Office.EventType.DocumentSelectionChanged,
        onChange,
      );
      removeHandler = () => {
        try {
          Office.context.document.removeHandlerAsync(
            Office.EventType.DocumentSelectionChanged,
            { handler: onChange },
          );
        } catch {
          // Host already tore the handler down; nothing to do.
        }
      };
      read(); // initial selection
    } catch {
      // Office not available (e.g. dev preview); leave selection empty.
    }

    return () => {
      alive = false;
      if (timer.current) window.clearTimeout(timer.current);
      removeHandler?.();
    };
  }, []);

  return selection;
}
