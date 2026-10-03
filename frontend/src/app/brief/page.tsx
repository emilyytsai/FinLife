import type { Metadata } from "next";
import { Suspense } from "react";
import { BriefView } from "./BriefView";

export const metadata: Metadata = {
  title: "Advisor brief | FinLife",
};

// /brief/?id=k3f9x2ab. A query parameter, not a dynamic route, so the static export works.
export default function BriefPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading brief...</p>}>
      <BriefView />
    </Suspense>
  );
}
