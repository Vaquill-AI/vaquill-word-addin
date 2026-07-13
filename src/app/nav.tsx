import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * App-level navigation + intent bus.
 *
 * The add-in's surfaces are organized by feature, but a lawyer's task
 * crosses them ("this clause is risky -> what's my position -> redline it").
 * This bus is the connective tissue: any surface can `navigate` to another tab
 * AND hand it a typed `intent` (a pre-filled next step), so results in one place
 * become one-tap actions in another instead of a manual tab hunt + re-typing.
 *
 * The target view reads the intent on mount/update and calls `clearIntent` once
 * it has applied it, so an intent fires exactly once.
 */

export type AppTab = "review" | "draft" | "assistant" | "tools";
export type ReviewSub = "redlines" | "changes" | "compare" | "citations";
export type SelectionToolKey = "rewrite" | "explain" | "plain" | "risk" | "compliance";
export type ToolKey =
  | "cleancopy"
  | "terms"
  | "xref"
  | "sendready"
  | "redact";

export type AppIntent =
  // Review hub
  | { kind: "reviewContract" }
  | { kind: "runPlaybook"; playbookId: string; contractType: string }
  | { kind: "checkCitations" }
  | { kind: "reviewPreset"; preset: "nda" | "compliance" }
  // Assistant
  | { kind: "assistantAsk"; prompt: string; scope?: "document" | "selection"; autoSend?: boolean }
  | { kind: "selectionTool"; tool: SelectionToolKey }
  // Draft + Tools
  | { kind: "draft" }
  | { kind: "openTool"; tool: ToolKey };

interface AppNav {
  tab: AppTab;
  reviewSub: ReviewSub;
  intent: AppIntent | null;
  navigate: (tab: AppTab, intent?: AppIntent) => void;
  setTab: (tab: AppTab) => void;
  setReviewSub: (sub: ReviewSub) => void;
  clearIntent: () => void;
}

const NavContext = createContext<AppNav | null>(null);

export function useAppNav(): AppNav {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useAppNav must be used within <AppNavProvider>");
  return ctx;
}

export function AppNavProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<AppTab>("review");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("redlines");
  const [intent, setIntent] = useState<AppIntent | null>(null);

  const navigate = useCallback((nextTab: AppTab, nextIntent?: AppIntent) => {
    // Some intents also target a Review sub-tab.
    if (nextIntent?.kind === "checkCitations") setReviewSub("citations");
    else if (
      nextIntent?.kind === "reviewContract" ||
      nextIntent?.kind === "runPlaybook" ||
      nextIntent?.kind === "reviewPreset"
    ) {
      setReviewSub("redlines");
    }
    setTab(nextTab);
    setIntent(nextIntent ?? null);
  }, []);

  const clearIntent = useCallback(() => setIntent(null), []);

  const value = useMemo<AppNav>(
    () => ({ tab, reviewSub, intent, navigate, setTab, setReviewSub, clearIntent }),
    [tab, reviewSub, intent, navigate, clearIntent],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
