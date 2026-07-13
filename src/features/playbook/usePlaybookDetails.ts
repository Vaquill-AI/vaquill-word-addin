import { useCallback, useEffect, useState } from "react";
import { getPlaybooksWithPositions, type PlaybookDetail } from "@/api/playbooks";
import { errorMessage } from "@/api/errors";

interface State {
  status: "loading" | "ready" | "error";
  playbooks: PlaybookDetail[];
  error: string | null;
}

/** Loads the user's playbooks with their positions and fallback ladders. */
export function usePlaybookDetails() {
  const [state, setState] = useState<State>({ status: "loading", playbooks: [], error: null });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const playbooks = await getPlaybooksWithPositions();
      setState({ status: "ready", playbooks, error: null });
    } catch (e) {
      const error = errorMessage(e);
      setState({ status: "error", playbooks: [], error });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
