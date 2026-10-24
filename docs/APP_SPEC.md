# App spec: "Heat Pump Ready?" customer app, sales dashboard and technician view

Status: v1.0 (24 Oct 2026). Team NoIdea, WATT THE HACK Munich, nuuEnergy challenge.
Audience: the developer (human or Claude) building the front end. Read together with:
- `docs/AGENT_BACKEND_SPEC.md`: the backend (orchestrator, MCP tools, HTTP API, ElevenLabs voice).
- `app/`: the existing working web prototype (React + Vite + Tailwind). **Reuse its components and copy; do not
  re-implement any calculation.** All numbers come from `packages/core` or from the backend API.
- `kit/`: the official challenge pages, data and the two briefs (`CLAUDE_BRIEF.md`, `SALES_BRIEF.md`).

---

## 1. Product in one paragraph

A homeowner, often older and not technical, wants to know whether a heat pump would work in their home. They can
**talk to an assistant on the phone** (ElevenLabs voice) or **use the app** (chat or a guided form). The assistant asks
one question at a time, then gives an honest traffic light (green / yellow / red), the reason, what still needs a
technician, a rough cost and subsidy range, and the next step. With the homeowner's consent, nuuEnergy's sales team
receives a structured lead with a visit decision (A: on-site visit, B: 30-min technical call, C: ask for missing info,
D: not now) and a one-page briefing for the heating master (Heizungsbaumeister).

## 2. Users and their jobs

| User | Device | Job to be done |
|---|---|---|
| **Homeowner** (incl. older people, family helpers) | phone (voice call), smartphone browser, tablet, desktop | "Would a heat pump work in my home, what would it cost, what happens next?" in under 10 minutes, no jargon, no pressure |
| **Family helper** | smartphone | take photos (meter cabinet, radiators, outdoor spot) for a parent via an SMS link |
| **nuuEnergy sales / planning team** | desktop | see all leads, decide who gets the expensive 2-h visit, call the right people first |
| **Heizungsbaumeister** (heating master) | tablet / print | arrive prepared: what is already known, what to check on site, what to bring |

## 3. Surfaces (what to build)

1. **Customer web app** (mobile-first PWA): start screen → chat or guided form → result → next steps.
2. **Photo upload page** (opened from SMS/e-mail link, no login, works on any phone).
3. **Session resume page** (code or link; continue later).
4. **Sales dashboard** (desktop, behind login): lead list, filters, lead detail, company settings, CSV export.
5. **Technician briefing** (printable page per lead).
6. **Voice channel** (ElevenLabs phone/web agent): no screens, but the app shows the same session afterwards
   (e.g., the result and photo link sent by SMS).

Out of scope: payments, booking calendars for the visit (the sales team calls), CRM replacement.

---

## 4. Customer app: screens and features

### 4.1 Start screen
- One sentence: "Would a heat pump work in my home? An honest first answer in about 5–10 minutes. Free, no obligation."
- Three big buttons (min 56 px high):
  1. **"Talk to our assistant"** → starts a chat session (text, with a microphone button for speech input).
  2. **"Fill in a short form"** → guided form (same questions, one per screen).
  3. **"Call us instead"** → shows the ElevenLabs phone number with tap-to-call.
- Secondary: "Continue where I stopped" (resume code), language switch **Deutsch / English**, text-size switch (A / A+ / A++).
- Trust line: "nuuEnergy will never ask for bank details or passwords."
- Demo-only (hidden in production): "Try a demo house" B-01 … B-05 (exists in `app/`).

### 4.2 Chat assistant screen (talks to backend `/sessions/:id/messages`)
- Large chat bubbles, one assistant question at a time, high contrast, 18 px+ body text.
- **Quick-reply chips** under each question from the backend's `suggested_answers` (e.g., "Gas", "Oil", "I don't know").
  "I don't know" is always present.
- **Number confirmation chips**: when the assistant reads a number back ("2,500 litres of oil a year?"), show
  "Yes, correct" / "No, change it".
- **Microphone button** (browser speech-to-text) and **"Read aloud"** toggle (text-to-speech of assistant messages;
  ElevenLabs voice if available, else browser TTS).
