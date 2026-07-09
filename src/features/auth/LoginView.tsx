import { useState } from "react";
import { Button, Banner } from "@/ui/primitives";
import { login } from "@/auth/dialog-login";

/** Sign-in screen. Opens the Office dialog and completes Supabase PKCE. */
export function LoginView() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await login();
    } catch (e) {
      setError((e as Error).message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

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
      <Button variant="primary" onClick={onSignIn} loading={busy} block>
        Sign in to Vaquill AI
      </Button>
    </div>
  );
}
