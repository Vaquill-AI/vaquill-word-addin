import { notifyCommunityAuth } from "@/auth/session";
import { ProviderKeyForm } from "./ProviderKeyForm";

/**
 * First-run setup for the community edition. Shown until the user saves a working
 * key, at which point the app unlocks (saving notifies the session, which flips
 * the add-in to authed). Replaces the sign-in screen, since the community build
 * has no Vaquill account.
 */
const LINKS: { label: string; href: string }[] = [
  { label: "Get an OpenAI key", href: "https://platform.openai.com/api-keys" },
  { label: "Get an Anthropic key", href: "https://console.anthropic.com/settings/keys" },
];

export function KeyWizard() {
  return (
    <div className="stack" style={{ gap: 16, padding: 16, maxWidth: 460, margin: "0 auto" }}>
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: "var(--fs-body-lg, 18px)" }}>Set up Vaquill</h1>
        <p className="small muted" style={{ margin: 0 }}>
          This edition runs on your own AI provider. Add a key to unlock the assistant, review,
          drafting, and the tools. Everything runs against your key, from your machine.
        </p>
      </div>
      <div className="card" style={{ padding: 14 }}>
        <ProviderKeyForm onSaved={() => notifyCommunityAuth()} />
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {LINKS.map((l) => (
          <a key={l.href} className="small" href={l.href} target="_blank" rel="noreferrer">
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
