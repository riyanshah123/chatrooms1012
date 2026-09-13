"use client";

/** "BlueWolf21 is typing…" with animated dots. Hidden when nobody types. */
export function TypingDots({ usernames }: { usernames: string[] }) {
  if (usernames.length === 0) return <div className="h-5" aria-hidden />;
  const label =
    usernames.length === 1
      ? `${usernames[0]} is typing`
      : usernames.length === 2
        ? `${usernames[0]} and ${usernames[1]} are typing`
        : `${usernames.length} people are typing`;
  return (
    <p className="flex h-5 items-center gap-1.5 px-1 text-xs text-muted">
      {label}
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </p>
  );
}
