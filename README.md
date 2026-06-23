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
| `PORT` | No | HTTP port (default `3000`; Railway injects this) |
| `NODE_ENV` | No | Set `production` in deployed environments |
| `LOG_LEVEL` | No | Pino log level (default `info` in production) |
| `OPENAI_API_KEY` | For night logs | API key for LLM extraction |
| `OPENAI_MODEL` | No | Model name (default `gpt-4o-mini`) |
| `OPENAI_BASE_URL` | No | OpenAI-compatible API base URL |
| `NODE_ENV` | No | `production` disables pretty logs |

## Local run

```bash
npm run start:dev
```

The browser UI and JSON API run from the same NestJS process — no separate frontend server.

| Route | Purpose |
|-------|---------|
| `GET /` | Redirects to `/ui/` |
| `GET /ui/` | Handover utility form (static HTML) |
| `GET /health` | Health probe |
| `POST /handover` | Handover JSON API |

Open [http://localhost:3000/ui/](http://localhost:3000/ui/) after starting the service.

### Using the browser UI

1. Enter **Hotel ID**, **Morning date**, and **Timezone** (`+08:00` for Asia/Singapore).
2. Paste structured **events** as a JSON array (validated before submit).
3. Optionally paste a **night log** for LLM extraction (requires `OPENAI_API_KEY` on the server).
4. Click **Generate handover** — the submit button disables while the request is in flight.
5. Use **Load sample data** to populate the form from bundled `public/sample-request.json`.
6. Use **Reset** to clear results and restore default field values.

Results appear in action-first sections: still open, new tonight, newly resolved, then incomplete/contradictory entries. Each item shows priority, status, dates, recommended action, and warnings when present. **Evidence** for every item is in a collapsible `<details>` block — expand to see event IDs, source type, paragraph/line references, and exact quotes (original language preserved). The audit section at the bottom shows rendered handover text and raw JSON with a **Copy JSON** button.

Invalid events JSON, missing required fields, and API errors are shown inline; nothing fails silently.

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

`https://YOUR_RAILWAY_DOMAIN` — replace after Railway deployment and verification.

## Railway deployment

1. Create a [Railway](https://railway.app) project.
2. Connect this GitHub repository.
3. Railway builds from the root `Dockerfile` (`railway.toml` sets health check to `/health`).
4. Add environment variables in the Railway dashboard:

   | Variable | Required | Notes |
   |----------|----------|-------|
   | `PORT` | No | Railway sets this automatically |
   | `NODE_ENV` | Yes | `production` |
   | `LOG_LEVEL` | No | Default `info` |
   | `OPENAI_API_KEY` | For night logs | Required for free-text extraction |
   | `OPENAI_MODEL` | No | Default `gpt-4o-mini` |
   | `OPENAI_BASE_URL` | No | OpenAI-compatible API base URL |

5. Set the service health-check path to `/health`.
6. Generate a public domain in Railway networking settings.
7. Verify the deployment:

```bash
curl -s https://YOUR_RAILWAY_DOMAIN/health
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR_RAILWAY_DOMAIN/ui/
curl -s -X POST https://YOUR_RAILWAY_DOMAIN/handover \
  -H "Content-Type: application/json" \
  --data-binary @samples/handover-request.json
```

8. Open `https://YOUR_RAILWAY_DOMAIN/ui/` in a browser to use the demo UI.

No database or additional Railway services are required.

## Local Docker smoke test

```bash
docker build -t vouch-handover .
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e OPENAI_API_KEY=your-key-here \
  -e OPENAI_MODEL=gpt-4o-mini \
  vouch-handover

curl -s http://localhost:3000/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ui/
curl -s -X POST http://localhost:3000/handover \
  -H "Content-Type: application/json" \
  --data-binary @samples/handover-request.json
```

Invalid request (expect HTTP 400):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/handover \
  -H "Content-Type: application/json" \
  -d '{"hotelId":"x"}'
```

