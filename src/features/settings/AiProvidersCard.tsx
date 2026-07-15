import { ProviderKeyForm } from "@/features/onboarding/ProviderKeyForm";

/**
 * Settings card for the community edition: change provider, model, or key at any
 * time. Rendered only in the community build (see SettingsView).
 */
export function AiProvidersCard() {
  return (
    <div className="card settings-card">
      <h2 className="settings-heading">AI provider</h2>
      <p className="small muted settings-heading__hint">
        Vaquill uses your own AI key in this edition. Switch providers or update your key here.
      </p>
      <ProviderKeyForm />
    </div>
  );
}
