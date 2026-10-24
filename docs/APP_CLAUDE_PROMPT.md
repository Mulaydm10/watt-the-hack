# Prompt for the Claude building the phone app (paste as-is)

You are building the homeowner screens of the Flutter app `apps/heatpump` (Android, `dev.dhruv.heatpump`, kit port 8812)
in the phone-apps repo. The design concept is chosen by the owner (thermal / air / say). Your job now: replace the
scripted demo session with the **real backend**. Submission closes at 18:00; homeowner flow only. Sales dashboard and
technician briefing stay on the desktop web app; do not build them in the app.

## Ground rules
- **The app never calculates anything.** Every number, verdict, cost, subsidy and next step comes from the backend.
  Display values as returned (numbers are numbers; format with the locale, e.g. `de_DE` → 25.000 kWh, 2.043 €).
- **Missing data is never a "no".** Show "I don't know / Weiß nicht" on every question; unknowns lead to yellow, never red.
- **Nothing is shared without consent.** The backend asks for consent in the conversation; never send contact data
  from the app outside that flow. Never ask for age, income, health, bank details.
- **Accessibility first** (many users are older): one question per screen/turn, 18 sp+ text, 48 dp tap targets, high
  contrast, the traffic light always with a word and an icon, never colour alone. A visible "Speak to a person" action.
- German by default, English supported (the backend also follows fr, it, es, nl, pl, pt in free text).
- Keep the scripted B-04 / B-05 session as an **offline fallback** behind a "Demo mode" switch (venue Wi-Fi may fail).

## Backend
Base URL (configurable, e.g. `--dart-define=API_BASE=...`):
- public: `https://dhruvs-mac-mini.tailaf7ebe.ts.net`
- inside Tailscale: `http://100.80.210.100:8787`
JSON in/out. No auth for the homeowner endpoints. Timeouts: 60 s for messages (a turn takes ~5–8 s), 10 s otherwise.
Show a "Still thinking…" state after 3 s; on error show a friendly retry, keep the typed text.

### Conversation (main flow: chat or voice-style UI)
1. `POST /sessions` body `{"channel":"chat","lang":"de"}` →
   `{ session_id, messages: [greeting], state, progress: { pct, label: { en, de } } }`
2. `POST /sessions/{id}/messages` body `{"text": "<what the user typed or tapped>"}` →
   `{ messages: [reply], state, progress, suggested_answers: [string], guard }`
   - Render `messages[0]` as the assistant bubble. Render `suggested_answers` as tappable chips (they already include
     "Weiß nicht / I don't know"); tapping a chip sends its text as the next message.
   - `state` drives the UI: `GREETING, LOCATION, OUT_OF_AREA, MUST_HAVE, DEEPEN, CONFIRM, RESULT, SALES_QUESTIONS,
     CONSENT_CONTACT, HANDOFF, DONE, HUMAN_HANDOFF, PAUSED`. Show `progress.pct` + `progress.label[lang]` as a progress bar.
   - When `state` becomes `SALES_QUESTIONS` (or later) for the first time, fetch the result (step 3) and show the
     result screen; the conversation continues below it for the optional questions, consent and goodbye.
   - When `state` is `DONE`, show the last message as the closing screen (it contains the reference number and the
     dated callback promise) with "Start again".
3. `GET /sessions/{id}/result` →
   ```
   { verdict: "green|yellow|red", confidence: "high|medium|low", headline, reasons: [string],
     areas: [ { key: "demand|fit|feasibility|confidence", title, status: "good|check|issue", reason, nextCheck } ],
     heat_load: { bestKw, bestWPerM2, range: { low, high }, methodA, methodB, rules: [ { effect, reason } ] },
     flags: { obstacles: [ {title, detail} ], unknowns: [...], contradictions: [...], technicianChecks: [...] },
     costs: { running_costs: { heat_pump_eur_per_year, heat_pump_worst_eur_per_year, current_eur_per_year,
                               current_label, saving_eur_per_year_worst, assumptions: [string] },
              unit_kw: [number], sizing_note, price_band_eur: { low, high, label, note }, cost_drivers: [string],
              subsidy: { pct, max_eur, lines: [string], warning }, nuu_payback_claim },
     path_to_green: { steps: [ { check, outcome, effort, verdict, confidence } ], reachesGreenHigh, blockers: [string] },
     outcome: string | null }
   ```
   Result screen order: traffic light + confidence + headline → the **four area cards** (status badge + reason +
   "Next: nextCheck") → rough costs (heat pump vs today per year; price range "rough guide, before subsidy";
   subsidy lines; the `subsidy.warning` "apply before you order") → what a technician checks → path to green
   (only if not green/high) → "Show details" (heat-load methods, assumptions).

### Photos (optional task cards: meter cabinet, radiator, outdoor spot, boiler room, access, bill, certificate)
- `POST /sessions/{id}/photos?kind=meter_cabinet|radiator|outdoor|boiler_room|access|bill|certificate`
  with the **raw file as the body** and `Content-Type: image/jpeg|image/png|image/webp|image/heic|application/pdf`
  (max ~15 MB; compress to ~2 MB first) → `201 { photo_id, status: "received" }`.
- Poll `GET /sessions/{id}/photos/{photo_id}` every 5 s (stop after 60 s) → `{ status: "pending|analysed", finding }`.
  AI analysis takes ~20 s; never block the conversation. Show "Thanks, our system is looking at it", then a plain
  sentence from the finding (e.g. meter cabinet `finding.finding`: modern / old-or-full / unclear;
  radiator `finding.label`: single-pipe / two-pipe / unclear). Always add "a technician confirms".
- Alternative for family helpers: the web upload page `GET {base}/upload/{session_id}` (share this link).

### Other endpoints
- `GET /slots?lang=de|en` → question catalogue `[ { id, group, mode, type, question, why, options:[{value,label}], min, max } ]`
  (only if you build a form mode; the chat flow does not need it).
- `POST /sessions/{id}/pause` → `{ resume_code, valid_days }`; `POST /sessions/resume` body `{ resume_code }` → `{ session_id, state, progress }`.
- `GET /sessions/{id}` → full state (slots with provenance, photos, message history) for resuming the screen.
- `GET /health` → `{ ok }` (use for a connection check on start; fall back to Demo mode if it fails).

## Done when
- B-04 typed in the app (85221, semi-detached, 1987, 160 m², oil 2,500 litres, radiators, 3 people, hot water yes,
  boiler age unknown, renovation unknown, single-pipe) ends **yellow, ~9.5 kW, heat pump €2,043 vs oil €4,250**, and the
  four area cards show "Heating-system fit: check (single-pipe … not an automatic no)".
- B-02 (82131, detached, 2005, 180 m², gas 15,500 kWh, underfloor, 3 people, hot water yes, wood stove + solar thermal)
  ends **green, ~9.9 kW**.
- A photo upload returns 201 and later shows a finding without blocking the chat.
- Demo mode works with the network off.
- A Maestro flow covers start → first answer → result screen.

Questions about the backend: ask the owner; the backend lane is `services/` + `packages/agent` (do not edit those).
