"use client";

import { useState } from "react";
import { RotateCw, X } from "lucide-react";
import { AskBar } from "@/components/AskBar";
import { LifeInIcons } from "@/components/LifeInIcons";
import { ProfileBar } from "@/components/ProfileBar";
import { ProfileDrawer } from "@/components/ProfileDrawer";
import { ProfilePanel } from "@/components/ProfilePanel";
import { ShareButton } from "@/components/ShareButton";
import { TimelineChart } from "@/components/TimelineChart";
import { useFinLife } from "@/lib/useFinLife";

export function FinLifeApp() {
  const app = useFinLife();
  // The age under the pointer on the chart. The dashboard numbers and icons follow it.
  const [focusAge, setFocusAge] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const ready = app.profile !== null;
  const busy = app.chatPending || !ready;
  const hasResults = app.chartProfile !== null && app.chartCompare !== null;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 sm:px-6">
        <h1 className="text-xl font-bold text-primary">FinLife</h1>
        <p className="text-sm text-muted">See where your money is headed, then ask &ldquo;what if.&rdquo;</p>
      </header>

      {app.error && (
        <div className="mx-auto mt-3 w-full max-w-5xl px-4 sm:px-6">
          <div role="alert" className="flex items-center gap-3 rounded-lg border border-alert/30 bg-alert/10 px-4 py-2 text-sm">
            <span className="flex-1">{app.error}</span>
            {!ready && (
              <button type="button" onClick={app.loadProfiles} className="flex items-center gap-1 font-medium text-primary">
                <RotateCw size={14} aria-hidden="true" />
                Retry
              </button>
            )}
            <button type="button" onClick={app.dismissError} aria-label="Dismiss" className="text-muted hover:text-ink">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:px-6">
        {app.profile ? (
          <ProfileBar
            profiles={app.profiles}
            personaId={app.personaId}
            profile={app.profile}
            hasErrors={app.fieldErrors.length > 0}
            onPersona={app.choosePersona}
            onEdit={() => setDrawerOpen(true)}
          />
        ) : (
          <Placeholder text={app.profilesLoading ? "Loading profiles..." : "No profile loaded."} />
        )}

        {app.chartProfile && app.chartCompare && (
          <LifeInIcons
            profile={app.chartProfile}
            events={app.events}
            compare={app.chartCompare}
            focusAge={focusAge}
            freshIds={app.freshIds}
          />
        )}

        <div className="relative">
          {app.chartProfile && app.chartCompare ? (
            <TimelineChart
              profile={app.chartProfile}
              events={app.events}
              compare={app.chartCompare}
              focusAge={focusAge}
              onFocusAge={setFocusAge}
              showSummary={false}
              plotHeight="h-64 sm:h-80"
            />
          ) : (
            <Placeholder text={ready ? "Running your numbers..." : "Your timeline appears here."} tall />
          )}
          {app.chartPending && hasResults && (
            <span className="absolute bottom-3 right-4 animate-pulse rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
              Updating...
            </span>
          )}
        </div>

        <AskBar
          pending={app.chatPending}
          disabled={!ready}
          suggestions={app.suggestions}
          events={app.events}
          noChange={app.noChange}
          onSend={app.sendMessage}
          onRemoveEvent={app.removeEvent}
          footer={app.shareRequest && <ShareButton request={app.shareRequest} disabled={busy || app.messages.length === 0} />}
        />
      </main>

      <footer className="px-4 pb-4 text-center text-xs text-muted sm:px-6">For education only. Not financial advice.</footer>

      <ProfileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {app.profile && (
          <ProfilePanel
            profiles={app.profiles}
            personaId={app.personaId}
            profile={app.profile}
            fieldErrors={app.fieldErrors}
            onPersona={app.choosePersona}
            onChange={app.setProfile}
            showPersona={false}
          />
        )}
      </ProfileDrawer>
    </div>
  );
}

function Placeholder({ text, tall = false }: { text: string; tall?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-card bg-surface p-6 text-sm text-muted shadow-soft ${tall ? "h-96" : "h-16"}`}>
      {text}
    </div>
  );
}
