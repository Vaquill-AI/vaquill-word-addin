import { useEffect, useState } from "react";
import { Badge, Button, IconButton } from "@/ui/primitives";
import { PlusIcon, XIcon } from "@/ui/icons";
import { listClients, type Client } from "@/api/platform";
import { getReviewPrefs } from "@/lib/prefs";
import {
  clientRulesContext,
  getClientRules,
  setActiveClientId,
  setClientRules,
} from "@/lib/clientRules";
import { resolveActiveClientId } from "@/lib/activeClient";
import { isCommunity } from "@/community/edition";
import { UpgradeGate } from "@/ui/UpgradeGate";

/**
 * Editor for a client's standing rules. Picks the active client (defaulting to
 * the current matter's client) and lets the user switch to any client, so rules
 * are reachable even without a default matter. Reports the active client's rules
 * as a prompt-ready context string, and the active client is shared with the main
 * review + triage so the same positions apply everywhere. Hidden when the user
 * has no clients yet.
 */
export function ClientRulesCard({ onRulesText }: { onRulesText?: (text: string) => void }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  // Load the client list and resolve the active client (from a prior choice or
  // the default matter) once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cs, activeId] = await Promise.all([
        listClients().catch(() => [] as Client[]),
        resolveActiveClientId(getReviewPrefs().matterId),
      ]);
      if (cancelled) return;
      setClients(cs);
      setClientId(activeId || "");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the selected client's rules and report them whenever the client changes.
  useEffect(() => {
    setRules(clientId ? getClientRules(clientId) : []);
    onRulesText?.(clientId ? clientRulesContext(clientId) : "");
  }, [clientId, onRulesText]);

  // Clients live in the hosted account, so in the community/BYOK edition show a
  // lock explaining what the account adds rather than silently rendering nothing.
  if (isCommunity())
    return (
      <UpgradeGate title="Client rules">
        Set standing per-client positions that auto-apply every time you review that client's paper,
        with a Vaquill AI account.
      </UpgradeGate>
    );
  if (clients === null || clients.length === 0) return null;

  function pick(id: string) {
    setActiveClientId(id);
    setClientId(id);
  }
  function commit(next: string[]) {
    setRules(next);
    setClientRules(clientId, next);
    onRulesText?.(clientRulesContext(clientId));
  }
  function add() {
    const v = draft.trim();
    if (!v) return;
    commit([...rules, v]);
    setDraft("");
  }

  const activeName = clients.find((c) => c.id === clientId)?.name;

  return (
    <div className="card" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="small" style={{ fontWeight: 600 }}>
          Client rules
        </span>
        {clientId && <Badge tone="neutral">{rules.length}</Badge>}
      </div>

      <select aria-label="Client" value={clientId} onChange={(e) => pick(e.target.value)}>
        <option value="">Select a client...</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {clientId ? (
        <>
          <span className="small muted">
            Standing positions applied automatically when reviewing {activeName || "this client"}'s
            paper.
          </span>
          {rules.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              {rules.map((r, i) => (
                <div key={`${i}-${r}`} className="row" style={{ gap: 6, alignItems: "center" }}>
                  <span className="small" style={{ flex: 1, minWidth: 0 }}>
                    {r}
                  </span>
                  <IconButton
                    label="Remove rule"
                    tone="red"
                    onClick={() => commit(rules.filter((_, idx) => idx !== i))}
                  >
                    <XIcon size={12} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ gap: 6 }}>
            <input
              value={draft}
              placeholder="e.g. Cap liability at 12 months' fees"
              aria-label="New client rule"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button variant="default" size="sm" onClick={add} disabled={!draft.trim()}>
              <PlusIcon size={13} /> Add
            </Button>
          </div>
        </>
      ) : (
        <span className="small muted">
          Pick a client to set rules that auto-apply to their paper on review.
        </span>
      )}
    </div>
  );
}
