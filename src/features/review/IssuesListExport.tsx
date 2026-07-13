import { useState } from "react";
import { Button } from "@/ui/primitives";
import { DownloadIcon, CopyIcon, CheckIcon } from "@/ui/icons";
import { severityOf, SEVERITY_META } from "@/lib/severity";
import { downloadBlob } from "@/office/export";
import type { RedlineSuggestion, ReviewFlag } from "@/api/types";
import type { Decision } from "./decisions";

/**
 * Issues list: the structured deliverable a GC hands the deal team, distinct from
 * the narrative ReviewMemo. Every issue as a spreadsheet row (clause, severity,
 * our position, status) they can scan in Excel/Sheets and mark up. Exports a CSV
 * download and a tab-separated "copy as table" that pastes into Excel or Word.
 */

const HEADERS = [
  "#",
  "Clause",
  "Section",
  "Severity",
  "Type",
  "Issue",
  "Our proposed language",
  "Status",
];

function statusLabel(d: Decision): string {
  return d === "accepted" ? "Accepted" : d === "rejected" ? "Rejected" : "Open";
}

function typeLabel(r: RedlineSuggestion): string {
  if (r.grounding === "insertion") return "Missing clause";
  if (r.isDealBreaker) return "Deal-breaker";
  if (r.nature) return r.nature === "substantive" ? "Substantive" : "Housekeeping";
  return "";
}

function buildRows(
  redlines: RedlineSuggestion[],
  flags: ReviewFlag[],
  decisionOf: (i: number) => Decision,
): string[][] {
  const rows: string[][] = [];
  redlines.forEach((r, i) => {
    rows.push([
      String(i + 1),
      r.clauseName,
      r.sectionReference ?? "",
      SEVERITY_META[severityOf(r)].label,
      typeLabel(r),
      r.rationale,
      r.proposedLanguage,
      statusLabel(decisionOf(i)),
    ]);
  });
  // Flag-for-discussion items: noticed but not changed, so no severity/proposal.
  flags.forEach((f, j) => {
    rows.push([
      String(redlines.length + j + 1),
      f.clauseName,
      f.sectionReference ?? "",
      "",
      "Flag",
      f.observation,
      "",
      "Discuss",
    ]);
  });
  return rows;
}

/** Collapse newlines to keep each value on one spreadsheet row. */
function clean(s: string): string {
  return (s ?? "").replace(/\r?\n+/g, " ").trim();
}

function csvCell(s: string): string {
  const v = clean(s);
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(rows: string[][]): string {
  return [HEADERS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

function toTsv(rows: string[][]): string {
  // Tab-separated pastes directly as a table into Excel or Word.
  return [HEADERS, ...rows]
    .map((r) => r.map((c) => clean(c).replace(/\t/g, " ")).join("\t"))
    .join("\n");
}

export function IssuesListExport({
  redlines,
  flags,
  decisionOf,
}: {
  redlines: RedlineSuggestion[];
  flags: ReviewFlag[];
  decisionOf: (i: number) => Decision;
}) {
  const [copied, setCopied] = useState(false);
  if (redlines.length === 0 && flags.length === 0) return null;

  const rows = buildRows(redlines, flags, decisionOf);

  function download() {
    // Prepend a BOM so Excel reads the UTF-8 correctly.
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "issues-list.csv");
  }

  async function copyTable() {
    try {
      await navigator.clipboard.writeText(toTsv(rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the CSV download still works.
    }
  }

  return (
    <div className="card doc-tools">
      <h2 className="small muted" style={{ margin: 0 }}>
        Issues list for the deal team
      </h2>
      <p className="small muted" style={{ margin: 0 }}>
        Every issue as a spreadsheet row (clause, severity, our position, status) to hand to the
        business owner.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Button variant="default" size="sm" onClick={download}>
          <DownloadIcon size={14} /> Export CSV
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void copyTable()}>
          {copied ? (
            <>
              <CheckIcon size={14} /> Copied
            </>
          ) : (
            <>
              <CopyIcon size={14} /> Copy as table
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
