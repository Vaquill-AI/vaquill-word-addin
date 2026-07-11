import { useEffect, useState } from "react";
import { Button } from "@/ui/primitives";
import { listClients, createClientNote, type Client } from "@/api/platform";

/**
 * Save an assistant answer as a note on a Vaquill AI client. Lazy: it loads
 * clients only when expanded, and hides gracefully when there are none. Keeps the
 * research done in Word from being lost to the local session.
 *
 * `defaultOpen` starts it expanded (used when opened from the answer's overflow
 * menu, where the "Save to notes" trigger lives in the kebab, not inline);
 * `onClose` fires when the user cancels so the caller can unmount it.
 */
export function SaveAnswerToNotes({
  content,
  defaultOpen = false,
  onClose,
}: {
  content: string;
  defaultOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadClients() {
    if (clients !== null) return;
    try {
      const c = await listClients();
      setClients(c);
      if (c[0]) setClientId(c[0].id);
    } catch {
      setClients([]);
    }
  }

  async function expand() {
    setOpen(true);
    setError(null);
    await loadClients();
  }

  // When mounted already-open (from the kebab), load the client list eagerly.
  useEffect(() => {
    if (defaultOpen) void loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancel() {
    setOpen(false);
    onClose?.();
  }

  async function save() {
    if (!clientId) return;
    setBusy(true);
    setError(null);
    try {
      await createClientNote(clientId, { content, title: "Note from Vaquill AI for Word" });
      setDone(true);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="small muted msg__note-status">Saved to notes.</span>;
  if (!open) {
    return (
      <button type="button" className="msg__save-note" onClick={expand}>
        Save to notes
      </button>
    );
  }
  if (clients && clients.length === 0) {
    return <span className="small muted msg__note-status">No clients to save to.</span>;
  }
  return (
    <div className="row msg__note-row" style={{ gap: 6, flexWrap: "wrap" }}>
      <select
        className="msg__note-select"
        aria-label="Client"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
      >
        {(clients ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button variant="default" size="sm" onClick={save} loading={busy} disabled={!clientId}>
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={cancel}>
        Cancel
      </Button>
      {error && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
