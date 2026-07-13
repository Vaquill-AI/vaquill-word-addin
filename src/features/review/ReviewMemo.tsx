import { useMemo, useState } from "react";
import { Banner, Button } from "@/ui/primitives";
import { severityOf } from "@/lib/severity";
import { goToBookmark } from "@/office/bookmarks";
import { selectClauseInDocument } from "@/office/navigate";
import { readDocumentText } from "@/office/document";
import { downloadDocx } from "@/office/export";
import { exportCorrectedDocx } from "@/api/contract-review";
import { errorMessage } from "@/api/errors";
import type {
  AcceptedRedline,
  ContractReviewResponse,
  RedlineSuggestion,
  ReviewFlag,
} from "@/api/types";
import "./review-memo.css";

/**
 * Review memo: a read-only, shareable work-product summary of a review. Where
 * the redline cards are action-first (accept/reject each edit), the memo is the
 * "what did this review find" narrative a lawyer would paste into an email or a
 * file note. Items are grouped by the NATURE of the change:
 *
 *   Substantive        = backend `nature === "substantive"`, else deal-breaker
 *                        or high-severity redlines (heuristic fallback)
 *   Housekeeping       = backend `nature === "housekeeping"`, else the rest
 *   Flag for discussion = the `flags` (noticed but not changed)
 *
 * The pipeline may tag each redline's `nature`; when present we group by it, and
 * fall back to the severity heuristic for any redline that lacks it. Each line
 * carries a footnote number that jumps to the clause in the document (via the
 * per-clause bookmark anchor, mirroring the redline card's locate).
 *
 * Purely additive: renders nothing when there are no redlines and no flags.
 */

type MemoTone = "red" | "green" | "yellow";

/**
 * How to locate this item's text in the document. `bookmarkIndex` is the
 * redline's original index in the full redlines array, so the anchor name
 * matches the one placed at review time (`Vaquill_clause_${index + 1}`). `text`
 * is the verbatim fallback search. Absent entirely for flags with no anchor.
 */
interface MemoLocate {
  bookmarkIndex?: number;
  text?: string;
}

interface MemoItem {
  /** 1-based footnote; for redlines it equals the original index + 1. */
  footnote: number;
  clauseName: string;
  sectionReference?: string;
  takeaway: string;
  locate?: MemoLocate;
}

interface MemoGroup {
  key: string;
  title: string;
  tone: MemoTone;
  blurb: string;
  items: MemoItem[];
}

const TAKEAWAY_MAX = 160;

