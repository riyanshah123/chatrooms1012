/* eslint-disable @next/next/no-img-element */

/**
 * Anonymous avatar. With no uploaded image, renders a deterministic
 * gradient + initials derived from the username — every "BlueWolf21" looks
 * identical everywhere without storing anything.
 */
const GRADIENTS = [
  ["#6366f1", "#a855f7"],
  ["#06b6d4", "#3b82f6"],
  ["#f59e0b", "#ef4444"],
  ["#10b981", "#06b6d4"],
  ["#ec4899", "#8b5cf6"],
  ["#f97316", "#eab308"],
  ["#14b8a6", "#22c55e"],
  ["#8b5cf6", "#6366f1"],
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  username,
  src,
  size = 36,
}: {
  username: string;
  src?: string | null;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={username}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const [from, to] = GRADIENTS[hash(username) % GRADIENTS.length];
  // Initials: leading letter + first interior capital ("BlueWolf21" → "BW")
  const interior = username.slice(1).match(/[A-Z]/)?.[0] ?? "";
  return (
    <div
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {(username[0] ?? "?").toUpperCase()}
      {interior}
    </div>
  );
}
