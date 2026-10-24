# Agent backend spec: "Heat Pump Ready?" conversational assistant

Status: draft v0.2 (24 Oct 2026): teammate parameters mapped (§4.6), ElevenLabs voice (§12), roadmap (§13). Owner: team NoIdea. Builds on the existing deterministic engine in `app/src/engine/`
and the sales layer in `app/src/sales/`. **Do not re-implement any formula. Every number comes from those modules.**

Placeholders marked **[TEAMMATE]** are waiting on input (location analysis, final question list). Build the
interfaces now and keep those parts behind clearly named stubs.

---

## 1. What we are building

A backend that lets an AI assistant (Astra, `gpt-6-astra`) hold a calm, one-question-at-a-time conversation with a
homeowner, often older and not technical, by voice or chat. The assistant:

1. Asks for the postcode first and runs a location lookup (service area, subsidy region, local factors).
2. Collects the building and energy facts one by one, in plain language, accepting "I don't know".
3. Runs the deterministic assessment through tools (never doing maths itself).
4. Tells the homeowner an honest result, a rough cost and subsidy range, and the next step.
5. Sends a structured report to nuuEnergy's sales team (with consent) and, depending on the outcome,
   promises a call, asks for photos, or gives an honest "not now" with a way forward.

No UI is in scope. The deliverable is: an **MCP server** exposing the tools, a **conversation orchestrator**
(session state + agent loop), and a small **HTTP API** that any front end (app, phone line, web chat) can call.

### Design principles
- **LLM talks, tools decide.** The model chooses what to ask next and phrases it; tools validate answers,
  compute everything and return the verdict. The model must never state a number that did not come from a tool result.
- **One question at a time, plain words, no pressure.** Short sentences. Read numbers back. Offer "I don't know".
- **Missing data is never a "no".** Unknowns lead to yellow and a technician check, never red (existing engine rule).
- **Fair and private.** Never ask or store age, income (outside the homeowner-only subsidy calculator), nationality,
  gender or health. The conversation adapts to how the person talks, not to who they are.
- **Same engine everywhere.** Web app, agent and sales dashboard all call the same `assess()` / `visitDecision()`.

---

## 2. Architecture

```
 Front end (app / phone / web chat)         nuuEnergy CRM / email / Slack
            │  HTTP + websocket                        ▲
            ▼                                          │ webhook (sales report)
 ┌──────────────────────────────┐        ┌──────────────────────────┐
 │ Conversation orchestrator    │◄──────►│ Report & lead service    │
 │  - session store             │        │  - lead JSON + summary    │
 │  - agent loop (Astra)        │        │  - briefing (Heizungs-    │
 │  - slot tracker / next-Q     │        │    baumeister) HTML/PDF   │
 │  - safety guard              │        └──────────────────────────┘
 └──────────────┬───────────────┘
                │ MCP (tool calls)
                ▼
 ┌──────────────────────────────────────────────────────────┐
 │ MCP server "heatpump-tools"                               │
 │  location • profile • assessment • costs • photos •       │
 │  bill • sales decision • lead • callback                  │
 │  (thin wrappers over app/src/engine + app/src/sales)      │
 └──────────────────────────────────────────────────────────┘
```

- **Language/runtime:** TypeScript on Node 20+, so the existing engine is imported directly (move `app/src/engine`,
  `app/src/sales`, `app/src/ai` into a shared package `packages/core`; the web app imports it too).
- **MCP:** `@modelcontextprotocol/sdk`, stdio for local dev, Streamable HTTP for deployment.
- **Model:** Astra (`gpt-6-astra`) via the existing `src/ai/provider.ts` (OpenAI-compatible). Use native tool/function
  calling. Keep the provider swappable (Claude/OpenAI/Astra) as today.
- **Storage:** SQLite (demo) behind a repository interface; swappable for Postgres. Photos on disk/S3 with signed URLs.
- **Voice (optional, later):** STT/TTS outside this service; the orchestrator only sees text turns plus photo uploads.

---

## 3. Conversation flow (state machine)

States are explicit; the model moves between them only via tool results.

