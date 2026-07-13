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

/** A small circular initials chip, colored deterministically from the name. */
export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
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
