# DECISIONS.md

## Timebox

- Started: `2026-06-23 20:15`
- Stopped: `[TODO: exact local date and time]`
- Total focused time: approximately 2 hours

I treated the timebox as a constraint on scope, not as a reason to weaken the core trust guarantees.

## What I built

I built a stateless NestJS service that generates a morning handover from:

- structured front-desk events;
- multilingual free-text night logs;
- multiple nights of incident history.

The service:

1. normalizes both input formats into evidence-linked observations;
2. reconciles related observations into incident threads;
3. applies deterministic incident-state transitions;
4. classifies incidents as:

   - still open;
   - newly resolved;
   - new tonight;

5. surfaces incomplete, unsupported, ambiguous, or contradictory entries;
6. returns structured JSON and a lightweight HTML view;
7. emits structured JSON logs;
8. exposes a health endpoint and is deployed on Railway.

The service is intentionally stateless for this two-hour slice. Each request contains the relevant history required for reconciliation.

## What I deliberately skipped

I deliberately did not add:

- a database;
- authentication or authorization;
- background queues;
- microservices;
- a vector database;
- a separate React frontend;
- hotel-specific operational runbooks;
- a human correction workflow;
- complete production monitoring and alerting.

These would be reasonable production additions, but they would not improve the most important requirement within the timebox: producing a grounded and correctly reconciled handover.

I chose a modular monolith because it keeps the domain logic easy to test while avoiding deployment and distributed-system overhead.

## Input and shift assumptions

A night shift runs approximately from 23:00 until 07:00 and crosses a calendar boundary.

The API uses a `morningDate` to identify the handover being generated. The target shift is treated as the overnight period ending on that morning.

Date-boundary logic is centralized rather than duplicated throughout the application.

Where the input does not contain enough timestamp information to confidently assign an observation, the service preserves that uncertainty rather than inventing a time.

## Observation versus incident

A source entry is treated as an observation, not automatically as a new incident.

For example:

- “Air-conditioning failed” is an observation that may open an incident.
- “Maintenance attended” is a progress observation.
- “Compressor failure confirmed” is another update to the same incident.
- “Air-conditioning restored” is a resolution observation.

This separation allows several source entries across several nights to form one incident thread.

## Reconciliation across nights

Observations are processed chronologically.

The reconciliation strategy prefers:

1. an explicit incident reference, when available;
2. the same room, category, and normalized subject;
3. the same room and a compatible normalized issue;
4. otherwise, a new incident.

The implementation deliberately prefers false separation over unsafe merging.

If an observation could plausibly belong to multiple incidents, the service does not silently choose one. It emits an ambiguity warning.

Canonical incident status is calculated using deterministic rules:

- `opened` makes an incident open;
- `still_open` keeps or makes it open;
- `progress_update` does not imply resolution;
- `resolved` closes it;
- `unknown` does not overwrite a known state.

A maintenance visit, diagnosis, or temporary workaround is therefore not treated as a resolution unless the source explicitly supports restored service or another terminal outcome.

## Handover classification

The main handover sections are mutually exclusive.

### Still open

The incident opened before the target shift and remained unresolved at the end of the shift.

### Newly resolved

The incident received an explicit resolution observation during the target shift.

### New tonight

The incident first opened during the target shift and remained unresolved at the end of the shift.

Repeated mentions are collapsed into one incident item. The handover presents the current state and latest meaningful update rather than retelling the full chronology.

## Grounding

Grounding is enforced in application code, not only through model instructions.

Structured observations reference their original event IDs.

Every free-text observation must include an exact quote from the source night log. The application checks that the quote actually exists in the submitted source text.

If the quote cannot be verified:

- the observation is rejected or quarantined;
- it cannot alter canonical incident state;
- a warning is recorded.

Every final handover item must contain at least one source-evidence reference. The application treats an evidence-free handover item as an invariant violation.

This prevents a fluent but unsupported model output from becoming operational truth.

## Use of AI

The model is used as an untrusted multilingual parser.

It helps extract:

- room identifiers;
- issue categories;
- normalized subject keys;
- operational observations;
- exact supporting quotes;
- ambiguity indicators.

The model does not own:

- canonical incident identity;
- canonical incident state;
- cross-night reconciliation;
- priority;
- handover section classification;
- final handover generation.

Those decisions remain in deterministic and testable application code.

## Handling incomplete input

Missing information is represented explicitly.

Examples include:

- unknown room;
- missing timestamp;
- unclear outcome;
- unknown resolution state.

The service does not infer missing values merely to make the handover appear complete.

Incomplete observations are included in the warning section when they may require operator review.

## Handling contradictory input

Contradictory observations are preserved with their source evidence.

The service does not hide contradictions using a generated summary or automatically assume that the most recent sentence is correct.

Where deterministic ordering and explicit resolution evidence are sufficient, the normal state reducer is applied.

Where the conflict cannot be resolved safely, the incident is flagged for review.

## Action-first presentation

The handover is organized by operational relevance rather than chronology.

Open and urgent items are shown before resolved or informational items.

Recommended actions are intentionally conservative. A generic follow-up instruction may be derived from the incident state, but specific actions, owners, room moves, refunds, vendor calls, or deadlines are shown only when supported by the source input.

## Structured logging

Logs are emitted as structured JSON and include fields such as:

- run ID;
- hotel ID;
- morning date;
- processing phase;
- observation ID;
- incident ID;
- reconciliation decision;
- deterministic reason code;
- source references;
- warning and incident counts;
- prompt version;
- configured model.

The logs record observable inputs, outputs, and application decisions. They do not record hidden model chain-of-thought.

## Deployment decision

I deployed the service as one stateless NestJS application on Railway.

The same application serves:

- the JSON API;
- the lightweight HTML interface;
- the health endpoint.

This keeps the deployment reproducible and easy to test with both a browser and `curl`.

No database is required for this implementation because each request contains the relevant historical input.

## Where AI helped most

AI helped most with:

- interpreting multilingual free text;
- identifying operational facts in inconsistent prose;
- separating multiple facts from one paragraph;
- producing normalized subject and category candidates;
- accelerating implementation and test generation within the timebox.

## Where AI got in the way

AI was less reliable when:

- asked to infer incident status from indirect wording;
- distinguishing progress from actual resolution;
- linking similar incidents;
- filling missing operational details;
- producing abstractions broader than the timebox required.

The response was to reduce the model’s authority, require exact evidence quotes, validate its output, and keep reconciliation deterministic.

## What I would do in hours 3–6

With another four hours, I would prioritize:

1. Add persistent incident and extraction-run storage.
2. Add idempotent source ingestion using content hashes.
3. Add a human review workflow for ambiguous incident links.
4. Expand golden and adversarial test fixtures.
5. Add explicit reopened-incident presentation.
6. Add model and prompt evaluation metrics.
7. Add hotel-specific priority and action policies.
8. Add source-level PII redaction and retention controls.
9. Improve operational monitoring and request tracing.
10. Add deployment smoke tests against the public URL.

## One thing that surprised me

`[TODO: replace this with an honest observation from the actual data or implementation.]`

Suggested example:

The hardest part was not translating or summarizing the free-text log. It was deciding whether two differently worded entries represented the same operational incident without merging unrelated problems. This made incident identity and evidence preservation more important than generating polished prose.

## Known limitations

- The implementation is stateless.
- Incident matching uses transparent deterministic heuristics rather than a trained matching model.
- Hotel-specific operational priorities are not yet configurable.
- Ambiguous observations may remain unlinked.
- The HTML page is intended as a utility view, not a production operations dashboard.
- `[TODO: add any actual implementation limitations discovered during testing.]`