| # | State | Goal | Exit when |
|---|---|---|---|
| 0 | `GREETING` | Introduce nuuEnergy assistant, explain it takes ~5–10 min, free, no obligation, can stop anytime, a family member may help. Ask permission to start. | user agrees |
| 1 | `LOCATION` | Ask postcode → `lookup_location`. | lookup done |
| 1a | `OUT_OF_AREA` | If outside service area: still offer the free self-check result, but say no expert can be sent; offer a local-installer hint. | user chooses to continue or end |
| 2 | `MUST_HAVE` | Collect must-have slots (§4.1). | all must-have slots filled or explicitly "don't know" |
| 3 | `INTERIM_CHECK` | `assess_building` + `get_next_questions`. If verdict is already confident (green/high or red with obstacle), skip to 5. | tool says enough |
| 4 | `DEEPEN` | Ask only the "very useful" and feasibility slots that change the result (ranked by `get_next_questions`). Offer photos via SMS link. | `get_next_questions` returns none, or user wants to stop |
| 5 | `CONFIRM` | Read back key facts; show contradictions kindly; user confirms (AGB 4.1). | confirmed |
| 6 | `RESULT` | `assess_building`, `estimate_costs`, `explain_result`. Tell verdict, reason, open points, rough cost. | delivered |
| 7 | `SALES_QUESTIONS` | Optional: owner/tenant, timeline, boiler broken, decision-makers. Ask permission first. | answered or skipped |
| 8 | `CONSENT_CONTACT` | Ask consent to share with nuuEnergy; collect name + phone + preferred call time only if consented. Mention right to object to marketing profiling. | consent yes/no |
| 9 | `HANDOFF` | `visit_decision` → `create_lead` → `send_sales_report` → closing statement (§6). | done |
| — | `HUMAN_HANDOFF` | Any time the user asks for a person, is confused/upset, or a safety rule triggers. | — |
| — | `PAUSED` | User wants to continue later; session resumable by link/code for 14 days. | — |

Rules:
- Max one question per turn; never stack questions.
- After 2 unclear answers to the same question, offer "Shall we skip this? A technician can check it." and mark unknown.
- If the user volunteers several facts at once, call `update_profile` with all of them and do not re-ask.
- Every 4–5 questions, give a one-line progress note ("Two more questions about the house, then I'll give you a first answer.").

---

## 4. Slots (questions) and how each is used

Each slot is stored with **value, unit, provenance** (`user_said`, `bill_ai`, `photo_ai`, `location_lookup`, `default`),
**confidence** and **timestamp**. Names match the engine's `Building` type where one exists.

### 4.1 Must have
| Slot | Engine field | Plain question (draft) | Accepts | Notes |
|---|---|---|---|---|
| postcode | `location` | "What is your postcode? Five digits are enough." | 5 digits | Asked first → `lookup_location`. |
| energy use | `annual_consumption_kwh` | "How much heating fuel do you use in a year? It's on your yearly bill. kWh, litres of oil or cubic metres of gas are all fine." | number + unit; or bill photo | Convert L/m³ × 10 in the tool. Offer "or send a photo of the bill". |
| fuel | `energy_carrier` (+ detail) | "What do you heat with today: gas, oil, liquid gas (LPG), district heating or electricity?" | enum | LPG → carrier `gas`, detail "LPG". |
| year built | `construction_year` | "Roughly when was the house built? The decade is enough." | year / decade | Decade → mid-year, provenance `user_estimate`. |
| heated area | `floor_area_m2` | "About how many square metres do you heat?" | number | Plausibility 15–5000. Offer "rooms × ~15 m²" only as a prompt, never auto-fill. |
| distribution | `heat_distribution` | "Do you have radiators, floor heating, or both?" | enum | Underfloor → skip radiator/pipe slots. |
| people + hot water | `persons_in_household`, `hot_water_via_heating` | "How many people live there?" then "Does the same boiler also make your hot water?" | int; yes/no | Two separate turns. |

### 4.2 Very useful (asked only if `get_next_questions` ranks them as decisive)
| Slot | Engine field / effect | Plain question (draft) |
|---|---|---|
| renovation | `renovation_status` + notes | "Has anything been insulated or replaced since it was built, like windows, walls or the roof? Roughly when?" |
| other heat sources | `building_notes` | "Do you also heat with a wood stove or fireplace, or have solar panels for hot water?" |
| unused areas | `building_notes` | "Are there parts of the house you don't heat, like an empty top floor?" |
| radiator count | `radiator_info` | "Roughly how many radiators are there?" |
| radiator / pipe photos | `PhotoFindings` | "Could you (or someone with you) take a photo where the pipes meet a radiator? I'll send a link to your phone." |
| boiler age | commitment.boiler + subsidy | "How old is your boiler, roughly? If it's over 20 years, there's an extra subsidy." |
| flow temperature | `flow_temperature_c` | Only if user knows it: "Do you know the temperature setting of your heating water?" |

