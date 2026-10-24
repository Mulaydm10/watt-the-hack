# Heat Pump Ready? (nuuEnergy challenge, WATT THE HACK Munich)

Munich Climate Week, 24 Oct 2026, 09:00–19:00 CEST, Audimax München. One-day build.
Challenge: nuuEnergy's "Heat Pump Ready?" (track: Buildings & Everyday Energy). Submission 18:00, live demo for the jury.

**What it does.** A browser tool that gives a homeowner an honest first answer to "would a heat pump work in my home?":
green / yellow / red with a reason they understand, what the tool can't tell yet, what a technician must check on site,
and the yearly running cost. nuuEnergy's sales team sees the same result as a visit decision (call first, visit, or ask
for more info), so fewer technician visits fail on site. Missing data never makes a house red.

## Start here

| Read | For |
|---|---|
| [`PROBLEM_AND_APPROACH.md`](PROBLEM_AND_APPROACH.md) | The problem, what the organisers told us on site, the approach so far, open questions |
| [`docs/REFINED_APPROACH.md`](docs/REFINED_APPROACH.md) | The plan for the last hours: concept, ranked build list with lanes, 3-minute demo script, risks, data-source tests (incl. ETHOS.BUILDA) |
| [`app/README.md`](app/README.md) | How the engine and the app work, assumptions and limits, the sales side |
| [`docs/REFERENCES.md`](docs/REFERENCES.md) | The 13 sources behind the parameters and rules, mapped rule by rule |

## Live system (demo)

| What | Where | Notes |
|---|---|---|
| Voice agent (ElevenLabs) | https://elevenlabs.io/app/talk-to?agent_id=agent_3601m5q14gwxf6ya187pqkh79t9z | Female voice (Sarah), opens in German and English, follows the caller in de/en/fr/it/es/nl/pl/pt; one question at a time; all numbers and the verdict come from the engine through tools |
| Sales: live leads | web app → **Live leads** (`/#/live`), e.g. http://100.80.210.100:5173/#/live | Real leads from the voice agent and chat: traffic light, next step (A–D) with reasons, the four result areas, contact (only with consent), what was promised, status + notes, printable briefing. Sign in with the sales token (`SALES_TOKEN` in `services/.env` on the Mac) |
| Assistant API | https://dhruvs-mac-mini.tailaf7ebe.ts.net (public, Tailscale Funnel), `http://100.80.210.100:8787` (tailnet) | Homeowner endpoints for the phone app; contract in [`docs/APP_CLAUDE_PROMPT.md`](docs/APP_CLAUDE_PROMPT.md). Lead endpoints need the sales token |
| MCP tools | `http://100.80.210.100:8788/mcp` | The same tools for any MCP client |

How a call flows: caller → ElevenLabs (speech, voice) → our orchestrator as its custom LLM (Astra `gpt-6-astra` +
tools + a guard that blocks invented numbers or a changed verdict) → result and dated callback promise to the caller →
with consent, a sales report (JSON + summary) that appears in **Live leads**. Three demo leads (B-02, B-04, B-05 as
Peter, Helga and Anna, marked "demo") are seeded with `npx tsx services/orchestrator/scripts/seed-demo-leads.mts`.
The public Funnel address is for the demo only: turn it off afterwards with `tailscale funnel --https=443 off` on the Mac.

## Run it

```bash
npm install
npm run dev -w app
```

The app opens at http://localhost:5173. It works without an API key. For the AI helpers (radiator-photo check, bill
reader, plain-language summary), copy `app/.env.example` to `app/.env` and set a key. Never commit `.env`.
The assistant backend (orchestrator, MCP server) runs separately: see [`services/README.md`](services/README.md).

```bash
npm test
npm run build
```

Known issues (24 Oct, 15:00):
- `package-lock.json` only has the Mac native binaries. On Windows or Linux, if the build fails with
  "Cannot find module ../lightningcss.<platform>.node", delete `node_modules` and `package-lock.json`, run
  `npm install` again, and don't commit the regenerated lockfile.
- `npm test` ends with an error from the `app` workspace ("No test files found"): its tests moved to `packages/core`.
  At commit `7b8fb4c` all real tests pass: 80 in `packages/core`, 21 in `packages/agent`, 3 in `services/mcp-tools`,
  17 in `services/orchestrator` (live-AI tests skipped without a key). Live persona runs with Astra: B-04 yellow
  9.5 kW and B-02 green 9.9 kW, 0 guard fallbacks, about 6.8 s per turn.

## Results for the 5 buildings

Engine output at commit `cd3d1b3`. The 3 dev buildings come with nuuEnergy's reference values; the jury keeps the
references for B-04 and B-05 hidden.

| Building | Verdict (confidence) | Best estimate | Reference | Main reason |
|---|---|---|---|---|
| B-01 | green (low) | 9.8 kW | 9.6 kW, green | Moderate load; radiators likely fine at ≤ 55 °C; the bill looks too low |
| B-02 | green (high) | 9.9 kW | 9.7 kW, green | Moderate load; underfloor heating suits a heat pump |
| B-03 | yellow (high) | 16.6 kW | 14.5 kW, yellow | Radiators probably need 55–60 °C; 83 W/m² is on the high side |
| B-04 | yellow (medium) | 9.5 kW | hidden | Known obstacle: single-pipe heating system, a technician must check it |
| B-05 | yellow (low) | 10.4 kW | hidden | The data contradicts itself: consumption far too high for a 2006 house, 14 rooms in 125 m² |

