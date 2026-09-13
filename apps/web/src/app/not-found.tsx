import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-7xl font-bold text-accent">404</p>
      <h1 className="text-xl font-medium">This conversation doesn&apos;t exist.</h1>
      <p className="max-w-sm text-muted">
        The room may have been archived, or the link is wrong.
      </p>
      <Link href="/" className="btn-primary mt-2">
        Back to the feed
      </Link>
    </main>
  );
}