### 4.3 Feasibility (website no-go reasons)
| Slot | Effect | Plain question (draft) |
|---|---|---|
| meter cabinet photo | pre-check (upgrade risk) | "A photo of your electricity meter cabinet helps us spot a costly upgrade early." |
| outdoor spot photo + distance | pre-check, noise flag | "Where could an outdoor unit go, garden or wall? About how many metres to the neighbour's boundary?" |
| house type | tight placement flag | "Is it a detached house, semi-detached, or in a row (terraced)?" |

### 4.4 Sales side (optional, after the result, with permission)
`ownership`, `timeline`, `boiler` (broken?), `decisionMakers` exactly as `app/src/sales/types.ts` `Commitment`.
Phrase: "Do you mind a few short questions so our team can plan the next step? You can skip any of them."

### 4.5 Never ask
Age, date of birth, income (except the homeowner-only subsidy calculator, never sent to sales), health, nationality,
bank or card details, passwords, ID numbers. If the user volunteers them, do not store them.

**[TEAMMATE]** Final question list and wording (and German versions) replace the drafts above. Keep slot names stable.

### 4.6 Teammate parameter list → conversation plan (v0.2)

The teammate's inventory has ~50 parameters. Asked one by one that is a 30-minute call, too long for an older
caller on the phone. Every parameter is therefore assigned a **mode**:

- **ASK**: always asked in the call (target: 9 questions, ~5 minutes).
- **ADAPT**: asked only if `get_next_questions` shows it changes the verdict, confidence, tier or a cost line.
- **PHOTO/DOC**: collected by SMS upload link (photo or document), never as a spoken question.
- **TECH**: not asked in the call; listed in the briefing for the 30-min call or the on-site visit. Asked only if the
  caller volunteers it or clearly knows (e.g., says "I'm an engineer").
- **SALES**: after the result, with permission, all optional.
- **CONTACT**: end of call, only with consent.

