import { useCallback, useEffect, useState } from "react";
import { readFullDocumentText } from "@/office/document";
import { fillFromReference, type FillItem } from "@/api/fill";
import { errorMessage } from "@/api/errors";
import { detectPlaceholders } from "./detect";

export type FillState =
  | { status: "detecting" }
  | { status: "ready"; placeholders: string[] }
  | { status: "extracting"; placeholders: string[] }
  | { status: "review"; placeholders: string[]; fills: FillItem[]; applied: ReadonlySet<string> }
  | { status: "error"; error: string };

/**
 * Detect placeholders in the open document, extract their values from an
 * attached reference (each grounded server-side), and track which have been
 * applied. The apply itself (tracked-change replace) lives in the view so it can
 * drive per-card + bulk apply; the hook records what's applied.
 */
export function useFill() {
  const [state, setState] = useState<FillState>({ status: "detecting" });

  const detect = useCallback(async () => {
    setState({ status: "detecting" });
    try {
      const text = await readFullDocumentText();
      setState({ status: "ready", placeholders: detectPlaceholders(text) });
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  const extract = useCallback(async (file: File, placeholders: string[]) => {
    setState({ status: "extracting", placeholders });
    try {
      const res = await fillFromReference(file, placeholders);
      setState({ status: "review", placeholders, fills: res.fills, applied: new Set() });
    } catch (e) {
      setState({
        status: "error",
        error: errorMessage(e),
      });
    }
  }, []);

  const markApplied = useCallback((placeholders: string[]) => {
    setState((s) => {
      if (s.status !== "review") return s;
      const applied = new Set(s.applied);
      for (const p of placeholders) applied.add(p);
      return { ...s, applied };
    });
  }, []);

  const reset = useCallback(() => {
    void detect();
  }, [detect]);

  return { state, extract, markApplied, reset };
}
