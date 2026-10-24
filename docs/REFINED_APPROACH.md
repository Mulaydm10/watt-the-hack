# Refined approach: Heat Pump Ready? (nuuEnergy)

Written 24 Oct 2026, 15:00–15:20 CEST, by Parth (with Claude). The repo owner (Mulaydm10) makes the final calls.

Basis: Part A of `PROBLEM_AND_APPROACH.md`, `kit/docs/`, the code at commit `cd3d1b3`, and checks run on a Windows
laptop between 14:46 and 14:58 CEST. Tests were re-run at `009214e` after the owner pushed new backend commits. I wrote a from-zero plan before reading Parts B/C (summary in Appendix B).
Addendum (15:05–15:10): an evaluation of the ETHOS.BUILDA building dataset (section 3 and Appendix C).

**Where the numbers come from.** Every number below is tagged:
[E] engine output at `cd3d1b3`, printed for all 5 buildings ·
[T] `npm test` ·
[G] `kit/docs/Technical_Guardrails.txt` ·
[O] what the organisers said on site (Part A2) ·
[M] my own measurement from this laptop, 24 Oct, 14:47–15:20 CEST ·
[C] a named commit message or file.
Assumptions are marked **Assumption**. Clock times and time boxes are plans, not claims.

---

## 0. What is built vs. what is only a spec

| Status | What |
|---|---|
| **Built, verified today** | Engine in `packages/core` (heat load A+B, radiators/JAZ, four flag kinds, verdict, path to green). Homeowner wizard (3 steps) and result page. Sales dashboard (tiers A–D), "free expert check" pre-check flow, technician briefing. At commit `009214e`, 117 tests pass and 7 live-AI tests are skipped without a key [T]. Build passes after the lockfile fix [M]. |
| **Built, but the web app doesn't use it** | `packages/agent` (slots, profile, state machine, outcomes, sales report), `services/mcp-tools` (MCP server), and, pushed by the owner at 15:00–15:08 while I worked, `services/orchestrator`: an Astra tool loop with a number/verdict guard, an HTTP API with a photo upload page and pause/resume, sales reports by e-mail (off until SMTP is set), and an ElevenLabs custom-LLM bridge [C `ce6c6f7`, `8e183e7`, `009214e`]. At 15:19 also an ElevenLabs agent setup script and caller-language switching, de/en [C `c015c2e`, `b10b940`]. It needs an LLM key in `services/.env`; voice also needs an ElevenLabs account. |
| **Built, but needs an API key (none on this laptop)** | Photo classifier, bill reader, plain-language rephrase. Without a key the photo step shows 3 fallback questions and the result shows "AI helper is off" [M]. |
| **Spec only** | Chat UI inside the web app, SMS photo link, location module (stub only: postcode → service area and subsidy region). Whether a live ElevenLabs agent or phone number exists: unknown. |

---

## 1. The problem

Homeowners can't easily find out whether a heat pump would work in their home: today only a technician visit
answers it, and many wrongly assume they need underfloor heating or a full renovation. nuuEnergy pays for that
uncertainty too: the organisers told us about 15% of technician visits can't proceed on site [O], often because of
location factors or small things nobody checked beforehand. So the tool must give the homeowner an honest first
answer from what they already have, say clearly what it can't tell, and let the same answer stop a wasted visit
before the van leaves.

## 2. The concept we pitch

**One transparent rules engine, two doors.** The homeowner gets green / yellow / red in under 3 minutes, with a plain
reason, the yearly running cost, and a clear split between "there is an obstacle" and "we can't tell yet". nuuEnergy's
sales team gets the same result as a visit-readiness check: which known no-go causes are already cleared, and whether
the house matches what the homeowner said, before a technician drives out. Open building data (ETHOS.BUILDA) and AI
(photos, bills) only pre-fill or flag things for a person to confirm; they never change the verdict.

| Criterion (points) | How we score | Evidence today |
|---|---|---|
| Technical execution (25) | Deterministic engine on the guardrail numbers; both heat-load methods shown side by side; bad input becomes "unknown", never a bad value | Dev buildings 2%, 2% and 14% off the reference, all on the expected colour [E]; 117 tests pass [T] |
| Problem-solution fit (25) | Short check, plain reason, yearly cost, a next step; sales sees who needs a call, a visit or more info first | Wizard has 12 fields in steps 1–2 plus optional photos [M]; sales tiers A–D [C `app/README.md`] |
| Explainability and uncertainty (20) | Obstacles, can't-tell-yet and contradictions are kept apart; unknown never makes red; assumptions table with sources; path to green; every building-data value shows its source and says when it is a machine-learning estimate | B-04 yellow with a named obstacle; B-05 yellow, low confidence, with 3 contradictions [E] |
| Innovation and AI (15) | AI only where it removes work: pipe photo (few-shot on the 5 installer-labelled photos, abstains below 70%), bill reader, and open building data cross-checked against the homeowner's answers. Optional: aerial outdoor-unit hint. A guard rejects any number the engine didn't produce | Leave-one-out photo eval 4/5 correct, 0 confidently wrong [C `fb72e4f`, not re-run today] |
| Feasibility and scale (15) | No manual work per house; rules and company inputs are editable; building-level open data for every residential building in Germany (ETHOS.BUILDA, ODbL); the engine is already exposed as MCP tools for a chat or phone channel | ETHOS.BUILDA files checked, one CSV per state (Appendix C) [M]; MCP tests pass [T] |

