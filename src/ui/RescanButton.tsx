import { Button } from "./primitives";
import { RefreshIcon } from "./icons";

/**
 * Shared "Rescan" control for document-analysis tools. Re-reads the open document
 * and refreshes the tool's findings. One component so the icon, label, busy state,
 * and placement are identical for every tool (defined terms, cross-references,
 * figures, send-ready, ...) instead of each view hand-rolling its own.
 *
 * Usually passed to {@link ViewHeader} via `onRescan`, which renders it top-right.
 */
export function RescanButton({
  onClick,
  busy = false,
  label = "Rescan",
  size = "sm",
}: {
  onClick: () => void;
  /** True while a scan is in flight: shows a spinner and disables re-triggering. */
  busy?: boolean;
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={onClick}
      loading={busy}
      disabled={busy}
      title="Re-read the document and refresh"
      aria-label={label}
    >
      {!busy && <RefreshIcon size={13} />} {label}
    </Button>
  );
}
