import { useCallback, useEffect, useRef, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Badge, Banner, Button, SegmentedControl, Spinner } from "@/ui/primitives";
import { CheckIcon } from "@/ui/icons";
import { errorMessage } from "@/api/errors";
import { insertDocxAtCursorOrDownload } from "@/office/export";
import { listDrafts, exportDraftDocx, type DraftListItem } from "@/api/drafts";
import { DRAFT_MODE_OPTIONS, type DraftMode } from "./mode";
import { humanize } from "@/lib/strings";
import "./draft.css";

const LIMIT = 30;

type ListState =
  | { status: "loading" }
  | { status: "ready"; items: DraftListItem[]; hasMore: boolean }
  | { status: "error"; error: string };


/** A draft that is still generating (or failed) can't be inserted yet. */
function isInsertable(d: DraftListItem): boolean {
  return d.generationStatus == null || d.generationStatus === "completed";
}

/**
 * Browse the user's saved Vaquill drafts and insert one into the open document.
 * The draft's .docx is exported server-side and inserted via base64, preserving
 * formatting. Newest first, paginated via Load more.
 */
export function SavedDraftsView({
  mode,
  setMode,
}: {
  mode: DraftMode;
  setMode: (m: DraftMode) => void;
}) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (offset: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (append) setLoadingMore(true);
    else setState({ status: "loading" });
    try {
      const rows = await listDrafts({ limit: LIMIT, offset }, controller.signal);
      setState((prev) => {
        const base = append && prev.status === "ready" ? prev.items : [];
        return { status: "ready", items: [...base, ...rows], hasMore: rows.length === LIMIT };
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({
        status: "error",
        error: errorMessage(e),
      });
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(0, false);
    return () => abortRef.current?.abort();
  }, [load]);

  async function insert(d: DraftListItem) {
    if (busyId) return;
    setBusyId(d.id);
    setNote(null);
    setInsertedId(null);
    try {
      const { base64 } = await exportDraftDocx(d.id);
      const how = await insertDocxAtCursorOrDownload(base64, `${d.title || "draft"}.docx`);
      setInsertedId(d.id);
      if (how === "downloaded") {
        setNote("This host can't insert files in place, so the draft was downloaded instead.");
      }
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const items = state.status === "ready" ? state.items : [];

  return (
    <div className="stack draft-view">
      <ViewHeader
        title="Draft"
        info="Insert one of your saved Vaquill drafts into the open document, preserving its formatting. Useful for resuming a draft you started on the web or in an earlier session."
      />

      <SegmentedControl<DraftMode>
        label="Draft mode"
        options={DRAFT_MODE_OPTIONS}
        value={mode}
        onChange={setMode}
      />

      {state.status === "loading" && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Loading your drafts...</span>
        </div>
      )}
      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}
      {note && <Banner tone="danger">{note}</Banner>}

      {state.status === "ready" && items.length === 0 && (
        <Banner tone="info">
          You have no saved drafts yet. Generate one here, or create one in the web app.
        </Banner>
      )}

      {items.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {items.map((d) => {
            const insertable = isInsertable(d);
            return (
              <div key={d.id} className="card template-card">
                <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="template-card__title">{d.title || "Untitled draft"}</span>
                  <span className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="small muted">{humanize(d.category)}</span>
                    {d.version > 1 && <span className="small muted">· v{d.version}</span>}
                    {!insertable && <Badge tone="yellow">Generating</Badge>}
                  </span>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void insert(d)}
                  loading={busyId === d.id}
                  disabled={!!busyId || !insertable}
                  title={insertable ? undefined : "This draft is still generating."}
                >
                  {insertedId === d.id ? (
                    <>
                      <CheckIcon size={13} /> Inserted
                    </>
                  ) : (
                    "Insert"
                  )}
                </Button>
              </div>
            );
          })}
          {state.status === "ready" && state.hasMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(items.length, true)}
              loading={loadingMore}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