---

## 3. Keep, change, cut

**Keep**
- **The engine.** It matches the 3 dev references on colour and within 14% on kW [E]. Rewriting it now only adds risk.
- **The four flag kinds and "unknown never red".** This is the heart of criterion 3 and the brief's main rule.
- **Path to green.** It shows what a positive technician check would change. That is honest and useful.
- **Sales dashboard, pre-check flow and briefing.** They already tell nuuEnergy's story: B-04 gets "30-min call first",
  B-05 gets "ask for missing info first" [M, sales view].
- **AI behind one interface, with guards.** No new numbers, never overrides stated data, abstains below 70% [C `app/README.md`].
- **The agent, MCP and voice backend: the owner's lane.** Built today, in its own files (`services/`, `packages/agent`),
  which no other lane touches. In the 3-minute demo it gets one sentence, or a 20-second live exchange only if it ran
  end to end twice by 17:15. *Reason:* at about 6.8 s per turn [C `8e183e7`], a full spoken check doesn't fit next to
  B-04, B-05 and the sales view, and it adds three live dependencies (LLM key, network, ElevenLabs).

**Change**
- **Make the 15% visible.** Add a visit-readiness panel to the sales view, built on the guardrails' no-go list
  (single-pipe, no outdoor-unit spot, heat load too high) plus meter cabinet and data contradictions [G]. Today the
  sales view shows tiers and an expected value, but not "which visit risks are already checked".
- **Result page order.** Put "what's still open" right under the verdict. Today the "can't tell yet" list sits below
  path to green, the plain-words box, heat load and costs, so a homeowner scrolls a long way to find it [M].
- **Address checks: two, instead of the six sources in Part B3.** First, ETHOS.BUILDA: the address pre-fills the year and house type for the
  homeowner to confirm, and sales gets "check before the visit" when the answers and the data disagree (see the
  verdict below). It matches the organisers' "dataset that can tell how old a house is" [O] and runs offline from a
  small slice. Second, only if a fourth person or agent is free: an aerial photo plus an AI hint about outdoor-unit
  space. The organisers asked for AI on the aerial view [O] and it is bonus (b), but it needs a key and the network on
  stage. Otherwise it is the "next step" in the pitch. Neither ever changes the traffic light.
- **One time claim: "under 3 minutes".** That is the brief's number. Drop the 5- and 10-minute targets from the pitch.
- **AI on in the demo.** Put a key in `app/.env`. Without it the jury sees "Photo AI is off" and "AI helper is off" [M].

**Cut (today)**
- **A chat UI inside the web app, the SMS link, and a full voice call in the main demo.** The backend for them now
  exists, but a new front end plus a rehearsed live call doesn't fit before 17:15, and no criterion requires voice.
- **Zensus, Overpass, Denkmal, LoD2, Google.** Broken, unreachable, too sparse, too heavy, or they need a billing key
  (Appendix A). ETHOS.BUILDA replaces Zensus: it is per building, not a 100 m grid, and has no demographic fields.
- **ETHOS.BUILDA's refurbishment state.** It is a random assignment from statistics (Appendix C), so it says nothing
  about the actual house.
- **Euro amounts from the expected-value model in the pitch.** They come from placeholders "nuuEnergy to set"
  [C `app/README.md`]. Show the tiers and the reasons instead.

**From-zero plan vs. current direction.** My from-zero plan (Appendix B) matched what exists on the engine, the honesty
lists, the wizard, the photo AI and a sales view. I would not have started the voice/agent backend today; the owner has
built it now, so it stays, in its own lane and out of the main demo path. I would have built the
sales view around visit-failure causes, not expected value. I ranked address enrichment last. The evidence moved it
up: ETHOS.BUILDA gives per-building data that works offline, the aerial photo works from a browser, and the organisers
asked for both kinds of check.

### ETHOS.BUILDA (addendum): use it, within three limits

What it is: version 2.0.0 is the newer one (Zenodo record 13771740, published 9 Oct 2024, database `v8_20240916`;
the record you linked, 12069755, is version 1.0.0). It lists all residential buildings in Germany, one CSV per state:
Bavaria `DE2.csv` is 1,275.7 MB, Hamburg `DE6.csv` 88.1 MB. Every value carries a source and a lineage. Licence ODbL
[M, record metadata]. Evidence in Appendix C.

- **Limit 1: refurbishment state is random.** In my sample of 69,432 Bavarian rows, 100% of `refurbishment_state`
  values have lineage "stat", which the dataset's own `lineages.csv` defines as "random assignment based on statistics"
  [M]. Never show or use it.
- **Limit 2: many values are machine-learning estimates.** 63.2% of construction years and 42.2% of size classes come
  from the dataset's own model, with no published accuracy [M]. The model's years look skewed: 89.5% fall in 1949–1978,
  against 68.6% for census-derived years [M; I did not check whether the sample is representative]. So:
  - pre-fill only, and the homeowner confirms or corrects;
  - raise "check before the visit" only when the stated year and a **census-derived** year fall in different guardrail
    age bands (before 1979 / 1979–2001 / 2002+) [G]. A year that differs inside one band changes nothing in the engine;
  - an ML year that disagrees is a soft note ("our data guesses 1949–1978; you said 1987; we use your answer"), not a
    risk. Otherwise many real 1980s and 1990s houses could be flagged by mistake (my inference from the skew, not
    measured).
