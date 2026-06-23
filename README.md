# Night-shift handover service

Stateless NestJS service that ingests structured front-desk events and multilingual free-text night logs, reconciles incidents across nights, and produces an evidence-grounded morning handover.

## Setup

```bash
npm install
cp .env.example .env
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default `3000`) |
| `OPENAI_API_KEY` | For night logs | API key for LLM extraction |
| `OPENAI_MODEL` | No | Model name (default `gpt-4o-mini`) |
| `OPENAI_BASE_URL` | No | OpenAI-compatible API base URL |
| `NODE_ENV` | No | `production` disables pretty logs |

## Local run

```bash
npm run start:dev
```

## Tests

```bash
npm test
```

Tests use a fake night-log extractor and never call a live LLM.

## Docker

```bash
docker build -t night-shift-handover .
docker run --rm -p 3000:3000 --env-file .env night-shift-handover
```

## Sample curl

Health:

```bash
curl -s http://localhost:3000/health
```

Handover (structured events only):

```bash
curl -s -X POST http://localhost:3000/handover \
  -H 'Content-Type: application/json' \
  -d @samples/handover-request.json
```

Handover with free-text night log (requires `OPENAI_API_KEY`):

```bash
curl -s -X POST http://localhost:3000/handover \
  -H 'Content-Type: application/json' \
  -d '{
    "hotelId": "lumen-sg",
    "timezone": "+08:00",
    "morningDate": "2026-05-28",
    "events": [],
    "nightLog": "Room 112 aircon — maintenance finally came to look at it tonight. 112 stays out of order for now."
  }'
```

## Architecture summary

1. **Structured normalization** — deterministic mapping from `events.json`-shaped records to evidence-linked observations.
2. **LLM extraction** — untrusted parser for free-text night logs; strict JSON schema + Zod validation.
3. **Grounding enforcement** — every night-log quote must exist verbatim in source text before acceptance.
4. **Reconciliation** — chronological, deterministic incident matching and state reduction.
5. **Handover projection** — mutually exclusive sections (`stillOpen`, `newTonight`, `newlyResolved`, `warnings`) with conservative actions.

The LLM never owns canonical incident state or final handover prose.

## Known limitations

- Stateless: each request must include full relevant history.
- No persistence, operator correction UI, or auth.
- LLM extraction quality depends on model and prompt; failures return structured-events-only partial handover with `extractionFailed: true`.
- Shift boundary assumes 23:00–07:00 local time labelled by morning date.
- Priority ordering is a simple ruleset, not learned ranking.

## Deployed URL

`https://YOUR_DEPLOYMENT_URL` — replace after deployment.