/** One clean line of takeaway text: collapse whitespace, trim at a word boundary. */
function toTakeaway(source: string): string {
  const flat = source.replace(/\s+/g, " ").trim();
  if (flat.length <= TAKEAWAY_MAX) return flat;
  const cut = flat.slice(0, TAKEAWAY_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[,;:.\s]+$/, "")}...`;
}

function redlineItem(r: RedlineSuggestion, index: number): MemoItem {
  return {
    footnote: index + 1,
    clauseName: r.clauseName,
    sectionReference: r.sectionReference?.trim() || undefined,
    takeaway: toTakeaway(r.rationale),
    locate: { bookmarkIndex: index, text: r.currentLanguage?.trim() || undefined },
  };
}

function flagItem(f: ReviewFlag, footnote: number): MemoItem {
  const section = f.sectionReference?.trim() || undefined;
  return {
    footnote,
    clauseName: f.clauseName,
    sectionReference: section,
    takeaway: toTakeaway(f.observation),
    // Flags carry no verbatim clause text and no bookmark. Jump only when a
    // section reference gives us something to search for; otherwise the footnote
    // is a plain, non-interactive marker.
    locate: section ? { text: section } : undefined,
  };
}

/**
 * Prefer the pipeline's `nature` tag; fall back to the severity heuristic
 * (deal-breaker or high severity = substantive) for redlines that lack it, so
 * reviews produced before the field existed still group sensibly.
 */
function natureOf(r: RedlineSuggestion): "substantive" | "housekeeping" {
  if (r.nature === "substantive" || r.nature === "housekeeping") return r.nature;
  return r.isDealBreaker || severityOf(r) === "high" ? "substantive" : "housekeeping";
}

/** Jump to the item's clause: bookmark anchor first, verbatim search fallback. */
async function jumpToItem(item: MemoItem): Promise<void> {
  const loc = item.locate;
  if (!loc) return;
  try {
    if (
      loc.bookmarkIndex !== undefined &&
      (await goToBookmark(`Vaquill_clause_${loc.bookmarkIndex + 1}`))
    ) {
      return;
    }
    if (loc.text) await selectClauseInDocument(loc.text);
  } catch {
    // Best-effort navigation: a failure to locate must not disrupt the memo.
  }
}

function buildGroups(redlines: RedlineSuggestion[], flags: ReviewFlag[]): MemoGroup[] {
  const substantive: MemoItem[] = [];
  const housekeeping: MemoItem[] = [];
  redlines.forEach((r, i) => {
    const item = redlineItem(r, i);
    if (natureOf(r) === "substantive") {
      substantive.push(item);
    } else {
      housekeeping.push(item);
    }
  });

  // Flags number after the redlines so every footnote in the memo is unique.
  const flagItems = flags.map((f, j) => flagItem(f, redlines.length + j + 1));

  const groups: MemoGroup[] = [
    {
      key: "substantive",
      title: "Substantive",
      tone: "red",
      blurb: "Deal-breakers and high-severity edits. Review these first.",
      items: substantive,
    },
    {
      key: "housekeeping",
      title: "Housekeeping",
      tone: "green",
      blurb: "Routine tightening and lower-risk cleanups.",
      items: housekeeping,
    },
    {
      key: "flags",
      title: "Flag for discussion",
      tone: "yellow",
      blurb: "Noticed but not changed. Confirm before sending.",
      items: flagItems,
    },
  ];

  return groups.filter((g) => g.items.length > 0);
}

/** Render the memo as clean, shareable Markdown. */
function toMarkdown(groups: MemoGroup[]): string {
  const lines: string[] = ["# Review memo", ""];
  for (const group of groups) {
    lines.push(`## ${group.title} (${group.items.length})`);
    for (const item of group.items) {
      const section = item.sectionReference ? ` (${item.sectionReference})` : "";
      lines.push(`- [${item.footnote}] **${item.clauseName}**${section} - ${item.takeaway}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ReviewMemo({
  result,
  redlines,
}: {
  result: ContractReviewResponse;
  redlines: RedlineSuggestion[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const groups = useMemo(
    () => buildGroups(redlines, result.flags ?? []),
    [redlines, result.flags],
  );

  const total = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups],
  );

  if (total === 0) return null;

  async function onCopy() {
    const ok = await copyText(toMarkdown(groups));
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  // Download the redlined document: reuses the server-side corrected-export
  // (native tracked changes, authored "Vaquill AI Contract Review"). Insertions
  // have no clause to replace, so only anchored replacements go in.
  async function onDownload() {
    setDownloading(true);
    setNote(null);
    try {
      const accepted: AcceptedRedline[] = redlines
        .filter((r) => r.grounding !== "insertion" && r.currentLanguage.trim())
        .map((r) => ({
          clauseName: r.clauseName,
          currentLanguage: r.currentLanguage,
          replacementLanguage: r.proposedLanguage,
          comment: r.rationale,
        }));
      if (accepted.length === 0) {
        setNote("No replaceable redlines to export (inserted clauses apply in the pane only).");
        return;
      }
      const documentText = await readDocumentText();
      const { base64, filename } = await exportCorrectedDocx({
        documentText,
        acceptedRedlines: accepted,
        contractType: result.contractType ?? "other",
        trackedChanges: true,
      });
      downloadDocx(base64, filename);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="review-memo card">
      <div className="review-memo__head">
        <button
          type="button"
          className="review-memo__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`review-memo__chevron ${open ? "review-memo__chevron--open" : ""}`} aria-hidden>
            &rsaquo;
          </span>
          <span className="review-memo__title">Review memo</span>
          <span className="review-memo__total">
            {total} item{total === 1 ? "" : "s"}
          </span>
        </button>
        {open && (
          <div className="row" style={{ gap: 4 }}>
            <Button variant="ghost" size="sm" onClick={onCopy}>
              {copied ? "Copied" : "Copy memo"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDownload} loading={downloading}>
              Download .docx
            </Button>
          </div>
        )}
      </div>

      {open && note && <Banner tone="warn">{note}</Banner>}

      {open && (
        <div className="review-memo__body">
          <p className="review-memo__intro small muted">
            A read-only summary of this review, grouped by the nature of each change. Copy it as
            Markdown to share the work product.
          </p>
          {groups.map((group) => (
            <div className="review-memo__group" key={group.key}>
              <div className={`review-memo__group-head review-memo__group-head--${group.tone}`}>
                <span className="review-memo__dot" aria-hidden />
                <h3 className="review-memo__group-title">{group.title}</h3>
                <span className="review-memo__group-count">{group.items.length}</span>
              </div>
              <p className="review-memo__blurb small muted">{group.blurb}</p>
              <ul className="review-memo__list">
                {group.items.map((item) => (
                  <li className="review-memo__item" key={`${group.key}-${item.footnote}`}>
                    <div className="review-memo__meta">
                      {item.locate ? (
                        <button
                          type="button"
                          className="review-memo__footnote"
                          aria-label="Jump to clause in document"
                          onClick={() => void jumpToItem(item)}
                        >
                          {item.footnote}
                        </button>
                      ) : (
                        <span
                          className="review-memo__footnote review-memo__footnote--static"
                          aria-hidden
                        >
                          {item.footnote}
                        </span>
                      )}
                      <span className="review-memo__clause">{item.clauseName}</span>
                      {item.sectionReference && (
                        <span className="review-memo__section">{item.sectionReference}</span>
                      )}
                    </div>
                    <p className="review-memo__takeaway">{item.takeaway}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
