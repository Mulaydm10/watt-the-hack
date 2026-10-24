# Build brief: "Heat Pump Ready?" (nuuEnergy challenge, WATT THE HACK Munich, 24 Oct 2026)

You are Claude Code. Build the prototype described here **today**: submission closes at **18:00**, then a live demo (no slides). Build the core first and get it working end to end, then add the extras. Everything you need is in this kit:
- `data/`: the 4 official building files, byte-identical to the Notion attachments.
- `photos/`: the 5 installer-confirmed radiator photos, renamed to their true labels.
- `docs/`: the official challenge pages as plain text. `docs/Technical_Guardrails.txt` is the source of truth for the formulas.

---

## 1. What we are building (plain words)
A homeowner opens a website, enters what they already know (energy bill, building facts, a few phone photos) and, **in under 3 minutes**, gets:
1. **A traffic light**:
   - 🟢 Green: likely suitable based on available info.
   - 🟡 Yellow: potentially suitable, but important checks remain or data is thin.
   - 🔴 Red: insufficient evidence for a positive assessment / a real obstacle.
2. **The reason in plain language.**
3. **What is still open**: what the tool cannot tell, and what a technician must check on site.
4. **Costs**: yearly running cost with a heat pump vs. their current gas or oil.

**Core judging principle (quote):** "A tool that says 'I can't tell from this data, a technician must check X and Y' beats one that returns a confident wrong number."
**Also required:** "Missing data does not automatically mean a building is unsuitable. Your tool must clearly distinguish between 'there is an obstacle' and 'we can't tell yet from this data'."

### Scoring (100)
- 25: technical execution and reliability.
- 25: problem-solution fit and user value.
- 20: explainability and handling uncertainty.
- 15: innovation and smart use of AI.
- 15: feasibility and scalability.

### Deliverables
1. A browser prototype that runs locally in a standard browser.
2. Results for the **2** evaluation buildings (B-04, B-05) shown in the pitch. The Deliverables page says "3", but the data and the One-Pager both say 2.
3. A live demo.

**Bonus (only if time permits):**
- (a) Read an uploaded energy bill automatically: consumption, carrier, cost.
- (b) Flag outdoor-unit placement constraints from photos.

---

## 2. Tech stack (keep it simple and reliable)
- **Vite + React + TypeScript + Tailwind**, single-page app, `npm run dev`. No backend is required for the core.
- **Core engine = pure TypeScript functions** in `src/engine/`, with no UI code inside, unit-tested with **Vitest**. This is where the score for "reliability" comes from.
- **AI (photos + bill)** in `src/ai/`: one call to a vision LLM (Claude or OpenAI) with the API key from `.env` (`VITE_LLM_API_KEY`). If CORS or the key is a problem, add a tiny `server/` (Express or Hono, about 30 lines) that proxies the call. **The app must work fully with no key**: the photo step falls back to manual questions ("Do you see one pipe running from radiator to radiator?"). Never hard-code or commit the key.
- Load the building data from `data/*.json` (copy it to `src/data/`).

Suggested layout:
```
src/engine/heatLoad.ts      // both methods + range + chosen estimate
src/engine/radiators.ts     // flow temp / JAZ selection
src/engine/costs.ts
src/engine/flags.ts         // obstacles, unknowns, contradictions, technician checks
src/engine/verdict.ts       // green/yellow/red + confidence + reasons
src/engine/assess.ts        // assess(building, photoFindings?) -> Assessment
src/engine/*.test.ts
src/ai/classifyPipePhoto.ts // vision call -> {label, confidence, reasons}
src/ai/readBill.ts          // bonus
src/ui/...                  // wizard + result page + "demo buildings" picker
```

---

## 3. Input model (identical to the dataset fields)
```ts
type Building = {
  building_id?: string;
  construction_year: number;
  floor_area_m2: number;
  renovation_status: 'unrenovated'|'partially'|'fully'|null;
  heat_distribution: 'radiators'|'underfloor'|'mixed';
  annual_consumption_kwh: number;          // convert litres/m3 x 10 if the user enters those
  energy_carrier: 'gas'|'oil'|'district'|'electric';
  energy_carrier_detail?: string;          // "LPG", "approx. 2,500 litres per year"
  radiator_info?: string;
  pipe_system: 'two-pipe'|'single-pipe'|'unknown';
  flow_temperature_c: number|null;
  persons_in_household: number;
  hot_water_via_heating: boolean;          // CSV uses yes/no, JSON uses true/false
  rooms: number|null;
  building_notes?: string;
  location: string;
};
```
Empty fields mean "not documented", just like in real life. Treat them as **unknown**, never as a bad value.

