# Heat Pump Ready? Problem statement and approach so far

Team brief for humans and AI agents joining the nuuEnergy challenge (WATT THE HACK, Munich, 24 Oct 2026).
Last updated: 24 Oct 2026, ~14:45 CEST, by Paul (written with Claude).

## How to read this (especially if you are an AI agent)

- **Part A is the ground truth:** the problem, the rules, the data, the judging. Everything in it comes from the
  official challenge pages (`kit/docs/`) or from what the organisers told us on site (marked as such).
- **Part B is our current direction**, not a requirement. If you were asked to think from zero: read Part A, write
  down your own approach (what would you build by 18:00, and why), then read Part B and compare. Push back where
  the evidence supports a different plan.
- **Part C lists open questions.** Don't silently assume an answer; scope decisions belong to the repo owner
  (Mulaydm10, see `GOVERNANCE.md`).
- Some older notes are out of date: `notes/challenge.md` still says "angle TBD", and `notes/ai_onboarding_prompt.md`
  says code lives in `src/`. Code actually lives in `app/` (UI) and `packages/core/` (engine, sales logic, AI).

---

## Part A: The problem

### A1. The official brief (written, from nuuEnergy)

**In one sentence:** build a browser tool that gives a homeowner an honest first answer to "would a heat pump work in
my home?" in under 3 minutes, using only what they already have, and says clearly what a technician still has to check.

**Why it matters:** millions of homes still heat with gas or oil. Heat pumps work in far more existing houses than
people think, but most homeowners never get past the first question. Many wrongly assume they need underfloor heating
or a full renovation. Today only a technician visit answers it, which costs time and money on both sides, and
sometimes the technician only finds out on site that it won't work without major changes.

**Inputs the homeowner has:** energy bill, building age, heating system, address, a few smartphone photos.

**What the result must say:**
1. Ready or not: green / yellow / red, with a reason a normal person understands.
   - Green: likely suitable based on the available information.
   - Yellow: potentially suitable, but important checks remain, or there is less data.
   - Red: insufficient evidence for a positive assessment.
2. What's still open: what the tool can't tell, and what a technician must check on site.

**The rule that matters most:** missing data does not mean a house is unsuitable. The tool must clearly separate
"there is an obstacle" from "we can't tell yet from this data". The brief says a tool that admits "I can't tell, a
technician must check X and Y" beats one that returns a confident wrong number.

**Fixed numbers:** `kit/docs/Technical_Guardrails.txt` is the source of truth, so all teams are comparable:
- Heat load, method A: floor area × W/m² by building age (before 1979 unrenovated 120–180; 1980s–90s 80–120;
  renovated or built 2002+ 40–60; low-energy / new build 15–40).
- Heat load, method B: consumption in kWh (1 L oil ≈ 10 kWh, 1 m³ gas ≈ 10 kWh) × 0.88 boiler efficiency,
  minus ~1,000 kWh hot water per person, ÷ ~2,000 full-load hours.
- Above ~75 W/m², insulation or windows may be worth it (a hint for the result).
- Heat-pump efficiency (JAZ): underfloor 4.0, radiators up to 55 °C 3.5, radiators 55–60 °C 2.8.
- Fixed prices: heat-pump electricity 26 ct/kWh, gas 11 ct/kWh, oil 1.70 €/L.
- Some items are always for a technician (see the guardrails file, section 4).

**Deliverables (due 18:00 today; jury 18:00–19:00, winners at 19:00):**
1. A working prototype that runs locally in a standard browser.
2. Results for the evaluation buildings, shown in the pitch. The deliverables page says 3, but the data has 2 (B-04, B-05).
3. A live demo, not slides.
4. Bonus, if time permits: (a) read an uploaded energy bill automatically (consumption, carrier, costs);
   (b) flag installation risks from photos, e.g. where the outdoor unit could realistically go.

**Judging (100 points):**

| Criterion | Points |
|---|---|
| Technical execution and reliability: does it work, are calculations plausible, does it handle different houses? | 25 |
| Problem-solution fit and user value: does it solve the homeowner's real problem, is it understandable and actionable? | 25 |
| Explainability and handling uncertainty: transparent assumptions, flags missing info, avoids misleading conclusions | 20 |
| Innovation and smart use of technology: AI used meaningfully, not as a gimmick | 15 |
| Feasibility and scalability: could it become a product and work across many homes without manual effort? | 15 |

### A2. What the organisers told us on site (verbal, not in the written brief)

