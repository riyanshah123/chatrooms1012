"use client";

import { useSearchParams } from "next/navigation";
import { MailCheck, MailWarning } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

/**
 * Nudges signed-in accounts that haven't confirmed their email, and reports
 * the result when someone returns from the confirmation link. Deliberately a
 * banner rather than a wall: people can read and look around unconfirmed,
 * they just can't post.
 */
function Banner() {
  const params = useSearchParams();
  const { status, emailVerified, restoreSession } = useAuthStore();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justVerified, setJustVerified] = useState(false);

  const verifiedParam = params.get("verified");

  // Coming back from the email link: pick up the new state, then say so.
  useEffect(() => {
    if (verifiedParam === "1") {
      setJustVerified(true);
      void restoreSession();
      const t = setTimeout(() => setJustVerified(false), 6000);
      return () => clearTimeout(t);
    }
  }, [verifiedParam, restoreSession]);

  if (justVerified) {
    return (
      <div className="border-b border-emerald-600/20 bg-emerald-600/10">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-2.5 text-sm sm:px-6">
          <MailCheck size={16} className="shrink-0 text-emerald-600" />
          <p className="font-medium text-emerald-700">
            Email confirmed. You can post now.
          </p>
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || emailVerified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await api("/auth/verify/resend", { method: "POST" });
      setSent(true);
    } catch {
      setSent(true); // throttled or already verified; don't nag further
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-accent/25 bg-accent/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
        <MailWarning size={16} className="shrink-0 text-accent" />
        <p className="min-w-0">
          Confirm your email to start posting. Check your inbox.
        </p>
        {sent ? (
          <span className="text-xs font-medium text-muted">Sent, give it a minute.</span>
        ) : (
          <button
            onClick={resend}
            disabled={busy}
            className="text-xs font-semibold text-accent underline underline-offset-2 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Resend"}
          </button>
        )}
      </div>
    </div>
  );
}

export function VerifyBanner() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <Banner />
    </Suspense>
  );
}
