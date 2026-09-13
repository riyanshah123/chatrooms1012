import Link from "next/link";

/** Centered glass panel shared by login / signup / onboarding. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 block text-center font-display text-2xl font-bold"
        >
          chatrooms<span className="text-accent">101</span>
        </Link>
        <div className="glass animate-fade-up p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
