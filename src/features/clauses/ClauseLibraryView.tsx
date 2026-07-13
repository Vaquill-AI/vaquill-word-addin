import { useCallback, useEffect, useState } from "react";
import { Button, Banner, Badge, Field, Spinner, IconButton } from "@/ui/primitives";
import { InfoTip } from "@/ui/InfoTip";
import { XIcon } from "@/ui/icons";
import {
  searchClauses,
  createClause,
  deleteClause,
  toClauseTypeKey,
  type ClauseEntry,
} from "@/api/clauses";
import { readSelectionText } from "@/office/document";
import { insertPassageAtCursor } from "@/office/richInsert";
import { ApiError, friendlyMessage } from "@/api/errors";
import "./clauses.css";

const PREVIEW_MAX = 180;

/**
 * Personal clause library inside Word: save a clause from the open document for
 * reuse, and insert a saved clause at the cursor. Two in-document loops a GC runs
 * constantly (their standard governing-law block, a favored limitation-of-
 * liability, etc.). Management of the library at large lives in the web app; this
 * is the insert/save surface.
 */
export function ClauseLibraryView() {
  const [clauses, setClauses] = useState<ClauseEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The clause currently being inserted or deleted (locks its row buttons).
  const [busyId, setBusyId] = useState<string | null>(null);

  // Save-a-selection form, opened from the current Word selection.
  const [saveText, setSaveText] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setClauses(await searchClauses({ limit: 100 }));
    } catch (e) {
      setError(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
      setClauses([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function startSaveSelection() {
    setNote(null);
    try {
      const text = await readSelectionText();
      if (!text.trim()) {
        setNote("Select the clause text in the document first, then save it.");
        return;
      }
      setSaveText(text.trim());
      setSaveName("");
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function saveClause() {
    const name = saveName.trim();
    if (!name || !saveText.trim() || saving) return;
    setSaving(true);
    setNote(null);
    try {
      await createClause({ name, clauseType: toClauseTypeKey(name), content: saveText.trim() });
      setSaveText("");
      setSaveName("");
      await load();
    } catch (e) {
      setNote(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function insert(c: ClauseEntry) {
    setBusyId(c.id);
    setNote(null);
    try {
      await insertPassageAtCursor(c.name, c.content);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(c: ClauseEntry) {
    if (c.isSystem) return;
    setBusyId(c.id);
    setNote(null);
    try {
      await deleteClause(c.id);
      setClauses((list) => (list ?? []).filter((x) => x.id !== c.id));
    } catch (e) {
      setNote(e instanceof ApiError ? friendlyMessage(e) : (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = (clauses ?? []).filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.clauseType.toLowerCase().includes(q) ||
      c.content.toLowerCase().includes(q),
  );

  return (
    <div className="stack clauses">
      <div className="stack" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 className="view-title">Clause library</h1>
          <InfoTip text="Save a clause from the open document for reuse, and insert a saved clause at your cursor. Your standard blocks, one click away." />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Insert a saved clause at the cursor, or save the selected text for reuse.
        </p>
      </div>

      {/* Save the current selection as a reusable clause. */}
      {saveText ? (
        <div className="card stack clauses__save" style={{ gap: 8 }}>
          <Field label="Clause name">
            <input
              value={saveName}
              placeholder="e.g. Governing law - Delaware"
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
            />
          </Field>
          <p className="small muted clauses__preview" style={{ margin: 0 }}>
            {saveText.slice(0, PREVIEW_MAX)}
            {saveText.length > PREVIEW_MAX ? "..." : ""}
          </p>
          <div className="row" style={{ gap: 6 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={saveClause}
              loading={saving}
              disabled={!saveName.trim() || saving}
            >
              Save clause
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSaveText("")} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="default" size="sm" onClick={startSaveSelection}>
          Save selection as a clause
        </Button>
      )}

      <input
        className="clauses__search"
        value={query}
        placeholder="Search clauses..."
        aria-label="Search clauses"
        onChange={(e) => setQuery(e.target.value)}
      />

      {note && <Banner tone="warn">{note}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      {clauses === null ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner />
          <span className="small muted">Loading clauses...</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="small muted" style={{ textAlign: "center", padding: "12px 0" }}>
          {clauses.length === 0
            ? "No clauses yet. Select text in the document and save it as a clause."
            : "No clauses match your search."}
        </p>
      ) : (
        <ul className="clauses__list stack" style={{ gap: 8 }}>
          {filtered.map((c) => (
            <li key={c.id} className="card clauses__item stack" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                <div className="stack" style={{ gap: 2 }}>
                  <strong>{c.name}</strong>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    <Badge tone="neutral">{c.clauseType}</Badge>
                    {c.isSystem && <Badge tone="brand">Firm</Badge>}
                  </div>
                </div>
                {!c.isSystem && (
                  <IconButton label={`Delete ${c.name}`} tone="red" onClick={() => void remove(c)}>
                    <XIcon size={13} />
                  </IconButton>
                )}
              </div>
              <p className="small muted clauses__preview" style={{ margin: 0 }}>
                {c.content.slice(0, PREVIEW_MAX)}
                {c.content.length > PREVIEW_MAX ? "..." : ""}
              </p>
              <div className="row">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void insert(c)}
                  loading={busyId === c.id}
                  disabled={busyId === c.id}
                >
                  Insert at cursor
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
