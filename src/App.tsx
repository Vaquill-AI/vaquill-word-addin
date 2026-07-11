import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { Header } from "@/ui/Header";
import { Button, SegmentedControl } from "@/ui/primitives";
import {
  ReviewIcon,
  DraftIcon,
  AssistantIcon,
  PlaybookIcon,
  SettingsIcon,
  ArrowLeftIcon,
  ToolsIcon,
} from "@/ui/icons";
import { subscribe } from "@/auth/session";
import { LoginView } from "@/features/auth/LoginView";
import { ReviewView } from "@/features/review/ReviewView";
import { ChangesView } from "@/features/review/ChangesView";
import { AuthorityView } from "@/features/authority/AuthorityView";
import { GovernanceView } from "@/features/governance/GovernanceView";
import { AssistantView } from "@/features/assistant/AssistantView";
import { DraftView } from "@/features/draft/DraftView";
import { PlaybookView } from "@/features/playbook/PlaybookView";
import { ToolsHub } from "@/features/toolshub/ToolsHub";
import { ReviewProvider } from "@/features/review/ReviewProvider";
import { OrgSwitcher } from "@/features/org/OrgSwitcher";
import { SettingsView } from "@/features/settings/SettingsView";
import { subscribeActiveOrg } from "@/lib/org";
import "./styles/app.css";

/**
 * Five primary modes. Reviewing a document (redlines, citations, sign-off) is
 * one hub with a sub-nav; the document utilities (Compliance, Redact, Fill) are
 * folded under a single Tools launcher rather than one tab each.
 */
type Tab = "review" | "draft" | "assistant" | "playbook" | "tools";
type ReviewSub = "redlines" | "changes" | "citations" | "signoff";

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "review", label: "Review", icon: ReviewIcon },
  { id: "draft", label: "Draft", icon: DraftIcon },
  { id: "assistant", label: "Assistant", icon: AssistantIcon },
  { id: "playbook", label: "Playbook", icon: PlaybookIcon },
  { id: "tools", label: "Tools", icon: ToolsIcon },
];

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("redlines");
  // Bumped whenever the active organization changes, to remount the data views
  // (matters/drafts/playbooks/clients) so they refetch under the new org.
  const [orgVersion, setOrgVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  // A "Run this playbook" handoff from the Playbook tab to the Review form.
  const [pendingPlaybook, setPendingPlaybook] = useState<{
    playbookId: string;
    contractType: string;
  } | null>(null);

  useEffect(() => subscribe(setUser), []);
  useEffect(() => subscribeActiveOrg(() => setOrgVersion((v) => v + 1)), []);

  return (
    <ReviewProvider>
      <div className="app">
        <Header
        right={
          user ? (
            <div className="row" style={{ gap: 8 }}>
              <OrgSwitcher />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings((v) => !v)}
                aria-pressed={showSettings}
                title="Settings"
                aria-label="Settings"
              >
                <SettingsIcon size={15} />
              </Button>
            </div>
          ) : undefined
        }
      />

      {user && !showSettings && (
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

      {user && !showSettings && tab === "review" && (
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
        key={orgVersion}
        role={user ? "tabpanel" : undefined}
        aria-labelledby={user ? `tab-${tab}` : undefined}
      >
        {!user ? (
          <LoginView />
        ) : showSettings ? (
          <div className="stack" style={{ gap: 8 }}>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowSettings(false)}
              style={{ alignSelf: "flex-start" }}
              aria-label="Back to app"
            >
              <ArrowLeftIcon size={14} /> Back
            </Button>
            <SettingsView />
          </div>
        ) : tab === "review" ? (
          reviewSub === "redlines" ? (
            <ReviewView
              pendingPlaybook={pendingPlaybook}
              onPendingConsumed={() => setPendingPlaybook(null)}
            />
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
        ) : tab === "playbook" ? (
          <PlaybookView
            onRunPlaybook={(pb) => {
              setPendingPlaybook({ playbookId: pb.id, contractType: pb.contractType });
              setReviewSub("redlines");
              setTab("review");
            }}
          />
        ) : (
          <ToolsHub />
        )}
      </div>
      </div>
    </ReviewProvider>
  );
}
