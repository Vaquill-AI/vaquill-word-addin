import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button, Spinner } from "@/ui/primitives";
import { Dropzone } from "@/ui/Dropzone";
import { CheckIcon, PlusIcon, RefreshIcon } from "@/ui/icons";
import { applyFills } from "@/office/fill";
import type { FillItem } from "@/api/fill";
import { useFill, type FillState } from "./useFill";
import "./fill.css";

const ACCEPT = ".pdf,.docx,.doc,.txt";

export function FillView() {
  const { state, extract, markApplied, reset } = useFill();

  if (state.status === "detecting") {
    return (
      <div className="stack fill-view">
        <h1 className="view-title">Fill</h1>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <span className="small muted">Scanning for placeholders...</span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="stack fill-view">
        <h1 className="view-title">Fill</h1>
        <Banner tone="danger">{state.error}</Banner>
        <Button variant="default" size="sm" onClick={reset}>
          <RefreshIcon size={13} /> Try again
        </Button>
      </div>
    );
  }

  // ready | extracting share the header + placeholder list.
  if (state.status === "ready" || state.status === "extracting") {
    const extracting = state.status === "extracting";
    return (
      <div className="stack fill-view">
        <ViewHeader
        title="Fill"
        info="Fills the placeholders in this document (like [Company Name] or [Insert Date]) using an attached reference document. Every value is backed by a quote from the reference and proposed as a tracked change you can accept or reject."
        subtitle="Fill this template's placeholders from a reference document (a signed agreement, term sheet, etc.)."
      />

        {state.placeholders.length === 0 ? (
          <Banner tone="info">
            No placeholders found. This works on templates with bracketed placeholders like [Company
            Name] or {"{{governing_law}}"}.
          </Banner>
        ) : (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>
                {state.placeholders.length} placeholder{state.placeholders.length === 1 ? "" : "s"} found
              </span>
              <div className="fill-tokens">
                {state.placeholders.slice(0, 20).map((p) => (
                  <span key={p} className="fill-token small">{p}</span>
                ))}
                {state.placeholders.length > 20 && (
                  <span className="small muted">+{state.placeholders.length - 20} more</span>
                )}
              </div>
            </div>

            <Dropzone
              accept={ACCEPT}
              label="Attach reference document"
              hint="PDF, Word, or text. Max 10MB."
              busy={extracting}
              busyLabel="Reading the reference and extracting values..."
              onFile={(f) => void extract(f, state.placeholders)}
            />
          </>
        )}
      </div>
    );
  }

  return <FillReview state={state} onMarkApplied={markApplied} onReset={reset} />;
}

function FillReview({
  state,
  onMarkApplied,
  onReset,
}: {
  state: Extract<FillState, { status: "review" }>;
  onMarkApplied: (placeholders: string[]) => void;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null); // placeholder or "__all__"
  const [note, setNote] = useState<string | null>(null);

  const found = state.fills.filter((f) => f.found && f.value);
  const missing = state.fills.filter((f) => !f.found || !f.value);
  const pending = found.filter((f) => !state.applied.has(f.placeholder));

  async function applyOne(fill: FillItem) {
    setBusy(fill.placeholder);
    setNote(null);
    try {
      const out = await applyFills([{ placeholder: fill.placeholder, value: fill.value }]);
      if (out.applied > 0) onMarkApplied([fill.placeholder]);
      else setNote(`Could not find ${fill.placeholder} in the document.`);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function applyAll() {
    setBusy("__all__");
    setNote(null);
    try {
      const out = await applyFills(pending.map((f) => ({ placeholder: f.placeholder, value: f.value })));
      onMarkApplied(pending.map((f) => f.placeholder));
      if (out.notFound.length > 0) {
        setNote(`Applied ${out.applied}. ${out.notFound.length} placeholder(s) were not found.`);
      }
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack fill-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="view-title">Fill</h1>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <PlusIcon size={13} /> New fill
        </Button>
      </div>

      {found.length === 0 ? (
        <Banner tone="info">No values for these placeholders were found in the reference.</Banner>
      ) : (
        <>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span className="small muted">
              {found.length} of {state.fills.length} filled
            </span>
            {pending.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={applyAll}
                loading={busy === "__all__"}
                disabled={!!busy}
              >
                Apply all ({pending.length})
              </Button>
            )}
          </div>

          <div className="stack" style={{ gap: 8 }}>
            {found.map((f) => {
              const done = state.applied.has(f.placeholder);
              return (
                <div key={f.placeholder} className="card fill-card">
                  <div className="fill-card__head">
                    <span className="fill-card__token small">{f.placeholder}</span>
                    {done && <Badge tone="green">Applied</Badge>}
                  </div>
                  <p className="fill-card__value">{f.value}</p>
                  {f.quote && (
                    <p className="fill-card__quote small muted">
                      From reference: &ldquo;{f.quote}&rdquo;
                    </p>
                  )}
                  {!done && (
                    <div className="row" style={{ gap: 8 }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void applyOne(f)}
                        loading={busy === f.placeholder}
                        disabled={!!busy}
                      >
                        <CheckIcon size={13} /> Apply
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {missing.length > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          {missing.length} placeholder{missing.length === 1 ? "" : "s"} had no value in the reference:{" "}
          {missing.slice(0, 8).map((f) => f.placeholder).join(", ")}
          {missing.length > 8 ? ", ..." : ""}
        </p>
      )}
      {note && <Banner tone="warn">{note}</Banner>}
    </div>
  );
}