Reported by Paul after talking to the track organisers at about 14:15. The numbers are what they said; we have not
seen data behind them.

- **nuuEnergy's funnel:** free consultation → a lead arrives with some data → the sales team talks to the lead →
  sales sends a technician to the house.
- **About 15% of technician visits can't proceed.** The causes are location and area factors, plus "random" factors
  that are often small things.
- **Every failed visit wastes technician time and labour.** Their goal is to save that money and push the 15% toward zero.
- **They want an AI-assisted system that verifies the decision factors before the visit.** Examples they mentioned:
  AI looking at the 3D / aerial view of the house from Google Maps, and a dataset that can tell how old a house is
  "and other factors" (we didn't catch its name; the Zensus 2022 grid in B4 is a likely candidate).

**Our reading (an interpretation, not their words):** the paying customer is nuuEnergy's sales and operations team.
The homeowner check is the front door that produces better-qualified leads. The jury still scores against the
written brief (A1), so a winning demo probably needs both stories.

**Still worth asking the organisers:** what one failed visit costs; which causes make up the 15%; visits per month;
what data a lead arrives with today.

### A3. The data: 5 buildings

Files: `kit/data/` (originals), `packages/core/src/data/` (copy the code uses), `kit/photos/` (5 installer-confirmed
radiator-pipe photos, file names give the true label: single-pipe, two-pipe, can't tell).

| ID | Set | Built | m² | Heating | Fuel / year | Pipe | What it tests | Reference |
|---|---|---|---|---|---|---|---|---|
| B-01 | dev | 2001 | 195 | radiators | LPG 10,000 kWh | unknown | Radiators can be fine (good U-values given by owner) | 9.6 kW, green |
| B-02 | dev | 2005 | 180 | underfloor (+1 radiator) | gas 15,500 kWh | unknown | Bill understates demand: wood stove all winter, solar hot water | 9.7 kW, green |
| B-03 | dev | 1970 | 200 | radiators | oil 40,000 kWh (≈4,000 L) | two-pipe | Old but maybe: partly renovated, 12 valves to replace, top floor unused | 14.5 kW, yellow |
| B-04 | eval | 1987 | 160 | radiators | oil 25,000 kWh (≈2,500 L) | **single-pipe** | A confirmed obstacle; semi-detached house | hidden |
| B-05 | eval | 2006 | 125 | mixed (underfloor + 8 radiators) | gas 27,000 kWh | unknown | Data contradicts itself: ~216 kWh/m² for a 2006 house, 14 rooms in 125 m² | hidden |

Patterns: no house gives a flow temperature (the most important unknown); pipe system is unknown in 3 of 5; the
locations are only "Munich area (85xxx)" style, so **there are no street addresses**. Address-based checks can't be
validated on this dataset; a demo needs an address you're allowed to show.

### A4. Non-negotiables

- Honesty: unknown never means red; never invent numbers; show assumptions and sources.
- Use the guardrail numbers above.
- Fairness and privacy: never use demographic data (age, nationality, income, etc.) to judge a lead or a house.
- The browser demo must work without an API key (AI features need fallbacks).
- Never commit secrets, `.env` files or API keys.

---

## Part B: Approach so far (as of ~14:45)

### B1. What exists and works

**`packages/core/`**: shared TypeScript logic, pure functions, no UI. 80 tests pass (5 live-AI tests skipped without a key).
- `engine/assess.ts`: sanitize inputs → heat load (methods A and B, combined by named rules: other heat source means
  the bill is a lower bound; implausibly low bill is distrusted; partial renovation or unused floor means trust the bill)
  → radiators, flow temperature and JAZ → flags in separate kinds (obstacles, can't-tell-yet, contradictions,
  technician checks) → verdict. Unknowns alone never give red. All constants with sources in `engine/constants.ts`.
- `engine/pathToGreen.ts`: simulates positive technician checks through the same engine ("what would turn this green").
- `engine/areas.ts`: groups the result into 4 result areas.
- `sales/visitDecision.ts`: lead tiers A (send a technician), B (30-min technical call), C (ask for missing info first),
  D (not now), from the technical result plus the homeowner's own answers (owner/tenant, timeline, boiler age).
  Also a remote pre-check (meter cabinet, outdoor spot, boiler room, radiator photos) and the nuuEnergy service area
  (Greater Munich, Greater Hamburg, Lower Bavaria).
- `ai/`: one switchable LLM interface (Claude / OpenAI / Astra). Pipe-photo classifier, bill reader, and a
  plain-language rephrase that is rejected if it contains any number the engine didn't produce. According to commit
  `fb72e4f`, a leave-one-out eval on the 5 photos gave 4/5 correct and 0 confidently wrong (not re-run for this brief).

**`app/`**: Vite + React UI. Homeowner wizard and result page; a sales dashboard and a technician briefing page;
the URL hash switches between homeowner and sales views.

**Current results** (engine at commit `8c49c98`):

| ID | Verdict (confidence) | Best estimate | Reference | Main reason |
|---|---|---|---|---|
| B-01 | green (low) | 9.8 kW | 9.6 kW, green | Moderate load (50 W/m²); radiators likely fine at ≤ 55 °C |
| B-02 | green (high) | 9.9 kW | 9.7 kW, green | Moderate load; underfloor suits a heat pump |
| B-03 | yellow (high) | 16.6 kW | 14.5 kW, yellow | Radiators probably need 55–60 °C; 83 W/m² is on the high side |
| B-04 | yellow (medium) | 9.5 kW | hidden | Strong warning: single-pipe system (deliberately yellow, see `SINGLE_PIPE_VERDICT`) |
| B-05 | yellow (low) | 10.4 kW | hidden | Data contradiction: consumption far above what a 2002+ building suggests |

**Known setup issue:** `package-lock.json` was generated on a Mac and lists only the Mac binaries for lightningcss
and Tailwind's native engine. A clean `npm ci` on Linux (and probably Windows) installs fine, but `npm run build`
and the app's test run fail with "Cannot find module ../lightningcss.<platform>.node". Fix on such a machine: delete `node_modules` and
`package-lock.json`, then run `npm install`. Verified on Linux: after that, all tests pass and the build succeeds.

### B2. Written as specs, not built yet

- `docs/APP_SPEC.md` (v1.1): customer app (chat or guided form, photo upload via SMS link, resume later, consent),
  sales dashboard, printable technician briefing, accessibility for older users.
- `docs/AGENT_BACKEND_SPEC.md` (v0.2): a conversational assistant with MCP tools, an orchestrator, an HTTP API and
  ElevenLabs voice. §4.6 maps a teammate's ~50-item question list to modes: ASK / ADAPT / PHOTO / TECH / SALES.
- There is no backend or server code in the repo yet.

### B3. Evidence we gathered

**1. Which inputs actually change the verdict (sensitivity test).** For each of the 5 houses, each engine input was
set to "unknown" and to plausible alternatives (±25–30% for numbers, other options for choices), and the verdict
compared. Run on the engine at commit `b7d6f29`; the 14:28 refactor added rules, but the 5 baseline verdicts are unchanged.

| Input | Finding | Implication |
|---|---|---|
| Energy bill | Without it, all 5 houses turn yellow whatever else is answered; B-01 widens from 9.8 kW to a 7.8–23.4 kW range; a 30% guess error flips B-03 to green | The most valuable input. A bill photo beats a typed guess |
| Year built | Moves the result most: B-01/B-02 go red if built in the 1950s–70s, yellow if 1980s–90s | Must ask. Decade is fine, except near the band edges (1979, 2002); B-01 (2001) sits on one |
| Pipe system | Single-pipe → yellow; B-04 would be green with two-pipe | Ask only for radiator houses, by photo or "unsure" |
| Flow temperature | At 65 °C, 4 of 5 turn red; unknown breaks nothing | Ask only "if you know it" |
| Floor area | Unknown drops B-01/B-02 to yellow; ±25% changes nothing | Ask; a rough guess is fine |
| Wood stove / unheated floors | Shifts the kW estimate up to 46%, no flips | Two yes/no taps beat free text |
| People, hot water | ≤ 16% kW shift, no flips | Cheap to ask; low impact |
| Renovation status | No flips; without a bill it never rescues a yellow | Optional |
| Rooms | Only matters for contradictions (B-05) | Optional |
| Fuel, emitter type | No flips, but needed for unit conversion, costs and skipping questions | Keep, one tap each |

Rough time budget: asking all ~51 items of the teammate list would take a homeowner about 10–15 minutes
(estimate: ~5 s per tap, ~40 s per photo, ~1 min to find the bill). About 11 core questions take ~2–2.5 minutes.
Note that the specs use different targets: the brief says under 3 minutes, `AGENT_BACKEND_SPEC.md` aims at ~9 spoken
questions in ~5 minutes, and `APP_SPEC.md` says under 10 minutes.

**2. Likely reasons a technician visit fails.** These are hypotheses to check with the organisers, not data:
- No workable spot for the outdoor unit, or too close to neighbours (noise). Semi-detached and terraced houses are the
  risk; German noise rules (TA Lärm) are strictest at night in residential areas.
- Listed building or protected ensemble.
- The area is planned for district heating.
- The house isn't what the customer described (age, size, use).
- An old meter cabinet means a surprise upgrade cost.
- Single-pipe heating or radiators that need high temperatures.
- The person can't decide alone (tenant, co-owner, owners' association).

**3. Address-based data sources** (researched 24 Oct by reading the providers' pages; **none tested from a browser
yet**, so CORS is unknown; Vite's dev-server proxy is the fallback):

| Source | What it gives | Access | Caveats |
|---|---|---|---|
| OpenStreetMap (Overpass API) | Building outlines → detached / semi / terraced (shared walls), distance to neighbouring buildings | Free | Coverage and accuracy vary |
| Bavarian Denkmal-Atlas (BLfD) | Listed buildings and ensembles | WMS `http://geodaten.bayern.de/ogc/ogc_denkmal.cgi`; layers incl. `einzeldenkmalO`, `bauensembleO`; no fee, © BLfD | Bavaria only; feature lookup at a point not verified |
| Zensus 2022, 100 m grid | Per grid cell: buildings by construction period (before 1919 … 2020+), heating type, heating fuel | Esri-hosted copy: `https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/Zensus2022_grid_final/FeatureServer/0` (query → JSON / GeoJSON) | A neighbourhood statistic, not the individual house. **Also has demographic fields: do not use them** |
| Munich heat plan | Zones incl. district-heating expansion areas and air-source heat-pump suitability areas | Map viewer: `geoportal.muenchen.de/portal/waermeplan/` | Munich only; non-binding; no API found |
| Bavarian LoD2 3D building models | Building heights and roof shapes | Open data, CityGML download | Heavy files; no construction year |
| Google Maps Platform (Solar API, 3D tiles, Street View) | Roof and building geometry, imagery for an AI to look at | Needs a billing-enabled API key | For EEA billing accounts since 8 Jul 2025, Solar `buildingInsights` omits some address fields; coverage for small towns unverified |

**4. A pitch line we liked (not decided):** "15% of your visits fail on site. We catch them before the van leaves."
Savings = visits per month × 15% × share we catch × cost per failed visit (the numbers have to come from nuuEnergy).

---

## Part C: Open questions

1. **Scope vs. time.** The specs describe a voice agent, an MCP backend, a customer app, a dashboard and a technician
   view. The jury needs a working browser demo with B-04/B-05 results at 18:00. What is the smallest demo that tells
   both stories: the homeowner's honest answer and fewer wasted visits?
2. **Time target:** 3 minutes (brief) vs. ~5 minutes (agent spec) vs. 10 minutes (app spec). Which do we claim?
3. **Address checks:** build any today? If yes, which, and which demo address can we show?
4. **Single-pipe:** currently yellow with a strong warning. Red is also defensible. Which fits "obstacle vs. can't tell"?
5. **Wall or ceiling heating:** treat it like underfloor (low temperature)? This is pending in the agent spec.
6. **B-01 is green with low confidence.** Is that the honest message, or should low confidence cap the result at yellow?
7. What failed-visit numbers can we still get from the organisers before the pitch?

Recommended answers, ranked build list and demo script: [`docs/REFINED_APPROACH.md`](docs/REFINED_APPROACH.md) (24 Oct, ~15:20).

---

## Where things are

| Path | What |
|---|---|
| `kit/docs/` | Official challenge pages as text (mission, guardrails, data, deliverables, evaluation) |
| `kit/data/`, `kit/photos/` | Official buildings and labelled pipe photos |
| `kit/CLAUDE_BRIEF.md`, `kit/SALES_BRIEF.md` | Earlier build briefs |
| `packages/core/src/` | Engine, sales logic, AI calls, data (all logic and numbers) |
| `app/` | Browser UI (`npm install`, then `npm run dev -w app`); see `app/README.md` |
| `docs/APP_SPEC.md`, `docs/AGENT_BACKEND_SPEC.md` | Product and backend specs |
| `docs/pitch_outline.md` | Pitch outline (still nearly empty) |
| `notes/workflow.md` | Append-only work log |
