import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { Header } from "@/ui/Header";
import { Button, SegmentedControl } from "@/ui/primitives";
import {
  ReviewIcon,
  DraftIcon,
  AssistantIcon,
  SettingsIcon,
  ArrowLeftIcon,
  ToolsIcon,
} from "@/ui/icons";
import { subscribe } from "@/auth/session";
import { LoginView } from "@/features/auth/LoginView";
import { ReviewView } from "@/features/review/ReviewView";
import { ChangesView } from "@/features/review/ChangesView";
import { CompareView } from "@/features/compare/CompareView";
import { AuthorityView } from "@/features/authority/AuthorityView";
import { AssistantTab } from "@/features/assistant/AssistantTab";
import { DraftView } from "@/features/draft/DraftView";
import { ToolsHub } from "@/features/toolshub/ToolsHub";
import { ReviewProvider } from "@/features/review/ReviewProvider";
import { SettingsView } from "@/features/settings/SettingsView";
import { ContextBar } from "@/features/shell/ContextBar";
import { AppNavProvider, useAppNav, type AppTab, type ReviewSub } from "@/app/nav";
import { subscribeActiveOrg } from "@/lib/org";
import "./styles/app.css";

/**
 * Four primary modes, each a job you do to the document open in front of you:
 * Review (read + mark up), Draft (write new language), Assistant (ask the doc),
 * Tools (finalize / QA utilities). Everything that does not need the open
 * document (case-law research, playbook + template + draft libraries) lives on
 * the web app and is reached by a deep-link, not a tab.
 */
// Order leads with the primary in-document jobs (Review is the flagship and the
// most frequent task for an in-house transactional user), then the utilities.
const TABS: { id: AppTab; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "review", label: "Review", icon: ReviewIcon },
  { id: "draft", label: "Draft", icon: DraftIcon },
  { id: "assistant", label: "Assistant", icon: AssistantIcon },
  { id: "tools", label: "Tools", icon: ToolsIcon },
];

export function App() {
  return (
    <ReviewProvider>
      <AppNavProvider>
        <AppShell />
      </AppNavProvider>
    </ReviewProvider>
  );
}

function AppShell() {
  const { tab, setTab, reviewSub, setReviewSub, intent, clearIntent } = useAppNav();
  const [user, setUser] = useState<User | null>(null);
  // Bumped whenever the active organization changes, to remount the data views
  // (matters/drafts/playbooks/clients) so they refetch under the new org.
  const [orgVersion, setOrgVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => subscribe(setUser), []);
  useEffect(() => subscribeActiveOrg(() => setOrgVersion((v) => v + 1)), []);

  // A "Run this playbook" handoff resolves to the Review form's pending state.
  const pendingPlaybook =
    tab === "review" && intent?.kind === "runPlaybook"
      ? { playbookId: intent.playbookId, contractType: intent.contractType }
      : null;
  // A "quick check" handoff (NDA screen / compliance) opens that Review preset.
  const pendingPreset =
    tab === "review" && intent?.kind === "reviewPreset" ? intent.preset : null;
  // reviewContract / checkCitations intents only steer navigation; consume them
  // once we have landed so they do not re-fire.
  useEffect(() => {
    if (intent?.kind === "reviewContract" || intent?.kind === "checkCitations") clearIntent();
  }, [intent, clearIntent]);

  return (
    <div className="app">
      {/* Logged out: the branded header (logo + wordmark) for login. Logged in:
          one compact bar carrying the logo, the tab nav, and the account controls,
          so the mode nav no longer costs a second row. The wordmark is dropped
          here; the logo alone identifies the app. */}
      {!user ? (
        <Header />
      ) : (
        <header className="appbar">
          <a
            href="https://www.vaquill.ai"
            target="_blank"
            rel="noreferrer"
            className="appbar__brand"
            title="Vaquill AI"
            aria-label="Open the Vaquill AI website in your browser"
          >
            <img
              src="/assets/icon-80.png"
              width={22}
              height={22}
              alt="Vaquill AI"
              className="appbar__mark"
            />
          </a>
          <nav
            className="appbar__tabs"
            role="tablist"
            aria-label="Mode"
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const i = TABS.findIndex((t) => t.id === tab);
              const next =
                e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : (i + 1) % TABS.length;
              setShowSettings(false);
              setTab(TABS[next].id);
              document.getElementById(`tab-${TABS[next].id}`)?.focus();
            }}
          >
            {TABS.map((t) => {
              // In Settings no tab reads as active; clicking one both switches mode
              // and leaves Settings, so the tabs double as the way out.
              const on = !showSettings && t.id === tab;
              return (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  role="tab"
                  aria-selected={on}
                  aria-controls="app-panel"
                  tabIndex={on ? 0 : -1}
                  className={`tabnav__tab ${on ? "tabnav__tab--on" : ""}`}
                  onClick={() => {
                    setShowSettings(false);
                    setTab(t.id);
                  }}
                >
                  <t.icon size={15} />
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="appbar__right">
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
        </header>
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
              { value: "compare", label: "Compare" },
              { value: "citations", label: "Citations" },
            ]}
          />
        </div>
      )}

      {user && !showSettings && <ContextBar />}

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
              pendingPreset={pendingPreset}
              onPendingConsumed={clearIntent}
            />
          ) : reviewSub === "changes" ? (
            <ChangesView />
          ) : reviewSub === "compare" ? (
            <CompareView />
          ) : (
            <AuthorityView />
          )
        ) : tab === "draft" ? (
          <DraftView />
        ) : tab === "assistant" ? (
          <AssistantTab
            intent={tab === "assistant" ? intent : null}
            onIntentDone={clearIntent}
          />
        ) : (
          <ToolsHub intent={tab === "tools" ? intent : null} onIntentDone={clearIntent} />
        )}
      </div>
    </div>
  );
}
