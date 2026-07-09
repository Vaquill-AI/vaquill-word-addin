import { computeDiff } from "office-word-diff";
import "./inline-diff.css";

export function InlineDiff({ before, after }: { before: string; after: string }) {
  const diff = computeDiff(before, after);

  return (
    <p className="inline-diff">
      {diff.map(([op, text], index) => {
        if (op === -1) {
          return (
            <del key={index} className="inline-diff__del">
              {text}
            </del>
          );
        }
        if (op === 1) {
          return (
            <ins key={index} className="inline-diff__ins">
              {text}
            </ins>
          );
        }
        return <span key={index}>{text}</span>;
      })}
    </p>
  );
}
