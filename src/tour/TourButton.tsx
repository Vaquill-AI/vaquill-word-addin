import { useTour } from "./TourProvider";
import "./tour.css";

/**
 * A small "Take a tour" link that launches a specific guide in place. Drop it into
 * any view header (e.g. `<TourButton tourId="tool-redact" />`) for an on-surface
 * entry point; every guide is also reachable centrally from the Guides menu.
 */
export function TourButton({ tourId, label = "Take a tour" }: { tourId: string; label?: string }) {
  const { start } = useTour();
  return (
    <button type="button" className="tour-launch" onClick={() => start(tourId)}>
      {label}
    </button>
  );
}
