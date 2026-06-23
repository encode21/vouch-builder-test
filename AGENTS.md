# AGENTS.md

## Project purpose

This repository implements the Vouch Builder Test: a trustworthy night-shift handover service for hotel morning managers.

The service ingests structured events and multilingual free-text night logs, reconciles incidents across nights, and produces an action-first handover.

## Highest-priority invariants

1. Every handover statement must reference source evidence.
2. Missing or contradictory information must be surfaced, never silently completed.
3. The LLM is an untrusted text parser, not the owner of canonical incident state.
4. Incident reconciliation, state transitions, and handover classification must remain deterministic and testable.
5. “Technician attended” or “progress made” must not automatically mean “resolved”.
6. Do not hardcode behaviour to the supplied sample hotel, rooms, events, or wording.

## Scope

This is a two-hour implementation slice.

Prefer:

- a modular NestJS monolith;
- stateless request processing;
- strict runtime validation;
- simple deterministic reconciliation;
- JSON structured logging;
- focused tests;
- Docker deployment.

Avoid unless explicitly required:

- databases;
- queues;
- microservices;
- vector databases;
- frontend polish;
- multi-agent workflows;
- speculative production infrastructure.

## AI boundary

The free-text extractor may produce evidence-linked observation drafts.

Every free-text observation must include an exact source quote. Application code must verify that the quote exists in the original input before accepting the observation.

The model must not generate the final handover or decide canonical incident history.

## Development commands

Use the commands defined in `package.json`.

Before considering a task complete, run:

```bash
npm run format
npm run lint
npm run build
npm test
```

Adjust commands only when the repository uses a different package manager or scripts.

## Change discipline

- Preserve existing work.
- Keep changes small and reviewable.
- Do not squash commit history.
- Do not hide incomplete behaviour.
- Update `README.md` and `DECISIONS.md` when assumptions or tradeoffs change.
