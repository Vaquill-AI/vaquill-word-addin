import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { Header } from "@/ui/Header";
import { Button, IconButton, SegmentedControl, Spinner } from "@/ui/primitives";
import { Avatar } from "@/ui/Avatar";
import {
  ReviewIcon,
  DraftIcon,
  AssistantIcon,
  ArrowLeftIcon,
  ToolsIcon,
  HelpIcon,
} from "@/ui/icons";
import { subscribe, clearSession } from "@/auth/session";
import { getMe } from "@/api/account";
import { LoginView } from "@/features/auth/LoginView";
import { ReviewView } from "@/features/review/ReviewView";
import { ChangesView } from "@/features/review/ChangesView";
import { CompareView } from "@/features/compare/CompareView";
import { AuthorityView } from "@/features/authority/AuthorityView";
import { AssistantTab } from "@/features/assistant/AssistantTab";
import { DraftView } from "@/features/draft/DraftView";
import { PlaybookView } from "@/features/playbook/PlaybookView";
import { ToolsHub } from "@/features/toolshub/ToolsHub";
import { ReviewProvider } from "@/features/review/ReviewProvider";
import { SettingsView } from "@/features/settings/SettingsView";
import { ContextBar } from "@/features/shell/ContextBar";
import { AppNavProvider, useAppNav, type AppTab, type ReviewSub } from "@/app/nav";
import { TourProvider, useTour } from "@/tour/TourProvider";
import { GuidesMenu } from "@/tour/GuidesMenu";
import { WELCOME_TOUR_ID } from "@/tour/registry";
import { resetToursSeen } from "@/tour/tourStore";
import { isCommunity } from "@/community/edition";
import { KeyWizard } from "@/features/onboarding/KeyWizard";
import { subscribeActiveOrg } from "@/lib/org";
import "./styles/app.css";

/**
 * Four primary modes, each a job you do to the document open in front of you:
 * Review (read + mark up), Draft (write new language), Assistant (ask the doc),
 * Tools (finalize / QA utilities). Everything that does not need the open
 * document (case-law research, playbook + template + draft libraries) lives on
 * the web app and is reached by a deep-link, not a tab.
 */
// Order leads with the Assistant (the default landing tab and the most flexible
// entry point: ask about the doc, or switch to Edit for redlines), then the
// structured in-document jobs, then the utilities.
const TABS: { id: AppTab; label: string; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "assistant", label: "Assistant", icon: AssistantIcon },
  { id: "review", label: "Review", icon: ReviewIcon },
  { id: "draft", label: "Draft", icon: DraftIcon },
  { id: "tools", label: "Tools", icon: ToolsIcon },
];

export function App() {
  return (
    <ReviewProvider>
      <AppNavProvider>
        <TourProvider>
          <AppShell />
        </TourProvider>
      </AppNavProvider>
    </ReviewProvider>
  );
}

