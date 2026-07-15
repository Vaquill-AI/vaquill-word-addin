import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { Button } from "@/ui/primitives";
import { CheckIcon } from "@/ui/icons";
import { buildLedgerFromGate, type GateLike, type ReviewMeta } from "@/lib/governance";
import { writeLedger } from "@/office/governance";
import { getUser } from "@/auth/session";

/**
 * Stamps the review's sign-off gate into the document as a governance ledger.
 * Rendered in the Review results; the Sign-off tab reads and manages it.
 */
export function RecordGovernance({ gate, meta }: { gate: GateLike; meta: ReviewMeta }) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function record() {
    setStatus("busy");
    setError(null);
    try {
      const ledger = await buildLedgerFromGate(gate, meta, getUser()?.email ?? "Unknown user");
      await writeLedger(ledger);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(errorMessage(e));
    }
  }

  return (
    <div className="stack" style={{ gap: 4 }}>
      <Button
        variant="primary"
        size="sm"
        onClick={record}
        loading={status === "busy"}
        disabled={status === "done"}
      >
        {status === "done" ? (
          <>
            <CheckIcon size={14} /> Recorded in document
          </>
        ) : (
          "Record sign-off in document"
        )}
      </Button>
      {status === "done" && (
        <span className="small muted">Saved into the file. Open the Sign-off tab to manage it.</span>
      )}
      {error && <span className="small redline__note--err">{error}</span>}
    </div>
  );
}
