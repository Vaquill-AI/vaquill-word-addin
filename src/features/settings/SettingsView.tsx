import { useEffect, useState } from "react";
import { Badge, Banner, Button, Field, Spinner } from "@/ui/primitives";
import { clearSession, getUser } from "@/auth/session";
import { getActiveOrgId } from "@/lib/org";
import { listMyOrganizations } from "@/api/organizations";
import { fetchUsageSnapshot, type QuotaSnapshot, type UsageMetric } from "@/api/usage";
import { MatterPicker } from "@/features/integration/MatterPicker";
import {
  getReviewPrefs,
  setReviewPrefs,
  subscribeReviewPrefs,
  type ReviewPrefs,
} from "@/lib/prefs";
import { CONTRACT_TYPES, JURISDICTIONS } from "@/features/review/constants";
import "./settings.css";

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

interface UsageRow {
  label: string;
  metric: UsageMetric | null;
}

function usageRows(snapshot: QuotaSnapshot): UsageRow[] {
  return [
    { label: "Chat messages", metric: snapshot.messages },
    { label: "Deep research", metric: snapshot.deepSearches },
    { label: "Legal tools", metric: snapshot.legalTools },
    { label: "Full drafts", metric: snapshot.fullDrafts },
  ];
}

function MeterRow({ label, metric }: UsageRow) {
  if (!metric) {
    return (
      <div className="settings-meter">
        <div className="row settings-meter__head">
          <span>{label}</span>
          <span className="small muted">Unlimited</span>
        </div>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, metric.percentage));
  return (
    <div className="settings-meter">
      <div className="row settings-meter__head">
        <span>{label}</span>
        <span className="small muted">
          {metric.current} / {metric.limit}
        </span>
      </div>
      <div
        className="settings-meter__track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span
          className={`settings-meter__fill${pct >= 90 ? " settings-meter__fill--high" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function UsageSection({ state }: { state: UsageState }) {
  if (state.status === "loading") {
    return (
      <div className="row muted small">
        <Spinner /> Loading usage...
      </div>
    );
  }
  if (state.status === "unavailable") {
    return <Banner tone="info">Usage is unavailable right now. Try again later.</Banner>;
  }
  const { snapshot } = state;
  const rows = usageRows(snapshot);
  const hasAnyMetric = rows.some((r) => r.metric);
  return (
    <div className="stack settings-usage">
      <div className="row settings-usage__tier">
        <span className="small muted">Plan</span>
        <Badge tone="brand">{snapshot.tierName || snapshot.tier || "Unknown"}</Badge>
      </div>
      {hasAnyMetric ? (
        <div className="form-grid">
          {rows.map((r) => (
            <MeterRow key={r.label} label={r.label} metric={r.metric} />
          ))}
        </div>
      ) : (
        <p className="small muted">No metered limits on your plan.</p>
      )}
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
            <div className="row settings-account__org">
              <span className="small muted">Organization</span>
              <span className="small">{orgName ?? "Default workspace"}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={clearSession}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="card settings-card">
        <h2 className="settings-heading">Usage this month</h2>
        <UsageSection state={usage} />
      </div>

      <div className="card settings-card">
        <h2 className="settings-heading">Workspace defaults</h2>
        <p className="small muted settings-heading__hint">
          Set your matter and jurisdiction once. New reviews and the assistant use them
          automatically, so you never re-pick them. Contract type pre-fills the review form.
        </p>
        <div className="form-grid">
          <MatterPicker
            value={prefs.matterId}
            onChange={(id) => setReviewPrefs({ matterId: id })}
            label="Default matter"
          />
          <Field label="Default jurisdiction">
            <select
              value={prefs.jurisdiction}
              onChange={(e) => setReviewPrefs({ jurisdiction: e.target.value })}
            >
              {JURISDICTIONS.map((o) => (
                <option key={o.value || "general"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default contract type">
            <select
              value={prefs.contractType}
              onChange={(e) => setReviewPrefs({ contractType: e.target.value })}
            >
              <option value="">No default</option>
              {CONTRACT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}
