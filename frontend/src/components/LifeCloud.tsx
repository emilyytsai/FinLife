"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  ApartmentAsset,
  ChildAsset,
  CondoAsset,
  CreditCardAsset,
  DebtAsset,
  InvestmentsAsset,
  HouseAsset,
  NetworkSphereAsset,
  PersonAsset,
  SedanAsset,
  SpouseAsset,
  SuvAsset,
} from "@/components/cloud/assets";
import { RevealGate, RevealPace, useRevealOpen } from "@/components/cloud/RevealGate";
import { money, pct } from "@/lib/format";
import { tipContent, tipReveal } from "@/lib/tipReveal";
import { lifeAt, type Detail, type LifeFigure } from "@/lib/lifeState";
import type { MockYear } from "@/lib/mock/household";
import type { Compare, LifeEvent, Profile } from "@/lib/types";

interface LifeCloudProps {
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
  /** The age to show. Driven by the timeline scrubber. */
  age: number;
  /** Mock mode only (demo branch): the household numbers the engine doesn't have. */
  mockYears?: Record<number, MockYear> | null;
  /** The question behind the scenario on screen, shown top left with a reset button. Null on the starting point. */
  scenarioPrompt?: string | null;
  onReset?: () => void;
}

interface Section {
  title: string;
  details: Detail[];
  /** A short sentence instead of (or above) the rows. */
  note?: string;
}

const section = (figure: LifeFigure | undefined): Section[] =>
  figure && figure.details.length > 0 ? [{ title: figure.title, details: figure.details }] : [];
const isSuv = (title: string) => /\b(suv|truck|van)\b/i.test(title);

const HOME_TITLE: Record<MockYear["home"], string> = { condo: "Condo", apartment: "Apartment", house: "House" };

/** Size of each money tile's point cloud: a little smaller on wide screens, where four stack beside the scene. */
const METRIC_VISUAL = "size-14 sm:size-16 lg:size-16";

/** From this many models on, the scene keeps clear of the money column (wide screens). */
const CROWDED_AT = 3;
/** The fallback never shrinks the models below this. */
const MIN_SCALE = 0.55;

/**
 * Trade-off pacing: when things leave and arrive together (e.g. the condo and SUV go, the apartment and daughter come),
 * the leavers fade out one by one and the row closes up; then the arrivals open space and scan in one by one, slowly,
 * so the user can follow what was traded for what. Seconds.
 */
const EXIT_FADE = 1;
const EXIT_STAGGER = 0.5;
const COLLAPSE = 0.7;
const ENTER_STAGGER = 0.9;
const ENTER_OPEN = 0.6;
const ENTER_SCAN = 2.2;
const EASE = [0.22, 1, 0.36, 1] as const;

/** What changed in the scene on the last render: keys that left and keys that arrived, in row order. */
interface SceneChange {
  removed: string[];
  added: string[];
}
const SceneChangeContext = createContext<SceneChange>({ removed: [], added: [] });

/** How long the leavers take, so the arrivals start once the row has closed up. */
const exitPhase = (removed: number) => (removed > 0 ? (removed - 1) * EXIT_STAGGER + EXIT_FADE + COLLAPSE * 0.6 : 0);

/** Pixels the ground grid shifts per year of age, so scrubbing reads as travel. */
const GROUND_STEP = 24;

/**
 * "Life Time Travel" as a LiDAR scan: the people and things in the user's life as point clouds on a dotted ground,
 * with the money in a data row below. Everything comes from the engine row, the profile, and the events at that age.
 */
