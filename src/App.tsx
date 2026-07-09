import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Header } from "@/ui/Header";
import { Button } from "@/ui/primitives";
import { subscribe, clearSession } from "@/auth/session";
import { LoginView } from "@/features/auth/LoginView";
import { ReviewView } from "@/features/review/ReviewView";
import { ToolsView } from "@/features/tools/ToolsView";
import { AuthorityView } from "@/features/authority/AuthorityView";
import { AssistantView } from "@/features/assistant/AssistantView";
import { GovernanceView } from "@/features/governance/GovernanceView";
import { PlaybookView } from "@/features/playbook/PlaybookView";
import { DraftView } from "@/features/draft/DraftView";
import "./styles/app.css";

type Tab = "review" | "assistant" | "draft" | "authority" | "tools" | "playbook" | "signoff";

const TABS: { id: Tab; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "assistant", label: "Assistant" },
  { id: "draft", label: "Draft" },
  { id: "authority", label: "Authority" },
  { id: "tools", label: "Tools" },
  { id: "playbook", label: "Playbook" },
  { id: "signoff", label: "Sign-off" },
];

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("review");

  useEffect(() => subscribe(setUser), []);

  return (
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
        <nav className="tabnav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tabnav__tab ${t.id === tab ? "tabnav__tab--on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <div className="app-body">
        {!user ? (
          <LoginView />
        ) : tab === "review" ? (
          <ReviewView />
        ) : tab === "assistant" ? (
          <AssistantView />
        ) : tab === "draft" ? (
          <DraftView />
        ) : tab === "authority" ? (
          <AuthorityView />
        ) : tab === "tools" ? (
          <ToolsView />
        ) : tab === "playbook" ? (
          <PlaybookView />
        ) : (
          <GovernanceView />
        )}
      </div>
    </div>
  );
}
