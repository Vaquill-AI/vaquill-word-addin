import { useEffect } from "react";
import { watchDocumentChanges } from "@/office/watch";

/**
 * Run `onChange` (debounced) whenever the open document changes while the caller
 * is mounted, plus when the task pane regains focus. Wraps `office/watch` with
 * the debounce + focus fallback + cleanup that every live-scan view needs, so a
 * view that shows document-derived state does not reimplement it.
 *
 * `onChange` MUST be stable (wrap in useCallback) and should do a SILENT refresh
 * (update in place, no loading spinner), so an edit does not flash the view.
 */
export function useDocumentAutoRefresh(onChange: () => void, debounceMs = 700): void {
  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    const debounced = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (mounted) onChange();
      }, debounceMs);
    };
    let cleanupWatch: (() => void) | undefined;
    void watchDocumentChanges(debounced).then((cleanup) => {
      if (mounted) cleanupWatch = cleanup;
      else cleanup();
    });
    window.addEventListener("focus", debounced);
    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("focus", debounced);
      cleanupWatch?.();
    };
  }, [onChange, debounceMs]);
}
