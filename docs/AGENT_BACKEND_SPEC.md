# Agent backend spec: "Heat Pump Ready?" conversational assistant

Status: draft v0.1 (24 Oct 2026). Owner: team NoIdea. Builds on the existing deterministic engine in `app/src/engine/`
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

## 12. Milestones (suggested)
1. Move engine to `packages/core`; MCP server with `lookup_location` (stub), `update_profile`, `assess_building`,
   `estimate_costs`, `visit_decision`, `create_lead`, `send_sales_report` (to a local file/webhook).
2. Orchestrator with state machine, `get_next_questions`, number/verdict guard, scripted-conversation tests.
3. Photo tools + upload links; bill reader.
4. Outcome templates (§6), consent, report delivery to the real channel.
5. Teammate's location module + final question list; German.
6. Live persona evals; tune prompts (not rules).

---

## 13. Open inputs needed
See the chat summary; tracked here:
- [ ] **[TEAMMATE] Location analysis:** inputs, outputs and data sources (see §5 `lookup_location`).
- [ ] **[TEAMMATE] Final question list** with wording (en + de), order, and which are must-have.
- [ ] Sales report destination (CRM webhook / email / Slack) and format they want.
- [ ] Callback promise (SLA) per tier, and working hours.
- [ ] Contact details to collect and the consent text (legal/privacy review).
- [ ] Language(s) and channel (voice, chat, both) for the demo.
- [ ] Astra access details: model id confirmed `gpt-6-astra`; tool calling via OpenAI-compatible API, or native MCP?
- [ ] Whether location should adjust the heat-load maths (e.g., full-load hours / design temperature by region) —
      this would change the engine and must be agreed and tested on B-01..B-03 first.
