"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A centered pop-up for the full profile form. Esc, the close button, or the backdrop closes it. */
export function ProfileDrawer({ open, onClose, children }: ProfileDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Kept in a ref so typing in the form (which re-renders the page) doesn't re-run the focus effect.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // On open: focus the close button, listen for Esc, and stop the page behind from scrolling.
  // On close: undo all three and give focus back to the opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Edit your details"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-canvas p-4 shadow-2xl sm:p-5"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Your details</p>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-ink"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