---

## 4. Engine: exact formulas from Technical Guardrails

### 4a. Heat load, method A (floor area)
| Building | W/m² |
|---|---|
| Unrenovated, built before 1979 | 120–180 |
| Built 1980s–1990s | 80–120 |
| Renovated or built 2002+ | 40–60 |
| Low-energy / new build | 15–40 |

Result: `area × [low, high]` → a range in kW.
**Gaps you must handle explicitly (show them in the UI):**
- 1979 and 2000–2001 fall in no band. Use the neighbouring band and set the reason "between age bands".
- "Partially" renovated pre-1979 sits between bands, so widen the range.

### 4b. Heat load, method B (consumption)
1. Convert to kWh: oil 1 L ≈ 10 kWh, gas 1 m³ ≈ 10 kWh.
2. Useful heat = consumption × 0.88.
3. If hot water is via heating, subtract 1,000 kWh per person per year.
4. Divide by 2,000 full-load hours → kW.

Also compute **specific load in W/m²** = kW × 1000 / area. **Above ~75 W/m²**, hint that better windows or insulation may be worth it.

### 4c. Combining the two (this is where we win or lose)
Show **both** methods and the range. Then pick a **best estimate with a stated reason**, using checks driven by the notes. Calibrate them on the dev cases:

| Case | Method A | Method B | Reference | Why B or A is wrong | Rule to encode |
|---|---|---|---|---|---|
| B-01, 2001, 195 m², LPG 10,000 kWh, 4 people | 80–120 or 40–60 → ~7.8–23 kW | **2.4 kW** | **9.6** | Consumption is implausibly low (12 W/m²) for a 2001 house. The owner's U-values (wall 0.21, windows 1.1) indicate a good envelope. | If method B < ~25 W/m² and nothing explains it, distrust B ("bill looks too low; partial year, second heat source or vacancy?"). Fall back to A at the low end. Flag as **data contradiction**. |
| B-02, 2005, 180 m², gas 15,500 kWh, underfloor | 40–60 → 7.2–10.8 kW | **5.3 kW** | **9.7** | Wood stove used all winter plus solar thermal for hot water, so gas covers only part of the heat. | If the notes mention a wood stove, fireplace or other heat source, treat B as a **lower bound** and lean on A (upper half). Solar thermal means the hot-water subtraction is too large. |
| B-03, 1970, 200 m², oil 40,000 kWh, partially renovated, top floor unused | 120–180 → 24–36 kW | **16.6 kW** | **14.5** | Partly renovated (cavity insulation, roof) and the top floor is not heated, so the area method overestimates. | If renovation is "partially"/"fully", or the notes say part of the area is unused or insulated, trust B and shrink A. |

Implement this as a small, readable **list of rules**, each producing `{ effect, reason }`, so the UI can show "We trusted X because Y". Do **not** fit hidden magic constants. The jury rewards transparent logic. The tests must reproduce the dev references within a sensible tolerance (e.g., best estimate within ±25% and the reference inside the shown range), plus the expected verdicts.

### 4d. Radiators → flow temperature → JAZ
- Underfloor (~35 °C) → **JAZ 4.0**.
- Radiators that can run at ≤55 °C → **JAZ 3.5**.
- Radiators needing 55–60 °C → **JAZ 2.8**.
- Mixed (underfloor + radiators) → the radiator circuit dictates the flow temperature, so use the radiator JAZ (show 3.5–2.8 as a range).
- At 55 °C a radiator delivers about **half** its rated output (rated at 75 °C). If the radiator type and size are known (Type 11/22/33 from the photo), check that the summed output at 55 °C covers the heat load. If unknown → **unknown, technician check** (not red).
- **Single-pipe** → the end radiators get cooler water, so assume 55–60 °C (JAZ 2.8) unless proven otherwise.
- Small or old radiators → "needs checking".

