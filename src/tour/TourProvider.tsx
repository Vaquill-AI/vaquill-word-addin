import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useAppNav } from "@/app/nav";
import { getTour } from "./registry";
import { hasSeenTour, markTourSeen } from "./tourStore";
import { TourOverlay } from "./TourOverlay";
import type { TourDef, TourNav } from "./types";

interface TourContextValue {
  active: TourDef | null;
  index: number;
  /** Start a tour by id (from the registry). */
  start: (tourId: string) => void;
  /** Start a tour only if the user has not completed it (first-run). */
  startIfUnseen: (tourId: string) => void;
  next: () => void;
  prev: () => void;
  /** Close the tour and mark it seen (so it does not re-prompt). */
  close: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within <TourProvider>");
  return ctx;
}

/**
 * Onboarding tour engine. Holds the active tour + step, drives the app's nav bus
 * so a step can move the user across tabs / review sub-tabs / tools before the
 * spotlight points at the target, and persists completion so the first-run
 * walkthrough shows once. All UI is rendered by <TourOverlay>.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { setTab, setReviewSub, navigate } = useAppNav();
  const [active, setActive] = useState<TourDef | null>(null);
  const [index, setIndex] = useState(0);

  const applyNav = useCallback(
    (nav?: TourNav) => {
      if (!nav) return;
      if (nav.tool) {
        navigate("tools", { kind: "openTool", tool: nav.tool });
        return;
      }
      if (nav.reviewSub) {
        setTab("review");
        setReviewSub(nav.reviewSub);
        return;
      }
      if (nav.tab) setTab(nav.tab);
    },
    [navigate, setTab, setReviewSub],
  );

  const start = useCallback(
    (tourId: string) => {
      const tour = getTour(tourId);
      if (!tour || tour.steps.length === 0) return;
      applyNav(tour.steps[0].nav);
      setActive(tour);
      setIndex(0);
    },
    [applyNav],
  );

  const startIfUnseen = useCallback(
    (tourId: string) => {
      if (!hasSeenTour(tourId)) start(tourId);
    },
    [start],
  );

  const close = useCallback(() => {
    setActive((cur) => {
      if (cur) markTourSeen(cur.id);
      return null;
    });
    setIndex(0);
  }, []);

  // next / prev read the current tour + index directly; the provider re-renders on
  // each step, so the overlay always receives fresh handlers.
  const next = () => {
    if (!active) return;
    const ni = index + 1;
    if (ni >= active.steps.length) {
      close();
      return;
    }
    applyNav(active.steps[ni].nav);
    setIndex(ni);
  };

  const prev = () => {
    if (!active || index === 0) return;
    const pi = index - 1;
    applyNav(active.steps[pi].nav);
    setIndex(pi);
  };

  const value: TourContextValue = { active, index, start, startIfUnseen, next, prev, close };

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          step={active.steps[index]}
          title={active.title}
          index={index}
          total={active.steps.length}
          onNext={next}
          onPrev={prev}
          onClose={close}
        />
      )}
    </TourContext.Provider>
  );
}
