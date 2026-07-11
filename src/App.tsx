import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { Header } from "@/ui/Header";
import { Button, SegmentedControl } from "@/ui/primitives";
import { ReviewIcon, DraftIcon, AssistantIcon, PlaybookIcon } from "@/ui/icons";
import { subscribe, clearSession } from "@/auth/session";
import { LoginView } from "@/features/auth/LoginView";
import { ReviewView } from "@/features/review/ReviewView";
import { ChangesView } from "@/features/review/ChangesView";
import { AuthorityView } from "@/features/authority/AuthorityView";
import { GovernanceView } from "@/features/governance/GovernanceView";
import { AssistantView } from "@/features/assistant/AssistantView";
import { DraftView } from "@/features/draft/DraftView";
import { PlaybookView } from "@/features/playbook/PlaybookView";
import { ReviewProvider } from "@/features/review/ReviewProvider";
import "./styles/app.css";

/**
 * Four primary modes. Reviewing a document (redlines, citations, sign-off) is
 * one hub with a sub-nav; clause tools are folded into the Assistant as a
 * selection action, rather than one tab per feature.
 */
type Tab = "review" | "draft" | "assistant" | "playbook";
type ReviewSub = "redlines" | "changes" | "citations" | "signoff";

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "review", label: "Review", icon: ReviewIcon },
  { id: "draft", label: "Draft", icon: DraftIcon },
  { id: "assistant", label: "Assistant", icon: AssistantIcon },
  { id: "playbook", label: "Playbook", icon: PlaybookIcon },
];

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("redlines");

  useEffect(() => subscribe(setUser), []);

  return (
    <ReviewProvider>
      <div className="app">
        <Header
        right={
          user ? (
            <Button variant="ghost" size="sm" onClick={clearSession}>
              Sign out
            </Button>
          ) : undefined
        }
      />

      {user && (
        <nav
          className="tabnav"
          role="tablist"
          aria-label="Mode"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const i = TABS.findIndex((t) => t.id === tab);
            const next =
              e.key === "ArrowLeft"
                ? (i - 1 + TABS.length) % TABS.length
                : (i + 1) % TABS.length;
            setTab(TABS[next].id);
            document.getElementById(`tab-${TABS[next].id}`)?.focus();
          }}
        >
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                aria-selected={on}
                aria-controls="app-panel"
                tabIndex={on ? 0 : -1}
                className={`tabnav__tab ${on ? "tabnav__tab--on" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            );
          })}
        </nav>
      )}

      {user && tab === "review" && (
        <div className="subnav">
          <SegmentedControl<ReviewSub>
            label="Review section"
            value={reviewSub}
            onChange={setReviewSub}
            options={[
              { value: "redlines", label: "Redlines" },
              { value: "changes", label: "Changes" },
              { value: "citations", label: "Citations" },
              { value: "signoff", label: "Sign-off" },
            ]}
          />
        </div>
      )}

      <div
        className="app-body"
        id="app-panel"
        role={user ? "tabpanel" : undefined}
        aria-labelledby={user ? `tab-${tab}` : undefined}
      >
        {!user ? (
          <LoginView />
        ) : tab === "review" ? (
          reviewSub === "redlines" ? (
            <ReviewView />
          ) : reviewSub === "changes" ? (
            <ChangesView />
          ) : reviewSub === "citations" ? (
            <AuthorityView />
          ) : (
            <GovernanceView />
          )
        ) : tab === "draft" ? (
          <DraftView />
        ) : tab === "assistant" ? (
          <AssistantView />
        ) : (
          <PlaybookView />
        )}
      </div>
      </div>
    </ReviewProvider>
  );
}
