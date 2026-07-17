import { type FormEvent, useState } from "react";
import { login } from "@/auth/dialog-login";
import { loginWithPassword } from "@/auth/password-login";
import { config } from "@/config";
import { Banner, Button, Field, SegmentedControl } from "@/ui/primitives";
import { ProviderKeyForm } from "@/features/onboarding/ProviderKeyForm";
import { setByokMode } from "@/community/edition";
import { notifyCommunityAuth } from "@/auth/session";

/** Open the web sign-up in the system browser. There is no sign-up inside Word:
 *  a new user registers on the web app, then comes back here to sign in. Prefer
 *  the Office host opener so the link escapes the sandboxed task-pane webview. */
function openRegister() {
  try {
    Office.context.ui.openBrowserWindow(config.signupUrl);
  } catch {
    window.open(config.signupUrl, "_blank", "noopener");
  }
}

/** The official multicolor Google "G" for the OAuth button (the one place a
 *  non-monochrome mark belongs). */
function GoogleGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Sign-in screen. Supports two paths:
 *   - Email + password: runs entirely in the task pane (no dialog).
 *   - Google: opens the Office dialog and completes Supabase PKCE in the pane.
 */
export function LoginView({ notice }: { notice?: string | null } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "password" | "google">(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"cloud" | "byok">("cloud");

  async function onPasswordSignIn(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy("password");
    setError(null);
    try {
      await loginWithPassword(email, password);
    } catch (err) {
      setError((err as Error).message || "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onGoogleSignIn() {
    setBusy("google");
    setError(null);
    try {
      await login();
    } catch (err) {
      setError((err as Error).message || "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <div className="login">
      <img src="/assets/logo-512.png" width={64} height={64} alt="" className="login__mark" />
      <div className="stack" style={{ gap: 4, alignItems: "center" }}>
        <h1 className="login__title">Vaquill AI for Word</h1>
        <p className="login__sub small">
          Review the open contract, apply grounded redlines as tracked changes, and draft clauses
          without leaving Word.
        </p>
      </div>

      <SegmentedControl<"cloud" | "byok">
        label="Sign-in method"
        value={tab}
        onChange={setTab}
        options={[
          { value: "cloud", label: "Vaquill AI account" },
          { value: "byok", label: "Bring your own key" },
        ]}
      />

      {notice && !error && <Banner tone="info">{notice}</Banner>}
      {error && tab === "cloud" && <Banner tone="danger">{error}</Banner>}

      {tab === "cloud" ? (
        <>
          <form className="login__form" onSubmit={onPasswordSignIn}>
            <Field label="Email">
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@firm.com"
                disabled={disabled}
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                disabled={disabled}
              />
            </Field>
            <Button variant="primary" type="submit" loading={busy === "password"} disabled={disabled} block>
              Sign in
            </Button>
          </form>

          <div className="login__divider">
            <span>or</span>
          </div>

          <div className="login__form">
            <Button
              type="button"
              variant="default"
              onClick={onGoogleSignIn}
              loading={busy === "google"}
              disabled={disabled}
              block
            >
              <GoogleGlyph /> Continue with Google
            </Button>
          </div>

          <p className="login__register small muted">
            New to Vaquill AI?{" "}
            <button type="button" className="linkaction" onClick={openRegister} disabled={disabled}>
              Create an account
            </button>
          </p>
        </>
      ) : (
        <div className="login__form stack" style={{ gap: 10 }}>
          <p className="small muted" style={{ margin: 0 }}>
            Use your own OpenAI or Anthropic key. No account needed. Your key stays on this device
            and is sent only to your provider.
          </p>
          <ProviderKeyForm
            onSaved={() => {
              // Reload only when the flag actually persisted. If storage is
              // blocked the flag lives in memory, and reloading would wipe it
              // and drop the user right back on this screen; switch in place
              // instead so BYOK still works for the session.
              if (setByokMode(true)) window.location.reload();
              else notifyCommunityAuth();
            }}
          />
        </div>
      )}
    </div>
  );
}
