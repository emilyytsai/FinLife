# FinLife: requirements and tasks

Tentative and shared: every teammate and every Claude session works from this file. Deadline: Sat Oct 3, 9:00 AM PT. Judging: 9:30 to 11:00 AM PT.

## How to use this file
- Before each task: `git pull origin main` into your branch, read this file, then paste your next prompt from the team prompts doc (latest version). The IDs here (K1, B2, E3, ...) match the prompts.
- Your next task is the first unchecked one in your section whose "Needs" are met.
- When its "Done when" checks pass, tick it (`- [x]`) and add the time, in the same commit as the work. Merge to main at the checkpoint.
- Edit only your own section so merges stay clean. Brian keeps Status, Shared values, and Open decisions current; anyone can add a line to Open decisions or Blocked.
- If you're blocked or a checkpoint slips, add a line under Blocked and follow the "If it slips" column in the timeline.
- Requirements change only with team agreement, like CLAUDE.md and contracts/schema.md.

## Requirements (tentative)

### The demo
1. Connect: "Connect accounts" with fictional personas (Maya, Jordan, Priya) or manual entry. No real bank names, logos, or personal data.
2. Health check: 4 highlights (emergency fund, savings rate, debt-to-income, retirement pace) and 3 "What if I..." suggestions.
3. What if: the user asks in chat, Claude on Bedrock turns the question into events, the engine computes every number, and the chart shows the current path (solid) against the change (dashed).
4. Share: "Share with an advisor" makes a link to a one-page brief with goals, what they tested, where trouble starts, 3 questions for a first meeting, and a disclaimer.
5. Demo story with Maya: "What if I buy a $350k house at 28?", then "What if I also lose my job for 6 months at 31?", then "What if I raise my 401(k) to 10% at 25?", then share the brief.

### Platform
6. On AWS: the API on Lambda behind a Function URL; Claude on Bedrock (Sonnet 5, with Haiku 4.5 as the fallback); Bedrock Guardrails; DynamoDB for briefs and the audit log; the frontend on Amplify Hosting.
7. Never breaks on stage: stubs keep the API answering, and offline mode (Ctrl+Shift+O) replays recorded responses if AWS is down.
8. Compliance: the Rules in CLAUDE.md (no investment advice, a guardrail on every reply, an audit record per chat, numbers only from the engine, no personal data).

### Judging
- Startup We'd Buy Tomorrow. Business model: free for investors; LPL earns through the clients its advisors convert.
- Best Customer Experience.
- Best Use of AWS.

### Not now
- Pay stub upload (B5): only if the Sat 1:00 AM gate passes.
- Real account connections and real personal data.

