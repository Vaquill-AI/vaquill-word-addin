import { useState } from "react";
import "./avatar.css";

/** Up-to-two-letter initials from a person's name, for the avatar chip. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable hue (0-359) from the name, so each person keeps one color. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/**
 * A small circular avatar. Renders the user's photo (`src`, e.g. a Google OAuth
 * picture) when available, falling back to a deterministic initials chip if no
 * photo is provided or the image fails to load (broken URL, blocked by CSP).
 */
export function Avatar({
  name,
  src,
  size = 26,
}: {
  name: string;
  /** Photo URL. Only http(s) is used; anything else falls back to initials. */
  src?: string | null;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!src && /^https?:\/\//i.test(src) && !imgFailed;

  if (showPhoto) {
    return (
      <img
        className="avatar avatar--img"
        src={src ?? undefined}
        alt=""
        aria-hidden
        width={size}
        height={size}
        // Google avatar hosts 403 when a referrer is sent; suppress it.
        referrerPolicy="no-referrer"
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  const hue = hueOf(name);
  return (
    <span
      className="avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: size < 24 ? 9 : 10,
        background: `hsl(${hue} 52% 92%)`,
        color: `hsl(${hue} 42% 34%)`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
