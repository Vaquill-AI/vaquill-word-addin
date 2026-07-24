import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/ui/primitives";
import { getPlaybooksWithPositions, addToPlaybook, type PlaybookDetail } from "@/api/playbooks";
import type { RedlineSuggestion } from "@/api/types";

/**
 * Push a redline's proposed language into a playbook as a position (appended to
 * an existing clause's fallback ladder, or a new clause). Lazy: loads playbooks
 * only when expanded; hides gracefully when the user has none.
 */
export function AddToPlaybook({ redline }: { redline: RedlineSuggestion }) {
  const [open, setOpen] = useState(false);
  const [books, setBooks] = useState<PlaybookDetail[] | null>(null);
  const [pbId, setPbId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Distinct from `error` (an add-time failure): a failure to LOAD the list must
  // not be shown as "No playbooks yet", which would be a lie the user acts on.
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const b = await getPlaybooksWithPositions();
      setBooks(b);
      if (b[0]) setPbId(b[0].id);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function expand() {
    setOpen(true);
    setError(null);
    if (books === null && !loading) await load();
  }

  async function add() {
    const pb = books?.find((b) => b.id === pbId);
    if (!pb) return;
    setBusy(true);
    setError(null);
    try {
      await addToPlaybook(pb, {
        clauseName: redline.clauseName,
        proposedLanguage: redline.proposedLanguage,
        fallback: redline.fallbackPosition,
        isDealBreaker: redline.isDealBreaker,
      });
      setDone(true);
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="small muted">Added to playbook.</span>;
  if (!open) {
    return (
      <button type="button" className="linkaction" onClick={expand}>
        Add to playbook
      </button>
    );
  }
  if (loadError) {
    return (
      <span className="small" style={{ color: "var(--danger)" }}>
        Couldn't load playbooks.{" "}
        <button type="button" className="linkaction" onClick={() => void load()}>
          Retry
        </button>
      </span>
    );
  }
  if (loading || books === null) {
    return <span className="small muted">Loading playbooks...</span>;
  }
  if (books.length === 0) {
    return <span className="small muted">No playbooks yet. Create one first.</span>;
  }
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <select
        className="linkaction__select"
        aria-label="Playbook"
        value={pbId}
        onChange={(e) => setPbId(e.target.value)}
      >
        {(books ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <Button variant="default" size="sm" onClick={add} loading={busy} disabled={!pbId}>
        Add
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