export function LifeCloud({
  profile,
  events,
  compare,
  age: requestedAge,
  mockYears = null,
  scenarioPrompt = null,
  onReset,
}: LifeCloudProps) {
  const rows = events.length > 0 ? compare.scenario.years : compare.baseline.years;
  const first = rows[0]?.age ?? profile.age;
  const last = rows[rows.length - 1]?.age ?? profile.retire_age;
  const age = Math.min(Math.max(requestedAge, first), last);
  const row = rows.find((r) => r.age === age);
  // The engine has numbers from today to age 95. Outside that, the scene dims and the numbers show a dash.
  const outside = requestedAge < first ? "before" : requestedAge > last ? "after" : null;
  const shown = (value: number) => (outside ? null : value);

  const groups = Object.fromEntries(lifeAt(profile, events, age, row).map((group) => [group.key, group]));
  const [you, ...kids] = groups.family?.figures ?? [];
  const home = groups.home?.figures[0];
  const work = groups.work?.figures[0];
  const cars = groups.cars?.figures ?? [];
  const debt = groups.debt?.figures[0];
  const savings = groups.savings?.figures[0];

  // Hover cards for the money tiles. Every value is the engine's (this year's row and the plan's summary) or the profile's.
  const summary = (events.length > 0 ? compare.scenario : compare.baseline).summary;
  const noNumbers: Section[] = [{ title: "No numbers", details: [], note: "The plan has no numbers for this year." }];
  // Mock mode only: the household numbers from the browser-side projection (spouse, home, portfolio, child).
  const mockYear = !outside && mockYears ? mockYears[age] : undefined;
  const cashSections: Section[] =
    outside || !row
      ? noNumbers
      : [
          {
            title: "Cash this year",
            details: [
              { label: "Income", value: money(row.income) },
              { label: "Living costs", value: money(row.expenses) },
              { label: "Cash yield", value: pct(profile.assumptions.cash_yield) },
            ],
          },
          {
            title: `Working years (to ${profile.retire_age})`,
            details: [{ label: "Lowest cash", value: `${money(summary.min_cash)} at ${summary.min_cash_age}` }],
          },
        ];
  const debtSections: Section[] = outside
    ? noNumbers
    : [
        ...section(debt),
        ...(home?.name === "house" && row ? [{ title: "Home", details: [{ label: "Home equity", value: money(row.home_equity) }] }] : []),
        ...(mockYear
          ? [{ title: "Mortgage (not counted above)", details: [{ label: "Balance", value: money(mockYear.mortgageBalance) }] }]
          : []),
      ];
  const investmentSections: Section[] = mockYear
    ? [
        {
          title: "Brokerage portfolio",
          details: [
            { label: "Balance", value: money(mockYear.investments) },
            { label: "Adding", value: `${money(mockYear.investmentContribution)}/mo` },
            { label: "Expected return", value: `${pct(profile.assumptions.investment_return)}/yr` },
          ],
        },
      ]
    : [
        {
          title: "Investments",
          details: [],
          note: "Not in the plan yet. The engine doesn't track a brokerage portfolio, so there's no value to show.",
        },
      ];
  const youSections: Section[] = mockYear
    ? [
        {
          title: "Maya",
          details: [
            { label: "Age", value: String(age) },
            { label: "Retire at", value: String(profile.retire_age) },
            { label: "Income this year", value: money(mockYear.herIncome) },
            { label: "Work", value: mockYear.herSchedule },
            { label: "Her expenses", value: `${money(mockYear.herExpenses)}/yr` },
          ],
        },
        ...(savings ? [{ title: "Household 401(k)", details: savings.details }] : []),
      ]
    : [...section(you), ...section(work), ...section(savings), ...section(debt)];
  const spouseSections: Section[] = mockYear
    ? [
        {
          title: "Husband",
          details: [
            { label: "Age", value: String(mockYear.spouseAge) },
            { label: "Income this year", value: money(mockYear.spouseIncome) },
            { label: "His expenses", value: `${money(mockYear.spouseExpenses)}/yr` },
            { label: "Retires", value: `With Maya, at ${mockYear.spouseAge + profile.retire_age - age}` },
          ],
        },
      ]
    : [];
  const homeSections: Section[] = mockYear
    ? [
        {
          title: HOME_TITLE[mockYear.home],
          details: [
            { label: "Market value", value: money(mockYear.homeValue) },
            { label: "Mortgage left", value: money(mockYear.mortgageBalance) },
            { label: "Equity", value: money(mockYear.homeValue - mockYear.mortgageBalance) },
            ...(mockYear.monthlyHoa > 0 ? [{ label: "HOA", value: `${money(mockYear.monthlyHoa)}/mo` }] : []),
            ...mockYear.homeNotes,
          ],
        },
      ]
    : [];
  const kidSections = (kid: LifeFigure): Section[] =>
    mockYear && mockYear.childAge !== null
      ? [
          {
            title: "Daughter",
            details: [
              { label: "Age", value: String(mockYear.childAge) },
              { label: "Her expenses", value: mockYear.childExpenses > 0 ? `${money(mockYear.childExpenses)}/yr` : "None (18+)" },
              { label: "Costs run to", value: `Maya's age ${age - mockYear.childAge + 17}` },
            ],
          },
        ]
      : section(kid);
  const retirementSections: Section[] =
    outside || !savings
      ? noNumbers
      : [
          { title: "401(k)", details: savings.details },
          {
            title: "Outlook",
            details: [
              { label: "Expected return", value: `${pct(profile.assumptions.investment_return)}/yr` },
              { label: `At ${profile.retire_age}`, value: money(summary.retirement_at_retire) },
            ],
          },
        ];
  // In mock mode the household's home is drawn from the mock numbers instead (its buy_house event is only for the timeline).
  const ownsHome = home?.name === "house" && !mockYear;
  const modelCount = 1 + kids.length + (ownsHome ? 1 : 0) + cars.length + (mockYear ? 2 : 0);
  const crowded = modelCount >= CROWDED_AT;

  // The scene's keys in row order (mirrors the list below), and what changed since the last set.
  const sceneKeys = [
    "you",
    ...kids.map((kid) => kid.key),
    ...(mockYear ? ["spouse", mockYear.home] : []),
    ...(ownsHome && home ? [home.key] : []),
    ...cars.map((car) => car.key),
  ];
  const sceneKey = sceneKeys.join("|");
  const [change, setChange] = useState<SceneChange & { key: string }>({ key: sceneKey, removed: [], added: [] });
  if (change.key !== sceneKey) {
    const before = change.key.split("|");
    setChange({
      key: sceneKey,
      removed: before.filter((key) => !sceneKeys.includes(key)),
      added: sceneKeys.filter((key) => !before.includes(key)),
    });
  }

  // Fallback scaling: when the row of models is wider than its safe zone, shrink the whole group to fit.
  // Measured with unscaled sizes (transforms don't change layout), so it never feeds back on itself.
  const zoneRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const zone = zoneRef.current;
    const row = rowRef.current;
    if (!zone || !row) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(zone);
      const available = zone.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const needed = row.offsetWidth;
      setScale(available > 0 && needed > available ? Math.max(MIN_SCALE, available / needed) : 1);
    });
    observer.observe(zone);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="cloud-heading" className="relative rounded-card p-5 text-ink sm:p-6">
        <h2 id="cloud-heading" className="sr-only">
          Your life at age {age}
        </h2>

        {/* The scenario on screen: its question, a reminder that it's a what-if, and a way back to the starting point. */}
        <AnimatePresence>
          {scenarioPrompt && (
            <motion.div
              key={scenarioPrompt}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
              transition={{ duration: 0.4, ease: EASE }}
              className="mb-4 lg:absolute lg:left-6 lg:top-6 lg:z-10 lg:mb-0 lg:max-w-[15rem]"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Viewing a scenario</p>
              <p className="mt-1 text-sm leading-snug text-ink">&ldquo;{scenarioPrompt}&rdquo;</p>
              <p className="mt-1 text-[11px] leading-snug text-muted">A what-if, not a prediction or advice.</p>
              {onReset && (
                <button
                  type="button"
                  onClick={onReset}
                  className="glass-strong fill-btn mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-ink [--fill-scale:6]"
                  style={{ ["--btn-fill" as string]: "var(--accent)" }}
                >
                  <span className="circle" aria-hidden="true" />
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>Reset scenario</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {row && (
          <dl className="flex justify-center text-center">
            <Figure label="Net worth" value={shown(row.net_worth)} format={money} large />
          </dl>
        )}
        {outside && (
          <p className="mt-1 text-center text-xs text-muted">
            {outside === "before" ? "Before today: no numbers yet." : `The plan runs to age ${last}.`}
          </p>
        )}

        {/* The scene: point clouds standing on a scanned ground plane. */}
        <div className={`relative mt-4 transition-opacity duration-500 ${outside ? "opacity-30" : ""}`}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div
              className="absolute inset-x-[-20%] bottom-0 h-32 origin-bottom transition-[background-position] duration-700 ease-out [mask-image:linear-gradient(to_top,black,transparent)] [transform:perspective(420px)_rotateX(62deg)]"
              style={{
                backgroundImage: "radial-gradient(var(--ground-dot) 1px, transparent 1.5px)",
                backgroundSize: `${GROUND_STEP}px ${GROUND_STEP}px`,
                backgroundPosition: `${-(age - profile.age) * GROUND_STEP}px 0`,
              }}
            />
          </div>
          {/* Safe zone: with 3+ models, wide screens reserve the money column's width on the right, so the group
              re-centers in the space to its left. If the row is still too wide, it scales down to fit. */}
          <div ref={zoneRef} className={`flex justify-center transition-[padding] duration-500 ${crowded ? "lg:pr-52" : ""}`}>
            <ul
              ref={rowRef}
              className="relative flex min-h-56 w-full flex-wrap items-end justify-center gap-y-4 pb-6 pt-4 transition-transform duration-500 sm:min-h-64 sm:px-2 lg:w-max lg:flex-nowrap"
              style={{ transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "bottom center" }}
              aria-label="People and things"
            >
              <SceneChangeContext.Provider value={change}>
                <AnimatePresence initial={false} custom={change.removed}>
                  <Item key="you" id="you" label={mockYear ? "Maya" : "You"} sections={youSections}>
                    <PersonAsset className="h-40 w-16 sm:h-52 sm:w-24" />
                  </Item>
                  {kids.map((kid, i) => (
                    <Item key={kid.key} id={kid.key} label={mockYear ? "Daughter" : "Child"} sections={kidSections(kid)}>
                      <ChildAsset
                        variant={i % 2 === 0 ? 1 : 2}
                        phase={2 + i}
                        // A newborn (the "kid now" scenario) stands smaller than a 5-year-old.
                        className={mockYear?.childAge === 0 ? "h-16 w-9 sm:h-20 sm:w-11" : "h-24 w-12 sm:h-32 sm:w-16"}
                      />
                    </Item>
                  ))}
                  {/* Mock mode only: the husband, then the home (the condo, or the smaller apartment in the kid scenario). */}
                  {mockYear && (
                    <Item key="spouse" id="spouse" label="Husband" sections={spouseSections}>
                      <SpouseAsset className="h-40 w-16 sm:h-52 sm:w-24" />
                    </Item>
                  )}
                  {mockYear?.home === "condo" && (
                    <Item key="condo" id="condo" label="Condo" sections={homeSections}>
                      <CondoAsset className="h-40 w-28 sm:h-56 sm:w-40" />
                    </Item>
                  )}
                  {mockYear?.home === "apartment" && (
                    <Item key="apartment" id="apartment" label="Apartment" sections={homeSections}>
                      <ApartmentAsset className="h-28 w-28 sm:h-36 sm:w-36" />
                    </Item>
                  )}
                  {mockYear?.home === "house" && (
                    <Item key="house" id="house" label="House" sections={homeSections}>
                      <HouseAsset className="h-36 w-40 sm:h-52 sm:w-64" />
                    </Item>
                  )}
                  {ownsHome && home && (
                    <Item key={home.key} id={home.key} label="Home" sections={section(home)}>
                      <HouseAsset className="h-36 w-40 sm:h-52 sm:w-64" />
                    </Item>
                  )}
                  {cars.map((car, i) =>
                    isSuv(car.title) ? (
                      <Item key={car.key} id={car.key} label={car.title} sections={section(car)}>
                        <SuvAsset phase={1 + i} className="h-20 w-32 sm:h-32 sm:w-52" />
                      </Item>
                    ) : (
                      <Item key={car.key} id={car.key} label={car.title} sections={section(car)}>
                        <SedanAsset phase={1 + i} className="h-20 w-32 sm:h-28 sm:w-52" />
                      </Item>
                    ),
                  )}
                </AnimatePresence>
              </SceneChangeContext.Provider>
            </ul>
          </div>
        </div>

        {/* The money, floating over the right of the scene on wide screens (below it on narrow ones). No borders. */}
        {row && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 lg:absolute lg:right-6 lg:top-1/2 lg:z-10 lg:mt-0 lg:w-48 lg:-translate-y-1/2 lg:grid-cols-1 lg:gap-2">
            <Metric label="Cash" value={shown(row.cash)} sections={cashSections} visual={<CreditCardAsset className={METRIC_VISUAL} />} />
            <Metric label="Debt" value={shown(row.debt)} sections={debtSections} visual={<DebtAsset className={METRIC_VISUAL} />} />
            {/* No investments value in the engine yet (schema has no field for it), so this shows a dash, never a made-up number. */}
            <Metric
              label="Investments"
              value={mockYear ? mockYear.investments : null}
              sections={investmentSections}
              visual={<InvestmentsAsset className={METRIC_VISUAL} />}
            />
            <Metric
              label="Retirement"
              value={shown(row.retirement)}
              sections={retirementSections}
              visual={<NetworkSphereAsset className={METRIC_VISUAL} />}
            />
          </dl>
        )}
      </section>
    </MotionConfig>
  );
}

function Figure({
  label,
  value,
  format,
  large = false,
}: {
  label: string;
  value: number | null;
  format: (v: number) => string;
  large?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</dt>
      <dd className={`font-light tabular-nums tracking-tight text-ink ${large ? "text-5xl" : "text-2xl"}`} aria-live="polite">
        {value === null ? "—" : <AnimatedNumber value={value} format={format} />}
      </dd>
    </div>
  );
}

/** One money tile. Hover, focus, or tap shows its specifics beside it. */
function Metric({ label, value, visual, sections }: { label: string; value: number | null; visual: ReactNode; sections: Section[] }) {
  const tip = useSideTip();
  return (
    <div className="relative flex items-center gap-3" onMouseEnter={(event) => tip.show(event.currentTarget)} onMouseLeave={tip.hide}>
      <button
        type="button"
        aria-label={`${label} details`}
        aria-expanded={tip.open}
        onClick={(event) => (tip.open ? tip.hide() : tip.show(event.currentTarget.parentElement ?? event.currentTarget))}
        onFocus={(event) => tip.show(event.currentTarget.parentElement ?? event.currentTarget)}
        onBlur={tip.hide}
        className="shrink-0 rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
      >
        {visual}
      </button>
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</dt>
        <dd className="text-2xl font-light tabular-nums tracking-tight text-ink drop-shadow-[0_0_8px_var(--number-glow)]">
          {value === null ? "—" : <AnimatedNumber value={value} format={money} />}
        </dd>
      </div>
      <AnimatePresence>{tip.open && sections.length > 0 && <TipCard side={tip.side} sections={sections} />}</AnimatePresence>
    </div>
  );
}

type Side = "right" | "left" | "below" | "below-start" | "below-end";
/** The hover card's width (w-60) and its gap from the model, in px. */
const TIP_WIDTH = 240;
const TIP_GAP = 12;
const TIP_POSITION: Record<Side, string> = {
  right: "left-full top-1/2 ml-3 -translate-y-1/2",
  left: "right-full top-1/2 mr-3 -translate-y-1/2",
  below: "left-1/2 top-full mt-2 -translate-x-1/2",
  "below-start": "left-0 top-full mt-2",
  "below-end": "right-0 top-full mt-2",
};

/** Where a hover card opens: beside its anchor toward the side with more room, or below it if neither side fits. */
function useSideTip() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("right");

  function show(el: Element) {
    const rect = el.getBoundingClientRect();
    const roomRight = window.innerWidth - rect.right;
    const roomLeft = rect.left;
    const needed = TIP_WIDTH + TIP_GAP + 8;
    if (roomRight >= needed && roomRight >= roomLeft) setSide("right");
    else if (roomLeft >= needed) setSide("left");
    else {
      // Below, kept on screen: lined up with the anchor's edge when centering would run off either side.
      const center = rect.left + rect.width / 2;
      setSide(center - TIP_WIDTH / 2 < 8 ? "below-start" : center + TIP_WIDTH / 2 > window.innerWidth - 8 ? "below-end" : "below");
    }
    setOpen(true);
  }

  return { open, side, show, hide: () => setOpen(false) };
}

