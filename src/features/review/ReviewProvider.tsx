import { createContext, useContext, type ReactNode } from "react";
import { useReview } from "./useReview";

/**
 * Hoists the contract-review state ABOVE the tab switch.
 *
 * ReviewView (the Redlines sub-tab) unmounts whenever the user changes tab or
 * sub-tab. If the review state lived inside it, switching away would unmount
 * the hook and abort the in-flight (paid) review, losing all progress. By
 * owning `useReview` here -- mounted once at the app root and never unmounted on
 * navigation -- the stream keeps running in the background and the state (and
 * results) are still there when the user returns.
 */
type ReviewApi = ReturnType<typeof useReview>;

const ReviewContext = createContext<ReviewApi | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const review = useReview();
  return <ReviewContext.Provider value={review}>{children}</ReviewContext.Provider>;
}

export function useReviewContext(): ReviewApi {
  const ctx = useContext(ReviewContext);
  if (!ctx) {
    throw new Error("useReviewContext must be used within a ReviewProvider");
  }
  return ctx;
}
