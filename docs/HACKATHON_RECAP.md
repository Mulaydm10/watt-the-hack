# Hackathon recap: WATT THE HACK Munich, 24 Oct 2026

Team NoIdea (Dhruv Mulay, Parth Deshmukh, Pratik Waghmode) · nuuEnergy challenge "Heat Pump Ready?"

## What we submitted

| Item | Where |
|---|---|
| Final pitch deck (10 slides) | [`submissions/pitch/NoIdea_HeatPumpReady_Pitch.pdf`](../submissions/pitch/NoIdea_HeatPumpReady_Pitch.pdf) |
| Detailed deck (19 slides) + sources and build scripts | [`submissions/pitch/`](../submissions/pitch/) |
| Demo video (2:56) | https://youtu.be/8AJnO8cEilY · render pipeline in [`submissions/video/`](../submissions/video/) |
| Code | this repository (made public after the submission) |
| Android app | Flutter app on the same backend; download page served at `/app` during the event |

## What we built, in order

1. **Engine** on nuuEnergy's technical guardrails: two heat-load methods combined by named rules, traffic light,
   four result areas, path to green. Calibrated on B-01 to B-03 (3/3 verdicts).
2. **Web app** (Hearth theme): landing with thermal pre-scan, result page, booking flow, sales dashboard.
3. **Sales layer**: tiers A–D in nuuEnergy's funnel, expected value, service area by postcode, subsidy rules.
4. **Agent backend**: conversation slots, profile with provenance, next-question logic, 27 tools, MCP server.
5. **Orchestrator** with Astra (`gpt-6-astra`, Responses API) and a guard against invented numbers or a changed verdict.
6. **ElevenLabs voice agent** with our orchestrator as custom LLM; 8 languages; "one moment" fillers.
7. **Photo AI and bill reader** (three-vote classifier; "a technician checks" when unsure).
8. **Live leads** dashboard with a map (exact building only with consent) and a printable briefing.
9. **Flutter Android app**, pitch deck, demo video, public download page with QR code.

## Demo infrastructure (all switched off on 25 Oct 2026)

| Piece | During the event | Now |
|---|---|---|
| Orchestrator API `:8787` | public via Tailscale Funnel (443) | stopped, Funnel off |
| Public web app build `:4173` | public via Tailscale Funnel (8443), built without any API key | stopped, Funnel off |
| MCP server `:8788`, Vite dev `:5173` | tailnet only | stopped |
| ElevenLabs agent | `agent_3601m5q14gwxf6ya187pqkh79t9z` | still exists in the ElevenLabs account; it fails without the backend |

To run it again, see [`services/README.md`](../services/README.md) and the README's "Run it" section.

## Lessons

- **"AI talks, rules decide"** kept the demo honest: the guard never had to step in during the live persona tests.
- **Voice latency** (about 5–8 s per turn) was the weakest point; a filler phrase helped, streaming would help more.
- **A 1-minute call is realistic:** on the 5 kit houses, 7–8 questions (year, area, yearly use + fuel, heating type,
  people, other heat source, pipe system) gave the same verdicts as the full interview. Not built yet.
- Never expose a Vite dev server publicly when `VITE_*` keys exist: they are bundled into the page.

## Follow-ups

- Rotate the OpenAI key that was pasted in chat during the event.
- Optional: delete or archive the ElevenLabs agent.
- Ideas from the "next" slide: learn from real visit outcomes, faster voice turns, bigger photo test sets, CRM hand-off.