- **Progress bar** with plain labels: "Your home → Heating → Result" (from backend `progress`).
- **"Speak to a person"** button always visible → calls backend `handoff` → shows phone number / callback promise.
- **"Pause and continue later"** → shows resume code + sends it by SMS/e-mail if given.
- Upload buttons appear inline when the assistant asks for a photo or bill ("Take photo" / "Send link to another phone").
- Typing indicator; if the backend is slow (> 3 s), show "Still checking…"; on error, a friendly retry button.
- Never show raw JSON, tool names or internal state.

### 4.3 Guided form (alternative to chat, same backend slots)
- One question per screen, big tap targets, "I don't know" on every question, Back / Next.
- Question order and wording come from the backend slot catalogue (`GET /slots?lang=de`), not hard-coded, so the
  teammate's final wording updates both chat and form.
- Unit pickers for consumption (kWh / litres oil / m³ gas) with live conversion shown ("= 25,000 kWh").
- Conditional questions follow `get_next_questions` (e.g., radiator/pipe questions hidden for underfloor only).
- Existing reference: `app/src/ui/Wizard.tsx` (3 steps) and `BookFlow.tsx` (pre-check + plans).

### 4.4 Photo and document upload (in-app and via SMS link)
- Task cards, each with a sample photo of "what we need" and a one-line why:
  meter cabinet (most important), radiator + pipes, outdoor spot (+ "metres to the neighbour's boundary" field and
  house type), boiler room, energy bill, energy certificate.
- Camera capture on mobile, gallery upload, PDF for documents. Compress images client-side (max ~2 MB, keep EXIF off).
- After upload: "Thanks, our system is looking at it" (AI takes ~20 s; never block the conversation).
- Show the finding when ready in plain words ("Looks like a modern meter cabinet; a technician will confirm").
- Pre-check completeness bar (0–100 %) with "Each photo makes the expert's visit shorter."
- SMS link page: no login, shows only the requested tasks for that session, expires after 14 days.

### 4.5 Confirm details screen (required before anything goes to sales)
- Card list of the key facts (postcode area, year, area, fuel + yearly amount, heating type, people, hot water, boiler
  age, renovation) with an edit pencil on each.
- Our data warnings shown kindly, e.g., "Your consumption looks high for a 2006 house. Could you check the bill?"
- Checkbox: "My details are correct to the best of my knowledge" (nuuEnergy terms, AGB 4.1).

### 4.6 Result screen (reuse `app/src/ui/Result.tsx` blocks)
Order matters: answer first, details later.
1. **Traffic light** (big, with text label, never colour alone) + confidence + one-sentence headline.
2. **"In plain words"** paragraph (guarded AI text) with the engine's reasons available via "Why?".
3. **What happens next** (from the outcome templates, backend `outcome`):
   - Green / tier A: "Our planning team will call you as soon as possible to arrange the free visit."
   - Tier B: "A short technical phone call (about 30 minutes) is the next step."
   - Tier C: "Please check X / send a photo of Y; then we'll get in touch."
   - Red / D: honest "not a good fit right now", the path to green, guide download.
   - Out of area: "We can't send an expert to your area; here is your free first assessment."
4. **Rough costs**: heat pump vs today per year; typical price range (gross, before subsidy); subsidy estimate with
   lines; "Apply for the subsidy before you order, or it is lost"; optional income calculator (stays on device,
   "prefer not to say" default).
5. **What we can't tell yet** / **Known obstacles** / **Data to check** (three separate, plain lists).
6. **Path to green** (steps a technician check could unlock) when not already green with high confidence.
7. **What a technician will check** (meter cabinet first).
8. "Show the details" (collapsed): heat-load methods, assumptions table with sources, the maths.
- Buttons: "Send me this result" (SMS/e-mail, with consent), "Speak to a person", "Start again".