| Teammate parameter | Mode | Slot / engine field | Effect |
|---|---|---|---|
| Postcode or service region | ASK (first) | `location` | `lookup_location`: service area, region, subsidy top-up |
| Type of home | ASK | `house_type` (new: detached/semi/terraced/apartment/other) | noise/placement flag; apartment → approval path |
| Owner / representative / renter / unsure | SALES (ASK early if apartment) | `commitment.ownership` (+ `representative`) | tier C "involve the owner" for renters |
| Number of residential units | ADAPT (only if apartment/multi) | `units_in_building` (new) | >1 → approval needed, shared system likely |
| Approval needed (landlord / WEG / co-owners) | ADAPT (if renter, apartment or units > 1) | `approval_needed` (new) | tier C; report flag |
| Construction year | ASK | `construction_year` | method A band; single-pipe prior |
| Heated floor area | ASK | `floor_area_m2` | both methods |
| Number of heated rooms | ADAPT (if area looks implausible) | `rooms` | contradiction check (m²/room) |
| Number of floors | TECH | `floors` (new) | briefing only (pipe runs, indoor space) |
| Insulation / renovation status | ASK | `renovation_status` | method A band, combination rule |
| Renovation measures (windows, roof, façade, doors) | ADAPT (if renovated) | `renovation_measures[]` → `building_notes` | partial vs full; insulation tips |
| Year of each renovation | ADAPT (only if it decides partial vs full) | `renovation_years` (new) | old measures (<1995) count as partial |
| Energy certificate rating / demand | PHOTO/DOC (or ADAPT if known) | `certificate_kwh_m2a` (new) | **new cross-check**: bill vs certificate → contradiction if > 40 % apart; never replaces the bill |
| Heating fuel | ASK | `energy_carrier` (+ biomass, other → no fixed price) | cost comparison |
| Heater type and model | PHOTO/DOC (boiler-room photo) / TECH | `heater_model` (new) | briefing |
| Heater age / installation year | ASK | `commitment.boiler` + `boiler_year` | +16 % subsidy if ≥ 20 y; urgency |
| Location of the current heater | TECH | `heater_location` (new) | briefing (indoor unit placement) |
| Heater also provides hot water | ASK | `hot_water_via_heating` | method B hot-water deduction |
| Annual consumption | ASK (or bill photo) | `annual_consumption_kwh` | method B, costs |
| Consumption unit | ASK (same turn) | converted in `update_profile` | L/m³ × 10 |
| Consumption includes hot water | ADAPT (if hot water is separate or unclear) | drives `hot_water_via_heating` | no deduction if hot water is made elsewhere |
| Current flow temperature | TECH (ADAPT if known) | `flow_temperature_c` | JAZ; usually unknown, technician tests 55 °C |
| System problems / comfort issues | ADAPT (open question, radiators only) | `comfort_issues` (new) | uneven heat → "radiators may be undersized" unknown + tech check |
| Heat emitters (radiators, underfloor, wall, ceiling, mixed) | ASK | `heat_distribution` (+ `wall`/`ceiling`) | JAZ. **Decision needed:** treat wall/ceiling heating like underfloor (low temperature, JAZ 4.0)? Guardrails don't define it; default = like underfloor with a technician check |
| Share of each emitter type | ADAPT (if mixed) | `emitter_share` (new) | briefing; radiator circuit still sets flow temp |
| Pipe system | ADAPT (radiators + built < 1980 or apartment) → PHOTO | `pipe_system` | #1 obstacle; photo classifier |
| Radiator type and size | PHOTO / TECH | `PhotoFindings.radiator_type` | 55 °C output check (future) |
| Rooms heat evenly | ADAPT (with comfort issues) | `comfort_issues` | as above |
| Hydraulic balancing done | TECH | `hydraulic_balancing` (new) | tip / tech check; KfW requires it anyway |
| Number of people | ASK | `persons_in_household` | hot-water deduction |
| Hot-water system (central / electric / HP water heater) | ADAPT (if "heater makes hot water" = no/unsure) | `hot_water_system` (new) → `hot_water_via_heating` | deduction |
| Hot-water tank present | TECH | `hot_water_tank` (new) | indoor space; briefing |
| Hot-water usage | TECH | — | not used (fixed 1,000 kWh/person rule) |
| Planned household changes | ADAPT (open, end of building part) | `planned_changes` (new) | report note; sizing caution |
| Indoor location / space for equipment | PHOTO (boiler room) / TECH | `indoor_space` (new) | pre-check, briefing |
| Outdoor-unit location and access constraints | PHOTO + 1 spoken question | `outdoor_spot` | pre-check; tight-placement flag |
| Distance to windows / neighbour | ASK in the outdoor question | `outdoor_spot.neighbour_distance_m` | noise flag (TA Lärm, AGB 7.7) |
| Noise or planning concerns | ADAPT (open) | `noise_concerns` (new) | report flag; tech check |
| Access route for installation | PHOTO / TECH | `access_route` (new) | briefing |
| Meter cabinet condition | PHOTO | `meter_cabinet` | upgrade-cost risk |
| Electrical connection / upgrade needs | TECH | — | always a technician check (guardrails) |
| PV system or battery | ADAPT (one yes/no) | `pv_battery` (new) | report: self-consumption potential (no extra price maths; no fixed PV price given) |
| Chimney, oil tank, other removal | ADAPT (if oil, or old boiler) | `removals[]` (new) | cost-driver line; briefing |
| Desired timeframe | SALES | `commitment.timeline` | tier, P(sale) |
| Heater working / urgent | SALES (ASK early if caller mentions a breakdown) | `commitment.boiler = broken` | urgency, tier |
| Photos available | PHOTO/DOC | upload links | pre-check completeness |
| Documents (bills, certificate, records, floor plans) | PHOTO/DOC | `documents[]` | bill reader; certificate cross-check |
| Preferred language | ASK (very first, or detected) | `lang` (de/en) | ElevenLabs voice + templates |
| Preferred contact method and details | CONTACT | `contact` | only with consent |

**Resulting call script (target ≈ 9 spoken questions + adaptive extras):**
language → postcode → house type → year built → heated area → fuel + yearly amount (or "send bill photo") →
emitters → people + does the boiler make hot water → boiler age → renovation done? → *(adaptive: pipe system,
other heat sources, unused floors, comfort issues, PV, approvals)* → read-back → result → *(sales, with permission)* →
consent + contact → SMS link for photos/documents.

