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
export type ReviewSub = "redlines" | "changes" | "compare" | "citations" | "playbooks";
export type SelectionToolKey = "rewrite" | "explain" | "plain" | "risk" | "compliance";
export type ToolKey =
  | "cleancopy"
  | "terms"
  | "xref"
  | "sendready"
  | "redact"
  | "properFormat"
  | "termnav"
  | "cockpit"
  | "figures";

export type AppIntent =
  // Review hub
  | { kind: "reviewContract" }
  | { kind: "runPlaybook"; playbookId: string; contractType: string }
  | { kind: "checkCitations" }
  | { kind: "reviewPreset"; preset: "nda" | "compliance" }
  // Assistant
  | {
      kind: "assistantAsk";
      prompt: string;
      scope?: "document" | "selection";
      autoSend?: boolean;
      /** Ground the answer purely in the open document: skip corpus / matter /
       *  web retrieval. Used when the question is about the open document itself
       *  (e.g. "should I accept this redline?"), where external retrieval only
       *  adds latency and irrelevant citations. */
      documentOnly?: boolean;
    }
  | { kind: "selectionTool"; tool: SelectionToolKey }
  // Land on a specific Review sub-tab (e.g. Compare -> Changes triage).
  | { kind: "openReviewSub"; sub: ReviewSub }
  // Open Review -> Redlines and scroll to / highlight one clause's card
  // (e.g. Deal cockpit row -> the redline it tracks). clauseKey is the
  // redlineKey; clauseName is carried only for messaging.
  | { kind: "focusClause"; clauseKey: string; clauseName?: string }
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
  // Assistant is the default landing tab: the most flexible entry point (ask, or
  // switch to Edit for redlines) and where a new user should start.
  const [tab, setTab] = useState<AppTab>("assistant");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("redlines");
  const [intent, setIntent] = useState<AppIntent | null>(null);

  const navigate = useCallback((nextTab: AppTab, nextIntent?: AppIntent) => {
    // Some intents also target a Review sub-tab.
    if (nextIntent?.kind === "checkCitations") setReviewSub("citations");
    else if (nextIntent?.kind === "openReviewSub") setReviewSub(nextIntent.sub);
    else if (
      nextIntent?.kind === "reviewContract" ||
      nextIntent?.kind === "runPlaybook" ||
      nextIntent?.kind === "reviewPreset" ||
      nextIntent?.kind === "focusClause"
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
