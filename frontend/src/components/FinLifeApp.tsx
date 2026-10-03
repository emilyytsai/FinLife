"use client";

import { useCallback, useState, type ReactNode } from "react";
import { MotionConfig, motion } from "framer-motion";
import { RotateCw, X } from "lucide-react";
import { AgePicker } from "@/components/AgePicker";
import { AskBar, AskInput } from "@/components/AskBar";
import { BrandHeader } from "@/components/BrandHeader";
import { LandingIntro } from "@/components/LandingIntro";
import { RevealGate } from "@/components/cloud/RevealGate";
import { LifeCloud } from "@/components/LifeCloud";
import { ProfileBar } from "@/components/ProfileBar";
import { ProfileDrawer } from "@/components/ProfileDrawer";
import { ProfilePanel } from "@/components/ProfilePanel";
import { ShareButton } from "@/components/ShareButton";
import { useFinLife } from "@/lib/useFinLife";

export function FinLifeApp() {
  const app = useFinLife();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The page's point clouds wait for the landing screen to lift, then scan in where the user can see them.
  const [modelsOpen, setModelsOpen] = useState(false);
  const revealModels = useCallback(() => setModelsOpen(true), []);
  // The age picked on the timeline scrubber. It stays until the what-ifs change; then the panel jumps to
  // the event the last question added (or today with none), so a new question shows its effect right away.
  const eventsKey = app.events.map((event) => event.id).join(",");
  const [scrub, setScrub] = useState<{ age: number; eventsKey: string } | null>(null);
  const scrubAge = scrub && scrub.eventsKey === eventsKey ? scrub.age : null;
  const newestEventAge = app.events.reduce((max, event) => Math.max(max, event.age), app.chartProfile?.age ?? 0);
  const defaultAge = app.landingAge ?? newestEventAge;
  const age = scrubAge ?? defaultAge;

  function travelTo(next: number) {
    if (next === scrubAge) return;
    setScrub({ age: next, eventsKey });
  }

  const ready = app.profile !== null;
  const busy = app.chatPending || !ready;
  const hasResults = app.chartProfile !== null && app.chartCompare !== null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full flex-1 flex-col">
        {/* The intro covers the page until the first numbers are in (or loading fails), then fades away. */}
        <LandingIntro ready={hasResults || app.error !== null} onReveal={revealModels} />
        <BrandHeader />

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

        <RevealGate.Provider value={modelsOpen}>
          <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 pb-12 sm:px-6 sm:pb-16">
            <Rise order={0}>
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
            </Rise>

            <Rise order={1}>
              {app.chartProfile && app.chartCompare ? (
                <LifeCloud profile={app.chartProfile} events={app.events} compare={app.chartCompare} age={age} />
              ) : (
                <Placeholder text={ready ? "Running your numbers..." : "Your life at a glance appears here."} tall />
              )}
            </Rise>

            <Rise order={2}>
              {app.chartProfile ? (
                <AgePicker
                  startAge={app.chartProfile.age}
                  endAge={app.chartCompare?.baseline.years.at(-1)?.age ?? app.chartProfile.retire_age}
                  age={age}
                  events={app.events}
                  onChange={travelTo}
                  pending={app.chartPending && hasResults}
                  trailing={<AskInput pending={app.chatPending} disabled={!ready} onSend={app.sendMessage} />}
                />
              ) : (
                <Placeholder text="Your timeline appears here." />
              )}
            </Rise>

            <Rise order={3}>
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
            </Rise>
          </main>
        </RevealGate.Provider>

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
    </MotionConfig>
  );
}

/** Each main section rises into place, one after another, on first load. */
function Rise({ order, children }: { order: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: order * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Placeholder({ text, tall = false }: { text: string; tall?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-card bg-surface p-6 text-sm text-muted shadow-soft ${tall ? "h-96" : "h-16"}`}
    >
      {text}
    </div>
  );
}
