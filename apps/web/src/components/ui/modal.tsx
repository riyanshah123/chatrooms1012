"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

/**
 * Animated modal on a blurred backdrop. Escape / backdrop click dismisses
 * (unless `locked` — used by the Room Full dialog where dismissing has a
 * side effect the caller must decide on).
 */
export function Modal({
  open,
  onClose,
  title,
  locked = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open || locked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !locked && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={title}
            className="glass w-full max-w-md p-6"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || !locked) && (
              <div className="mb-4 flex items-center justify-between">
                {title && <h2 className="font-display text-lg font-semibold">{title}</h2>}
                {!locked && (
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