- **Limit 3: homes only.** **Assumption:** the venue, a university building, has no record. On stage the honest answer
  is then "no home record at this address, so nothing is pre-filled". Check this when the slice is cut.
- **Design rules.** The engine only sees dataset values after the homeowner confirms them. The verdict never changes on
  dataset values alone. TABULA is used only for a plain-language line, read from the `tabula_type` code (for example
  `DE.N.SFH.06…` means a single-family house built 1969–1978). The guardrail numbers stay the only inputs to any
  calculation [G].
- **The demo slice.** The file isn't sorted by location, so one full pass over `DE2.csv` is needed: keep the rows in a
  box around the demo area, keep source and lineage, drop the refurbishment state, convert the points from EPSG:3035
  to latitude/longitude, write a small JSON file the app ships with. No live download in the app. At the 1.68 MB/s I
  measured on one connection, a full pass takes about 13 minutes [M]. Zenodo accepts byte ranges, so 4–8 parallel
  ranges should be faster (**Assumption**).
- **Credits.** "Contains ETHOS.BUILDA data (Forschungszentrum Jülich), ODbL." The dataset's `sources.csv` also asks to
  credit the 2011 census (dl-de/by-2-0) and "IEE Projects TABULA + EPISCOPE (www.episcope.eu)".

---

## 4. Build list (ranked by points gained per hour)

Build window: about 15:30 to 16:45 for features, 16:45 to 17:15 for integration, rehearsal 17:15–17:45, submit by
18:00. Up to four lanes can run in parallel without touching the same files. Lane D is optional.

- **Lane A (homeowner UI, engine, AI setup):** `app/package.json`, `app/.env` (local only), `app/src/ui/Result.tsx`,
  `packages/core/src/engine/*`, `packages/core/src/ai/provider.ts`.
- **Lane B (sales UI, docs):** `app/src/ui/SalesDashboard.tsx`, `app/src/ui/Briefing.tsx`, `packages/core/src/sales/*`
  (only lane B edits sales files), `app/README.md`, `PROBLEM_AND_APPROACH.md`.
- **Lane C (ETHOS.BUILDA):** new `packages/core/src/geo/geocode.ts`, new `packages/core/src/geo/buildingData.ts`
  (+ test), new `packages/core/src/data/builda_demo_slice.json` + attribution file, a cut script (for example
  `scratch/cut_builda_slice.mjs`), `app/src/ui/Wizard.tsx`.
- **Lane D (optional, aerial hint):** new `packages/core/src/geo/aerial.ts`, new `packages/core/src/ai/aerialHint.ts`
  (+ test), `app/src/ui/BookFlow.tsx`.
- **Lane O (the owner, already running):** `services/*`, `packages/agent/*`. No other lane edits these.

Contracts for the first 15 minutes, so nobody waits:
- Lane C adds one optional field, `dataset_check`, to `Building` in `packages/core/src/engine/types.ts` and pushes by
  15:40. It is the only engine file lane C touches; lane A pulls before editing the engine. `sanitize()` builds a new
  object from known fields, so the engine can't use the new field. The lead already stores the whole `Building`, so
  lane B can read `lead.building.dataset_check`.
- Lane C pushes `geo/geocode.ts` (address → latitude/longitude via Nominatim) by 15:45; lane D imports it.
- Lane B adds any optional display field it needs to `packages/core/src/sales/types.ts` (for example where an
  outdoor-spot answer came from). Lane D fills the existing `outdoorSpot` answer and never changes the type itself.
- Nobody edits `app/src/App.tsx` unless lane B needs a route.
- No lane adds npm packages except lane O. Each dependency change rewrites `package-lock.json`, which already breaks
  Windows and Linux builds (section 7).