**New engine rules this introduces (must be tested on B-01..B-05 before use):**
1. Energy-certificate cross-check (contradiction only, never changes the estimate).
2. Wall/ceiling heating mapped to low-temperature emitters (pending decision).
3. Comfort issues → "radiators may be undersized" unknown (yellow, never red).
4. Hot water made elsewhere → no hot-water deduction (already supported via `hot_water_via_heating=false`).
5. Apartment / units > 1 / approval needed → sales tier C "involve owner/association" (technical verdict unchanged).
6. Biomass/other fuel → no current-cost comparison (as district heating today).

---

## 5. MCP tools

All tools are deterministic unless marked *AI*. Inputs/outputs are JSON (zod schemas). Every result includes
`explanations: string[]` the model may paraphrase, and `numbers: Record<string, number>` the model may quote verbatim.

| Tool | Purpose | Wraps |
|---|---|---|
| `lookup_location(postcode)` | Service area, region, subsidy top-ups, **[TEAMMATE]** local factors | `sales/offer.serviceArea` + teammate module |
| `update_profile(session_id, fields[])` | Validate + store slot values with provenance; returns normalized values, read-back text, plausibility warnings | `engine/sanitize` |
| `get_profile(session_id)` | Current slots + which are unknown | store |
| `get_next_questions(session_id, max=3)` | Ranked list of slots still worth asking, with reason ("decides pipe system"), and `enough_for_result: bool` | new, see §5.1 |
| `assess_building(session_id)` | Verdict, confidence, heat load (both methods + chosen + rule), flags (obstacles / unknowns / contradictions), technician checks | `engine/assess` |
| `path_to_green(session_id)` | Steps that would turn the result green, or blockers | `engine/pathToGreen` |
| `estimate_costs(session_id, income_band?)` | Running costs (HP vs today), unit size, price band, subsidy lines incl. "apply before ordering" | `engine/costs`, `sales/offer` |
| `explain_result(session_id, audience='homeowner'\|'sales')` *AI* | Plain-language text, guarded (no new numbers, same verdict) | `ai/explain` |
| `request_photo_link(session_id, kind)` | Create upload link (SMS/email) for `radiator`, `meter_cabinet`, `outdoor`, `boiler_room`, `bill` | new |
| `classify_pipe_photo(session_id, photo_ids[])` *AI* | Single/two-pipe/unclear, 3-look vote; never overrides stated data | `ai/classifyPipePhotosVoted` |
| `assess_meter_cabinet_photo(photo_id)` *AI* | modern / old-or-full / unclear + upgrade-risk flag | new (same vote pattern) |
| `assess_outdoor_photo(photo_id, distance_m?, house_type?)` *AI* | space hint, tight-placement / noise flag | new + `sales/types.tightPlacement` |
| `read_bill(photo_id)` *AI* | kWh, carrier, cost, period → proposed slot values (must be confirmed by user) | `ai/readBill` |
| `confirm_details(session_id)` | Read-back summary + kind contradiction prompts for the CONFIRM state | new |
| `visit_decision(session_id)` | Tier A/B/C/D, out-of-area flag, reasons, P(sale) steps, EV | `sales/visitDecision` |
| `record_consent(session_id, scopes[])` | Consent for sharing with nuuEnergy, contact, photos; timestamped | new |
| `create_lead(session_id, contact?)` | Persist lead; returns lead_id | `sales/store` (server version) |
| `send_sales_report(lead_id)` | Build report (§7) and deliver via webhook/email/Slack | new |
| `schedule_callback(lead_id, preferred_window)` | Record preferred call time; returns promise text per tier | new |
| `handoff_to_human(session_id, reason)` | Flag for a human to take over; returns message to user | new |

### 5.1 `get_next_questions` ranking (deterministic)
1. Any unfilled must-have slot (in table order).
2. Slots whose answer would change the **verdict or confidence**: re-run `assess` with the slot set to its
   best and worst plausible value; ask if the verdict differs (e.g., pipe system for pre-1980 radiators,
   renovation for pre-1979, other heat source when the bill looks implausibly low).
3. Feasibility slots (meter cabinet, outdoor spot, house type), because they shorten the visit.
4. Stop when nothing would change the verdict, or after the user says they want to finish.
Skip logic: underfloor only → no radiator/pipe/flow slots; out of area → no feasibility/sales slots unless user asks.

---

## 6. Outcomes: what the homeowner hears

The verdict is technical (`assess`); the next step comes from `visit_decision`. Statements are templates the model
may rephrase but must keep the meaning. No promises the tier does not support.

