import { useState } from "react";
import { Badge, IconButton } from "@/ui/primitives";
import { OverflowMenu } from "@/ui/OverflowMenu";
import { LocateIcon } from "@/ui/icons";
import { selectClauseInDocument } from "@/office/navigate";
import { commentOnCitation } from "@/office/citations";
import { config } from "@/config";
import type { AuthorityResult, GoodLaw, Verdict } from "@/api/authority";

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

/**
 * Good-law (treatment) badge for a verified case. "good" is the only reassuring
 * (green) state; "caution" warns the case may be non-binding; "unknown" is a
 * neutral "we could not determine treatment" rather than a benign pass.
 */
function goodLawBadge(status: GoodLaw) {
  switch (status) {
    case "good":
      return <Badge tone="green">Good law</Badge>;
    case "caution":
      return <Badge tone="yellow">Caution</Badge>;
    default:
      return <Badge tone="neutral">Treatment unknown</Badge>;
  }
}

/** Plain-English word for a treatment tier, for the inserted document comment. */
function goodLawWord(status: GoodLaw): string {
  switch (status) {
    case "good":
      return "Good law";
    case "caution":
      return "Caution";
    default:
      return "Treatment unknown";
  }
}

/** Human label for the statute corpus a resolved section lives in. */
function corpusLabel(corpusType?: string): string | undefined {
  switch (corpusType) {
    case "usc":
      return "US Code";
    case "cfr":
      return "Code of Federal Regulations";
    case "state":
      return "State code";
    default:
      return undefined;
  }
}

/**
 * The link to include in the document comment. Statutes resolve to an in-app
 * section URL; cases use an in-app case link built from the cluster id. We
 * deliberately do NOT use the external corpus host here: a comment travels with
 * the .docx, so its link must point to our own app, not a third-party source.
 */
function commentUrl(r: AuthorityResult): string | undefined {
  if (r.kind === "statute") return r.sectionUrl;
  return r.clusterId ? `${config.appBase}/cases/${r.clusterId}` : undefined;
}

function commentText(r: AuthorityResult): string {
  const url = commentUrl(r);
  const source = url ? ` Source: ${url}` : "";
  if (r.kind === "statute") {
    if (r.verdict === "verified") {
      const label = r.label ?? r.raw;
      return `${label}: resolved in Vaquill AI's US statutes corpus. Confirm it is current (not amended or repealed) before relying on it.${source}`;
    }
    return `Could not resolve ${r.raw} in Vaquill AI's US statutes corpus. Verify this citation manually before relying on it.`;
  }
  if (r.verdict === "verified") {
    const name = r.caseName ?? "This citation";
    const yr = r.year ? ` (${r.year})` : "";
    const g = r.goodLaw;
    const treatment = g ? ` Treatment: ${goodLawWord(g.status)}${g.label ? ` - ${g.label}` : ""}.` : "";
    return `${name}${yr}: found in Vaquill AI's US case-law corpus. Confirm current treatment (not overruled or superseded) before relying on it.${treatment}${source}`;
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

  const isStatute = result.kind === "statute";
  const meta = isStatute
    ? corpusLabel(result.corpusType)
    : [result.court, result.year].filter(Boolean).join(" · ");

  return (
    <div className="card authority">
      <div className="authority__top">
        <span className="authority__cite">{result.raw}</span>
        <div className="row" style={{ gap: 4 }}>
          {isStatute && <span className="authority__count small muted">statute</span>}
          {result.count > 1 && <span className="authority__count small muted">x{result.count}</span>}
          {verdictBadge(result.verdict)}
          {!isStatute &&
            result.verdict === "verified" &&
            result.goodLaw &&
            goodLawBadge(result.goodLaw.status)}
        </div>
      </div>

      {result.verdict === "verified" && isStatute && (
        <div className="stack" style={{ gap: 1 }}>
          {result.label && <span className="authority__name">{result.label}</span>}
          {meta && <span className="small muted">{meta}</span>}
          <span className="small muted">
            Resolved in the US statutes corpus. Confirm it is current (not amended or repealed)
            before relying on it.
          </span>
          {result.sectionUrl && (
            <a
              className="authority__link"
              href={result.sectionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View statute
            </a>
          )}
        </div>
      )}
      {result.verdict === "verified" && !isStatute && (
        <div className="stack" style={{ gap: 1 }}>
          {result.caseName && <span className="authority__name">{result.caseName}</span>}
          {meta && <span className="small muted">{meta}</span>}
          <span className="small muted">
            Found in the corpus. Confirm current treatment before relying on it.
            {typeof result.citedByCount === "number" &&
              ` Cited by ${result.citedByCount} case${result.citedByCount === 1 ? "" : "s"}.`}
          </span>
          {result.goodLaw && (
            <span className="small muted">
              Treatment: {result.goodLaw.label || goodLawWord(result.goodLaw.status)}
              {result.goodLaw.detail ? `. ${result.goodLaw.detail}` : ""}
            </span>
          )}
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
        <span className="small muted">
          {isStatute
            ? "Parsed as a statute citation but not resolved in the corpus. Verify manually."
            : "Parsed as a citation but not found in the corpus. Verify manually."}
        </span>
      )}
      {result.verdict === "unrecognized" && (
        <span className="small muted">Could not resolve this citation. Verify manually before relying on it.</span>
      )}

      <div className="authority__actions">
        <IconButton label="Find in document" onClick={locate}>
          <LocateIcon size={14} />
        </IconButton>
        <OverflowMenu
          label="More citation actions"
          items={[
            {
              label: commented ? "Commented" : "Comment in document",
              onSelect: () => {
                if (!busy) void comment();
              },
            },
          ]}
        />
        {note && <span className="small muted">{note}</span>}
      </div>
    </div>
  );
}
