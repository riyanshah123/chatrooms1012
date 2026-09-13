"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { ApiRequestError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1");

/** Shared login / signup form: email+password plus Google. */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { login, signup } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = mode === "login"
        ? await login(email, password)
        : await signup(email, password);
      if (result.needsOnboarding) {
        router.replace("/onboarding");
      } else {
        router.replace(sessionStorage.getItem("cr-return-to") ?? "/");
        sessionStorage.removeItem("cr-return-to");
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Something went wrong — try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "login"
          ? "Your anonymous identity is waiting."
          : "Your email stays private — everyone sees only your anonymous name."}
      </p>

      {/* Google OAuth is a full-page redirect through the API */}
      <a href={`${API_ORIGIN}/auth/google`} className="btn-ghost mt-6 w-full">
        <GoogleIcon />
        Continue with Google
      </a>

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" /> or with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
        <input
          type="password"
          required
          minLength={mode === "signup" ? 10 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "signup" ? "Password (10+ characters)" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="size-4 border-accent-ink/40 border-t-accent-ink" /> : null}
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.2-6.9-5.2H1.3v3C3.3 21.2 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.1 14.2c-.3-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2v-3H1.3C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.2l3.8-3z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.8 3C6 6.9 8.8 4.7 12 4.7z" />
    </svg>
  );
}