| # | Item | Lane | Time box | Done when | Files |
|---|---|---|---|---|---|
| 1 | Root `npm test` green | A | 5 min (15:30–15:35) | `npm test` exits 0 (add `--passWithNoTests` to the app's test script, or remove the script) | `app/package.json` |
| 2 | AI key on the demo laptop + live smoke test | A | 15 min (15:35–15:50) | `app/.env` has a key (never committed); `LIVE_AI=1 npx vitest run src/ai/live.eval.test.ts` passes in `packages/core`; uploading `kit/photos/5_cant-tell.jpeg` in the wizard gives "unclear"; the plain-words box shows text for B-04 | `app/.env` (gitignored) |
| 3 | Shorter AI timeout for the demo | A | 5 min (15:50–15:55) | `TIMEOUT_MS` lowered from 30 s; **Assumption:** about 12 s is enough for one vision call; confirm with the timing from item 2 | `packages/core/src/ai/provider.ts` |
| 4 | Result page: "what's still open" under the verdict | A | 35 min (15:55–16:30) | For B-04 and B-05, the verdict, the reason, the three flag lists and the yearly cost fit on the first screen of the demo laptop at 100% zoom; heat-load methods, maths, assumptions and path to green sit below or behind a "Details" toggle; the "AI helper is off" box is hidden when there is no key | `app/src/ui/Result.tsx` |
| 5 | B-05 duplicate contradiction + honest source labels | A | 15 min (16:30–16:45) | B-05 shows one "consumption too high for a 2006 house" contradiction, not two that say the same thing; the assumption rows for wall/ceiling heating, energy certificate, photo confidence and single-pipe say "our design choice", not "calibration (dev cases B-01..B-03)"; all tests pass; all 5 verdicts unchanged | `packages/core/src/engine/flags.ts`, `packages/core/src/engine/constants.ts`, engine tests |
| 6 | Visit-readiness panel ("would this visit fail?") | B | 50 min (15:30–16:20) | Each lead lists single-pipe, outdoor-unit spot, heat load too high, meter cabinet, data contradictions and "house matches the homeowner's answers" as "checked OK / known risk / not checked yet", each with its source (homeowner, photo AI, building data, technician only); the building-data row also shows "soft note (ML estimate)"; B-04 shows single-pipe as a known risk; B-05 shows contradictions to clear; both show the building-data row as "not checked yet (no address)"; a header line counts the risks checked before the visit; the briefing prints the same list | `app/src/ui/SalesDashboard.tsx`, `app/src/ui/Briefing.tsx`, optional fields in `packages/core/src/sales/types.ts` |
| 7 | ETHOS.BUILDA: demo slice, address pre-fill, "check before the visit" | C | 75 min (15:30–16:45), hard stop | The slice JSON is under 1 MB, covers a box around the venue, keeps source and lineage, and drops the refurbishment state; typing the venue address in wizard step 2 shows either the matched record (year band, house type, plain-language TABULA line, source, an "ML estimate" label when it is one) to confirm or correct, or "no home record at this address"; `compareWithDataset()` has unit tests for agree / census year in another band → flag / ML year in another band → soft note / no record; B-01..B-05 give the same verdicts with and without a record; the credit line is visible. Order: write the cut script first and start it in the background (one full pass over `DE2.csv`), then build the lookup while it runs. If not working at 16:45: drop it and the row stays "not checked yet" | new `packages/core/src/geo/geocode.ts`, new `packages/core/src/geo/buildingData.ts` (+ test), new `packages/core/src/data/builda_demo_slice.json` + attribution file, the cut script, `app/src/ui/Wizard.tsx`, one optional field in `packages/core/src/engine/types.ts` |
| 8 | Optional: address → aerial photo → AI outdoor-unit hint | D | 55 min (15:45–16:40), hard stop 16:45 | Only with a fourth person or agent. In the "free expert check" flow, the address shows the aerial photo (Bavaria `by_dop40c`, Appendix A) within a few seconds, then an AI hint: house type and "space for an outdoor unit: likely / unlikely / can't tell" with a confidence, labelled "hint, a technician confirms"; with no key or no network, the two existing outdoor questions stay and nothing breaks; the traffic light never changes; one unit test with a mocked LLM | new `packages/core/src/geo/aerial.ts`, new `packages/core/src/ai/aerialHint.ts` (+ test), `app/src/ui/BookFlow.tsx` |
| 9 | Doc refresh | B | 10 min (16:20–16:30) | `app/README.md` test count and run steps are right; Parts B1–B3 of `PROBLEM_AND_APPROACH.md` fixed per section 8 below | `app/README.md`, `PROBLEM_AND_APPROACH.md` |
| 10 | Integration and freeze | all | 30 min (16:45–17:15) | On the demo laptop: `git pull`, `npm test` and `npm run build` pass; the section 5 walkthrough runs end to end twice; tag `demo-1715` pushed and used for the demo | none |
| – | Ask the organisers 4 questions (no code) | any human | 10 min, before 16:30 | Answers written in `notes/workflow.md`: cost of one failed visit, visits per month, top causes of the 15%, what data a lead arrives with today | `notes/workflow.md` |

Why this order: items 1–3 cost 25 minutes and remove visible failures (a red `npm test`, "AI is off" on stage, a
30-second silence). Item 4 helps the two biggest criteria (fit, explainability: 45 points). Item 5 fixes something
the jury will see on B-05, an evaluation building. Item 6 makes the paying customer's problem visible. Item 7 adds the
"is the house what the homeowner said?" check that item 6 shows, and it works offline. Item 8 is the most visual
but needs a key and the network on stage, so it is optional and has a hard stop.

---

## 5. Demo script (3 minutes)

Before the jury arrives: run tag `demo-1715`; press "Clear typed-in leads" in the sales view; run one photo
classification to warm up the API; open `kit/photos/` in a file window; browser zoom set as rehearsed.

| Time | Screen | Say / do |
|---|---|---|
| 0:00–0:15 | Home page | "Would a heat pump work in my home? Today only a technician visit answers it. And nuuEnergy told us about 15% of those visits can't proceed on site [O]." |
| 0:15–0:40 | Wizard | Click "Start check". Show the 3 steps: bill, house, photos. "Every question has 'I don't know'." In step 2 type the venue's address. **Assumption** (check when the slice is cut): "No home record at this address, so we pre-fill nothing. For a house we'd pre-fill the year and type, say where it comes from, and you confirm." Then open the **B-04** demo card: "Same engine, with B-04's data, to save time." |
| 0:40–1:15 | B-04 result | "Yellow, and a **known obstacle**: a single-pipe system. That's an obstacle, not missing data." Point at both methods: area method 12.8–19.2 kW, bill method 9.5 kW; best estimate 9.5 kW [E]. "Single-pipe forces 55–60 °C, so we use JAZ 2.8: about €2,043 a year with a heat pump vs €4,250 for oil [E]." Point at path to green: enlarge the end radiators or convert the loop. |
| 1:15–1:50 | B-05 result | "Yellow, low confidence. The data contradicts itself: 216 kWh/m² a year for a 2006 house, 14 rooms in 125 m², and the two methods are 39% apart: 10.4 kW vs 5–7.5 kW [E]. We won't guess which number is wrong. A technician confirms the bill, the area and the room count." |
| 1:50–2:20 | Wizard, all "I don't know" | **Live honesty moment.** Start the check again and press Next through steps 1–2 without answering. In step 3 upload `5_cant-tell.jpeg`; the AI should answer "unclear", so the pipe system stays "unknown" and goes on the technician list. The result is yellow, low confidence, "not enough data to estimate the heat load", never red (I tested this path without a key [M]). "It tells you when it can't tell." *(No key or no network: answer "I don't know" to the 3 photo questions: same result.)* *(Only if item 8 was built and time allows: the aerial photo of the venue appears and the hint says it can't judge outdoor space for this building, so a technician checks.)* |
| 2:20–2:50 | Sales view (`#/sales`) | "Same engine, second door." B-04 → "30-min technical call first". B-05 → "ask for missing info first". Neither gets a blind visit. Open the visit-readiness panel: "These are the no-go causes from your own guardrails, plus 'is the house what the homeowner said?'. We show which ones are checked before the van leaves." |
| 2:50–3:00 | Assumptions table | "Rules, not a black box. Every number comes from your guardrails. AI reads photos and bills and can never change the verdict. The same engine already sits behind an MCP server and a voice-assistant backend, so a phone or chat channel reuses it." |

---

## 6. Recommended answers to the open questions (Part C)

1. **Scope.** The web app is the demo: wizard → result → sales view, plus items 1–7 above. The voice/chat backend the
   owner built today gets one sentence, or a 20-second live exchange if it ran end to end twice by 17:15.
   *Reason:* the web app already tells both stories; a spoken check runs at about 6.8 s per turn [C `8e183e7`] and adds
   three live dependencies (LLM key, network, ElevenLabs).
2. **Time target.** Claim "under 3 minutes" only. *Reason:* it's the brief's number; Part B3 estimates the core
   questions at about 2–2.5 minutes (an estimate). Time it once in rehearsal; if it's over, say "about 3 minutes".
3. **Address checks.** Build ETHOS.BUILDA pre-fill + "check before the visit" (item 7). Build the aerial hint
   (item 8) only if a fourth person or agent is free. Demo address: the hackathon venue. **Assumption:** the venue is
   TUM's Audimax at Arcisstraße 21; the README only says "Audimax Muenchen". *Reason:* ETHOS.BUILDA answers the
   organisers' "how old is the house" ask per building, runs offline, and catches "the house isn't what the customer
   described", one of the failure causes in Part B3. The venue is a public building. B-04 and B-05 have no street
   address, so neither check can be validated on the dataset; say so in the pitch.
4. **Single-pipe.** Keep yellow with a strong warning, labelled clearly as "known obstacle" (the engine's headline
   already says this). *Reason:* the official background page says single-pipe is "not a deal-breaker" and "rarely a
   clean green without an on-site check", which fits yellow. The guardrails list it first among the "most common
   no-go reasons", so red is defensible too: if the jury's reference says red, it's one constant
   (`SINGLE_PIPE_VERDICT`) and the reason text stays the same. Say that openly in Q&A.
5. **Wall or ceiling heating.** Treat it like underfloor (JAZ 4.0) with a technician check. That is already in the
   assumptions table. *Reason:* both are large low-temperature surfaces. None of the 5 houses has it, so no result
   changes. Label it "our design choice", not a guardrail or calibration (item 5).
6. **B-01 green with low confidence.** Keep green and show the confidence plus its reasons (bill implausibly low,
   4 unknowns [E]). *Reason:* nuuEnergy's own expected verdict for B-01 is green [C `kit/data`], and the brief defines
   green as "likely suitable based on available information". Capping at yellow would make us wrong on a reference case.
7. **Failed-visit numbers.** One person asks the organisers the 4 questions in the build list before 16:30.
   *Reason:* the pitch can only use "about 15%" [O]. Without their answers, show the savings formula
   (visits × 15% × share caught × cost per failed visit) with no invented numbers.
8. **New: may we commit the ETHOS.BUILDA demo slice?** `GOVERNANCE.md` says never commit raw datasets.
   Recommendation: yes, commit the small derived slice (demo box only, needed fields only, under 1 MB) with an
   attribution file. *Reason:* it is a tiny extract, not a raw dataset, and building it on the demo laptop instead adds a
   download of about 13 minutes as a live risk [M]. The repo is private today [M]; if it goes public, the slice must stay
   under ODbL. The owner decides.

---

## 7. Top risks for the live demo

| Risk | What happens | Fallback |
|---|---|---|
| **No API key** | Photo step shows 3 questions; "AI helper is off" box shows [M] | Item 2, done by 15:50. If the key fails on stage, walk the no-key path: "I don't know" answers give the same honest result, and the engine is the source of truth. Item 4 hides the "off" box. |
| **No internet** | AI and address lookups fail; engine, wizard, result and sales view still run (all local) | Keep network features in one optional demo slot and skip it if offline. **Assumption:** someone has a phone hotspot. Never run `npm install` at the venue. |
| **Slow API** | AI calls wait up to 30 s (`provider.ts`); the photo classifier asks the model 3 times and takes the majority [C `e0ce5f8`] | Item 3 shortens the timeout. Warm up before the jury. Talk through the "can't tell" logic while it runs. On timeout the app falls back to questions, which is itself the honest path. |
| **Build breaks on the demo laptop** | The lockfile only has Mac binaries; on Windows the build failed until I regenerated it [M] | Demo on a laptop where `npm run build` passed. Keep `app/dist` built, with `npx vite preview` as backup. |
| **A late push breaks `main`** | A teammate pushes every few minutes | Freeze at 17:15 and demo from tag `demo-1715`. |
| **A live voice exchange stalls** | Silence on stage; about 6.8 s per turn even when it works [C `8e183e7`] | Only try it if it ran end to end twice by 17:15; otherwise one sentence. |
| **Old leads in the sales view** | Leads live in browser `localStorage` [C `app/README.md`] | Press "Clear typed-in leads" before the demo. |
| **ETHOS.BUILDA slice is slow or fails to cut** | One full pass over 1,275.7 MB; about 13 minutes at the 1.68 MB/s I measured [M] | Start the cut first, at 15:30, in the background. Use parallel byte ranges; re-request a failed range instead of starting over. If there's no slice by 16:45, switch the feature off: the row says "not checked yet". |
| **The dataset says something wrong on stage** | A pre-filled year or type is off | It is shown as an estimate with its source, the homeowner's answer wins, and it never changes the verdict. Say so: that is the point. |
| **Overpass is down** | Only matters if someone builds on it | Don't. It never answered from this laptop [M]. |

---

## 8. Wrong or outdated in the current docs and code

1. **`PROBLEM_AND_APPROACH.md` B2** says "There is no backend or server code in the repo yet". Out of date:
   `packages/agent`, `services/mcp-tools` and `services/orchestrator` (HTTP API, e-mail reports, ElevenLabs bridge)
   were committed today (`4a2d94e`, `cd3d1b3`, `ce6c6f7`, `8e183e7`, `009214e`).
2. **Test counts.** B1 says 80 tests; `app/README.md` says 65. At commit `009214e`: 80 (core) + 21 (agent) + 3 (MCP)
   + 13 (orchestrator) = 117 pass, 7 skipped [T]. The two voice commits after that (`b10b940`, `c015c2e`) were not
   re-run.
3. **Root `npm test` exits with an error.** The `app` workspace still runs `vitest run`, but its tests moved to
   `packages/core`, so vitest reports "No test files found" and exits 1. All real tests pass (item 1).
4. **`docs/AGENT_BACKEND_SPEC.md`** says the engine is in `app/src/engine/` and sales in `app/src/sales/`. Both moved
   to `packages/core/src/`.
5. **Denkmal WMS URL in B3** (`http://geodaten.bayern.de/ogc/ogc_denkmal.cgi`) redirects to https and then returns 404 [M].
6. **B3 says no data source was tested from a browser.** Now tested (Appendix A).
7. **Munich heat plan has no API (B3).** Not quite: the viewer's config points to open map services at
   `https://geoportal.muenchen.de/geoserver/rku/wms` that a browser can query [M]. But it covers the city of Munich
   only, and B-04/B-05 are in 85xxx, outside the city.
8. **Assumption sources are mislabelled.** The assumptions table tags wall/ceiling heating, "bill vs energy
   certificate beyond 40%", photo AI minimum confidence and confirmed single-pipe as "Our calibration rule (dev cases
   B-01..B-03)". None of the dev cases has wall heating, an energy certificate, photos or single-pipe, so these are
   design choices (item 5).
9. **B-05 counts one fact twice.** "Consumption far above what this building age suggests" and "High consumption for a
   2002+ building" are the same finding, and both count toward the confidence penalty (item 5).
10. **Path to green for B-05, step 1** ("confirm the bill, heated area and room count") leaves confidence at "low".
    That reads as if confirming the data changes nothing. Not in the build list; be ready for the question.
11. **Time targets disagree:** landing page "under three minutes", `APP_SPEC.md` "5–10 minutes" and "under 10 minutes",
    agent spec "~5 minutes" (see question 2).
12. **Wizard placeholders** ("1985", "140", "55") look like pre-filled answers. Minor.
13. **Older notes:** `notes/challenge.md` says "angle TBD", and `notes/ai_onboarding_prompt.md` says the code lives in
    `src/` (owner edits only). The root `README.md` said "nuu energy or Ecurious (TBC)" and "build in `src/`"; I
    rewrote it with this doc.
14. **Product caveat:** the API key is a `VITE_` variable, so it ends up in the browser bundle. Fine for a local demo,
    not for a product; there, AI calls would go through the backend in `services/`.
15. **Part A2 guesses the organisers' house-age dataset is the Zensus grid.** ETHOS.BUILDA fits their description
    better: per building, with construction year, size class and TABULA type. Zensus is a 100 m grid statistic. The
    Part B3 source table doesn't list ETHOS.BUILDA.
16. **A claim without data.** With every answer "I don't know", the result still says "Radiators probably need
    55–60 °C, so the heat pump runs less efficiently" [M]. Nothing supports that when nothing is known; it should be a
    "can't tell yet" item. Not in the build list (it touches the engine's radiator logic); be ready for the question.

---

## Appendix A: Verification evidence

**Tests and build [T][M].** `npm install` (clean clone at `cd3d1b3`) → `npm run build` failed with
"Cannot find module '../lightningcss.win32-x64-msvc.node'". After deleting `node_modules` and `package-lock.json` and
reinstalling, the build passed. The regenerated lockfile was not committed. Tests: core 80 passed / 5 skipped, agent 16
passed, MCP 3 passed; `app` exits 1 with "No test files found". Re-run at about 15:20 on commit `009214e`, after the
owner's three new commits and the same lockfile fix: core 80 passed / 5 skipped, agent 21 passed, MCP 3 passed,
orchestrator 13 passed / 2 skipped; build passed. Commits `b10b940` and `c015c2e` (15:19) were not re-run.

**App click-through [M].** Wizard with B-04's facts (single-pipe, 1987, 160 m², 3 people, 2,500 L oil) gave the same
result as the B-04 demo card. B-05 result, the sales view, and a run with every answer "I don't know" (yellow, low
confidence) checked. Nothing crashed. Points of confusion are listed in section 8 (items 9, 10, 12, 16) and section 3
(result page order).

**Engine results for all 5 buildings [E]:**

| ID | Verdict (confidence) | Best estimate | Method A | Method B | Reference | Heat pump vs today, per year | Main reasons |
|---|---|---|---|---|---|---|---|
| B-01 | green (low) | 9.8 kW (50 W/m²) | 7.8–23.4 kW | 2.4 kW | 9.6 kW, green | €654–817 vs €1,100 | Moderate load; radiators likely fine at ≤ 55 °C. Bill flagged as too low; 4 unknowns |
| B-02 | green (high) | 9.9 kW (55 W/m²) | 7.2–10.8 kW | 5.3 kW | 9.7 kW, green | €887 vs €1,705 | Moderate load; underfloor suits a heat pump |
| B-03 | yellow (high) | 16.6 kW (83 W/m²) | 12–36 kW | 16.6 kW | 14.5 kW, yellow | €2,615–3,269 vs €6,800 | Radiators probably need 55–60 °C; 83 W/m² is on the high side |
| B-04 | yellow (medium) | 9.5 kW (59 W/m²) | 12.8–19.2 kW | 9.5 kW | hidden | €2,043 vs €4,250 | Strong warning: single-pipe; JAZ 2.8 |
| B-05 | yellow (low) | 10.4 kW (83 W/m²) | 5–7.5 kW | 10.4 kW | hidden | €1,765–2,206 vs €2,970 | 3 data contradictions; radiators probably 55–60 °C; 83 W/m² |

Dev check: B-01 is 2% above its reference (9.8 vs 9.6), B-02 2% above (9.9 vs 9.7), B-03 14% above (16.6 vs 14.5).
All three match the expected colour. The results are the same as the table in Part B1.

**Address data sources [M].** One request each, from this laptop, with an `Origin: http://localhost:5173` header.
Test point: the venue (Arcisstraße 21, Munich), a public building. In the browser pane I repeated the working ones
with `fetch()` from a page on localhost; all of them answered there too. For Zensus I requested only building-age and
heating fields, never the demographic ones.

| Source | Result | Time | Browser can call it directly? | Use today? |
|---|---|---|---|---|
| Nominatim geocoding (not in B3, but any address feature needs it) | Works; found the TUM site | 0.3–1.0 s | Yes (`*`) | Yes, for item 7 (max 1 request per second) |
| OSM Overpass | Failed: TLS error from curl; 25–30 s timeouts from Node and from the browser, on two servers | – | Unknown (never answered) | No |
| BLfD Denkmal WMS | Redirect to https, then 404; three other URL guesses also 404 | – | No header on the 404 | No |
| Zensus 2022 grid | Works. No cell at the venue point; a small box around it returned cells, but their building-age counts were empty or all zero | 0.8–3.5 s | Yes (`*`) | No: too sparse in dense areas, a neighbourhood rather than a house, and demographic fields in the same layer |
| Munich heat plan (`geoportal.muenchen.de/geoserver/rku/wms`, e.g. layer `rku:wp_baublock_potentials_luftwaermepumpe`) | Works; JSON per city block | 0.3 s | Yes (`*`) | Optional; city of Munich only |
| Munich aerial photo (`geoportal.muenchen.de/geoserver/gsm/wms`, layer `gsm:g_luftbild`) | Works; sharp image | 0.8–1.5 s | Yes (`*`) | Optional, city only |
| Bavaria aerial photo DOP40 (`geoservices.bayern.de/od/wms/dop/v1/dop40`, layer `by_dop40c`; not in B3) | Works; info layer shows flight date 24.08.2024 for the venue | 0.26–0.32 s | Yes (echoes the origin) | **Yes, best source for item 7** |
| Bavarian LoD2 CityGML | Tile `690_5334` exists | 0.45 s (headers only) | No CORS header: would need the Vite dev proxy | No: one tile is 161,632,238 bytes |
| Google Solar API | 403 without a key | 0.9 s | Yes (echoes the origin) | No, needs a billing key |
| ETHOS.BUILDA on Zenodo (addendum, v2.0.0) | Works: record metadata, lookup tables, byte ranges of `DE2.csv` (Appendix C) | 0.7 s for metadata; 1.68 MB/s for data | Yes (`*`) | Yes, as an offline slice (item 7); never downloaded live by the app |

None of the sources I'd use needs the Vite dev proxy.

## Appendix B: My from-zero plan (14:47, before reading Parts B/C)

1. A deterministic engine on the guardrails: both heat-load methods as a range, named adjustments, flow temperature →
   JAZ → costs, a readable verdict table, calibrated on B-01..B-03.
2. Every input carries a source (you said / from the bill / estimated / unknown); the result has three lists (what we
   know, what we assumed, what a technician must check); a contradiction detector for B-05.
3. A short homeowner flow with one result card.
4. AI only for the radiator photo (few-shot on the 5 photos, with "can't tell") and the bill, with a no-key fallback.
5. A sales "visit readiness" view built on the known no-go causes, for the 15% story.
6. Address enrichment only if cheap and reliable; demo-only, because the dataset has no addresses.
7. No chat agent, MCP, database or auth.

Ranking: engine + result card > uncertainty display > photo AI > sales visit readiness > bill reading > address data.

## Appendix C: ETHOS.BUILDA evidence [M]

Checked 15:04–15:08 CEST from this laptop. Nothing was downloaded in full: I read the record metadata, the two small
lookup tables, and two byte ranges of `DE2.csv` (the first 2 MB, and 25 MB from the middle of the file).

| Check | Result |
|---|---|
| Versions | Record 12069755 is v1.0.0 (18 Jun 2024, database `v7_20240429`). The newer one is record 13771740, v2.0.0 (9 Oct 2024, database `v8_20240916`). Both ODbL. Authors: Dabrock, Ulken, Pflugradt, Weinand, Stolten (Forschungszentrum Jülich). |
| Files (v2.0.0) | One plain CSV per NUTS-1 state, not zipped. DE2 Bavaria 1,275.7 MB; DE6 Hamburg 88.1 MB; DE9 Lower Saxony 857.1 MB; DEF Schleswig-Holstein 221.7 MB. Plus `sources.csv` and `lineages.csv`. Product note: nuuEnergy's "Greater Hamburg" postcodes (20, 21, 22, per `packages/core/src/sales/config.ts`) reach beyond Hamburg itself, so a Hamburg product needs more than DE6. |
| Columns | `id`, `position` (WKT point, EPSG:3035), then `construction_year`, `size_class`, `refurbishment_state`, `tabula_type`, each a JSON object with `value`, `source` and `lineage`. |
| Lineage meanings (`lineages.csv`) | `ai` "Determined by using artificial intelligence"; `map` "Mapping of source data values to target attributes"; `stat` "Random assignment based on statistics"; `der` "Derived from source data through logical argument". |
| Sources (`sources.csv`) | Zensus 2011 buildings on the 100 m grid (dl-de/by-2-0); TABULA building typology (must visibly credit "IEE Projects TABULA + EPISCOPE (www.episcope.eu)"); the UBA report "Wohnen und Sanieren" (refurbishment). `v4_model.json` is the dataset's own ML model: no entry, no published accuracy. |
| Sample | 69,432 Bavarian rows, 388.9 bytes per row on average. So DE2 holds roughly 3.3 million rows (file size ÷ row size). |
| `construction_year` | 63.2% ML (`ai`), 36.8% derived from Zensus 2011 (`der`). ML years: 89.5% in 1949–1978, 7.0% before 1949, 2.2% in 1979–2001, 1.2% in 2002+. Census-derived years: 68.6% in 1949–1978, 9.0% before 1949, 17.6% in 1979–2001, 4.7% in 2002+. |
| `size_class` | SFH 82.3%, MFH 9.9%, TH 7.1%, AB 0.6%. 57.8% derived from Zensus 2011, 42.2% ML. |
| `refurbishment_state` | 100% `stat` (random, from the UBA statistics). Values 1 (40.8%), 2 (54.7%), 3 (4.5%). |
| `tabula_type` | 100% `map`. Codes look like `DE.N.SFH.06.Gen.ReEx.001.001`. The size part equals `size_class` in every sampled row. Age class vs. year in the sample: 01 up to 1859, 02 1860–1918, 03 1919–1948, 04 1949–1957, 05 1958–1968, 06 1969–1978, 07 1979–1983, 08 1984–1994, 09 1995–2001, 10 2002–2009, 11 2010–2015, 12 2016–2022. The 1978/1979 and 2001/2002 edges match the guardrail bands. |
| Access | Byte ranges work (HTTP 206), and the server sends `Access-Control-Allow-Origin: *`. One connection: 2.07 MB/s on the 2 MB range, 1.68 MB/s on the 25 MB range. |
| Demo coordinates | The venue's Zensus cells are named like `CRS3035RES100mN2782700E4437600` (Appendix A), so the venue sits near E 4,437,600 / N 2,782,700 in EPSG:3035, the same range as the sample points. |
| Privacy and fairness | No demographic fields; the values describe buildings, not people. Linked to an address, building data can still count as personal data, so show the homeowner what we found and let them correct it. |
| Licence duties | ODbL: credit the database, keep the slice under ODbL if it is ever shared publicly, and keep the sources' own credits (Zensus 2011, TABULA). |
