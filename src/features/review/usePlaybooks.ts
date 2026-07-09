import { useEffect, useState } from "react";
import { listPlaybooks, type Playbook } from "@/api/playbooks";
import { ApiError, friendlyMessage } from "@/api/errors";

interface PlaybooksState {
  status: "loading" | "ready" | "error";
  playbooks: Playbook[];
  error: string | null;
}

/** Load the user's playbooks once when the review form mounts. */
export function usePlaybooks() {
  const [state, setState] = useState<PlaybooksState>({
    status: "loading",
    playbooks: [],
    error: null,
  });

  useEffect(() => {
    let alive = true;
    listPlaybooks()
      .then((playbooks) => {
        if (alive) setState({ status: "ready", playbooks, error: null });
      })
      .catch((e) => {
        if (!alive) return;
        const error = e instanceof ApiError ? friendlyMessage(e) : (e as Error).message;
        setState({ status: "error", playbooks: [], error });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