/** The frosted card itself: titled blocks of label/value rows, or a short note. */
function TipCard({ side, sections }: { side: Side; sections: Section[] }) {
  return (
    <motion.div
      role="tooltip"
      {...tipReveal(side)}
      className={`pointer-events-none absolute z-20 w-60 rounded-xl border border-line bg-surface/90 p-3 text-sm shadow-2xl backdrop-blur-md ${TIP_POSITION[side]}`}
    >
      {sections.map((part, index) => (
        <motion.div key={part.title} {...tipContent} className={index > 0 ? "mt-2 border-t border-line pt-2" : ""}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{part.title}</p>
          {part.note && <p className="mt-1 text-ink/80">{part.note}</p>}
          {part.details.length > 0 && (
            <dl className="mt-1 space-y-0.5">
              {part.details.map((detail) => (
                <div key={detail.label} className="flex justify-between gap-3">
                  <dt className="text-muted">{detail.label}</dt>
                  <dd className="tabular-nums text-ink">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** One point-cloud model in the scene. Hover, focus, or tap shows its values beside it. */
function Item({ id, label, sections, children }: { id: string; label: string; sections: Section[]; children: ReactNode }) {
  const tip = useSideTip();
  const change = useContext(SceneChangeContext);
  // Arrivals wait for the leavers, then come in one by one: the slot opens, then the model scans in slowly.
  // Frozen at mount, so later renders don't move it.
  const [enterDelay] = useState(() => {
    const index = change.added.indexOf(id);
    return index < 0 ? 0 : exitPhase(change.removed.length) + index * ENTER_STAGGER;
  });
  const [pace] = useState(() => (enterDelay > 0 ? ENTER_SCAN : 1.3));
  const [scanning, setScanning] = useState(enterDelay === 0);
  useEffect(() => {
    if (scanning) return;
    const timer = setTimeout(() => setScanning(true), (enterDelay + ENTER_OPEN * 0.7) * 1000);
    return () => clearTimeout(timer);
  }, [scanning, enterDelay]);
  const pageOpen = useRevealOpen();

  return (
    // The li animates its width (spacing included, on the inner div), so neighbors slide over smoothly as a slot
    // opens or closes. Leavers fade and blur out in order (AnimatePresence's custom = the keys that left), then collapse.
    <motion.li
      initial={{ opacity: 0, width: 0 }}
      animate={{
        opacity: 1,
        width: "auto",
        transition: { width: { duration: ENTER_OPEN, delay: enterDelay, ease: EASE }, opacity: { duration: 0.3, delay: enterDelay } },
      }}
      exit="leave"
      variants={{
        leave: (removed: string[]) => {
          const delay = Math.max(0, removed.indexOf(id)) * EXIT_STAGGER;
          return {
            opacity: 0,
            filter: "blur(8px)",
            y: 14,
            width: 0,
            transition: {
              opacity: { duration: EXIT_FADE, delay, ease: "easeIn" },
              filter: { duration: EXIT_FADE, delay, ease: "easeIn" },
              y: { duration: EXIT_FADE, delay, ease: "easeIn" },
              width: { duration: COLLAPSE, delay: delay + EXIT_FADE, ease: EASE },
            },
          };
        },
      }}
    >
      <div className="px-1.5 sm:px-5">
        <div className="relative" onMouseEnter={(event) => tip.show(event.currentTarget)} onMouseLeave={tip.hide}>
          <button
            type="button"
            aria-label={label}
            aria-expanded={tip.open}
            onClick={(event) => (tip.open ? tip.hide() : tip.show(event.currentTarget))}
            onFocus={(event) => tip.show(event.currentTarget)}
            onBlur={tip.hide}
            className="block rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
          >
            <RevealGate.Provider value={pageOpen && scanning}>
              <RevealPace.Provider value={pace}>{children}</RevealPace.Provider>
            </RevealGate.Provider>
          </button>
          <AnimatePresence>{tip.open && sections.length > 0 && <TipCard side={tip.side} sections={sections} />}</AnimatePresence>
        </div>
      </div>
    </motion.li>
  );
}