## Status
- [x] Phase 0: contracts, backend skeleton with stubs, frontend lib and wiring page (main, Fri 11:06 AM)
- [x] Shared AWS session for the hackathon account and the CLAUDE.md rule (PR #1, Fri 11:57 AM)
- [x] Categories submitted (Fri, before noon)

## Timeline (PT)
| When | Done by then | If it slips |
| --- | --- | --- |
| Fri 12:00 PM | Phase 0 on main; categories submitted; one Bedrock call works from a laptop | Everyone helps get Bedrock working; nothing AI-related moves without it |
| Fri 4:00 PM | K1, K2 merged; B1 coach answers locally; E1, E2 working on stubs | Frontend keeps going on stubs |
| Fri 8:00 PM | K3 merged; K4 Lambda deployed; B2 guardrail + audit; E3 chat on the real local API | Run the backend locally for the demo; keep deploying in parallel |
| Sat 12:00 AM | B3 share + brief; E4 icons; E5 brief page | Brief served from a fixture; icons without animation |
| Sat 1:00 AM | Gate: connect -> health check -> what if -> brief runs end to end on AWS | If yes, Brian may try B5 (upload). If no, everyone fixes the core demo |
| Sat 4:00 AM | E6 Amplify deploy; B4 offline fixtures; full demo on the Amplify URL | All stop and fix |
| Sat 6:00 AM | Demo video recorded (backup) | Record whatever runs |
| Sat 8:30 AM | Deck (LPL template), code ZIP, and form submitted | Hard deadline is 9:00 AM |

## Shared values
Non-secret only. Never paste AWS keys here. Fill these in as they become known.
- Event region:
- Bedrock model ID (Sonnet 5):
- Fallback model ID (Haiku 4.5):
- Guardrail ID / version:
- Function URL:
- Amplify URL:
- Organizer answers: Is the account up through judging? How does each teammate log in? Can we create IAM roles and CloudFormation stacks (SAM)? Can Amplify connect to GitHub? Are public Function URLs, DynamoDB, and Guardrails allowed?

## Kevin: engine and AWS infra
- [x] K1 Engine: simulate. Due Fri 4:00 PM. Done when: the simulate placeholders in backend/tests/test_engine.py are real tests and pass; Maya's summary and flags are reported (no events, and a $350k house at 28).
- [x] K2 Compare, money, labels. Due Fri 4:00 PM. Done when: money() matches frontend/src/lib/format.ts (round half up, so 1250 is $1.3k); every label example in schema.md passes; K1 and K2 are merged to main.
- [ ] K3 Analysis and demo tuning. Due Fri 8:00 PM. Needs K1. Done when: backend/tests/test_analysis.py passes; the demo checks are reported (no baseline flags; a cash flag between 28 and 31 with the house; a 10% 401(k) ends higher); the $5M suggested-price cap is decided.
- [ ] K4 AWS deploy with SAM. Due Fri 8:00 PM. Needs Docker, the finlife profile, and the guardrail ID from B2 (deploy without it first if B2 isn't done). Done when: GET /health and POST /simulate on the Function URL match local; the Function URL is in Shared values.

## Brian: API and AI
- [ ] Organizer AWS answers recorded in Shared values. Due Fri 12:00 PM.
- [ ] B0 Bedrock works from a laptop. Due Fri 12:00 PM. Needs the hackathon account login. Done when: the CLI converse call answers with --profile finlife; model IDs are in backend/.env and Shared values.
- [ ] B1 Coach on Bedrock. Due Fri 4:00 PM. Needs B0. Done when: test_numbers.py and the aws coach test pass; replies to the 3 demo questions are reported.
- [ ] B2 Guardrail and audit log. Due Fri 8:00 PM. Needs the finlife-advice guardrail created in the console. Done when: the bait reply is blocked; Decimal round-trip tests pass; each /chat writes one audit record; the guardrail ID and version are in Shared values.
- [ ] B3 Share and brief. Due Sat 12:00 AM. Needs B1. Done when: mocked-model tests (valid JSON, invalid JSON, a made-up number, 2 questions) all produce a valid Brief.
- [ ] B4 Refusal tests and offline fixtures. Due Sat 4:00 AM. Needs B1 to B3 and K3. Done when: the 5 refusal tests pass; offline JSON is saved to backend/fixtures/offline and frontend/public/offline.
- [ ] B5 Pay stub upload (stretch). Only if the Sat 1:00 AM gate passes.

## Emi: frontend
Done when, for each task: npm run lint and npm run build pass, and it works on stubs at 375px wide.
- [ ] E1 Connect flow and profile editing. Due Fri 4:00 PM.
- [ ] E2 Health check and timeline chart. Due Fri 4:00 PM. Started: TimelineChart on `frontend` (not merged).
- [ ] E3 Chat experience. Due Fri 8:00 PM. Needs B1 running locally (build on stubs until then).
- [ ] E4 Life icons on the timeline. Due Sat 12:00 AM. Started: EventMarker, EventIcon, and EventChips on `frontend` (not merged).
- [ ] E5 Share flow and advisor brief. Due Sat 12:00 AM. Needs B3 for real briefs (stub briefs work now). Started: ShareButton and the brief page on `frontend` (not merged).
- [ ] E6 Amplify deploy, offline mode, and polish. Due Sat 4:00 AM. Needs the Function URL (K4) and offline fixtures (B4). Done when: the full demo runs on the Amplify URL and out/brief/index.html exists.

## Submission
- [ ] Deck in the LPL template. Owner: Roby. Due Sat 8:30 AM. Should cover the problem, the demo story, the business model, compliance (guardrail, audit, number check), and the AWS architecture.
- [ ] Demo video (backup). Owner: TBD. Due Sat 6:00 AM.
- [ ] Code ZIP and submission form. Owner: TBD. Due Sat 8:30 AM (hard deadline 9:00 AM).

## Team gates
- [ ] Sat 1:00 AM: connect, health check, what if, and brief run end to end on AWS. If yes, Brian may try B5. If no, everyone fixes the core demo.
- [ ] Sat 4:00 AM: the full demo runs on the Amplify URL.
- [ ] Before judging (Sat 9:30 AM): hit /health on the Function URL a minute early, confirm the account is still up, and have offline mode ready (Ctrl+Shift+O).

## Open decisions
- Suggested house price can go above buy_house's 5,000,000 max for incomes above about $833k (the Phase 0 stub caps it). Kevin proposes a fix in K3; a schema change needs team agreement.
- money() must round half up in the engine and the frontend alike, so both give identical strings.
- Owners for the demo video, the code ZIP, and the submission form.

## Blocked
Add a line: who, what's blocking, and what's needed.
- (none yet)