| Situation | What the homeowner hears (template) | Sales action |
|---|---|---|
| **Green**, tier A | "Good news: from what you told me, a heat pump very likely suits your home. Your rough running costs would be about €X instead of €Y a year. One of our planning team will call you as soon as possible, usually within [SLA], to arrange the free visit by our heating master." | Book on-site heat-load visit (A). Report flagged *priority*. |
| **Green**, tier B (e.g., few photos, no timeline) | "It looks promising. The next step is a short phone call, about 30 minutes, with our technical planning team to go through the details. They'll call you at the time you chose." | 30-min call (B). |
| **Yellow**, unknowns | "It may well work, but a few things can't be told from here, for example [open points]. That's normal. Our planning team will call you for a short technical chat; if you can send a photo of [X], that call will be even quicker." | B, plus photo link. |
| **Yellow**, data contradictions (tier C) | "Some numbers don't quite fit together, for example [kind contradiction]. Could you check your bill when you have a moment? I've sent you a link; once that's clear, our team will get in touch." | C: request info/photos, auto-reminder after 3 days. |
| **Yellow/Red**, single-pipe or other obstacle | "There is one thing that makes it harder: [obstacle in plain words]. It doesn't rule it out. Options are [way forward]. Our team can talk you through them by phone if you like. Would you like that?" | B if they say yes, else D with info pack. |
| **Red**, hard obstacle | "To be honest, with what we know now a heat pump isn't a good fit, because [reason]. That could change if [path to green]. I'll send you our guide on insulation and subsidies, and you're welcome to check again later." | D: info + subsidy guide, re-contact later. Never "rejected". |
| **Out of area** | "Thank you. Your home is outside the area where our team works, so we can't send an expert. Here is your free first assessment anyway, and a tip on finding a local installer." | Outside service area (no lead unless consented for info). |
| **Not enough data** | "I can't give you a reliable answer yet without [missing]. Would you like to continue later, or have our team call you to help?" | C or PAUSED. |

Always close with: the reference number, what happens next and when, that it's free and without obligation,
the subsidy rule "apply before you order", and how to stop contact / object to profiling.

---

## 7. Sales report (what the team receives)

Delivered as JSON (webhook) + human-readable summary (email/Slack) + link to the Heizungsbaumeister briefing.

```jsonc
{
  "lead_id": "L-2026-10-24-0042",
  "created_at": "...",
  "consent": { "share_with_nuu": "2026-10-24T14:02Z", "contact": true, "photos": true, "profiling_objection": false },
  "contact": { "name": "...", "phone": "...", "preferred_window": "weekday mornings" },   // only with consent
  "location": { "postcode_area": "82xxx", "region": "Munich area", "service_area": "in", "local": { /* [TEAMMATE] */ } },
  "building": { /* engine Building with provenance per field */ },
  "assessment": { "verdict": "yellow", "confidence": "medium", "heat_load": { "best_kw": 9.5, "range": [9.5, 19.2], "rule": "..." },
                  "obstacles": [...], "unknowns": [...], "contradictions": [...], "technician_checks": [...] },
  "path_to_green": { "steps": [...], "blockers": [...] },
  "costs": { "hp_eur": [2043, 2043], "current_eur": 4250, "unit_kw": [10], "price_band_eur": [35000, 45000], "subsidy_pct": 46 },
  "visit_decision": { "tier": "B", "label": "30-min technical phone call first", "reasons": [...], "p_sale": 0.3, "expected_value_eur": 650 },
  "pre_check": { "completeness_pct": 55, "answered_remotely": [...], "still_on_site": [...] },
  "photos": [{ "kind": "radiator", "url": "signed...", "ai": { "label": "single-pipe", "confidence": 0.79, "agreement": 1 } }],
  "conversation": { "turns": 34, "duration_min": 9, "summary": "...", "user_questions": ["Is it loud?"], "concerns": ["cost"] },
  "promised_to_customer": "Call within 2 working days"
}
```
Never included: age, income, health, anything the user volunteered outside the slots.

---

## 8. Safety, fairness, privacy (guard layer in the orchestrator)
- **Number guard:** before sending any assistant message, extract numbers; each must appear in a tool result of this
  session (reuse the `explain.ts` check). Otherwise regenerate once, then fall back to a template.
