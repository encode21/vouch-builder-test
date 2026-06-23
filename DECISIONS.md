# DECISIONS.md

**Start time:** `TODO_FILL_IN`  
**Stop time:** `TODO_FILL_IN`

## What was built

A stateless NestJS modular monolith with:

- `GET /health` — JSON health probe with timestamp (no LLM dependency)
- `GET /` and `GET /ui` — static demo UI
- `POST /handover` accepting structured events + optional free-text night log
- Deterministic structured-event normalization
- Pluggable `NightLogExtractor` with live OpenAI adapter
- Zod-validated LLM output and programmatic quote grounding
- Deterministic incident reconciliation and state reduction
- Action-first JSON handover + Markdown `renderedText`
- Pino structured JSON logging with phase/decision codes
- Docker packaging and focused Jest tests (fake extractor)

The service is intentionally stateless for this two-hour slice. Each request contains the relevant history. Persistence and operator correction workflows are production follow-ups.

## Deliberately skipped

| Item | Why |
|------|-----|
| PostgreSQL / persistence | Brief scope; stateless request model for 2h slice |
| Queues, microservices | Modular monolith is sufficient |
| Auth | Not required for test harness |
| React / SPA frontend | Vanilla HTML/CSS/JS utility UI at `/ui/`; API unchanged |
| Vector DB / multi-agent | Unnecessary for deterministic reconciliation |
| Event sourcing | Overkill for slice |

## Reconciliation strategy

Observations are sorted chronologically and matched in order:

1. Explicit `incidentRef` when present
2. Same `room + category + subjectKey`
3. Same `room + compatible subjectKey` (shared type stem)
4. Otherwise create a new incident

Ambiguous multiple matches create a separate incident with `ambiguous_multiple_incident_matches` warning — false separation preferred over silent merge.

State reducer:

- `opened` / `still_open` → `open`
- `progress_update` → preserve status
- `resolved` → `resolved`
- `unknown` → preserve known status

Reopening after resolution records `incident_reopened_after_resolution`.

## Grounding enforcement

- Structured events always carry `{ sourceType: 'event', eventId }` evidence.
- LLM drafts must include exact `quote` strings.
- Application code verifies quote substring presence in original night log before acceptance.
- Rejected drafts are logged and listed in `rejectedObservations`; they never alter incident state.
- `assertAllItemsGrounded` throws if any handover item lacks evidence.

Prompt instructions alone are insufficient; grounding is enforced in code.

## Incomplete and contradictory inputs

- Missing room → `ambiguities` preserved; incident may remain room-less.
- Conflicting status signals surface via warnings; latest chronological reducer outcome wins for status.
- Ambiguous reconciliation → separate incident + warning.
- Ungrounded LLM output → rejected, not merged.
- LLM extraction failure → partial handover from structured events only with `extractionFailed: true` (documented policy).

## Preventing the LLM from inventing operational truth

The LLM only produces observation drafts. It does not:

- set incident status history
- classify handover sections
- assign priority
- write final handover prose

Canonical state, reconciliation, classification, and actions are deterministic application code. Quotes are verified against source text.

## Where AI helped

- Designing extraction prompt for multilingual messy prose
- Rapid NestJS scaffolding and boilerplate
- Drafting tests and documentation structure

## Where AI got in the way

- Temptation to let the model summarize the handover directly (rejected — violates trust boundary)
- Flat ESLint config churn; reverted to classic `.eslintrc.js`

## Hours 3–6 roadmap

1. Persistent incident store per hotel with operator merge/split UI
2. Idempotent ingestion API for live event stream
3. Golden-file regression suite from historical handovers
4. Improved subject-key normalization (facilities/compliance threads)
5. Deployment with secret management and observability dashboards
6. Human-in-the-loop correction feedback into matcher rules

## Deployment status

| Stage | Status |
|-------|--------|
| Dockerfile + `railway.toml` prepared | Yes |
| Local `npm run build` / `npm test` | Run before each release |
| Local Docker image smoke test | Documented in README |
| Deployed to Railway | **Not verified in this session** |
| Public `/health` verified | **Pending Railway deploy** |
| Public `POST /handover` verified | **Pending Railway deploy** |

Production binds `0.0.0.0`, serves static UI from `public/` at `/ui/`, and health checks do not call the LLM.

## One surprising observation

Relief-staff night logs mix English and Chinese in the same bullet, and operational status is often implied (“maintenance came”) rather than stated — strict signal taxonomy (`progress_update` vs `resolved`) matters more than fluent summarization.
