"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiRequestError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

/**
 * One-time anonymous-username picker. Suggestions come from the API;
 * the shuffle button refetches a new batch. USERNAME_TAKEN conflicts
 * surface inline without losing what the user typed.
 */
export function OnboardingForm() {
  const router = useRouter();
  const claimUsername = useAuthStore((s) => s.claimUsername);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = useQuery({
    queryKey: ["username-suggestions"],
    queryFn: () => api<{ suggestions: string[] }>("/auth/username/suggestions"),
    staleTime: Infinity,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await claimUsername(username);
      router.replace(sessionStorage.getItem("cr-return-to") ?? "/");
      sessionStorage.removeItem("cr-return-to");
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
      <h1 className="font-display text-2xl font-bold">Pick your anonymous name</h1>
      <p className="mt-1 text-sm text-muted">
        This is the only identity anyone will ever see. Choose wisely — it&apos;s
        permanent.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z][A-Za-z0-9_]*"
          title="Letters, digits and _ — must start with a letter"
          placeholder="BlueWolf21"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input text-center font-display text-lg"
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          {(suggestions.data?.suggestions ?? []).map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setUsername(s)}
              className={`chip ${username === s ? "chip-active" : ""}`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            aria-label="More suggestions"
            onClick={() => void suggestions.refetch()}
            className="chip"
          >
            <Dices size={14} />
          </button>
        </div>

        {error && <p className="text-center text-sm text-danger">{error}</p>}

        <button type="submit" disabled={busy || username.length < 3} className="btn-primary w-full">
          {busy ? <Spinner className="size-4 border-accent-ink/40 border-t-accent-ink" /> : null}
          Claim it
        </button>
      </form>
    </div>
  );
}
