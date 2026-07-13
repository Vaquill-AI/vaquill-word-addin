import { useState } from "react";
import { Banner, Button } from "@/ui/primitives";
import { CheckIcon } from "@/ui/icons";
import { canScrubMetadata, scrubDocumentMetadata } from "@/office/scrub";
import { errorMessage } from "@/api/errors";

/**
 * Residual-metadata hygiene before a contract leaves the firm. On Word desktop
 * this scrubs comments, tracked changes, document properties, and author /
 * personal info in one click (`removeDocumentInformation`). On the web, where
 * that API does not exist, it falls back to pointing the user at Word's built-in
 * Inspect Document. Shared by Clean copy and Send-ready.
 */
export function ScrubMetadata() {
  const supported = canScrubMetadata();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supported) {
    return (
      <Banner tone="warn">
        Before sending, run Word's <strong>File &gt; Info &gt; Inspect Document</strong> to strip
        residual metadata (author names, document properties, tracked changes) that this cannot reach.
      </Banner>
    );
  }

  async function scrub() {
    setBusy(true);
    setError(null);
    try {
      await scrubDocumentMetadata();
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      {done ? (
        <Banner tone="success">
          <CheckIcon size={13} /> Removed comments, tracked changes, document properties, and author
          info. Keep an unscrubbed copy; Word's Undo (Ctrl+Z) reverses this.
        </Banner>
      ) : (
        <>
          <span className="small muted">
            Remove residual metadata (comments, tracked changes, properties, author names) before
            sending this document externally.
          </span>
          <Button
            variant="default"
            size="sm"
            onClick={() => void scrub()}
            loading={busy}
            style={{ alignSelf: "flex-start" }}
          >
            Scrub metadata
          </Button>
        </>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
    </div>
  );
}
