import { type CSSProperties, useEffect, useState } from "react";

/**
 * A ticking "{n}s" counter so a long operation reads as actively working rather
 * than frozen, even when the backend sends no incremental progress. Decorative:
 * marked aria-hidden so it does not spam a screen reader every second (the
 * surrounding status text is the announced signal).
 */
export function ElapsedSeconds({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={className} style={style} aria-hidden>
      {seconds}s
    </span>
  );
}
