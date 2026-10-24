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
  At commit `009214e` all real tests pass: 80 in `packages/core`, 21 in `packages/agent`, 3 in `services/mcp-tools`,
  13 in `services/orchestrator` (7 live-AI tests skipped without a key).

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

## Repo map

| Path | What |
|---|---|
| `app/` | Vite + React UI: homeowner check and result, sales dashboard, expert-check flow, technician briefing |
| `packages/core/` | Engine, sales logic, AI calls, building data. Every number and verdict comes from here |
| `packages/agent/` | Conversation slots, profile, state machine, sales report. Tested; not used by the UI yet |
| `services/mcp-tools/` | MCP server that exposes the engine as tools. Tested; not used by the UI yet |
| `services/orchestrator/` | Voice/chat assistant backend: Astra tool loop with a number/verdict guard, HTTP API, ElevenLabs bridge. Tested; not used by the web app yet. See [`services/README.md`](services/README.md) |
| `kit/` | Official challenge pages (`kit/docs/`), the 5 buildings (`kit/data/`), installer-labelled pipe photos (`kit/photos/`) |
| `docs/` | Refined approach, app spec, agent backend spec, pitch outline |
| `notes/` | `workflow.md` (append-only work log), `challenge.md` and `ai_onboarding_prompt.md` (older, partly out of date) |
| `submissions/` | Final deliverables |
| `data/`, `scratch/` | Local only (gitignored contents) |
| `src/` | Leftover from the scaffold; not used |

## Team rules

See [`GOVERNANCE.md`](GOVERNANCE.md). In short: the owner (Mulaydm10) decides scope and pitch; `notes/workflow.md` is
append-only; never commit secrets, `.env` files, API keys or raw datasets; small commits straight to `main`.

## Data and credits

The 5 buildings, photos and guardrail values are from nuuEnergy's challenge kit. If we add address-based data
(ETHOS.BUILDA, ODbL, or open aerial imagery), the app shows the source and credit next to each value.
