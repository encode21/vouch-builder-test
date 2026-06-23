# AI Conversation Log

## Context

These conversations were conducted in Indonesian — the language I naturally reach for when planning and debugging under pressure. English is my working language for code and documentation, but switching to Indonesian lets me think faster and more precisely during a tight timebox.

**Tools used:** Implementation and debugging ran primarily in **Cursor Agent** (sessions logged below). For early architecture and scope decisions (Sessions 1–2), I also **compared conclusions with ChatGPT and Claude** to stress-test assumptions — especially the AI boundary and two-hour scope — before committing implementation prompts to Cursor. I kept a single log in this file rather than a separate Claude export: the decisions that shaped the repo are here, and duplicating the same guidance across `AI_CONVERSATIONS.md`, `AGENTS.md`, and Cursor rules would add noise without new signal for reviewers.

The sessions show my actual working process: how I analyzed the brief, pushed back on an initially over-engineered design, and converged on the smallest trustworthy implementation that still satisfies the core invariants.

The conversations are unedited to reflect the real decision trail.

### Cursor session index

> Screenshot: `docs/screenshots/cursor_agent_sessions.png`

I split work across separate Cursor Agent chats so each prompt stayed focused. The sidebar above maps to the sessions in this file:


| Cursor chat title                                     | Session                                                   | Focus                                            |
| ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Vouch Builder Test: Night…                            | [5](#session-5--core-service-implementation)              | NestJS handover service, tests, grounding        |
| Lightweight browser UI fo…                            | [6](#session-6--lightweight-browser-ui)                   | HTML/CSS/JS demo at `/ui`                        |
| *(Railway deployment — same build chat as Session 5)* | [7](#session-7--railway-deployment-preparation)           | Dockerfile, `railway.toml`, health probe         |
| *(Samples & simulation — continued in build chat)*    | [4](#session-4--testing-and-interviewer-simulation)       | May 28 sample, interviewer replay                |
| Hotel incident report follo…                          | [8](#session-8--hotel-incident-report-follow-up)          | Live May 28 output review + reconciliation fixes |
| npm ci error troubleshooti…                           | [9](#session-9--railway-npm-ci-build-troubleshooting)     | Lockfile `ajv` conflicts on Railway              |
| Improving document read…                              | [3](#session-3--making-this-log-reviewer-ready)           | Restructure `AI_CONVERSATIONS.md`                |
| Document review and tas…                              | [10](#session-10--document-review-and-submission-wrap-up) | Extend this log for interviewer review           |
| *(Regex vs LLM — follow-up in incident chat)*         | [11](#session-11--regex-vs-llm-for-night-log-parsing)     | Why regex exists alongside the LLM parser        |


Sessions 1–2 are planning chats (screenshots in `docs/screenshots/`). Sessions 3–4 and 10 are documentation and simulation work done after the core build.

---

## Session 1 — Initial Brief Analysis

> Screenshot: `docs/screenshots/first_session_chat.png`

I started by reading the brief carefully and forming an initial hypothesis about the architecture. My first instinct was to design a more complete production platform, but I quickly identified that this would be too broad for a two-hour timebox.

The key question I put to the AI: *what does the brief actually ask for, and what does it deliberately leave out?*

---

## Session 2 — Planning and Scope Refinement

> Screenshot: `docs/screenshots/second_session.png`

This session is split into four decision points, each of which shaped what got built.

---

### 2.1 — Defining the AI boundary

The central design question was: *where does LLM responsibility end and application responsibility begin?*

My initial proposal had the LLM supplying a `resolved` status that application code would copy into the canonical incident record. The AI helped me see the flaw: even if the label comes from the LLM, accepting it without verification still lets the model own operational truth indirectly.

**Decision:** treat the LLM as an untrusted multilingual parser only. It may extract evidence-linked observations from free text, but it must not determine incident state, reconciliation outcome, or handover classification. Those remain deterministic and testable in application code.

This is now Invariant 3 and 4 in `AGENTS.md`.

---

### 2.2 — Reassessing scope against the two-hour timebox

I asked the AI to re-read the brief from the interviewer's perspective and flag anything that looked like over-scope.

**Conclusion:** my original architecture covered too much surface area. The right goal was not a complete production platform but the smallest service that demonstrates the core trust guarantees end-to-end.

Revised priorities, in order:

1. Cross-night incident reconciliation
2. Evidence grounding (every claim links to a source quote)
3. Action-first handover output
4. Explicit surfacing of incomplete or contradictory data
5. A working deployed endpoint

Moved out of scope: database persistence, queues, microservices, polished frontend.

---

### 2.3 — Turning architecture decisions into implementation instructions

With the design settled, I needed to give Cursor effective implementation instructions without duplicating guidance across `AGENTS.md`, `CLAUDE.md`, and Cursor rules — duplicated rules drift and contradict each other.

**Decision:**


| Layer                            | Purpose                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| Karpathy rules (`.cursor/rules`) | General coding behaviour: simplicity, surgical changes, no speculative code |
| `AGENTS.md`                      | Project-specific invariants and hard constraints                            |
| Active Cursor conversation       | The specific implementation task in progress                                |


The Cursor prompt I derived from this session focused implementation on: grounding verification, deterministic reconciliation, focused tests, and avoiding unnecessary infrastructure.

---

### 2.4 — Separating UI and deployment work

The last planning step was to split the remaining work into independent prompts so that frontend and deployment changes could not contaminate unfinished core logic.

**UI decision:** a lightweight HTML + CSS + vanilla JS page served directly by the NestJS application. This avoids introducing React or a second deployment while still giving the interviewer a browser-accessible view.

The page was designed to:

- submit input to the existing `/handover` endpoint
- present open, new, resolved, and warning sections clearly
- expose source evidence inline
- display API errors explicitly
- render untrusted model output safely (no `innerHTML` from LLM strings)

Deployment was handled as a separate prompt after the core logic was complete, to avoid mixing concerns.

---

## Session 3 — Making this log reviewer-ready

> Screenshot: `docs/screenshots/rearrange_ai_conversations_md.png`

After implementation, I used Cursor again to reorganize this file itself. The raw conversation export was accurate but hard to scan quickly — section summaries were buried in prose, screenshot references looked like stray paths, and the decision trail was not obvious from an interviewer's perspective.

I asked the AI to rearrange and fix `AI_CONVERSATIONS.md` without rewriting the substance: keep the real working process visible, but structure it so each session and decision point is easy to jump to.

**What changed in this file:**

- a clearer intro explaining why Indonesian was used during planning
- numbered decision points under Session 2 (2.1–2.4) with explicit `Decision:` takeaways
- screenshot references formatted as captions instead of bare file paths
- a table for the instruction-layer split (`AGENTS.md` vs Cursor rules vs active conversation)

The screenshot above is the prompt that produced this layout. The summaries here are editorial structure only; the underlying decisions and scope choices are unchanged.

---

## Session 4 — Testing and interviewer simulation

> Screenshot: `docs/screenshots/samples_request_to_ai.png`

Once the service was running, I needed a realistic way to test it end-to-end and rehearse what an interviewer would actually do with the repo.

**The gap:** `data/night-logs.md` existed as source material from the brief, but no committed sample wired it into a handover request. The bundled samples only covered structured events:

- `samples/handover-request.json` — events only, with `"nightLog": ""`
- `public/sample-request.json` — same shape, used by the browser UI **Load sample data** button

That was enough for deterministic-path testing, but not for the full brief scenario (structured events plus multilingual free-text night log).

**Decision:** add a canonical May 28 scenario at `samples/handover-request-2026-05-28.json`:

- `morningDate`: `2026-05-28` (night of Wed 27 May → morning of Thu 28 May)
- `events`: 12 structured events from `data/events.json`
- `nightLog`: relief-staff prose from `data/night-logs.md`

**How to simulate what an interviewer would do:**


| Path                      | Command / action                                                                |
| ------------------------- | ------------------------------------------------------------------------------- |
| Unit tests (no live LLM)  | `npm test` — uses a fake night-log extractor                                    |
| API — events only         | `curl -d @samples/handover-request.json` against `POST /handover`               |
| API — full brief scenario | `curl -d @samples/handover-request-2026-05-28.json` (requires `OPENAI_API_KEY`) |
| Browser UI                | open `/`, click **Load sample data**, optionally paste night log, submit        |
| Health check              | `curl http://localhost:3000/health`                                             |


This kept testing practical inside the timebox: deterministic behaviour is covered by Jest, while the May 28 sample lets anyone replay the full handover path without manually assembling events and night-log text from separate files.

---

## Session 5 — Core service implementation

> Cursor chat: **Vouch Builder Test: Night-Shift Handover**

After planning (Sessions 1–2), I gave Cursor a single implementation prompt scoped to the two-hour timebox: inspect `BRIEF.md`, `data/events.json`, and `data/night-logs.md`, then build the smallest trustworthy deployed-ready service.

**What was built:**

- NestJS modular monolith with `POST /handover` and `GET /health`
- deterministic structured-event normalization
- pluggable `NightLogExtractor` (live OpenAI adapter + fake for tests)
- Zod-validated LLM output and programmatic quote grounding
- deterministic incident reconciliation and state reduction
- action-first JSON handover with `renderedText` Markdown
- Pino structured JSON logging

**Decision:** keep the LLM behind an interface and never let it own canonical incident state. Reconciliation, classification, and final handover sections are application code.

Along the way I hit a local `Cannot find module` error during `start:dev` — stale TypeScript build cache. Clearing `dist/` and restarting resolved it.

---

## Session 6 — Lightweight browser UI

> Cursor chat: **Lightweight browser UI for…**

With the API working, I opened a separate chat so UI work would not touch reconciliation logic.

**Decision:** serve a utility HTML page from the same NestJS process — no React, no second deployment.

Routes:

- `GET /` → redirect to `/ui/`
- `GET /ui/` → static handover form
- `POST /handover` → unchanged JSON API

The UI submits hotel ID, morning date, timezone, events JSON, and optional night log. Results render in action-first sections with collapsible evidence blocks. Untrusted model output is rendered safely (no `innerHTML` from LLM strings).

Files: `public/index.html`, `public/styles.css`, `public/app.js`, `public/sample-request.json`.

---

## Session 7 — Railway deployment preparation

> Cursor chat: **Vouch Builder Test** (deployment follow-up prompt in the same session)

Deployment was a separate prompt after core logic and UI were stable.

**What was added:**


| Artifact                 | Purpose                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| Multi-stage `Dockerfile` | `npm ci` → build → non-root runner with `dist/` + `public/`        |
| `railway.toml`           | Dockerfile build, health check on `/health`, restart on failure    |
| `.env.example`           | Document `PORT`, `NODE_ENV`, `LOG_LEVEL`, `OPENAI_`*               |
| `.dockerignore`          | Exclude `node_modules`, `.env`, tests, local docs                  |
| `src/config/env.ts`      | Startup validation; warn if `OPENAI_API_KEY` missing in production |
| `src/main.ts`            | Bind `0.0.0.0`; respect Railway-injected `PORT`                    |


**Decision:** one stateless Railway service — no database, no extra containers. Health check must succeed without calling the LLM.

`DECISIONS.md` records deployment honestly: config prepared locally; public URL verification pending until Railway build succeeds.

---

## Session 8 — Hotel incident report follow-up

> Cursor chat: **Hotel incident report follo…**

After running the full May 28 sample (`samples/handover-request-2026-05-28.json`) with a live LLM, I pasted the JSON response back into Cursor and asked what was wrong.

**First question:** *where is the LLM response that generates the threads?* — I wanted to confirm the pipeline: LLM produces observation drafts only; deterministic code reconciles them into incident threads.

**Diagnosis of the live output:**


| Problem                                | Example                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| Duplicate incidents (threading failed) | Room 112, 215, 309 appeared in both `stillOpen` and `newTonight`     |
| Missing `newlyResolved`                | Room 312 no-show fee collected in night log but not classified       |
| Grounding bug                          | Room 205 billing mismatch rejected due to case-sensitive quote match |
| Missing warnings                       | Wifi complaint with unknown room not surfaced                        |
| Generic actions                        | Leak and safe incidents lost urgent language from the night log      |


**Root cause:** night-log `subjectKey` values from the LLM (e.g. `aircon_room_112`) did not match structured keys (e.g. `maintenance_room_112`), so the reconciler created new incidents instead of updating existing threads.

**Decision:** implement fixes in application code — not by asking the LLM to reconcile:

1. broader reconciler matching (room + compatible category/subject, related categories)
2. case-insensitive quote grounding
3. updated extraction prompt (`night-log-v2`) with explicit `subjectKey` conventions
4. action phrases pulled from night-log quotes
5. `test/may28-integration.spec.ts` as a golden-path regression without a live LLM

I also asked whether the UI/JSON shape was acceptable for Vouch judgment — confirmed the structure was fine; the content gaps above were the real issue.

---

## Session 9 — Railway `npm ci` build troubleshooting

> Cursor chat: **npm ci error troubleshooti…**

Railway builds failed at `RUN npm ci` with `ajv` / `json-schema-traverse` version conflicts. The lockfile hoisted `ajv@8` where `ajv-keywords@3` requires `ajv@6`.

**Attempts:**

1. plain `npm install` locally — did not change the lockfile (macOS hoisting masked the conflict)
2. `npm ci --omit=dev` only in runner stage — builder stage still failed
3. `overrides` in `package.json` — did not produce a valid lockfile diff
4. `legacy-peer-deps` — same lockfile, no fix

**Fix that worked:**

- `.npmrc` with `install-strategy=nested` so `ajv` v6 and v8 stay in separate nested paths
- regenerate `package-lock.json` using npm `10.9.8` (Railway's version)
- copy `.npmrc` into the Docker builder stage before `npm ci`
- add `jest-util` as explicit devDependency so Jest resolves under nested installs locally

Verified `npm ci` in a clean directory with npm 10.9.8 before pushing. Railway redeploy from `main` was the next step; build cache clear recommended if the old lockfile was cached.

---

## Session 10 — Document review and submission wrap-up

> Cursor chat: **Document review and tas…** (this session)

After implementation and deployment troubleshooting, I returned to documentation so an interviewer could follow the full decision trail without opening every Cursor chat.

**What this session added to the log:**

- Session 3 — reorganized `AI_CONVERSATIONS.md` for reviewer readability
- Session 4 — documented testing and interviewer simulation with the May 28 sample
- Sessions 5–9 — captured the remaining Cursor chats (implementation, UI, Railway, incident fixes, `npm ci`)
- Session index — sidebar screenshot mapping chat titles to session numbers

The summaries here are editorial structure only. Underlying scope choices and trust invariants are unchanged from Sessions 1–2.

---

## Session 11 — Regex vs LLM for night-log parsing

> Screenshot: `docs/screenshots/regex_vs_llm_night_log.png`

After the Session 8 reconciliation fixes, I noticed `resolution-detector.ts` used regex patterns and asked a fair question:

> *Why regex? The night log is free text written by relief staff in whatever language they're comfortable in — some entries may not be in English.*

**Short answer:** the **LLM is the primary parser** for messy multilingual night logs. Regex appears only in small, deterministic helpers — never as a replacement for understanding arbitrary prose.

**Architectural split:**


| Input type                                | Parser                   | Trust level             |
| ----------------------------------------- | ------------------------ | ----------------------- |
| Multilingual free-text night log          | LLM (`llm-extractor.ts`) | Untrusted — drafts only |
| Structured events                         | Deterministic normalizer | Trusted                 |
| Reconciliation, classification, grounding | Application code         | Trusted, testable       |


**Where regex is used (and what it does *not* do):**


| Place                    | Role                                                    | Multilingual?                                                              |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `llm-extractor.ts`       | Primary night-log parser                                | **Yes** — model handles any language                                       |
| `grounding.validator.ts` | Verify quote exists in source text                      | Language-agnostic (substring / normalized match)                           |
| `draft-normalizer.ts`    | Fix `room_309` → `309` in subject keys                  | Structural only                                                            |
| `room.util.ts`           | Extract room numbers from text                          | **Partial** — `208 房`, `near 215`, `Room 112`                              |
| `resolution-detector.ts` | Fallback when LLM misses an obvious resolution          | **Limited** — English + a few Chinese phrases (e.g. `settle 了`, `收了一晚的费用`) |
| `handover.builder.ts`    | Pull imperative action phrases into `recommendedAction` | Mixed — English patterns + a few Chinese urgency markers                   |


**Decision:** regex is a **safety net**, not the parsing strategy. `resolution-detector.ts` only supplements LLM drafts when a line clearly signals resolution (like Room 312's no-show fee) but the model failed to emit `signal: "resolved"`. Every supplemental draft still goes through the same grounding check — the quote must exist verbatim in the source night log.

Regex does **not** decide incident state, write handover prose, or replace the LLM for general extraction. That keeps the design aligned with Invariant 3: the LLM is an untrusted parser; deterministic code owns truth.