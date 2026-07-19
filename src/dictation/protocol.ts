/**
 * Message protocol between the dictation DIALOG and the task pane.
 *
 * Office renders the task pane in a cross-origin iframe whose permissions policy
 * does not delegate the microphone, so `getUserMedia` / SpeechRecognition are
 * blocked there with no possible prompt. A top-level Office Dialog runs at our
 * own origin where the browser CAN prompt for the mic, so dictation actually
 * runs in the dialog and streams its transcript back here via `messageParent`
 * (strings only; the dialog is a separate browser context).
 */
export type DictationMessage =
  | { type: "transcript"; text: string } // running transcript (finalized + interim)
  | { type: "done"; text: string } // user accepted; final transcript
  | { type: "cancel" } // user dismissed without inserting
  | { type: "error"; message: string }; // mic denied / unsupported / recognition error

/** Serialize for messageParent (which accepts strings only). */
export function encodeDictation(msg: DictationMessage): string {
  return JSON.stringify(msg);
}

/** Parse a message from the dialog; null when it is not our shape. */
export function decodeDictation(raw: string): DictationMessage | null {
  try {
    const m = JSON.parse(raw) as DictationMessage;
    if (m && typeof m === "object" && typeof (m as { type?: unknown }).type === "string") {
      return m;
    }
  } catch {
    // Not JSON / not ours.
  }
  return null;
}