### 4e. Costs (fixed prices, show assumptions openly)
- Heat pump: `useful_heat_kWh ÷ JAZ × 0.26 €/kWh` (useful heat = consumption × 0.88).
- Current: gas `kWh × 0.11 €`; oil `litres × 1.70 €` (≈ 0.17 €/kWh). LPG is not given a price: label it "price assumption: gas price used, LPG is usually dearer".
- Show both, plus the yearly difference. Show a JAZ range when the flow temperature is uncertain.

### 4f. Flags (three separate kinds, shown separately in the UI)
1. **Obstacles (known problems)**, the official "most common no-go reasons":
   - Single-pipe heating system (Einrohrsystem).
   - No viable spot for the outdoor unit.
   - Heating load too high for the heat pump to run efficiently. Use specific load: e.g., > ~120 W/m², or radiators that can't cover the load even at 60 °C.
2. **Unknowns (can't tell yet)**: missing pipe system, radiator type, flow temperature, renovation status, inconclusive photos.
3. **Contradictions**: e.g., consumption far outside the age band (B-01 too low; B-05 216 kWh/m²/yr for a 2006 house), or a room count that's implausible for the area (B-05: 14 rooms in 125 m²).

**Technician checks: always shown**, then extended by the flags:
- Exact heat load (room-by-room calculation).
- **Meter cabinet / electrical connection.** New in the guardrails: every grid operator has its own rules, it must always be checked, it often needs an upgrade (plan for it in every assessment), and that upgrade raises the price a lot. Show it on every result as a check **and** as a cost risk.
- Where the outdoor unit can go.
- Plus case-specific items (pipe system, radiator sizes, flow-temperature test).

### 4g. Verdict logic (transparent, deterministic)
```
if any obstacle confirmed                       -> RED (or YELLOW if mitigable; see below)
else if critical unknowns or contradictions     -> YELLOW
else if heat load plausible, ≤55 °C feasible    -> GREEN
```
Refinements:
- **Confirmed single-pipe** = obstacle. It is the #1 no-go, and the background page says it is "rarely a clean green". Show it as RED "obstacle", with the way forward: "a technician checks whether the end radiators can be enlarged or the loop converted; then it may move to yellow". (A yellow + strong warning is also defensible. Keep the threshold in one constant so we can flip it before the pitch.)
- Unknowns alone must **never** produce red. Use YELLOW with the message "we can't tell yet".
- Output a **confidence** (high / medium / low) driven by how many inputs were missing or contradictory, and how far methods A and B disagree.
- Dev expectations to pass in the tests: B-01 green, B-02 green, B-03 yellow.

### 4h. Eval-building numbers you should get (sanity check; the official answers are hidden)
- **B-04** (1987, 160 m², oil 2,500 L = 25,000 kWh, 3 people, confirmed single-pipe):
  - Method B: (25,000 × 0.88 − 3,000) / 2,000 = **9.5 kW** (59 W/m²).
  - Method A: 80–120 W/m² → 12.8–19.2 kW.
  - JAZ 2.8 (single-pipe). Heat pump 22,000 / 2.8 × 0.26 ≈ **€2,040/yr** vs oil 2,500 × 1.70 = **€4,250/yr**.
  - Verdict: single-pipe obstacle → red, or yellow with a strong check (our current lean: red with a way forward).
- **B-05** (2006, 125 m², gas 27,000 kWh, 3 people, mixed, no facade/roof insulation, solar thermal, 14 rooms):
  - Method B: (23,760 − 3,000) / 2,000 = **10.4 kW** (83 W/m², above 75: insulation hint).
  - Method A (2002+): 40–60 → 5.0–7.5 kW. **The methods disagree ~2×**, which is a contradiction flag.
  - Heat pump at JAZ 3.5 ≈ €1,765/yr (2.8 → €2,206) vs gas 27,000 × 0.11 = **€2,970/yr**.
  - Verdict: **yellow**: contradictory data (check the bill, the heated area and the room count) plus radiator-circuit flow temperature. Pipe system unknown.

---

## 5. AI parts (the 15-point "smart use of AI" criterion)
### 5a. Radiator / pipe photo classifier (main AI feature)
- Input: 1–5 photos. Output JSON: `{ label: 'single-pipe'|'two-pipe'|'unclear', confidence: 0–1, evidence: string[], radiator_type?: '11'|'22'|'33'|'unknown', notes }`.
- Few-shot the model with the 5 installer-confirmed examples in `photos/`. **Trust the filenames here, not the original Notion filenames, which were misleading:**
  1. `1_single-pipe_classic-loop.jpg`
  2. `2_single-pipe_hidden-in-valve-block.jpeg`
  3. `3_two-pipe_classic.jpeg`
  4. `4_two-pipe_modern-valve-block.jpeg`
  5. `5_cant-tell.jpeg`
- Put the visual cues from `docs/Background__Single_pipe_vs__two_pipe_heating.txt` in the prompt:
  - Valve top plus return bottom on two separate pipes → likely two-pipe.
  - One pipe running along the wall from radiator to radiator, with a bypass piece → likely single-pipe.
  - A single bottom connection with both pipes coming from the floor → often single-pipe.
  - An H-block with two pipes → often can't tell; an extra side port (bypass) points to single-pipe.
  - Built in the 1960s–70s or an apartment building → single-pipe more likely, but not proof.
- **Rules:**
  - If `pipe_system` is given in the data, use it and skip the classifier.
  - "Two pipes at a radiator ≠ two-pipe system."
  - "The system belongs to the building, not one radiator."
  - Below a confidence of ~0.7 → output `unclear`, with this sentence: *"Heating pipe system unclear from the photos. A technician should check whether this is a single-pipe system, because that can require a higher flow temperature."*
- Never let the photo AI override confirmed data. Combine its result with the construction year as a prior.

### 5b. Bonus: bill reader
Upload a PDF or photo → the vision LLM extracts `{annual_consumption_kwh, energy_carrier, cost_eur, period}` → prefills the form for the user to confirm.

### 5c. Optional: plain-language explanation
An LLM may **rephrase** the engine's reasons into friendly text, but **all numbers and the verdict come from the deterministic engine**. Show the LLM text and the raw reasons side by side.

---

## 6. UI (aim: under 3 minutes for a real homeowner)
1. **Landing:** one sentence plus "Start check". Also a **"Try a demo house"** picker (B-01 to B-05) that fills the form instantly. This is essential for the live demo.
2. **Wizard (3 short steps):**
   - (1) Bill: kWh or litres/m³, carrier, or upload the bill.
   - (2) House: year, m², people, hot water yes/no, radiators/underfloor/mixed, renovation, notes.
   - (3) Photos: radiators and pipes (optional, with a "skip" button).
   - Every field has an "I don't know" option.
3. **Result page:**
   - A big traffic light, the confidence level and a one-sentence reason.
   - The heat-load card: method A range, method B value, the chosen estimate and **why**.
   - The cost card: heat pump vs current, the JAZ used, and all assumptions listed.
   - Three columns: **Obstacles / Can't tell yet / Contradictions**.
   - The **technician checklist** (meter cabinet always first-class).
   - "What would make this greener" tips (e.g., >75 W/m² → windows/insulation; enlarge end radiators).
   - A collapsible "Show the maths" section with every formula and number.
4. **Eval view:** a table of B-04 and B-05 results for the pitch slide/demo, plus dev B-01 to B-03 next to their references to prove the calibration.

Keep it German-market friendly (€, kWh) with English UI text. A German toggle is a nice-to-have.

---

## 7. Order of work (time-boxed)
1. The engine with tests on the dev cases (heat load, costs, flags, verdict). **Do not move on until the B-01/02/03 tests pass.**
2. A minimal UI: the demo picker plus the result page.
3. The wizard for manual entry.
4. The photo classifier (with the no-key fallback).
5. The eval table and polish.
6. Bonus: bill reader, then outdoor-unit photo hints.

Before submitting:
- Run `npm run build` and the tests, and do a manual run of all 5 demo houses.
- Write a README with how to run it, the assumptions, and the known limitations.

## 8. Do not
- Claim accuracy we did not measure. We only have 3 labelled houses, so say "matches the 3 reference cases within X%".
- Turn unknowns into red.
- Let the LLM invent numbers or the verdict.
- Commit API keys.
