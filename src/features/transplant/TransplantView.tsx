import { useState } from "react";
import { Badge, Banner, Button, Field, Spinner, LiveRegion } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon } from "@/ui/icons";
import { extractClause, type ExtractedClause } from "@/api/clause";
import { reconcileTerms, type Reconciliation } from "@/api/reconcile";
import { insertClauseTracked } from "@/office/richInsert";
import { readDocumentText } from "@/office/document";
import { ApiError, friendlyMessage } from "@/api/errors";
import "@/features/fill/fill.css"; // reuse the .fill-attach dropzone

const ACCEPT = ".pdf,.docx,.doc,.txt";

type State =
  | { status: "idle" }
  | { status: "extracting" }
  | { status: "done"; clause: ExtractedClause }
  | { status: "error"; error: string };

/**
 * Cross-document clause transplant: describe a clause, attach a source contract,
 * pull that clause verbatim, and insert it into the open document at the cursor
 * as a tracked change. Reuses the fill dropzone and the tracked-paragraph insert.
 */
export function TransplantView() {
  const [clause, setClause] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [inserting, setInserting] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Reconciled version of the clause (defined terms aligned to this document),
  // null until the user runs reconciliation.
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [reconciling, setReconciling] = useState(false);

  async function extract(file: File) {
    if (!clause.trim()) return;
    setState({ status: "extracting" });
    setInserted(false);
    setRecon(null);
    setNote(null);
    try {
      setState({ status: "done", clause: await extractClause(file, clause.trim()) });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }

  async function insert(text: string) {
    setInserting(true);
    setNote(null);
    try {
      await insertClauseTracked(text);
      setInserted(true);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setInserting(false);
    }
  }

  async function reconcile(clauseText: string) {
    setReconciling(true);
    setNote(null);
    try {
      const dest = await readDocumentText();
      setRecon(await reconcileTerms(clauseText, dest));
    } catch (e) {
      setNote(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setReconciling(false);
    }
  }

  function reset() {
    setState({ status: "idle" });
    setInserted(false);
    setRecon(null);
    setNote(null);
  }

  return (
    <div className="stack">
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Clause transplant</h1>
          <InfoTip text="Pull a clause from another contract and insert it into this document as a tracked change. The clause is copied verbatim from the source; place your cursor where you want it before inserting." />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Pull a clause from another contract into this document.
        </p>
      </div>

      <Field label="Clause to pull">
        <input
          value={clause}
          placeholder="e.g. the confidentiality clause"
          onChange={(e) => setClause(e.target.value)}
        />
      </Field>

      {state.status === "extracting" ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <LiveRegion>
            <span className="small muted">Finding the clause in the source...</span>
          </LiveRegion>
        </div>
      ) : (
        <label className="fill-attach">
          <input
            type="file"
            accept={ACCEPT}
            disabled={!clause.trim()}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void extract(f);
            }}
          />
          <span className="fill-attach__cta">Attach source contract</span>
          <span className="small muted">
            {clause.trim() ? "PDF, Word, or text. Max 10MB." : "Describe the clause first."}
          </span>
        </label>
      )}

      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}

      {state.status === "done" &&
        (state.clause.found ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="small" style={{ fontWeight: 600 }}>{state.clause.label}</span>
              <Button variant="ghost" size="sm" onClick={reset}>
                New
              </Button>
            </div>
            <div
              className="small"
              style={{
                whiteSpace: "pre-wrap",
                maxHeight: 240,
                overflowY: "auto",
                padding: 8,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-muted)",
              }}
            >
              {recon?.reconciledText ?? state.clause.text}
            </div>

            {recon ? (
              <div className="stack" style={{ gap: 4 }}>
                <Badge tone="brand">Terms reconciled to this document</Badge>
                {recon.changes.length > 0 ? (
                  <ul className="stack" style={{ margin: 0, paddingLeft: 16, gap: 2 }}>
                    {recon.changes.map((c, i) => (
                      <li key={i} className="small">
                        <strong>{c.from}</strong> {"->"} <strong>{c.to}</strong>
                        {c.note ? <span className="muted"> - {c.note}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted" style={{ margin: 0 }}>No term changes were needed.</p>
                )}
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => reconcile(state.clause.text)}
                loading={reconciling}
                disabled={reconciling}
              >
                Reconcile defined terms to this document
              </Button>
            )}

            <Button
              variant="primary"
              block
              onClick={() => insert(recon?.reconciledText ?? state.clause.text)}
              disabled={inserted}
              loading={inserting}
            >
              {inserted ? (
                <>
                  <CheckIcon size={14} /> Inserted as tracked change
                </>
              ) : (
                "Insert at cursor"
              )}
            </Button>
            {note && <Banner tone="warn">{note}</Banner>}
          </div>
        ) : (
          <Banner tone="info">
            No matching clause was found in the source. Try describing it differently.
          </Banner>
        ))}
    </div>
  );
}