function AppShell() {
  const { tab, setTab, reviewSub, setReviewSub, intent, navigate, clearIntent } = useAppNav();
  const { startIfUnseen, start } = useTour();
  const [user, setUser] = useState<User | null>(null);
  // Registration gate: a valid Supabase session is not enough. A bare OAuth
  // identity that authenticated but never signed up (no account) must not reach
  // the app. "checking" while we confirm via /auth/me; "ok" once confirmed.
  const [regState, setRegState] = useState<"idle" | "checking" | "ok">("idle");
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  // Bumped whenever the active organization changes, to remount the data views
  // (matters/drafts/playbooks/clients) so they refetch under the new org.
  const [orgVersion, setOrgVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuides, setShowGuides] = useState(false);

  useEffect(() => subscribe(setUser), []);
  useEffect(() => subscribeActiveOrg(() => setOrgVersion((v) => v + 1)), []);

  // When a session appears, confirm the identity is actually a registered account
  // before showing the app. An unregistered identity is signed out and sent to
  // sign up. Fail open: a transient /auth/me failure must never lock out a real
  // user, so only an explicit initialized === false blocks.
  useEffect(() => {
    if (!user) {
      setRegState("idle");
      return;
    }
    let alive = true;
    setRegState("checking");
    getMe()
      .then((me) => {
        if (!alive) return;
        if (me.initialized === false) {
          setAuthNotice(
            "You do not have a Vaquill AI account yet. Create one on the web, then sign in here.",
          );
          clearSession(); // -> subscribe fires user=null -> back to the login screen
        } else {
          setRegState("ok");
        }
      })
      .catch(() => {
        if (alive) setRegState("ok");
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const authed = !!user && regState === "ok";

  // First run: once the user is confirmed, start the welcome walkthrough unless
  // they have already completed (or skipped) it. It drives the tabs itself.
  useEffect(() => {
    if (authed) startIfUnseen(WELCOME_TOUR_ID);
  }, [authed, startIfUnseen]);

  // A "Run this playbook" handoff resolves to the Review form's pending state.
  const pendingPlaybook =
    tab === "review" && intent?.kind === "runPlaybook"
      ? { playbookId: intent.playbookId, contractType: intent.contractType }
      : null;
  // A "quick check" handoff (NDA screen / compliance) opens that Review preset.
  const pendingPreset =
    tab === "review" && intent?.kind === "reviewPreset" ? intent.preset : null;
  // A "View in review" handoff from the Deal cockpit: focus one clause's card.
  const pendingFocus =
    tab === "review" && intent?.kind === "focusClause"
      ? { clauseKey: intent.clauseKey, clauseName: intent.clauseName }
      : null;
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
      {!authed ? (
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
            <div className="appbar__guides" data-tour="help" style={{ position: "relative" }}>
              <IconButton
                label="Guides and walkthroughs"
                onClick={() => setShowGuides((v) => !v)}
                active={showGuides}
              >
                <HelpIcon size={16} />
              </IconButton>
              {showGuides && <GuidesMenu onClose={() => setShowGuides(false)} />}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings((v) => !v)}
              aria-pressed={showSettings}
              title="Account and settings"
              aria-label="Account and settings"
            >
              <Avatar
                name={
                  (user.user_metadata?.full_name as string) ||
                  (user.user_metadata?.name as string) ||
                  user.email ||
                  "Account"
                }
                src={
                  (user.user_metadata?.avatar_url as string) ||
                  (user.user_metadata?.picture as string) ||
                  null
                }
                size={22}
              />
            </Button>
          </div>
        </header>
      )}

      {authed && !showSettings && tab === "review" && (
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
              { value: "playbooks", label: "Playbooks" },
            ]}
          />
        </div>
      )}

      {authed && !showSettings && <ContextBar />}

      <div
        className="app-body"
        id="app-panel"
        key={orgVersion}
        role={authed ? "tabpanel" : undefined}
        aria-labelledby={authed ? `tab-${tab}` : undefined}
      >
        {!authed ? (
          regState === "checking" ? (
            <div className="login">
              <Spinner />
              <p className="login__sub small">Signing you in...</p>
            </div>
          ) : isCommunity() ? (
            <KeyWizard />
          ) : (
            <LoginView notice={authNotice} />
          )
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
            <SettingsView
              onReplayWalkthrough={() => {
                setShowSettings(false);
                resetToursSeen();
                start(WELCOME_TOUR_ID);
              }}
            />
          </div>
        ) : tab === "review" ? (
          reviewSub === "redlines" ? (
            <ReviewView
              pendingPlaybook={pendingPlaybook}
              pendingPreset={pendingPreset}
              pendingFocus={pendingFocus}
              onPendingConsumed={clearIntent}
            />
          ) : reviewSub === "changes" ? (
            <ChangesView />
          ) : reviewSub === "compare" ? (
            <CompareView />
          ) : reviewSub === "citations" ? (
            <AuthorityView />
          ) : (
            <PlaybookView
              onRunPlaybook={(pb) =>
                navigate("review", {
                  kind: "runPlaybook",
                  playbookId: pb.id,
                  contractType: pb.contractType,
                })
              }
            />
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
