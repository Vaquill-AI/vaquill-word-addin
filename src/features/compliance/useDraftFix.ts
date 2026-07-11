import { useCallback, useState } from "react";
import { rewriteClause, type ComplianceRequirement } from "@/api/clause-tools";
import { insertClauseTracked } from "@/office/richInsert";
import { ApiError, friendlyMessage } from "@/api/errors";

/**
 * Drives the "Draft a fix" flow for a single non-compliant (or partially
 * compliant) requirement: generate suggested contract language, then let the
 * caller insert it as a tracked change. Insertion is never automatic - the user
 * must invoke `insert` explicitly (propose-then-confirm).
 *
 * The drafted text stays stable in the `ready` state across the insert lifecycle
 * (via `inserting` / `inserted` / `insertError` flags) so a failed insert never
 * discards the draft the user is looking at.
 */
export type DraftFixState =
  | { status: "idle" }
  | { status: "drafting" }
  | {
      status: "ready";
      text: string;
      changesSummary?: string;
      inserting?: boolean;
      inserted?: boolean;
      insertError?: string;
    }
  | { status: "error"; error: string };

/** Base text handed to the rewrite endpoint - a seed it refines into a clause. */
function seedText(req: ComplianceRequirement): string {
  const rec = req.recommendation?.trim();
  if (rec) return rec;
  const name = req.requirementName?.trim();
  return name
    ? `Contract provision addressing ${name}.`
    : "Contract provision addressing the identified compliance requirement.";
}

/** Compose a precise instruction so the rewrite reads as fresh clause language. */
function buildInstruction(req: ComplianceRequirement): string {
  const parts = [
    `Draft a clear, enforceable contract clause that satisfies this compliance requirement: ${req.requirementName ?? "the identified requirement"}.`,
  ];
  if (req.regulationReference) parts.push(`Regulation reference: ${req.regulationReference}.`);
  if (req.gapDescription) parts.push(`Address this gap: ${req.gapDescription}.`);
  if (req.recommendation) parts.push(`Follow this recommendation: ${req.recommendation}.`);
  parts.push("Return only the clause language, ready to drop into the contract.");
  return parts.join(" ");
}

export function useDraftFix(req: ComplianceRequirement) {
  const [state, setState] = useState<DraftFixState>({ status: "idle" });

  const draft = useCallback(async () => {
    setState({ status: "drafting" });
    try {
      const result = await rewriteClause(seedText(req), {
        instruction: buildInstruction(req),
        mode: "rewrite",
        tone: "protective",
        jurisdiction: "US",
      });
      const text = result.rewritten?.trim();
      if (!text) {
        setState({
          status: "error",
          error: "Could not draft language for this requirement. Please try again.",
        });
        return;
      }
      setState({ status: "ready", text, changesSummary: result.changesSummary });
    } catch (e) {
      setState({
        status: "error",
        error: e instanceof ApiError ? friendlyMessage(e) : (e as Error).message,
      });
    }
  }, [req]);

  const insert = useCallback(async (text: string) => {
    setState((prev) =>
      prev.status === "ready" && !prev.inserting && !prev.inserted
        ? { ...prev, inserting: true, insertError: undefined }
        : prev,
    );
    try {
      await insertClauseTracked(text);
      setState((prev) =>
        prev.status === "ready"
          ? { ...prev, inserting: false, inserted: true, insertError: undefined }
          : prev,
      );
    } catch (e) {
      const message = (e as Error).message || "Could not insert into the document.";
      setState((prev) =>
        prev.status === "ready" ? { ...prev, inserting: false, insertError: message } : prev,
      );
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, draft, insert, reset };
}
