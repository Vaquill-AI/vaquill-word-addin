import { useState } from "react";
import { Button, Field } from "@/ui/primitives";
import { getCourtListenerToken, setCourtListenerToken } from "@/ai/keys";

/**
 * Optional CourtListener token for community case-law verification. With a token,
 * the Authority check verifies whether cited cases exist, browser-direct against
 * the user's own free CourtListener account. Rendered only in the community build.
 */
export function CourtListenerCard() {
  const [token, setToken] = useState<string>(getCourtListenerToken() ?? "");
  const [saved, setSaved] = useState(false);

  function save() {
    setCourtListenerToken(token);
    setSaved(true);
  }

  return (
    <div className="card settings-card">
      <h2 className="settings-heading">Case-law verification (optional)</h2>
      <p className="small muted settings-heading__hint">
        Add your free CourtListener API token to check whether cited cases exist. Statute
        verification is not available in the community edition.
      </p>
      <div className="stack" style={{ gap: 10 }}>
        <Field label="CourtListener token">
          <input
            type="password"
            value={token}
            placeholder="Paste your token"
            autoComplete="off"
            onChange={(e) => {
              setToken(e.target.value);
              setSaved(false);
            }}
            style={{ width: "100%" }}
          />
        </Field>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="primary" size="sm" onClick={save}>
            Save
          </Button>
          {saved && (
            <span className="small" style={{ color: "#157347" }}>
              Saved
            </span>
          )}
          <a
            className="small"
            href="https://www.courtlistener.com/help/api/rest/"
            target="_blank"
            rel="noreferrer"
          >
            Get a token
          </a>
        </div>
      </div>
    </div>
  );
}
