import { useState } from "react";
import { Badge, IconButton } from "@/ui/primitives";
import { LocateIcon } from "@/ui/icons";
import { selectClauseInDocument } from "@/office/navigate";
import { commentOnCitation } from "@/office/citations";
import type { AuthorityResult, Verdict } from "@/api/authority";

function verdictBadge(verdict: Verdict) {
  switch (verdict) {
    case "verified":
      // A corpus match confirms the case exists, not that it is still good
      // law, so this reads "Found" (not "Verified") with a caution tone.
      return <Badge tone="yellow">Found</Badge>;
    case "no_match":
      return <Badge tone="red">No match</Badge>;
    case "unrecognized":
      // U3: an unmatched / empty result is a warning, not a benign neutral.
      return <Badge tone="yellow">Unresolved</Badge>;
    default:
      return <Badge tone="neutral">Not checked</Badge>;
  }
}

function commentText(r: AuthorityResult): string {
  if (r.verdict === "verified") {
    const name = r.caseName ?? "This citation";
    const yr = r.year ? ` (${r.year})` : "";
    return `${name}${yr}: found in Vaquill AI's US case-law corpus. Confirm current treatment (not overruled or superseded) before relying on it.`;
  }
  return `No matching case found in the corpus for ${r.raw}. Verify this citation manually before relying on it.`;
}

export function AuthorityItem({ result }: { result: AuthorityResult }) {
  const [note, setNote] = useState<string | null>(null);
  const [commented, setCommented] = useState(false);
  const [busy, setBusy] = useState(false);

  async function locate() {
    setNote(null);
    try {
      const found = await selectClauseInDocument(result.raw);
      if (!found) setNote("Could not locate this citation in the document.");
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  async function comment() {
    if (busy) return;
    setNote(null);
    setBusy(true);
    try {
      const ok = await commentOnCitation(result.raw, commentText(result));
      if (ok) {
        setCommented(true);
        setTimeout(() => setCommented(false), 1500);
      } else {
        setNote("Could not locate this citation to comment on.");
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const meta = [result.court, result.year].filter(Boolean).join(" · ");

  return (
    <div className="card authority">
      <div className="authority__top">
        <span className="authority__cite">{result.raw}</span>
        <div className="row" style={{ gap: 4 }}>
          {result.count > 1 && <span className="authority__count small muted">x{result.count}</span>}
          {verdictBadge(result.verdict)}
        </div>
      </div>

      {result.verdict === "verified" && (
        <div className="stack" style={{ gap: 1 }}>
          {result.caseName && <span className="authority__name">{result.caseName}</span>}
          {meta && <span className="small muted">{meta}</span>}
          <span className="small muted">
            Found in the corpus. Confirm current treatment before relying on it.
            {typeof result.citedByCount === "number" &&
              ` Cited by ${result.citedByCount} case${result.citedByCount === 1 ? "" : "s"}.`}
          </span>
          {result.caseUrl && (
            <a
              className="authority__link"
              href={result.caseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View case
            </a>
          )}
        </div>
      )}
      {result.verdict === "no_match" && (
        <span className="small muted">Parsed as a citation but not found in the corpus. Verify manually.</span>
      )}
      {result.verdict === "unrecognized" && (
        <span className="small muted">Could not resolve this citation. Verify manually before relying on it.</span>
      )}

      <div className="authority__actions">
        <IconButton label="Find in document" onClick={locate}>
          <LocateIcon size={14} />
        </IconButton>
        <button className="authority__link" onClick={comment} disabled={busy}>
          {commented ? "Commented" : "Comment in document"}
        </button>
        {note && <span className="small muted">{note}</span>}
      </div>
    </div>
  );
}
