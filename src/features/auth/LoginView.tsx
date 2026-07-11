import { type FormEvent, useState } from "react";
import { login } from "@/auth/dialog-login";
import { loginWithPassword } from "@/auth/password-login";
import { Banner, Button, Field } from "@/ui/primitives";

/**
 * Sign-in screen. Supports two paths:
 *   - Email + password: runs entirely in the task pane (no dialog).
 *   - Google: opens the Office dialog and completes Supabase PKCE in the pane.
 */
export function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "password" | "google">(null);
  const [error, setError] = useState<string | null>(null);

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

      {error && <Banner tone="danger">{error}</Banner>}

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
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