### 4.7 Consent and contact screen
- Plain list "What is shared with nuuEnergy" and "What is never shared" (age, income, health, nationality).
- Checkboxes: share with nuuEnergy (required for a callback), photos, recording/transcript (voice only).
- Contact: name, phone, e-mail (optional), best time to call (morning / afternoon / evening).
- Line: "You can object to the use of your data for marketing profiling at any time." + link to privacy page.
- Confirmation screen with reference number and what happens next.

### 4.8 Resume and status
- Enter resume code or open link → continue the session at the last state.
- After submission: status page by reference ("received", "call scheduled", "visit booked") if the sales team updates it (optional, phase 2).

---

## 5. Sales dashboard (desktop; reuse `app/src/ui/SalesDashboard.tsx`)

- **Login** (email + password or SSO; out of scope for the demo, show "demo, would be behind login").
- **Lead list** columns: reference, postcode area, channel (voice/app), technical verdict + confidence, data
  completeness %, pre-check %, commitment level, visit decision (A–D / outside area), expected value, top reason,
  created, status.
- Filters: tier, verdict, region (Munich / Hamburg / Lower Bavaria / outside), status, date; search by reference.
- Sort by tier then expected value (default).
- **Lead detail drawer**: "Why this decision?" reasons, commitment signals, P(sale) steps, all facts with provenance
  badges (said / bill / photo AI / location), photos with AI findings + confidence, conversation summary and
  transcript (voice), customer's open questions/concerns, what was promised to the customer.
- **Actions**: open briefing (A/B), mark called / visit booked / not interested / not feasible (outcome logging),
  add note, re-send photo request, export CSV.
- **Company settings** (live): visit cost, average margin, base P(sale) per tier, tier-A pre-check threshold,
  service-area postcodes, visit-credit toggle (off by default). Label: "placeholder, nuuEnergy to set".
- **Outcome stats** (phase 2): predicted tier vs actual result table, to tune rules over time (still rule-based).
- Fairness footer: "Scored only on building facts and the homeowner's own answers."

## 6. Technician briefing (reuse `app/src/ui/Briefing.tsx`)
One printable page (A4, print CSS): house facts, heat-load range + chosen estimate + why, suggested unit sizes
(5/7/10/12/16/20 kW, "exact size only after the on-site calculation"), flow temperature / JAZ assumption,
"already answered remotely" with photo thumbnails, "check on site" ordered by importance (meter cabinet, outdoor spot,
pipe system, radiator sizes, exact heat load), "bring / measure", estimated visit duration, why this visit.

---

## 7. Accessibility (non-negotiable; older users are a primary group)
- WCAG 2.2 AA; base font 18 px, scalable to 200 % without horizontal scroll; line height ≥ 1.5.
- Contrast ≥ 4.5:1; traffic light always with text and icon, never colour alone.
- Tap targets ≥ 48 × 48 px; generous spacing; no time limits; no auto-advancing screens.
- One question per screen/turn; plain language (reading age ~12); no jargon or explain it inline
  ("heat load = how much heat your house needs on the coldest days").
- Full keyboard and screen-reader support (labels, live regions for new chat messages).
- Voice in and out; slower speech option; "repeat" always available.
- Never use pressure tactics (countdowns, "only today"); subsidy dates only as facts.

## 8. Language and content
- German (default) and English; all copy in `locales/de.json`, `locales/en.json`; slot questions from the backend.
- Numbers in German format in `de` (25.000 kWh, 2.043 €).
- Tone: honest, warm, short. Matches nuuEnergy's site ("a heat pump only pays off if it really fits the house").
- Words never used: "scam", "rejected", "unsuitable person". Use "commitment signals", "next step", "not a good fit right now".

