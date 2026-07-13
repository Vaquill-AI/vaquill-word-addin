import { watchDocumentChanges } from "./watch";

/**
 * Notify a caller when the document body actually changes, so a review can be
 * marked stale and re-run. A thin wrapper over `watchDocumentChanges` tuned for
 * review freshness: body-content (paragraph) events only, with a
 * selection-changed fallback on hosts that lack them. Comment events are
 * excluded because they do not alter the body hash the freshness check compares,
 * so firing on them would only trigger wasted re-reads.
 *
 * Returns a guarded unsubscribe (safe to call more than once); removal is
 * best-effort. The caller MUST debounce, as the underlying events fire on every
 * keystroke.
 */
export async function onDocumentChanged(cb: () => void): Promise<() => void> {
  return watchDocumentChanges(cb, { comments: false, selectionFallback: true });
}