- **Verdict guard:** the assistant may only state the verdict returned by `assess_building`.
- **No pressure:** banned phrases list (e.g., "only today", "last chance"); subsidy dates only as facts.
- **Customer protection:** the assistant never asks for bank details, passwords or ID; it states that nuuEnergy will
  never ask for these by phone. Helpful for older users targeted by scams.
- **Accessibility:** short sentences, one question per turn, offer to repeat, slower TTS rate option, no jargon
  (heat load → "how much heat the house needs on the coldest days"), always allow a human.
- **Consent:** nothing goes to sales before `record_consent`; consent text versioned; right to object shown.
- **Data minimisation:** delete sessions without consent after 30 days; photos stored only with consent.
- **Logging:** every tool call with inputs/outputs for audit; redact contact details in logs.

---

## 9. HTTP API (for any front end)
| Method | Path | Body / result |
|---|---|---|
| POST | `/sessions` | `{ channel: 'chat'\|'voice', lang }` → `{ session_id, first_message }` |
| POST | `/sessions/:id/messages` | `{ text }` → `{ messages[], state, progress }` (streaming via SSE optional) |
| POST | `/sessions/:id/photos` | multipart `{ kind, file }` → `{ photo_id, finding? }` |
| GET | `/sessions/:id` | state, slots, last assessment (for resume / debugging) |
| POST | `/sessions/:id/pause` | → `{ resume_code }` |
| POST | `/sessions/resume` | `{ resume_code }` → session |
| GET | `/leads/:id/briefing` | HTML briefing (print to PDF) |
| POST | `/webhooks/test` | send a sample report to the configured sales endpoint |

---

## 10. Repo layout (proposal)
```
packages/core/            engine + sales + ai (moved from app/src, unchanged API); app imports from here
services/mcp-tools/       MCP server (tool schemas, handlers, tests)
services/orchestrator/    session store, agent loop, guard, HTTP API, report sender
services/orchestrator/prompts/system.md   assistant persona + rules
services/orchestrator/templates/          outcome statements (§6), en + de
docs/AGENT_BACKEND_SPEC.md                this file
```

## 11. Tests and acceptance criteria
- **Tool unit tests:** every tool against the 5 dataset houses; results identical to `assess()` / `visitDecision()`.
- **Scripted conversations (no LLM):** replay fixed user turns through the orchestrator with a mock model that calls
  tools in order; assert final state, verdict, tier, report JSON. One script per §6 row.
- **LLM conversation evals (live, opt-in):** a simulated homeowner persona (Astra playing the user: hesitant,
  answers in decades, gives litres not kWh, asks to repeat, volunteers two facts at once, says "I don't know").
  Pass if: one question per turn, no invented numbers (guard log empty), correct verdict, all must-have slots asked,
  conversation ≤ 25 assistant turns for a complete profile.
- **Safety evals:** user asks "what's your bank account", "can you guarantee savings", gives age/income → assistant
  declines/does not store.
- Acceptance for the demo: B-02, B-04, B-05 reachable by conversation with the same verdicts/tiers as the web app.

## 12. Voice: ElevenLabs

The customer talks to an **ElevenLabs Conversational AI agent** (phone via Twilio/SIP, or web widget).
Verify exact feature names against the current ElevenLabs Agents docs before building.

**Recommended wiring (option A): ElevenLabs does voice, we do the brain.**
```
 Caller ──phone/web──► ElevenLabs agent (STT, TTS, turn-taking, voice)
                            │  "Custom LLM" = OpenAI-compatible endpoint
                            ▼
                 Orchestrator /v1/chat/completions (ours)
                   - session state, state machine, next-question
                   - Astra (gpt-6-astra) + MCP tools
                   - number / verdict / pressure guard
                            │ tool calls
                            ▼
                 MCP server "heatpump-tools"
 ElevenLabs post-call webhook ──► orchestrator: transcript + recording link → sales report
```
- Why A: the guard (no invented numbers, verdict only from tools) and the state machine stay in our code. If
  ElevenLabs called Astra and the tools directly (option B: built-in LLM + server tools/MCP), we'd lose that control.
- Option B is acceptable as a **fallback for the demo** if custom-LLM latency is a problem: register our tools as
  ElevenLabs server tools (webhooks to the MCP handlers) and put the rules in the agent prompt. The guard then only runs
  on tool outputs.

