import { clsx } from "clsx";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        "inline-block size-5 animate-spin rounded-full border-2 border-border border-t-accent",
        className,
      )}
    />
  );
}
