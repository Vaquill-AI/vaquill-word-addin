import { useState } from "react";
import { Badge, IconButton } from "@/ui/primitives";
import { LocateIcon } from "@/ui/icons";
import { selectClauseInDocument } from "@/office/navigate";
import { commentOnCitation } from "@/office/citations";
import type { AuthorityResult, Verdict } from "@/api/authority";

function verdictBadge(verdict: Verdict) {
  switch (verdict) {
    case "verified":
      return <Badge tone="green">Verified</Badge>;
    case "no_match":
      return <Badge tone="red">No match</Badge>;
    case "unrecognized":
      return <Badge tone="neutral">Unrecognized</Badge>;
    default:
      return <Badge tone="neutral">Not checked</Badge>;
  }
}

function commentText(r: AuthorityResult): string {
  if (r.verdict === "verified") {
    const name = r.caseName ?? "This citation";
    const yr = r.year ? ` (${r.year})` : "";
    return `${name}${yr}: verified against Vaquill AI's US case-law corpus.`;
  }
  return `No matching case found in the corpus for ${r.raw}. Verify this citation manually before relying on it.`;
}

export function AuthorityItem({ result }: { result: AuthorityResult }) {
  const [note, setNote] = useState<string | null>(null);
  const [commented, setCommented] = useState(false);

  async function locate() {
    setNote(null);
    const found = await selectClauseInDocument(result.raw);
    if (!found) setNote("Could not locate this citation in the document.");
  }

  async function comment() {
    setNote(null);
    const ok = await commentOnCitation(result.raw, commentText(result));
    if (ok) {
      setCommented(true);
      setTimeout(() => setCommented(false), 1500);
    } else {
      setNote("Could not locate this citation to comment on.");
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

      {result.verdict === "verified" && result.caseName && (
        <div className="stack" style={{ gap: 1 }}>
          <span className="authority__name">{result.caseName}</span>
          {meta && <span className="small muted">{meta}</span>}
        </div>
      )}
      {result.verdict === "no_match" && (
        <span className="small muted">Parsed as a citation but not found in the corpus. Verify manually.</span>
      )}

      <div className="authority__actions">
        <IconButton label="Find in document" onClick={locate}>
          <LocateIcon size={14} />
        </IconButton>
        <button className="authority__link" onClick={comment}>
          {commented ? "Commented" : "Comment in document"}
        </button>
        {note && <span className="small muted">{note}</span>}
      </div>
    </div>
  );
}
