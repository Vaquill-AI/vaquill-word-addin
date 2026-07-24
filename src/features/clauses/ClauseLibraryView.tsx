import { useCallback, useEffect, useState } from "react";
import { ViewHeader } from "@/ui/ViewHeader";
import { Button, Banner, Badge, Field, Spinner, IconButton } from "@/ui/primitives";
import { ScopedSearchList } from "@/ui/ScopedSearchList";
import { XIcon } from "@/ui/icons";
import { searchClauses, createClause, deleteClause, type ClauseEntry } from "@/api/clauses";
import { toClauseTypeKey } from "@/lib/strings";
import { readSelectionText } from "@/office/document";
import { insertPassageAtCursor } from "@/office/richInsert";
import { errorMessage } from "@/api/errors";
import "./clauses.css";

const PREVIEW_MAX = 180;

// Generic catch-all clause types carry no signal (the model just didn't tag a
// specific taxonomy), so we suppress the badge rather than show "custom".
const GENERIC_TYPES = new Set(["custom", "custom_clause", "general", "other", "misc", "uncategorized", ""]);
// Legal acronyms that should stay uppercase when humanizing the clause-type key.
const TYPE_ACRONYMS = new Set([
  "ip", "nda", "msa", "dpa", "sla", "saas", "ai", "us", "uk", "eu", "baa",
  "psa", "sow", "tos", "fcpa", "ofac", "gdpr", "ccpa", "hipaa",
]);

/** Turn a clause-type key ("ip_assignment") into a label ("IP Assignment"), or
 *  null for generic buckets that add no information. */
function clauseTypeLabel(clauseType: string): string | null {
  const key = clauseType.trim().toLowerCase();
  if (GENERIC_TYPES.has(key)) return null;
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (TYPE_ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function preview(text: string): string {
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}...` : text;
}

/**
 * Personal clause library inside Word: save a clause from the open document for
 * reuse, and insert a saved clause at the cursor. Two in-document loops a GC runs
 * constantly (their standard governing-law block, a favored limitation-of-
 * liability, etc.). Management of the library at large lives in the web app; this
 * is the insert/save surface. Built on the shared list chrome (ScopedSearchList)
 * and card/form primitives so it matches Templates, Saved drafts, and Playbooks.
 */
export function ClauseLibraryView() {
  const [clauses, setClauses] = useState<ClauseEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // The selected text pending "save as clause": non-null opens the save form in
  // place of the list (mirrors the Prompt library's New-prompt flow).
  const [saveText, setSaveText] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setClauses(await searchClauses({ limit: 100 }));
    } catch (e) {
      setError(errorMessage(e));
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
    } catch (e) {
      setNote(errorMessage(e));
    }
  }

  async function insert(c: ClauseEntry) {
    setBusyId(c.id);
    setNote(null);
    try {
      await insertPassageAtCursor(c.name, c.content);
    } catch (e) {
      setNote(errorMessage(e));
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
      setNote(errorMessage(e));
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
      <ViewHeader
        title="Clause library"
        info="Save a clause from the open document for reuse, and insert a saved clause at your cursor. Your standard blocks, one click away."
        subtitle="Insert a saved clause at the cursor, or save the selected text for reuse."
      />

      {note && <Banner tone="warn">{note}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      {clauses === null ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Spinner /> <span className="small muted">Loading clauses...</span>
        </div>
      ) : saveText !== null ? (
        <SaveClauseForm
          text={saveText}
          onCancel={() => setSaveText(null)}
          onSaved={async () => {
            setSaveText(null);
            await load();
          }}
        />
      ) : (
        <ScopedSearchList
          query={query}
          onQuery={setQuery}
          searchPlaceholder="Search clauses..."
          ariaLabel="Saved clauses"
          action={
            <Button variant="primary" size="sm" onClick={startSaveSelection}>
              Save selection
            </Button>
          }
          isEmpty={filtered.length === 0}
          empty={
            clauses.length === 0
              ? "No clauses yet. Select text in the document and save it as a clause."
              : "No clauses match your search."
          }
        >
          {filtered.map((c) => (
            <ClauseCard
              key={c.id}
              clause={c}
              busy={busyId === c.id}
              onInsert={() => void insert(c)}
              onDelete={() => void remove(c)}
            />
          ))}
        </ScopedSearchList>
      )}
    </div>
  );
}

function ClauseCard({
  clause,
  busy,
  onInsert,
  onDelete,
}: {
  clause: ClauseEntry;
  busy: boolean;
  onInsert: () => void;
  onDelete: () => void;
}) {
  const typeLabel = clauseTypeLabel(clause.clauseType);
  const [expanded, setExpanded] = useState(false);
  // Only offer "Read more" when the body is actually clipped by the preview.
  const isLong = clause.content.length > PREVIEW_MAX;
  return (
    <div className="card clause-card" role="listitem">
      <div className="clause-card__head">
        <div
          className="row"
          style={{ gap: 6, flexWrap: "wrap", alignItems: "baseline", minWidth: 0, flex: 1 }}
        >
          <strong className="clause-card__title">{clause.name}</strong>
          {typeLabel && <Badge tone="neutral">{typeLabel}</Badge>}
          {clause.isSystem && <Badge tone="brand">Firm</Badge>}
        </div>
        {!clause.isSystem && (
          <IconButton label={`Delete ${clause.name}`} tone="red" onClick={onDelete}>
            <XIcon size={13} />
          </IconButton>
        )}
      </div>
      <p
        className={`clause-card__preview small muted${
          expanded ? " clause-card__preview--full" : ""
        }`}
      >
        {expanded ? clause.content : preview(clause.content)}
      </p>
      {isLong && (
        <button
          type="button"
          className="clause-card__more"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      <div className="clause-card__actions">
        <Button variant="primary" size="sm" onClick={onInsert} loading={busy} disabled={busy}>
          Insert at cursor
        </Button>
      </div>
    </div>
  );
}

function SaveClauseForm({
  text,
  onCancel,
  onSaved,
}: {
  text: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createClause({
        name: trimmed,
        clauseType: toClauseTypeKey(trimmed, "custom_clause"),
        content: text,
      });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <Field label="Clause name">
        <input
          value={name}
          placeholder="e.g. Governing law - Delaware"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="card card--sunken card--pad">
        <p className="clause-card__preview small muted" style={{ margin: 0 }}>
          {preview(text)}
        </p>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="row" style={{ gap: 8 }}>
        <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!name.trim()}>
          Save clause
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
