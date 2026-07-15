import type { ReactNode } from "react";

/** Where the "Get Vaquill AI hosted" upsell points. One place to change it. */
export const HOSTED_URL = "https://app.vaquill.ai/auth/signup";

export function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/**
 * Community-edition upsell card. Shown where a feature needs Vaquill AI's hosted
 * data (corpus, case-law, statutes) or the hosted product, so the user SEES what
 * the fully-managed plan adds instead of the feature being hidden or failing on
 * click. Copy stays on-brand: no vendor names, and it complements rather than
 * attacks.
 */
export function UpgradeGate({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", color: "#7a5b12" }}>
        <LockIcon size={16} />
        <strong>{title}</strong>
      </div>
      {children && (
        <p className="small muted" style={{ margin: "8px 0 12px" }}>
          {children}
        </p>
      )}
      <a
        className="btn btn--primary btn--sm"
        href={HOSTED_URL}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none" }}
      >
        Get Vaquill AI hosted
      </a>
    </div>
  );
}

/** Compact inline variant, for a locked action that sat in a row of buttons. */
export function UpgradeLink({ label }: { label: string }) {
  return (
    <a
      className="btn btn--sm"
      href={HOSTED_URL}
      target="_blank"
      rel="noreferrer"
      title="Available on the Vaquill AI hosted plan"
      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <LockIcon size={14} /> {label}
    </a>
  );
}
