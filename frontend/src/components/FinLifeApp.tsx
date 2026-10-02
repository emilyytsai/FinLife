"use client";

import { useState } from "react";
import { RotateCw, X } from "lucide-react";
import { AskBar } from "@/components/AskBar";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { TimelineChart } from "@/components/TimelineChart";
import { useEventImpacts } from "@/lib/useEventImpacts";
import { useFinLife } from "@/lib/useFinLife";

export function FinLifeApp() {
  const app = useFinLife();
  const impacts = useEventImpacts(app.chartProfile, app.events);
  // The age under the pointer on the chart or on an Insights card; both views highlight it.
  const [focusAge, setFocusAge] = useState<number | null>(null);
  const ready = app.profile !== null;
  const busy = app.chatPending || !ready;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 sm:px-6">
        <h1 className="text-xl font-bold text-primary">FinLife</h1>
        <p className="text-sm text-muted">See where your money is headed, then ask &ldquo;what if.&rdquo;</p>
      </header>

      {app.error && (
        <div role="alert" className="mx-4 mt-3 flex items-center gap-3 rounded-lg border border-alert/30 bg-alert/10 px-4 py-2 text-sm sm:mx-6">
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
      )}

      {/* Inputs | chart + ask bar | insights. On narrow screens: chart, ask, insights, then the profile. */}
      <main className="grid flex-1 gap-4 p-4 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)_340px] lg:items-start xl:grid-cols-[300px_minmax(0,1fr)_380px]">
        <div className="order-3 lg:order-1">
          {app.profile ? (
            <ProfilePanel
              profiles={app.profiles}
              personaId={app.personaId}
              profile={app.profile}
              fieldErrors={app.fieldErrors}
              onPersona={app.choosePersona}
              onChange={app.setProfile}
            />
          ) : (
            <Placeholder text={app.profilesLoading ? "Loading profiles..." : "No profile loaded."} />
          )}
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <div className="relative">
            {app.chartProfile && app.chartCompare ? (
              <TimelineChart
                profile={app.chartProfile}
                events={app.events}
                compare={app.chartCompare}
                focusAge={focusAge}
                onFocusAge={setFocusAge}
              />
            ) : (
              <Placeholder text={ready ? "Running your numbers..." : "Your timeline appears here."} tall />
            )}
            {app.chartPending && app.chartCompare && (
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
            onSend={app.sendMessage}
            onRemoveEvent={app.removeEvent}
          />
        </div>

        <div className="order-2 lg:sticky lg:top-4 lg:order-3">
          <InsightsPanel
            profile={app.chartProfile}
            events={app.events}
            compare={app.chartCompare}
            analysis={app.analysis}
            impacts={impacts}
            messages={app.messages}
            chatPending={app.chatPending}
            focusAge={focusAge}
            onFocusAge={setFocusAge}
            shareRequest={app.shareRequest}
            shareDisabled={busy || app.messages.length === 0}
          />
        </div>
      </main>

      <footer className="px-4 pb-4 text-center text-xs text-muted sm:px-6">For education only. Not financial advice.</footer>
    </div>
  );
}

function Placeholder({ text, tall = false }: { text: string; tall?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-card bg-surface p-6 text-sm text-muted shadow-soft ${tall ? "h-96" : "h-40"}`}>
      {text}
    </div>
  );
}
