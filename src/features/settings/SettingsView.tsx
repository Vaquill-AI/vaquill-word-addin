import { useEffect, useState } from "react";
import { Badge, Button, Field, Spinner } from "@/ui/primitives";
import { Combobox } from "@/ui/Combobox";
import { clearSession, getUser } from "@/auth/session";
import { getActiveOrgId } from "@/lib/org";
import { listMyOrganizations } from "@/api/organizations";
import { fetchUsageSnapshot, type QuotaSnapshot } from "@/api/usage";
import { config } from "@/config";
import { MatterPicker } from "@/features/integration/MatterPicker";
import { OrgSwitcher } from "@/features/org/OrgSwitcher";
import {
  getReviewPrefs,
  setReviewPrefs,
  subscribeReviewPrefs,
  type ReviewPrefs,
} from "@/lib/prefs";
import { JURISDICTIONS } from "@/features/review/constants";
import "./settings.css";

// Footer links on the marketing site (www.vaquill.ai, the domain the manifest
// declares). Support matches the manifest's SupportUrl; confirm privacy/terms paths.
const SUPPORT_URL = "https://www.vaquill.ai/support";
const PRIVACY_URL = "https://www.vaquill.ai/privacy";
const TERMS_URL = "https://www.vaquill.ai/terms";
// Shown for support/debugging. Keep in sync with package.json "version".
const APP_VERSION = "0.1.0";

/**
 * Account / settings panel. Read-only account context (signed-in user, active
 * organization, current usage against plan limits) plus editable review
 * defaults (jurisdiction + contract type) persisted locally via prefs.ts.
 *
 * Self-contained: this view resolves its own data and is NOT wired into the app
 * shell here. Every remote field is null-guarded and degrades to a friendly
 * "unavailable" state rather than crashing when the backend omits it.
 */

type UsageState =
  | { status: "loading" }
  | { status: "ready"; snapshot: QuotaSnapshot }
  | { status: "unavailable" };

/**
 * Compact plan + usage line. The full per-metric breakdown and billing live in
 * the web app (this is a thin client), so the pane shows the plan, a one-line
 * message-quota glance, and a deep-link out to manage it. The reactive
 * QuotaBanner still warns in-flow when a limit is close.
 */
function UsageSection({ state }: { state: UsageState }) {
  const manageLink = (
    <a
      className="settings-usage__link small"
      href={`${config.appBase}/settings/billing`}
      target="_blank"
      rel="noreferrer"
    >
      Manage your plan
    </a>
  );

  if (state.status === "loading") {
    return (
      <div className="row muted small">
        <Spinner /> Loading usage...
      </div>
    );
  }
  if (state.status === "unavailable") {
    return (
      <div className="stack settings-usage" style={{ gap: 6 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Usage is unavailable right now.
        </p>
        {manageLink}
      </div>
    );
  }

  const { snapshot } = state;
  const messages = snapshot.messages;
  return (
    <div className="stack settings-usage" style={{ gap: 6 }}>
      <div className="row settings-usage__tier" style={{ justifyContent: "space-between", gap: 8 }}>
        <div className="row" style={{ gap: 6, alignItems: "center", minWidth: 0 }}>
          <Badge tone="brand">{snapshot.tierName || snapshot.tier || "Plan"}</Badge>
          <span className="small muted">
            {messages ? `${messages.current} / ${messages.limit} messages` : "Unlimited messages"}
          </span>
        </div>
        {manageLink}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Full usage and billing are in the Vaquill AI web app.
      </p>
    </div>
  );
}

export function SettingsView() {
  const user = getUser();
  const email = user?.email ?? "";
  const meta = user?.user_metadata ?? {};
  const rawName = (meta as Record<string, unknown>).full_name ?? (meta as Record<string, unknown>).name;
  const displayName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "";

  const [orgName, setOrgName] = useState<string | null>(null);
  // Org count decides whether the organization row is a switcher (multi-org) or
  // static text (single-org), so the active org is not shown twice.
  const [orgCount, setOrgCount] = useState(0);
  const [usage, setUsage] = useState<UsageState>({ status: "loading" });
  const [prefs, setPrefs] = useState<ReviewPrefs>(getReviewPrefs());

  // Keep the form in sync if the prefs store changes elsewhere.
  useEffect(() => subscribeReviewPrefs(setPrefs), []);

  // Resolve the active organization's display name.
  useEffect(() => {
    let alive = true;
    listMyOrganizations()
      .then((orgs) => {
        if (!alive) return;
        const activeId = getActiveOrgId();
        const match = activeId ? orgs.find((o) => o.id === activeId) : undefined;
        setOrgName(match?.name ?? (orgs.length > 0 ? orgs[0]?.name ?? null : null));
        setOrgCount(orgs.length);
      })
      .catch(() => {
        if (alive) setOrgName(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Load the usage snapshot.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    fetchUsageSnapshot(controller.signal)
      .then((snapshot) => {
        if (!alive) return;
        setUsage(snapshot ? { status: "ready", snapshot } : { status: "unavailable" });
      })
      .catch(() => {
        if (alive) setUsage({ status: "unavailable" });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  return (
    <div className="stack settings">
      <h1 className="view-title">Account</h1>

      <div className="card settings-card">
        <div className="settings-account__top">
          <div className="stack settings-account">
            {displayName && <span className="settings-account__name">{displayName}</span>}
            <span className="small muted">{email || "Not signed in"}</span>
            {/* One organization row: a switcher when the user owns more than one
                workspace, otherwise static text (so the active org is not shown
                twice). */}
            <div className="row settings-account__org">
              <span className="small muted">Organization</span>
              {orgCount > 1 ? (
                <OrgSwitcher />
              ) : (
                <span className="small">{orgName ?? "Personal"}</span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={clearSession}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="card settings-card">
        <h2 className="settings-heading">Plan &amp; usage</h2>
        <UsageSection state={usage} />
      </div>

      <div className="card settings-card">
        <h2 className="settings-heading">Workspace defaults</h2>
        <p className="small muted settings-heading__hint">
          Set your matter and jurisdiction once. New reviews and the assistant use them
          automatically, so you never re-pick them.
        </p>
        <div className="form-grid">
          <MatterPicker
            value={prefs.matterId}
            onChange={(id) => setReviewPrefs({ matterId: id })}
            label="Default matter"
            emptyLabel="General matter"
            showWhenEmpty
          />
          <Field label="Default jurisdiction">
            <Combobox
              value={prefs.jurisdiction}
              onChange={(v) => setReviewPrefs({ jurisdiction: v })}
              options={JURISDICTIONS}
              ariaLabel="Default jurisdiction"
            />
          </Field>
        </div>
      </div>

      <div className="settings-footer">
        <a className="settings-footer__link" href={SUPPORT_URL} target="_blank" rel="noreferrer">
          Help &amp; support
        </a>
        <span className="settings-footer__dot" aria-hidden>
          ·
        </span>
        <a className="settings-footer__link" href={PRIVACY_URL} target="_blank" rel="noreferrer">
          Privacy
        </a>
        <span className="settings-footer__dot" aria-hidden>
          ·
        </span>
        <a className="settings-footer__link" href={TERMS_URL} target="_blank" rel="noreferrer">
          Terms
        </a>
        <span className="settings-footer__ver">v{APP_VERSION}</span>
      </div>
    </div>
  );
}
