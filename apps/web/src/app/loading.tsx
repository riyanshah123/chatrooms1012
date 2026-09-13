/** Route-transition skeleton (App Router streams this instantly). */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-24 sm:px-6">
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-36 animate-pulse bg-surface-2/50" />
        ))}
      </div>
    </main>
  );
}
