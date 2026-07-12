import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Banner, Button, Field, SegmentedControl, Spinner } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { CheckIcon } from "@/ui/icons";
import { ApiError, friendlyMessage } from "@/api/errors";
import { insertDocxAtCursorOrDownload } from "@/office/export";
import { listTemplates, getTemplateDocx, type Template } from "@/api/templates";
import { DRAFT_MODE_OPTIONS, type DraftMode } from "./mode";
import "./draft.css";

const LIMIT = 30;

type ListState =
  | { status: "loading" }
  | { status: "ready"; items: Template[]; total: number; hasMore: boolean }
  | { status: "error"; error: string };

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Browse the firm template library and insert a template into the open document.
 * The template's .docx is fetched server-side and inserted via base64, preserving
 * formatting. Search is server-side + debounced; results paginate via Load more.
 */
export function TemplatesView({ mode, setMode }: { mode: DraftMode; setMode: (m: DraftMode) => void }) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (query: string, offset: number, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (append) setLoadingMore(true);
    else setState({ status: "loading" });
    try {
      const res = await listTemplates(
        { search: query || undefined, limit: LIMIT, offset },
        controller.signal,
      );
      setState((prev) => {
        const base = append && prev.status === "ready" ? prev.items : [];
        return {
          status: "ready",
          items: [...base, ...res.items],
          total: res.total,
          hasMore: res.hasMore,
        };
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    } finally {
      setLoadingMore(false);
    }
  }, []);

  // Debounced server-side search; immediate on mount and when the box is cleared.
  useEffect(() => {
    const t = setTimeout(() => void load(search.trim(), 0, false), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function insert(t: Template) {
    if (busyId) return;
    setBusyId(t.id);
    setNote(null);
    setInsertedId(null);
    try {
      const { base64 } = await getTemplateDocx(t.id);
      const how = await insertDocxAtCursorOrDownload(base64, `${t.title || "template"}.docx`);
      setInsertedId(t.id);
      if (how === "downloaded") {
        setNote("This host can't insert files in place, so the template was downloaded instead.");
      }
    } catch (e) {
      setNote(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const items = state.status === "ready" ? state.items : [];

  return (
    <div className="stack draft-view">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 className="view-title">Draft</h1>
        <InfoTip text="Browse your firm's template library and insert a template into the open document, preserving its formatting. Fill any bracketed placeholders after inserting (the Fill tool can help)." />
      </div>

      <SegmentedControl<DraftMode>
        label="Draft mode"
        options={DRAFT_MODE_OPTIONS}
        value={mode}
        onChange={setMode}
      />

      <Field label="Search templates">
        <input
          type="search"
          value={search}
          placeholder="e.g. NDA, lease, engagement letter"
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>

      {state.status === "loading" && (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Loading templates...</span>
        </div>
      )}
      {state.status === "error" && <Banner tone="danger">{state.error}</Banner>}
      {note && <Banner tone="danger">{note}</Banner>}

      {state.status === "ready" && items.length === 0 && (
        <Banner tone="info">
          No templates matched. Try different words, or upload a template in the web app.
        </Banner>
      )}

      {items.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          {items.map((t) => (
            <div key={t.id} className="card template-card">
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="template-card__title">{t.title}</span>
                <span className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {t.isSystem && <Badge tone="brand">Starter</Badge>}
                  <span className="small muted">{humanize(t.category)}</span>
                  {t.state && <span className="small muted">· {t.state}</span>}
                  {t.variableCount > 0 && (
                    <span className="small muted">
                      · {t.variableCount} field{t.variableCount === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                {t.description && (
                  <span className="small muted template-card__desc">{t.description}</span>
                )}
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => void insert(t)}
                loading={busyId === t.id}
                disabled={!!busyId}
              >
                {insertedId === t.id ? (
                  <>
                    <CheckIcon size={13} /> Inserted
                  </>
                ) : (
                  "Insert"
                )}
              </Button>
            </div>
          ))}
          {state.status === "ready" && state.hasMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load(search.trim(), items.length, true)}
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
