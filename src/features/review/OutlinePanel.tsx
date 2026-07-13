import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { Spinner } from "@/ui/primitives";
import { readOutline, goToOutlineItem, type OutlineItem } from "@/office/outline";

/**
 * A collapsible outline of the contract's headings and numbered clauses. Click
 * an entry to jump to it in the document. Loads lazily on first open so it costs
 * nothing until used, which matters for very long documents.
 */
export function OutlinePanel() {
  const [items, setItems] = useState<OutlineItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await readOutline());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (e.currentTarget.open && items === null && !loading) void load();
  }

  function go(index: number) {
    goToOutlineItem(index).catch((e) => setError(errorMessage(e)));
  }

  return (
    <details className="outline" onToggle={onToggle}>
      <summary className="outline__summary">Document outline</summary>
      {loading && (
        <div className="row" style={{ gap: 8, padding: "6px 0" }}>
          <Spinner />
          <span className="small muted">Reading the outline...</span>
        </div>
      )}
      {error && <p className="small" style={{ color: "var(--danger)", margin: "6px 0 0" }}>{error}</p>}
      {items && items.length === 0 && (
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          No headings or numbered clauses found in this document.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="outline__list">
          {items.map((it) => (
            <li key={it.index} style={{ paddingLeft: (Math.min(it.level, 4) - 1) * 12 }}>
              <button type="button" className="outline__item" onClick={() => go(it.index)}>
                {it.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
