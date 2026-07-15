import { useState } from "react";
import { Button, Field } from "@/ui/primitives";
import {
  MODEL_OPTIONS,
  PROVIDER_LABELS,
  getActiveProvider,
  getKey,
  getModel,
  setActiveProvider,
  setKey,
  setModel,
  type ProviderId,
} from "@/ai/keys";
import { testKey } from "@/ai/test";
import { errorMessage } from "@/api/errors";

/**
 * Reusable provider + key form, used both by the first-run wizard and the
 * Settings screen. Picks a provider, a model, and stores the user's key on this
 * device. "Test" does a live one-token ping so the user gets instant feedback.
 */
type Status =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

const PROVIDERS: ProviderId[] = ["openai", "anthropic"];

/**
 * Full provider wordmark (mark + name) shown as the option itself, so the picker
 * needs no separate text label. The logos are black on transparent, so each
 * option keeps a light background in both states and shows selection with a
 * brand ring rather than a dark fill (which would hide the black mark).
 */
const PROVIDER_LOGO: Record<ProviderId, { src: string; alt: string }> = {
  openai: { src: "/assets/openai.webp", alt: "OpenAI" },
  anthropic: { src: "/assets/claude.png", alt: "Claude" },
};

/** Sentinel dropdown value that reveals the free-text model id field. */
const CUSTOM = "__custom__";

function isKnownModel(provider: ProviderId, model: string): boolean {
  return MODEL_OPTIONS[provider].some((m) => m.id === model);
}

export function ProviderKeyForm({ onSaved }: { onSaved?: () => void }) {
  const [provider, setProvider] = useState<ProviderId>(getActiveProvider());
  const [model, setModelValue] = useState<string>(getModel(getActiveProvider()));
  // A saved model that is not in the curated list (a newer or provider-specific
  // one the user typed) starts the form in custom mode so it stays editable.
  const [custom, setCustom] = useState<boolean>(
    () => !isKnownModel(getActiveProvider(), getModel(getActiveProvider())),
  );
  const [key, setKeyValue] = useState<string>(getKey(getActiveProvider()) ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function switchProvider(p: ProviderId) {
    const nextModel = getModel(p);
    setProvider(p);
    setModelValue(nextModel);
    setCustom(!isKnownModel(p, nextModel));
    setKeyValue(getKey(p) ?? "");
    setStatus({ kind: "idle" });
  }

  function onModelSelect(value: string) {
    if (value === CUSTOM) {
      setCustom(true);
      setModelValue("");
    } else {
      setCustom(false);
      setModelValue(value);
    }
    setStatus({ kind: "idle" });
  }

  async function runTest() {
    const k = key.trim();
    if (!k) {
      setStatus({ kind: "error", message: "Enter your API key first." });
      return;
    }
    if (!model.trim()) {
      setStatus({ kind: "error", message: "Enter a model id first." });
      return;
    }
    setStatus({ kind: "testing" });
    try {
      await testKey(provider, k, model);
      setStatus({ kind: "ok" });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e) });
    }
  }

  function save() {
    setKey(provider, key.trim());
    setModel(provider, model.trim());
    setActiveProvider(provider);
    onSaved?.();
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <Field label="AI provider">
        <div className="row" style={{ gap: 8 }}>
          {PROVIDERS.map((p) => {
            const logo = PROVIDER_LOGO[p];
            const on = p === provider;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                aria-label={logo.alt}
                onClick={() => switchProvider(p)}
                style={{
                  flex: "1 1 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 44,
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: `1px solid ${on ? "var(--brand)" : "var(--control-border)"}`,
                  borderRadius: "var(--radius-sm)",
                  boxShadow: on ? "0 0 0 2px var(--brand-tint)" : "none",
                  cursor: "pointer",
                }}
              >
                <img
                  src={logo.src}
                  alt={logo.alt}
                  style={{ height: 18, width: "auto", maxWidth: "100%", objectFit: "contain" }}
                />
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Model">
        <select
          value={custom ? CUSTOM : model}
          onChange={(e) => onModelSelect(e.target.value)}
          style={{ width: "100%" }}
        >
          {MODEL_OPTIONS[provider].map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value={CUSTOM}>Other (enter model id)</option>
        </select>
        {custom && (
          <input
            type="text"
            value={model}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. gpt-5.5-pro"
            onChange={(e) => {
              setModelValue(e.target.value);
              setStatus({ kind: "idle" });
            }}
            style={{ width: "100%", marginTop: 6 }}
          />
        )}
      </Field>

      <Field label={`${PROVIDER_LABELS[provider]} API key`}>
        <input
          type="password"
          value={key}
          autoComplete="off"
          placeholder="Paste your key"
          onChange={(e) => {
            setKeyValue(e.target.value);
            setStatus({ kind: "idle" });
          }}
          style={{ width: "100%" }}
        />
      </Field>

      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="default" size="sm" loading={status.kind === "testing"} onClick={runTest}>
          Test
        </Button>
        <Button variant="primary" size="sm" disabled={!key.trim() || !model.trim()} onClick={save}>
          Save
        </Button>
        {status.kind === "ok" && (
          <span className="small" style={{ color: "#157347" }}>
            Working
          </span>
        )}
        {status.kind === "error" && (
          <span className="small" style={{ color: "#b02a37" }}>
            {status.message}
          </span>
        )}
      </div>

      <p className="small muted" style={{ margin: 0 }}>
        Your key stays on this device and is sent only to {PROVIDER_LABELS[provider]}.
      </p>
    </div>
  );
}
