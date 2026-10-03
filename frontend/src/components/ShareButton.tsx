"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { SlideButton } from "@/components/SlideButton";
import { ApiError, share } from "@/lib/api";
import type { ShareRequest } from "@/lib/types";

type ShareState =
  | { status: "idle" }
  | { status: "sharing" }
  | { status: "done"; url: string; copied: boolean }
  | { status: "error"; message: string };

interface ShareButtonProps {
  /** Everything POST /share needs: session_id, profile, events, messages. */
  request: ShareRequest;
  disabled?: boolean;
}

/** "Share with an advisor": creates a brief and shows its link with a copy button. */
export function ShareButton({ request, disabled = false }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>({ status: "idle" });

  async function handleShare() {
    setState({ status: "sharing" });
    try {
      const { url } = await share(request);
      setState({ status: "done", url, copied: false });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Couldn't create the brief. Try again.";
      setState({ status: "error", message });
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setState({ status: "done", url, copied: true });
    } catch {
      // Clipboard can be blocked; the link is still selectable in the field.
    }
  }

  return (
    <div className="space-y-2">
      <SlideButton
        type="button"
        onClick={handleShare}
        disabled={disabled || state.status === "sharing"}
        className="w-full rounded-full border border-primary py-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Share2 size={16} aria-hidden="true" />
        {state.status === "sharing" ? "Creating brief..." : "Share with an advisor"}
      </SlideButton>

      {state.status === "done" && (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="brief-link">
            Brief link
          </label>
          <input
            id="brief-link"
            readOnly
            value={state.url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => handleCopy(state.url)}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-canvas"
          >
            {state.copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {state.copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-sm text-alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