**Voice-specific requirements:**
- **Language:** German and English voices; `lang` slot chosen in the first turn (or from caller's first words).
- **Pace for older callers:** slower speaking rate, longer end-of-turn silence (patience before the agent replies),
  allow interruptions, offer "shall I repeat that?".
- **Numbers by voice:** read postcodes digit by digit ("eight, two, three…"), years as years, amounts with units;
  always confirm ("So that's two thousand five hundred litres of oil a year, right?").
- **Latency budget:** deterministic tools < 300 ms. AI photo/bill tools are **asynchronous** (≈20 s): the agent says
  "I'll have our system look at the photos; the result goes to our team" and never waits in silence.
- **Photos/documents:** voice can't carry them; `request_photo_link` sends an SMS/e-mail upload link during the call;
  results are attached to the lead when they arrive (and can re-run `assess_building` → updated report).
- **Short spoken answers:** the orchestrator returns ≤ 2 sentences per turn for voice (`channel: 'voice'`), longer text only in chat.
- **Recording and consent:** announce recording at the start if recorded; post-call transcript only stored with consent.
- **Handoff:** "speak to a person" → `handoff_to_human` → ElevenLabs transfer to a phone number (or callback promise).
- **Scam-safety line** in the greeting: "nuuEnergy will never ask you for bank details or passwords."

## 13. Roadmap

| Phase | Deliverable | Depends on | Done when |
|---|---|---|---|
| **0. Decisions (today)** | Answers to §14 open inputs: report channel, callback promises, consent text, wall/ceiling heating rule, ElevenLabs option A/B | you + team | written in this doc |
| **1. Core package** | Move `engine`, `sales`, `ai` to `packages/core`; web app still green (65 tests) | — | app builds, tests pass |
| **2. Slots v0.2** | Profile model with all §4.6 slots + provenance; `update_profile` validation, unit conversion, read-back text; new engine rules 1–6 behind tests | teammate list (received) | B-01..B-05 results unchanged; new rules tested |
| **3. MCP server** | Tools from §5 (location stubbed → real once location analysis arrives) | 1, 2 | tool unit tests on 5 houses |
| **4. Orchestrator** | State machine, `get_next_questions` (ASK/ADAPT logic), guard, chat API, scripted-conversation tests per §6 row | 3 | scripted runs reach same verdict/tier as web app |
| **5. Outcomes + sales report** | Templates (en/de), consent, lead + report JSON/summary, briefing link, delivery to chosen channel | 4, decisions | sample report received by sales channel |
| **6. ElevenLabs voice** | Agent configured (voices de/en, pacing), custom-LLM endpoint, SMS photo link, post-call webhook, human transfer | 4, 5, ElevenLabs account | end-to-end call for B-02 / B-04 / B-05 personas |
| **7. Location module** | Teammate's location analysis as `lookup_location` outputs (+ engine changes only if agreed and re-tested) | teammate | location results in report |
| **8. Evals + polish** | Simulated older-caller persona evals (voice + chat), safety evals, latency check, prompt tuning (not rule tuning) | 6 | ≤ 25 turns, 0 guard violations, correct verdicts |

Demo cut (if time is short): phases 1, 3, 4 (chat only), 5 with report to a local file/Slack, then 6 using option B.

---

## 14. Open inputs needed
See the chat summary; tracked here:
- [ ] **[TEAMMATE] Location analysis:** still missing. The parameter list only says "postcode or service region".
      Need: what location determines, the outputs, and the data sources (see §5 `lookup_location`).
- [x] Parameter list received (v0.2, mapped in §4.6). Still needed: final spoken wording in German + English for the ASK questions.
- [ ] Wall/ceiling heating: treat like underfloor (JAZ 4.0, technician check)? Yes/no.
- [ ] ElevenLabs: account/agent access, voices (de/en), phone number (Twilio/SIP) or web widget for the demo,
      whether custom LLM (option A) is allowed on the plan; SMS provider for photo links.
- [ ] Sales report destination (CRM webhook / email / Slack) and format they want.
- [ ] Callback promise (SLA) per tier, and working hours.
- [ ] Contact details to collect and the consent text (legal/privacy review).
- [ ] Language(s) and channel (voice, chat, both) for the demo.
- [ ] Astra access details: model id confirmed `gpt-6-astra`; tool calling via OpenAI-compatible API, or native MCP?
- [ ] Whether location should adjust the heat-load maths (e.g., full-load hours / design temperature by region) —
      this would change the engine and must be agreed and tested on B-01..B-03 first.
