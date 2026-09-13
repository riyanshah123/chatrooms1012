"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAuthStore } from "@/stores/auth";

/**
 * Landing spot after Google OAuth. The API already set the refresh cookie;
 * we run one silent refresh to obtain the access token, then route to
 * onboarding (first login) or wherever the user was headed.
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const restore = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    void (async () => {
      const session = await restore();
      if (!session) return router.replace("/login?error=oauth");
      if (session.needsOnboarding || params.get("onboarding") === "1") {
        return router.replace("/onboarding");
      }
      router.replace(sessionStorage.getItem("cr-return-to") ?? "/");
    })();
  }, [restore, router, params]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="animate-pulse text-muted">Signing you in…</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
