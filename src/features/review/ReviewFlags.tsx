import type { ReviewFlag } from "@/api/types";
import "./review-flags.css";

/**
 * "Flag for discussion" section: substantive things the review NOTICED but
 * deliberately did NOT redline (a wrong entity name, an odd schedule entry, a
 * genuine ambiguity). These are not edits; they are items a human should
 * confirm before signing. Visually distinct from redlines (amber/info card).
 *
 * Purely additive: renders nothing when there are no flags, so an older backend
 * that omits `flags` changes nothing about the existing review UI.
 */
export function ReviewFlags({ flags }: { flags: ReviewFlag[] }) {
  if (!flags || flags.length === 0) return null;

  return (
    <section className="review-flags card" aria-label="Flag for discussion">
      <div className="review-flags__head">
        <span className="review-flags__dot" aria-hidden />
        <h2 className="review-flags__title">
          Flag for discussion
          <span className="review-flags__count">{flags.length}</span>
        </h2>
      </div>
      <p className="review-flags__intro small">
        Noticed but not changed. Confirm before sending.
      </p>
      <ul className="review-flags__list">
        {flags.map((flag, i) => (
          <li className="review-flags__item" key={`${flag.clauseName}-${i}`}>
            <div className="review-flags__meta">
              <span className="review-flags__clause">{flag.clauseName}</span>
              {flag.sectionReference && (
                <span className="review-flags__section">{flag.sectionReference}</span>
              )}
            </div>
            <p className="review-flags__observation">{flag.observation}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
