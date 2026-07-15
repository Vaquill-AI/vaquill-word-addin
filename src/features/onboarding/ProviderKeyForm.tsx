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

/** ChatGPT (OpenAI) brand tile: black rounded square with the official white
 *  blossom mark. Self-contained (its own background) so it reads on both the
 *  selected (dark) and unselected (light) provider button. */
function OpenAIGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="24" height="24" rx="5" fill="#000" />
      <g transform="translate(4 4) scale(0.6667)" fill="#fff">
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z" />
      </g>
    </svg>
  );
}

/** Claude (Anthropic) brand tile: warm-coral rounded square with a white
 *  starburst, matching the ClaudeIcon used in the Vaquill AI web app. */
function AnthropicGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="24" height="24" rx="5" fill="#D97757" />
      <path d="M12 4.5 13.6 10.4 19.5 12 13.6 13.6 12 19.5 10.4 13.6 4.5 12 10.4 10.4 Z" fill="#fff" />
    </svg>
  );
}

const PROVIDER_GLYPH = { openai: OpenAIGlyph, anthropic: AnthropicGlyph } as const;

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
            const Glyph = PROVIDER_GLYPH[p];
            return (
              <Button
                key={p}
                variant={p === provider ? "primary" : "default"}
                size="sm"
                onClick={() => switchProvider(p)}
              >
                <Glyph /> {PROVIDER_LABELS[p]}
              </Button>
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
