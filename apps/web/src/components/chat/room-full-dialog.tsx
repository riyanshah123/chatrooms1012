"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Hourglass, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

/**
 * Shown when a join hits ROOM_FULL. Two states:
 *  1. Offer — join the waiting queue or go back to the feed.
 *  2. Waiting — live 1-based position (updated via waiting_queue socket
 *     events); admission is automatic (queue_admitted flips the room open),
 *     so the only action left is leaving the line.
 */
export function RoomFullDialog({
  open,
  queueLength,
  position,
  onJoinQueue,
  onLeaveQueue,
}: {
  open: boolean;
  queueLength: number;
  position: number | null; // null = not queued yet
  onJoinQueue: () => Promise<unknown>;
  onLeaveQueue: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => router.push("/")} locked title="Room Full">
      {position === null ? (
        <>
          <div className="flex items-center gap-3 text-muted">
            <Users size={32} className="shrink-0 text-accent" />
            <p className="text-sm">
              All seats are taken. Join the waiting queue and you&apos;ll be let in
              automatically the moment someone leaves.
              {queueLength > 0 && (
                <span className="mt-1 block">
                  {queueLength} {queueLength === 1 ? "person is" : "people are"} already
                  waiting.
                </span>
              )}
            </p>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              className="btn-primary flex-1"
              disabled={busy}
              onClick={() => void act(onJoinQueue)}
            >
              {busy ? <Spinner className="size-4" /> : <Hourglass size={16} />}
              Join the queue
            </button>
            <button className="btn-ghost flex-1" onClick={() => router.push("/")}>
              Back to feed
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="py-4 text-center">
            <p className="font-display text-5xl font-bold text-accent">#{position}</p>
            <p className="mt-2 text-sm text-muted">
              in line — hang tight, you&apos;ll be seated automatically when it&apos;s
              your turn.
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="btn-ghost flex-1"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await onLeaveQueue();
                  router.push("/");
                })
              }
            >
              Leave the queue
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
