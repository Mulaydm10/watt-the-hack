# Backend services

Spec: `docs/AGENT_BACKEND_SPEC.md`. App contract: `docs/APP_SPEC.md` §10.

| Piece | Path | What it does |
|---|---|---|
| Core engine | `packages/core` | Deterministic assessment, sales tiers, offer/subsidy rules, AI helpers (shared with the web app) |
| Agent domain | `packages/agent` | Slot catalogue (questions, modes, en/de), profile + validation + read-back, next-question logic, state machine, tools, outcomes, sales report, SQLite store |
| MCP server | `services/mcp-tools` | The same tools over MCP (stdio or Streamable HTTP `/mcp`) |
| Orchestrator | `services/orchestrator` | Astra tool loop + guard + HTTP API for any front end |

## Setup
```bash
npm install                      # at repo root (workspaces)
cat > services/.env <<'X'        # gitignored
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-6-astra            # uses the Responses API automatically (needed for tools)
PUBLIC_BASE_URL=http://<host>:8787
# optional: SALES_WEBHOOK_URL=https://...   LLM_REASONING_EFFORT=low
X
```

## Run
```bash
npx tsx services/orchestrator/src/server.ts             # HTTP API on :8787
npx tsx services/mcp-tools/src/server.ts                 # MCP over stdio
npx tsx services/mcp-tools/src/server.ts --http 8788     # MCP over HTTP at :8788/mcp
```
Data (sessions DB, uploads, reports) goes to `services/data/` (gitignored). Sales reports: `services/data/reports/<lead>.json|.md`.

## HTTP API (orchestrator)
`POST /sessions {channel, lang}` → greeting · `POST /sessions/:id/messages {text}` → reply, state, progress, suggested answers ·
`POST /sessions/:id/photos?kind=meter_cabinet|radiator|outdoor|boiler_room|access|bill|certificate` (raw image/pdf body) ·
`GET /sessions/:id/photos/:pid` · `GET /sessions/:id/result` · `GET /sessions/:id` · `POST /sessions/:id/pause` ·
`POST /sessions/resume {resume_code}` · `GET /slots?lang=de|en` · `GET /leads/:id/report` · `GET /upload/:sessionId` (photo page) · `GET /health`

## Tests
```bash
npm test --workspaces --if-present                        # all unit tests (no AI)
cd services/orchestrator && LIVE_AI=1 npx vitest run test/persona.eval.test.ts   # live Astra vs simulated homeowner
```
