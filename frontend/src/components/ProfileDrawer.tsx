"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Slide-out panel from the left for the full profile form. Esc or the backdrop closes it. */
export function ProfileDrawer({ open, onClose, children }: ProfileDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Kept in a ref so typing in the form (which re-renders the page) doesn't re-run the focus effect.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // On open: focus the close button and listen for Esc. On close: give focus back to the opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-ink/30"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Edit your details"
            className="absolute inset-y-0 left-0 w-[380px] max-w-[92vw] overflow-y-auto bg-canvas p-4 shadow-soft"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
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
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