All numbers come from the deterministic engine and the challenge's fixed guardrail values. AI never changes a verdict.

## Tech stack

| Layer | Tech |
|---|---|
| Calculation engine (`packages/core`) | TypeScript, pure functions with no machine learning; tested with Vitest |
| Agent logic (`packages/agent`) | TypeScript: questions, profile, state machine, tools, sales reports; sessions in SQLite (`node:sqlite`) |
| Orchestrator / API (`services/orchestrator`) | Node.js 26 with plain `node:http`, run via `tsx`; HTTP API, number/verdict guard, ElevenLabs bridge |
| Tool server (`services/mcp-tools`) | MCP SDK 1.32.1, over stdio or HTTP |
| AI model | OpenAI `gpt-6-astra`: Responses API for tool calling, Chat Completions for photos and PDFs; swappable to Claude or other OpenAI models by config |
| Voice | ElevenLabs Conversational AI with our orchestrator as its custom LLM; voice Sarah on `eleven_flash_v2_5` (multilingual); live transcripts over WebSocket |
| Web app (`app/`) | React 19, Vite 6, Tailwind CSS 4; Hearth theme with Fraunces, Geist and Geist Mono |
| Map | Leaflet 1.9.4 with OpenStreetMap tiles; addresses via OpenStreetMap Nominatim |
| Phone app | Flutter (Android) on the same backend API; tested with Maestro |
| Email reports | nodemailer (SMTP), built but not switched on yet |
| Hosting (demo) | Mac mini on Tailscale; public address via Tailscale Funnel for ElevenLabs and the phone app |
| Repo | npm workspaces monorepo; built with Claude Code |
| Pitch deck | HTML slides printed to PDF with headless Chrome (`submissions/pitch/`) |

## Repo map

| Path | What |
|---|---|
| `app/` | Vite + React UI: homeowner check and result, sales dashboard (demo houses), **Live leads** dashboard (real backend leads), expert-check flow, technician briefing |
| `packages/core/` | Engine, sales logic, AI calls, building data. Every number and verdict comes from here |
| `packages/agent/` | Conversation slots (ASK/ADAPT/PHOTO/TECH/SALES/CONTACT, de/en), profile with provenance, next-question logic, state machine, dynamic customer promises, sales report (file, e-mail, webhook), tools. Used by the orchestrator and MCP server |
| `services/mcp-tools/` | MCP server that exposes the same tools (stdio or HTTP) |
| `services/orchestrator/` | Voice/chat assistant backend: Astra tool loop with a number/verdict guard, multi-language following, HTTP API, ElevenLabs custom-LLM bridge, token-protected lead API behind **Live leads**. See [`services/README.md`](services/README.md) |
| `kit/` | Official challenge pages (`kit/docs/`), the 5 buildings (`kit/data/`), installer-labelled pipe photos (`kit/photos/`) |
| `docs/` | Refined approach, app spec, agent backend spec, pitch outline |
| `notes/` | `workflow.md` (append-only work log), `challenge.md` and `ai_onboarding_prompt.md` (older, partly out of date) |
| `submissions/` | Final deliverables |
| `data/`, `scratch/` | Local only (gitignored contents) |
| `src/` | Leftover from the scaffold; not used |

## Team rules

See [`GOVERNANCE.md`](GOVERNANCE.md). In short: the owner (Mulaydm10) decides scope and pitch; `notes/workflow.md` is
append-only; never commit secrets, `.env` files, API keys or raw datasets; small commits straight to `main`.

## Sources behind the rules

The parameters and rules are backed by public sources, mapped rule by rule in [`docs/REFERENCES.md`](docs/REFERENCES.md):
- **Building age never rules a home out:** Fraunhofer ISE measured 77 heat pumps in existing homes and found no
  correlation between construction year and efficiency (SPF 2.6–5.4); adequately sized radiators run almost as low as
  underfloor heating.
- **~55 °C is a screening reference, not pass/fail:** Verbraucherzentrale's rule of thumb (flow temperature below 55 °C
  most of the year); insulation, large heating surfaces and hydraulic balancing matter.
- **The exact heat load is checked room by room on site:** Umweltbundesamt Gebäudecheck and nuuEnergy's own process.
- **Questions and photo tasks** follow real installer intake (Enpal, Aira, thermondo, incl. thermondo's photo guide).
- **Address and age data are estimates to confirm:** ETHOS.BUILDA (ODbL), TABULA/EPISCOPE, Census 2022.
- **All formulas and prices** come from nuuEnergy's Technical Guardrails.

## Data and credits

The 5 buildings, photos and guardrail values are from nuuEnergy's challenge kit. If we add address-based data
(ETHOS.BUILDA, ODbL, or open aerial imagery), the app shows the source and credit next to each value.
