/**
 * Dictation dialog (runs in the Office Dialog popup, NOT the task pane).
 *
 * Why this exists: the task pane is a cross-origin iframe with no microphone
 * permission, so speech recognition cannot even prompt there. This page runs at
 * our origin in a top-level dialog window where the browser DOES prompt for the
 * mic. It captures speech and streams the transcript back to the pane through
 * `messageParent` (see ./protocol). The pane merges it into the composer.
 */
import { encodeDictation, type DictationMessage } from "./protocol";

// Minimal structural types for the Web Speech API (not in every host's lib.dom).
interface SpeechAlt {
  readonly transcript: string;
}
interface SpeechRes {
  readonly isFinal: boolean;
  readonly 0: SpeechAlt;
}
interface SpeechResList {
  readonly length: number;
  readonly [i: number]: SpeechRes;
}
interface SpeechEvent {
  readonly resultIndex: number;
  readonly results: SpeechResList;
}
interface SpeechErrorEvent {
  readonly error?: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Human message for a recognition/mic failure INSIDE the dialog. Unlike the
 *  pane, a denial here is a real, user-fixable prompt decision. */
function messageForError(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow it for this window and try again.";
    case "audio-capture":
      return "No microphone was found.";
    case "no-speech":
      return "Didn't catch any speech. Try again.";
    case "network":
      return "Dictation needs a network connection and could not reach the service.";
    default:
      return "Dictation could not start.";
  }
}

/** Post a message back to the task pane. No-op if not inside an Office dialog. */
function post(msg: DictationMessage): void {
  try {
    Office.context.ui.messageParent(encodeDictation(msg));
  } catch {
    // Not running inside a dialog (opened directly): nothing to relay to.
  }
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Omit<Partial<HTMLElementTagNameMap[K]>, "style"> & { style?: string },
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { style, ...rest } = props;
  Object.assign(el, rest);
  if (style) el.setAttribute("style", style);
  for (const c of children) el.append(c);
  return el;
}

function render(): { status: HTMLElement; preview: HTMLElement; insert: HTMLButtonElement } {
  document.getElementById("dictation-root")?.remove();
  document.body.setAttribute(
    "style",
    "margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#fff;",
  );
  const status = h("div", {
    style: "display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;",
  });
  const dot = h("span", {
    style:
      "width:10px;height:10px;border-radius:50%;background:#d92d20;flex:none;animation:vqpulse 1.2s ease-in-out infinite;",
  });
  const statusText = h("span", {}, "Listening. Speak now.");
  status.append(dot, statusText);

  const preview = h("div", {
    style:
      "min-height:72px;max-height:180px;overflow:auto;padding:10px 12px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa;font-size:14px;line-height:1.45;color:#333;white-space:pre-wrap;",
  });
  preview.textContent = "";

  const insert = h(
    "button",
    {
      type: "button",
      style:
        "flex:1;padding:9px 12px;border:none;border-radius:8px;background:#1a1a1a;color:#fff;font-size:14px;font-weight:600;cursor:pointer;",
    },
    "Insert",
  ) as HTMLButtonElement;
  const cancel = h(
    "button",
    {
      type: "button",
      style:
        "flex:none;padding:9px 14px;border:1px solid #d5d5d5;border-radius:8px;background:#fff;color:#1a1a1a;font-size:14px;font-weight:600;cursor:pointer;",
    },
    "Cancel",
  ) as HTMLButtonElement;

  const style = document.createElement("style");
  style.textContent = "@keyframes vqpulse{0%,100%{opacity:1}50%{opacity:.25}}";
  document.head.append(style);

  const row = h("div", { style: "display:flex;gap:8px;margin-top:12px;" }, insert, cancel);
  const root = h(
    "div",
    { style: "display:flex;flex-direction:column;gap:10px;padding:14px 16px;" },
    status,
    preview,
    row,
  );
  document.body.append(root);

  cancel.onclick = () => post({ type: "cancel" });
  return { status: statusText, preview, insert };
}

function run(): void {
  const ui = render();
  const Ctor = getCtor();
  if (!Ctor) {
    post({ type: "error", message: "Dictation is not supported in this window." });
    return;
  }

  let finalText = "";
  let stopped = false; // user pressed Insert; stop restarting on silence.
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;

  const currentText = (interim: string) => `${finalText}${interim}`.trim();

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    const text = currentText(interim);
    ui.preview.textContent = text;
    ui.preview.scrollTop = ui.preview.scrollHeight;
    post({ type: "transcript", text });
  };
  rec.onerror = (e) => {
    stopped = true;
    post({ type: "error", message: messageForError(e?.error) });
  };
  // The engine ends itself on a pause. While the user is still dictating, keep
  // the session alive by restarting; once they press Insert we let it end.
  rec.onend = () => {
    if (stopped) return;
    try {
      rec.start();
    } catch {
      // Could not resume: finish with whatever we have.
      post({ type: "done", text: currentText("") });
    }
  };

  ui.insert.onclick = () => {
    stopped = true;
    ui.status.textContent = "Inserting.";
    try {
      rec.stop();
    } catch {
      // already stopped
    }
    post({ type: "done", text: currentText("") });
  };

  // Prime the mic with an explicit getUserMedia so the browser shows one clean
  // permission prompt and a denial surfaces a precise message (SpeechRecognition
  // alone can fail silently). Release the stream immediately; recognition opens
  // its own capture.
  const primeAndStart = async () => {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
      rec.start();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const code =
        name === "NotAllowedError" || name === "SecurityError"
          ? "not-allowed"
          : name === "NotFoundError"
            ? "audio-capture"
            : undefined;
      stopped = true;
      post({ type: "error", message: messageForError(code) });
    }
  };
  void primeAndStart();
}

// Office.js must be ready before messageParent works.
Office.onReady(() => run());
