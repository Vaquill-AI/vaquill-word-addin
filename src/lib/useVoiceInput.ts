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
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
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
  const recRef = useRef<Recognition | null>(null);
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        // best-effort teardown
      }
    },
    [],
  );

  function stop() {
    try {
      recRef.current?.stop();
    } catch {
      // already stopped
    }
  }

  function start() {
    const Ctor = getCtor();
    if (!Ctor || recRef.current) return;
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
    rec.onerror = () => stop();
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
    }
  }

  return { supported, listening, start, stop };
}
