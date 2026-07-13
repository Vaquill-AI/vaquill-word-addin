import { useState } from "react";
import { Banner, Button, Field } from "@/ui/primitives";
import { PlaybookIcon } from "@/ui/icons";
import { readStructuredDocumentText } from "@/office/document";
import {
  extractPlaybookFromText,
  createPlaybook,
  type ExtractedPlaybook,
} from "@/api/playbooks";
import { CONTRACT_TYPES, labelOf } from "@/features/review/constants";
import { errorMessage } from "@/api/errors";

/**
 * Turn the open contract into a starter playbook. The #1 onboarding blocker for
 * a GC is "I have no playbook"; here they open their standard NDA/MSA in Word and
 * one click extracts its clause positions into a reviewable, savable playbook.
 * The server never auto-saves the extraction, so we show a name + confirm gate
 * before persisting.
 */

type State =
  | { status: "idle" }
  | { status: "extracting" }
  | { status: "preview"; extracted: ExtractedPlaybook }
  | { status: "saving" }
  | { status: "error"; error: string };

const MIN_CHARS = 200;

export function CreatePlaybookFromDoc({ onCreated }: { onCreated: () => void }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [name, setName] = useState("");

  const busy = state.status === "extracting" || state.status === "saving";

  async function extract() {
    setState({ status: "extracting" });
    try {
      const text = await readStructuredDocumentText();
      if (text.trim().length < MIN_CHARS) {
        setState({
          status: "error",
          error: "Open a contract first: there is too little text to build a playbook from.",
        });
        return;
      }
      const extracted = await extractPlaybookFromText(text);
      if (extracted.extractedCount === 0) {
        setState({
          status: "error",
          error: "No clause positions could be extracted from this document.",
        });
        return;
      }
      const typeLabel = labelOf(CONTRACT_TYPES, extracted.contractType) || "Contract";
      setName(`${typeLabel} playbook`);
      setState({ status: "preview", extracted });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }

  async function save(extracted: ExtractedPlaybook) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState({ status: "saving" });
    try {
      await createPlaybook({
        name: trimmed,
        contractType: extracted.contractType,
        positions: extracted.positions,
      });
      setName("");
      setState({ status: "idle" });
      onCreated();
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }

  if (state.status === "preview") {
    const ex = state.extracted;
    const typeLabel = ex.contractType
      ? labelOf(CONTRACT_TYPES, ex.contractType) || ex.contractType
      : "";
    return (
      <div className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="small" style={{ fontWeight: 600 }}>
            New playbook from this contract
          </span>
          <span className="small muted">
            Extracted {ex.extractedCount} clause position{ex.extractedCount === 1 ? "" : "s"}
            {typeLabel ? ` · detected ${typeLabel}` : ""}. Refine it in Vaquill AI after saving.
          </span>
        </div>
        <Field label="Playbook name">
          <input
            value={name}
            placeholder="e.g. Acme standard NDA"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="row" style={{ gap: 8 }}>
          <Button variant="primary" size="sm" onClick={() => void save(ex)} disabled={!name.trim()}>
            Save playbook
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setState({ status: "idle" })}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button
        variant="default"
        size="sm"
        onClick={() => void extract()}
        loading={busy}
        disabled={busy}
        style={{ alignSelf: "flex-start" }}
      >
        <PlaybookIcon size={14} /> Create playbook from this document
      </Button>
      {state.status === "extracting" && (
        <span className="small muted">Reading the contract and extracting positions...</span>
      )}
      {state.status === "saving" && <span className="small muted">Saving...</span>}
      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}
    </div>
  );
}
