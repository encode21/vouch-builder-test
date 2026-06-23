# AI Conversation Log

## Context

These conversations were conducted in Indonesian — the language I naturally reach for when planning and debugging under pressure. English is my working language for code and documentation, but switching to Indonesian lets me think faster and more precisely during a tight timebox.

The sessions show my actual working process: how I analyzed the brief, pushed back on an initially over-engineered design, and converged on the smallest trustworthy implementation that still satisfies the core invariants.

The conversations are unedited to reflect the real decision trail.

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

| Layer | Purpose |
|---|---|
| Karpathy rules (`.cursor/rules`) | General coding behaviour: simplicity, surgical changes, no speculative code |
| `AGENTS.md` | Project-specific invariants and hard constraints |
| Active Cursor conversation | The specific implementation task in progress |

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

| Path | Command / action |
|---|---|
| Unit tests (no live LLM) | `npm test` — uses a fake night-log extractor |
| API — events only | `curl -d @samples/handover-request.json` against `POST /handover` |
| API — full brief scenario | `curl -d @samples/handover-request-2026-05-28.json` (requires `OPENAI_API_KEY`) |
| Browser UI | open `/`, click **Load sample data**, optionally paste night log, submit |
| Health check | `curl http://localhost:3000/health` |

This kept testing practical inside the timebox: deterministic behaviour is covered by Jest, while the May 28 sample lets anyone replay the full handover path without manually assembling events and night-log text from separate files.