## 9. Privacy and security
- Consent before anything reaches sales; consent text versioned and stored with the lead.
- Never collect age, income (except the on-device subsidy calculator), health, nationality, bank details.
- Session data without consent deleted after 30 days; photos only with consent; signed, expiring photo URLs.
- API keys never in the front end in production (the prototype's browser-side key is demo-only): all AI calls go
  through the backend.
- Rate limiting on public endpoints; upload size/type checks; no PII in logs or analytics.

## 10. API contract the app uses (from `AGENT_BACKEND_SPEC.md` §9, plus)
| Method | Path | Used by |
|---|---|---|
| POST | `/sessions` `{ channel, lang }` | start screen |
| POST | `/sessions/:id/messages` `{ text }` → `{ messages[], suggested_answers[], state, progress, upload_request? }` | chat |
| GET | `/slots?lang=` → slot catalogue (id, question, answer type, options, mode) | guided form |
| PUT | `/sessions/:id/slots` `{ slot, value, unit? }` → validation + read-back | guided form |
| POST | `/sessions/:id/photos` (multipart `{ kind, file }`) → `{ photo_id, status }` | upload |
| GET | `/sessions/:id/photos/:photo_id` → finding when ready | upload |
| POST | `/sessions/:id/photo-link` `{ phone|email, kinds[] }` | "send link to another phone" |
| GET | `/sessions/:id/result` → assessment, costs, path to green, outcome text | result |
| POST | `/sessions/:id/confirm` | confirm details |
| POST | `/sessions/:id/consent` `{ scopes[], contact }` → `{ lead_id, outcome }` | consent |
| POST | `/sessions/:id/handoff` → phone number / callback promise | "speak to a person" |
| POST | `/sessions/:id/pause` → resume code; POST `/sessions/resume` | resume |
| GET | `/leads?filters` , GET `/leads/:id`, PATCH `/leads/:id` (status, note) | sales dashboard |
| GET/PUT | `/settings` (company inputs) | sales dashboard |
| GET | `/leads/:id/briefing` (HTML) | technician |

All responses carry numbers as numbers plus pre-formatted strings for display (`"2.043 €"`), so the app never formats
or computes amounts itself.

## 11. Tech stack and structure
- React 19 + TypeScript + Vite + Tailwind (as `app/`), PWA (installable, offline shell only).
- State: TanStack Query for API calls; small Zustand store for session id / language / text size.
- Routing: `/`, `/chat/:sessionId`, `/form/:sessionId`, `/upload/:token`, `/result/:sessionId`, `/resume`,
  `/sales`, `/sales/leads/:id`, `/sales/settings`, `/briefing/:leadId`.
- Shared UI from `app/src/ui` moved to `packages/ui` (TrafficLight, Card, FlagList, PathToGreenCard, Assumptions,
  CostCard, Briefing).
- i18n: `react-i18next`.
- Tests: Vitest + Testing Library for components; Playwright for flows (start → chat → result → consent; upload link;
  sales filter + settings change updates tiers); axe accessibility checks in CI.

## 12. Acceptance criteria
- A first-time user completes chat or form for B-02, B-04, B-05 data and sees the same verdict, costs and next step as
  the backend/`packages/core` (no front-end maths).
- Every question has "I don't know"; unknowns never produce red.
- Result screen shows the next step that matches the visit tier; no promise beyond the tier.
- Nothing reaches the sales dashboard without consent + confirmed details.
- Photo upload via SMS link works on iOS Safari and Android Chrome; AI finding appears without blocking chat.
- Lighthouse accessibility ≥ 95; axe: 0 serious issues; usable at 200 % zoom.
- German and English complete; numbers formatted per locale.
- Sales settings change updates expected value and tiers live.
- Briefing prints on one A4 page for typical leads.

## 13. Build order
1. Shared UI package + routing + i18n skeleton (reuse `app/` components).
2. Chat screen against the orchestrator API (`/sessions`, `/messages`), quick replies, number confirmation.
3. Result + consent + confirmation screens.
4. Photo upload (in-app + SMS link page) with async findings.
5. Guided form from the slot catalogue.
6. Sales dashboard against `/leads` + settings; lead detail drawer; outcome logging.
7. Briefing route; print CSS.
8. Accessibility pass, German copy, Playwright flows, PWA.

## 14. Open items (owner)
- Final question wording de/en (teammate) → served by `/slots`.
- Callback promise per tier, consent/recording text, privacy page link (team / nuuEnergy).
- ElevenLabs phone number and voice for "Call us instead" (team).
- Brand assets (logo, colours) if nuuEnergy wants the app to look like theirs.
