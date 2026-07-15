import { useCallback, useState } from "react";
import { errorMessage } from "@/api/errors";
import {
  applyProperFormat,
  scanFormatting,
  type FixKey,
  type FormatReport,
  type FormatScope,
} from "@/office/format";

/** The order fixes are presented and applied in. */
export const FIX_KEYS: FixKey[] = ["font", "size", "spacing"];

export type ProperFormatState =
  | { status: "idle" }
  | { status: "scanning"; scope: FormatScope }
  | { status: "review"; scope: FormatScope; report: FormatReport; fixes: ReadonlySet<FixKey> }
  | { status: "applying"; scope: FormatScope; done: number; total: number }
  | { status: "done"; scope: FormatScope; changed: number }
  | { status: "error"; error: string };

/**
 * Scan the document (or selection) for formatting inconsistency, let the user
 * pick which safe fixes to apply, then apply them toward the document's dominant
 * style. Mirrors the redact/clean-copy scan then confirm then apply shape.
 */
export function useProperFormat() {
  const [state, setState] = useState<ProperFormatState>({ status: "idle" });

  const scan = useCallback(async (scope: FormatScope) => {
    setState({ status: "scanning", scope });
    try {
      const report = await scanFormatting(scope);
      // Default a fix on only when there is actually something to fix for it.
      const fixes = new Set<FixKey>(FIX_KEYS.filter((k) => report.counts[k] > 0));
      setState({ status: "review", scope, report, fixes });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }, []);

  const setFixes = useCallback((fixes: ReadonlySet<FixKey>) => {
    setState((s) => (s.status === "review" ? { ...s, fixes } : s));
  }, []);

  const apply = useCallback(async (fixes: ReadonlySet<FixKey>, scope: FormatScope) => {
    setState({ status: "applying", scope, done: 0, total: 0 });
    try {
      const { changed } = await applyProperFormat(fixes, scope, (done, total) =>
        setState({ status: "applying", scope, done, total }),
      );
      setState({ status: "done", scope, changed });
    } catch (e) {
      setState({ status: "error", error: errorMessage(e) });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, scan, setFixes, apply, reset };
}
