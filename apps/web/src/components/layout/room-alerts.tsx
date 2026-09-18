"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SocketEvents, type RoomCreatedPayload } from "@chatrooms/contracts";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";

interface Alert extends RoomCreatedPayload {
  key: number;
}

/**
 * Live "a new room just opened" toasts. Mounted once app-wide; listens for the
 * global room_created broadcast and surfaces it wherever the user happens to
 * be. Requires a socket, so it only runs for signed-in users.
 */
export function RoomAlerts() {
  const status = useAuthStore((s) => s.status);
  const myProfileId = useAuthStore((s) => s.profile?.id);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();

    const onCreated = (p: RoomCreatedPayload) => {
      const entry: Alert = { ...p, key: Date.now() + Math.random() };
      // Keep at most three on screen so a burst can't bury the page.
      setAlerts((prev) => [entry, ...prev].slice(0, 3));
      setTimeout(
        () => setAlerts((prev) => prev.filter((a) => a.key !== entry.key)),
        8000,
      );
    };

    socket.on(SocketEvents.ROOM_CREATED, onCreated);
    return () => {
      socket.off(SocketEvents.ROOM_CREATED, onCreated);
    };
  }, [status, myProfileId]);

  const dismiss = (key: number) =>
    setAlerts((prev) => prev.filter((a) => a.key !== key));

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 sm:bottom-5 sm:left-auto sm:right-5 sm:translate-x-0">
      <AnimatePresence initial={false}>
        {alerts.map((a) => (
          <motion.div
            key={a.key}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass pointer-events-auto flex items-start gap-3 p-3.5 shadow-lg"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Sparkles size={16} />
            </span>

            <button
              onClick={() => {
                dismiss(a.key);
                router.push(`/prompt/${a.promptId}`);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <p className="text-xs text-muted">
                @{a.creatorUsername} just opened a room in {a.categoryName}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">
                {a.title}
              </p>
              <p className="mt-1 text-xs font-semibold text-accent">
                It is live now. Tap to join
              </p>
            </button>

            <button
              aria-label="Dismiss"
              onClick={() => dismiss(a.key)}
              className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <X size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
