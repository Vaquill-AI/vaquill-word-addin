/** Shows what the pane is currently acting on: the live document selection. */
export function SelectionPreview({
  text,
  words,
  hasSelection,
  loading,
}: {
  text: string;
  words: number;
  hasSelection: boolean;
  loading: boolean;
}) {
  if (loading) {
    return <div className="sel sel--empty small muted">Reading your selection...</div>;
  }

  if (!hasSelection) {
    return (
      <div className="sel sel--empty">
        <p className="small" style={{ margin: 0, fontWeight: 600 }}>
          No text selected
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          Highlight a clause in your document to rewrite or explain it. The pane follows your
          selection.
        </p>
      </div>
    );
  }

  const preview = text.length > 220 ? `${text.slice(0, 220)}...` : text;
  return (
    <div className="sel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small" style={{ fontWeight: 600 }}>
          Selected clause
        </span>
        <span className="small muted">{words} words</span>
      </div>
      <p className="sel__text">{preview}</p>
    </div>
  );
}
