# DECISIONS.md

**Initial focused build:** ~2 hours (core API, reconciliation, LLM boundary, basic tests)  
**Follow-up work:** reconciliation fixes, browser UI, May 28 sample, Railway Docker build, grounding/normalization hardening, documentation  
**Start / stop times:** *2026-06-23 20:15 / 2026-06-23 22:16*

---

## What was built

A stateless NestJS modular monolith that ingests **structured events** and **multilingual free-text night logs**, reconciles incidents across nights, and returns an action-first, evidence-grounded handover.

### HTTP surface


| Route            | Purpose                    |
| ---------------- | -------------------------- |
| `GET /health`    | JSON health probe (no LLM) |
| `GET /` → `/ui/` | Static demo form           |
| `POST /handover` | Handover JSON API          |


### Processing pipeline

1. **Structured normalization** — `events.json`-shaped records → evidence-linked observations (`eventId`).
2. **LLM extraction** — untrusted parser for free-text night logs (`night-log-v3` prompt, Zod schema).
3. **Draft normalization** — fix malformed model output (`room_309` → `309`, infer room from quote text e.g. `near 215`).
4. **Resolution supplement** — narrow deterministic fallback when settlement language is in the log but the LLM missed it (see [Multilingual night logs](#multilingual-night-logs-and-the-ai-boundary)).
5. **Grounding enforcement** — quotes must match source text before observations are accepted.
6. **Reconciliation** — chronological, deterministic incident matching and state reduction.
7. **Handover projection** — `stillOpen`, `newTonight`, `newlyResolved`, `warnings` + `renderedText`.

### Other deliverables

- Vanilla HTML/CSS/JS UI at `/ui/` (utility form, evidence blocks, raw JSON audit).
- Pino structured JSON logging (`runId`, `hotelId`, `morningDate`, phase/decision codes).
- Docker + `railway.toml`; `.npmrc` with `install-strategy=nested` for reproducible `npm ci` on Railway.
- **20 tests** across 4 suites (no live LLM in CI): unit reconciliation/grounding, May 28 integration golden path.
- Canonical scenario: `samples/handover-request-2026-05-28.json` (Wed 27 → Thu 28 May, structured history + relief-staff night log).

The service is **stateless**: each request must include the relevant event history. No database.

---

## Deliberately skipped


| Item                       | Why                                             |
| -------------------------- | ----------------------------------------------- |
| PostgreSQL / persistence   | Brief scope; stateless request model            |
| Queues, microservices      | Modular monolith is enough for the slice        |
| Auth                       | Not required for the test harness               |
| React / SPA                | Utility UI only; API is the contract            |
| Vector DB / multi-agent    | Reconciliation must stay deterministic          |
| LLM-written handover prose | Violates trust boundary; code projects sections |


---

## Reconciliation strategy

Observations are sorted chronologically and matched in order:

1. Explicit `incidentRef` when present
2. Same `room + category + subjectKey`
3. Same `room + category + compatible subjectKey` (shared room number in key or shared type stem)
4. Same `room + category` when **exactly one** incident matches that room and category
5. Same `room + related category` (`maintenance` ↔ `facilities`) when **exactly one** incident matches
6. Same `category + compatible subjectKey` for room-less incidents when unique
7. Otherwise → new incident

**Ambiguous multiple matches** → separate incident + `ambiguous_multiple_incident_matches` warning. False separation preferred over silent merge.

### State reducer


| Signal                  | Effect                                       |
| ----------------------- | -------------------------------------------- |
| `opened` / `still_open` | `open`                                       |
| `progress_update`       | preserve status (does **not** mean resolved) |
| `resolved`              | `resolved`                                   |
| `unknown`               | preserve known status                        |


Reopening after resolution → `incident_reopened_after_resolution`.

### Handover classification (morning date)


| Section         | Rule                                                          |
| --------------- | ------------------------------------------------------------- |
| `stillOpen`     | Open, opened on a prior shift                                 |
| `newTonight`    | Open, first opened on target shift                            |
| `newlyResolved` | Resolved on target shift, opened before target shift          |
| `warnings`      | `observation_ambiguity:*` flags; excluded from other sections |


**Follow-up fix (Session 8):** early live runs duplicated incidents (e.g. Room 112 in both `stillOpen` and `newTonight`) because LLM `subjectKey` values (`aircon_room_112`) did not match structured keys (`maintenance_room_112`). Broader matching + draft normalization fixed threading in tests; live LLM output can still vary run-to-run.

---

## Multilingual night logs and the AI boundary

Relief-staff logs are **free text in whatever language staff are comfortable with** (the sample mixes English and Chinese in the same bullet). The design does **not** assume English-only input.

### Who parses what


| Input                                       | Parser                       | Trust                               |
| ------------------------------------------- | ---------------------------- | ----------------------------------- |
| Free-text night log                         | **LLM** (`llm-extractor.ts`) | Untrusted — observation drafts only |
| Structured events                           | Deterministic normalizer     | Trusted                             |
| Reconciliation, sections, priority, actions | Application code             | Trusted, testable                   |


The LLM must **not** own canonical incident history or final handover wording.

### Where regex appears (and why)

Regex is **not** the primary night-log parser. It appears only in small deterministic helpers:


| Module                   | Role                                             | Multilingual?                                                         |
| ------------------------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| `llm-extractor.ts`       | Primary extraction                               | **Yes** — model handles arbitrary language                            |
| `grounding.validator.ts` | Verify quote in source                           | Language-agnostic (normalized substring / token overlap)              |
| `draft-normalizer.ts`    | Fix `room_309`-style fields                      | Structural                                                            |
| `room.util.ts`           | Extract room numbers                             | Partial — `208 房`, `near 215`, `Room 112`                             |
| `resolution-detector.ts` | Fallback for missed settlements                  | **Limited** — English + a few Chinese phrases (`settle 了`, `收了一晚的费用`) |
| `handover.builder.ts`    | Pull imperative phrases into `recommendedAction` | Mixed EN/ZH patterns                                                  |


`**resolution-detector.ts` tradeoff:** added after live runs showed the LLM sometimes missed obvious resolutions (e.g. Room 312 no-show fee collected). It only emits drafts when a **full source line** matches a narrow pattern; the line is used as the exact quote and still passes grounding. It does **not** generalize across all languages or hotels — that would be hours 3–6 work (LLM-only + verification, or locale-specific phrase lists). Documented here as a **2-hour reliability compromise**, not a production multilingual strategy.

---

## Grounding enforcement

- Structured events: `{ sourceType: 'event', eventId }`.
- Night-log drafts: required `quote` field.
- Before acceptance, code verifies the quote exists in the original night log:
  - case-insensitive, whitespace-normalized
  - line-level fallback when the model omits a prefix or middle phrase but the source line clearly matches (token overlap + room hint)
- Malformed `room` values normalized before grounding (`room_309` → `309`).
- Rejected drafts → `rejectedObservations`; they never alter incident state.
- `assertAllItemsGrounded` throws if any handover item lacks evidence.

Prompt instructions alone are insufficient; grounding is enforced in code.

---

## Incomplete and contradictory inputs

- Missing room → `ambiguities` preserved (e.g. `room_unknown` for wifi complaint); surfaced in `warnings`.
- Billing vs physical mismatch → `billing_system_mismatch` (e.g. Room 205 ghost guest).
- Conflicting status signals → latest chronological reducer wins; warnings when ambiguous.
- Ungrounded LLM output → rejected, not merged.
- LLM extraction failure / missing API key → structured-events-only handover with `extractionFailed: true`.

---

## Preventing the LLM from inventing operational truth

The LLM only produces observation drafts. It does **not**:

- set canonical incident status history
- classify handover sections
- assign priority
- write final handover prose

“Maintenance came” / “technician looked” → `progress_update`, **not** `resolved`, unless the source explicitly confirms settlement or restoration.

---

## Testing strategy


| Suite                                  | What it proves                                                     |
| -------------------------------------- | ------------------------------------------------------------------ |
| `test/handover.spec.ts`                | Classification, signal semantics, reconciliation, grounding        |
| `test/may28-integration.spec.ts`       | Full May 28 scenario without live LLM (deterministic drafts)       |
| `test/night-log-normalization.spec.ts` | Room normalization, quote grounding fallbacks, resolution detector |
| `test/env.spec.ts`                     | Env config smoke                                                   |


Live LLM quality is validated manually via `samples/handover-request-2026-05-28.json` and `/ui/` — not in CI.

---

## Known limitations (honest)

1. **LLM variability** — extraction quality depends on model, prompt, and temperature (`0`). Same sample can differ slightly between runs; structural fixes reduce but do not eliminate this.
2. **Regex resolution fallback** — English/Chinese settlement phrases only; not a general multilingual parser.
3. **Generic actions** — some items still fall back to “Morning manager follow-up required.” when no imperative phrase is found in grounded text.
4. **Stateless** — client must send full relevant history each request.
5. **Shift boundary** — fixed 23:00–07:00 local, labelled by morning date.
6. **Title truncation** — incident titles slice at 80 characters (cosmetic).
7. **Deployment** — Docker/Railway config ready; public URL must be verified and pasted into `README.md` before submission.

---

## Where AI helped

- Scoping the brief against the 2-hour timebox (pushing back on over-engineering).
- NestJS scaffolding, test structure, and documentation.
- Designing the extraction prompt for messy multilingual prose.
- Debugging live handover output (duplicate incidents, empty `newlyResolved`, malformed `room` fields).
- Railway `npm ci` / `ajv` lockfile conflict diagnosis (`install-strategy=nested`).

## Where AI got in the way

- Early temptation to let the model summarize the handover directly (rejected).
- LLM returning `room_309` / `room_unknown` instead of real room numbers — required a code normalizer, not just prompt tweaks.
- ESLint flat-config churn; kept classic `.eslintrc.js`.

---

## Hours 3–6 (if continued)

1. Remove or replace regex resolution fallback with LLM-only extraction + stricter schema validation.
2. Persistent incident store per hotel + operator merge/split UI.
3. Golden-file regression from historical handovers (including live LLM snapshots).
4. Locale-aware phrase lists or embedding-based quote alignment (still grounded).
5. Stronger `recommendedAction` from grounded imperative detection across languages.
6. Auth, observability dashboards, secret management.

---

## Deployment status


| Stage                                        | Status                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `npm run format` / `lint` / `build` / `test` | Passing locally (20 tests)                         |
| `npm run start:dev` + `/ui/`                 | Works locally with `OPENAI_API_KEY` for night logs |
| Dockerfile + `railway.toml` + `.npmrc`       | Prepared                                           |
| Railway `npm ci` lockfile fix                | Applied (`install-strategy=nested`)                |
| Public deployed URL + curl verification      | **You must deploy and paste URL into `README.md`** |


Production binds `0.0.0.0`, serves `public/` at `/ui/`, health check does not call the LLM.

### Local verification commands

```bash
curl -s http://localhost:3000/health

curl -s -X POST http://localhost:3000/handover \
  -H 'Content-Type: application/json' \
  -d @samples/handover-request-2026-05-28.json
```

---

## One surprising observation

Relief-staff night logs mix languages in a single bullet, and operational status is often **implied** (“maintenance came”) rather than stated. The hardest part was not summarization — it was **threading the same incident across structured events and free text** when the LLM invents different `subjectKey` shapes and room fields. Strict signal taxonomy (`progress_update` vs `resolved`) and quote grounding mattered more than fluent prose.

---

## Related docs

- `AGENTS.md` — invariants and AI boundary for agents
- `AI_CONVERSATIONS.md` — full Cursor session trail (planning in Indonesian, code/docs in English)
- `samples/handover-request-2026-05-28.json` — canonical end-to-end demo request

