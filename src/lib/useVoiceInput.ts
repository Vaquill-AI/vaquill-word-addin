import { useEffect, useRef, useState } from "react";
import { config } from "@/config";
import { decodeDictation } from "@/dictation/protocol";

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

/** True when the Office Dialog API is available, so we can run dictation in a
 *  top-level popup that CAN request the mic (the pane iframe cannot). */
function hasOfficeDialog(): boolean {
  try {
    return typeof Office !== "undefined" && !!Office?.context?.ui?.displayDialogAsync;
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
 * Push-to-talk dictation. While listening, `onTranscript` receives the running
 * transcript (finalized text plus the in-progress interim guess); the caller
 * merges it into its input. Cleans up on unmount.
 *
 * Two paths, same interface:
 *  - Inside Office (the real add-in), the task pane iframe has NO microphone
 *    permission, so recognition runs in a top-level Office DIALOG that CAN
 *    prompt for the mic; it streams the transcript back via messageParent.
 *  - Outside Office (the local `preview.html` dev harness, a normal browser tab
 *    where the mic works inline), it uses the Web Speech API directly.
 *
 * `supported` is true when either path is available, so the caller can hide the
 * mic where neither can work.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [supported] = useState(() => hasOfficeDialog() || !!getCtor());
  const [listening, setListening] = useState(false);
  // Set when an attempt fails (a denied prompt in the dialog, or a blocked mic
  // in a webview). Surfaced by the caller so the button is never a silent dead end.
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  // Handle to the open dictation dialog, so stop()/unmount can close it.
  const dialogRef = useRef<Office.Dialog | null>(null);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  // Close the dictation dialog if one is open. Best-effort: it may already be gone.
  function closeDialog() {
    const dialog = dialogRef.current;
    dialogRef.current = null;
    if (dialog) {
      try {
        dialog.close();
      } catch {
        // already closed
      }
    }
  }

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
    closeDialog();
    setListening(false);
  }

  useEffect(() => teardown, []);

  function stop() {
    teardown();
  }

  /** Office path: run recognition in a top-level dialog that can request the mic. */
  function startDialog() {
    // Clear any stale dialog before opening a fresh one.
    closeDialog();
    setError(null);
    Office.context.ui.displayDialogAsync(
      `${config.addinOrigin}/dictation.html`,
      { height: 42, width: 32, promptBeforeOpen: false },
      (result) => {
        if (result.status !== Office.AsyncResultStatus.Succeeded) {
          setError("Could not open the dictation window.");
          setListening(false);
          return;
        }
        const dialog = result.value;
        dialogRef.current = dialog;
        setListening(true);

        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
          const msg = decodeDictation((arg as { message?: string }).message ?? "");
          if (!msg) return;
          switch (msg.type) {
            case "transcript":
              cbRef.current(msg.text);
              break;
            case "done":
              cbRef.current(msg.text);
              closeDialog();
              setListening(false);
              break;
            case "cancel":
              closeDialog();
              setListening(false);
              break;
            case "error":
              setError(msg.message);
              closeDialog();
              setListening(false);
              break;
          }
        });

        // Fires when the user closes the popup manually (12006) or it fails to
        // load (12002/12003). Either way we are no longer listening.
        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          dialogRef.current = null;
          setListening(false);
        });
      },
    );
  }

  function start() {
    if (hasOfficeDialog()) {
      startDialog();
      return;
    }
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
