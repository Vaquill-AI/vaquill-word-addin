import { useEffect } from "react";
import { TOUR_GROUPS } from "./registry";
import { useTour } from "./TourProvider";
import "./tour.css";

/**
 * Small dropdown that lists every guide (the welcome lap + one per tab). Opened
 * from the Guides button in the top bar; picking one starts it. This is how a
 * user replays onboarding or learns a specific tab on demand.
 */
export function GuidesMenu({ onClose }: { onClose: () => void }) {
  const { start } = useTour();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        className="guides__backdrop"
        aria-label="Close guides"
        onClick={onClose}
      />
      <div className="guides" role="menu" aria-label="Guides">
        {TOUR_GROUPS.map((g) => (
          <div key={g.label} className="guides__group">
            <div className="guides__head small muted">{g.label}</div>
            {g.tours.map((t) => (
              <button
                key={t.id}
                type="button"
                className="guides__item"
                role="menuitem"
                onClick={() => {
                  start(t.id);
                  onClose();
                }}
              >
                <span className="guides__title">{t.title}</span>
                <span className="guides__sub small muted">{t.summary}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
