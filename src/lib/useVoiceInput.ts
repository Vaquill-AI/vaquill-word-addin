import { useEffect, useRef, useState } from "react";

// Minimal structural types for the Web Speech API (not present in every host's
// lib.dom), so we do not depend on @types/dom-speech-recognition. Only the bits
// we use are declared.
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

/** True when the pane is running in Word on the web. */
function isOfficeWeb(): boolean {
  try {
    return Office?.context?.platform === Office.PlatformType.OfficeOnline;
  } catch {
    return false;
  }
}

/**
 * Turn a Web Speech error code into a short, human message.
 *
 * `not-allowed` / `service-not-allowed` is NOT (usually) the user denying a
 * prompt. Office embeds the task pane in an iframe whose permissions policy does
 * not grant the add-in microphone access, so the API is blocked at the policy
 * level, with no prompt and often nothing the user can do. Word on the web is
 * explicit about it in the console ("Permissions policy violation"), and it does
 * the same to the Clipboard and Geolocation APIs.
 *
 * So this must never advise "it works in Word on the web": that was hardcoded,
 * and it told people already IN Word on the web to go to Word on the web.
 */
function messageForError(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return isOfficeWeb()
        ? "Word is not granting the microphone to add-ins in this pane. If your browser shows a blocked-microphone icon in the address bar, allow it and reload; otherwise dictation cannot run here."
        : "Microphone access is blocked in this pane, so dictation can't start.";
    case "audio-capture":
      return "No microphone was found.";
    case "no-speech":
      return "Didn't catch any speech. Try again.";
    case "network":
      return "Dictation needs a network connection and could not reach the service.";
    default:
      return "Dictation could not start in this window.";
  }
}

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Push-to-talk dictation via the Web Speech API. Feature-detected: `supported`
 * is false where the host webview lacks it (some Word desktop builds), so the
 * caller can hide the mic entirely. While listening, `onTranscript` receives the
 * running transcript (finalized text plus the in-progress interim guess); the
 * caller merges it into its input. Cleans up on unmount.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [supported] = useState(() => !!getCtor());
  const [listening, setListening] = useState(false);
  // Set when an attempt fails (most often a blocked mic in the desktop webview).
  // Surfaced by the caller so the button is never a silent dead end.
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  // Hard teardown that always leaves us in a clean, restartable state. onerror /
  // onend in some webviews are unreliable, so we never depend on them to reset:
  // any failed run must not jam the next click by leaving a stale recRef.
  function teardown() {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    }
    setListening(false);
  }

  useEffect(() => teardown, []);

  function stop() {
    teardown();
  }

  function start() {
    const Ctor = getCtor();
    if (!Ctor) return;
    // Clear any stale instance a prior failed run may have left behind, so the
    // guard below can never permanently block restarts.
    teardown();
    setError(null);
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      cbRef.current(`${finalText}${interim}`.trim());
    };
    rec.onerror = (e) => {
      setError(messageForError(e?.error));
      teardown();
    };
    rec.onend = () => teardown();
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      teardown();
      setError("Dictation could not start in this window.");
    }
  }

  return { supported, listening, error, start, stop };
}
