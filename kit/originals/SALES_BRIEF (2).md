# Build brief v2: Sales side, "Should we send an expert?" (add-on to CLAUDE_BRIEF.md)

**Context (from the challenge opening talk, not in the Notion pages):** nuuEnergy's **sales team** will use the assessment to decide whether to send a paid expert to a house. On-site consultations are expensive. Many homeowners book a free visit and never buy. So the product has **two users**:
1. **Homeowner:** gets the honest green/yellow/red first answer. This already exists; do not break it.
2. **Sales executive:** gets a **visit decision** with reasons, plus a **briefing pack** for the technician.

The pitch line: *"We don't just tell homeowners if they're ready. We tell nuuEnergy which visits are worth paying for, and we make every visit shorter."*

## 0. Ground rules (same as v1, plus these)
- **Still no ML and no hidden scores.** Every sales number comes from deterministic, visible rules with configurable weights in `src/sales/config.ts`. The sales exec must always see *why*.
- **Never call a customer a "scammer"** anywhere in the UI or the code. The words to use are *commitment signals*, *readiness to buy* and *visit priority*. We filter by *evidence of intent and technical fit*, not by suspicion.
- **Fairness and GDPR:**
  - Never score on income, nationality, age, gender or name.
  - Use only the building's facts and the answers the homeowner gives.
  - Show the homeowner what is shared with nuuEnergy, behind a consent checkbox.
  - Store everything locally (localStorage / JSON) for the demo, with no real personal data.
- **Do not change the technical verdict** with sales logic. The traffic light stays purely technical. Sales signals live in a separate layer.
- Keep the 33 existing tests green. Add tests for every new rule.

## 0b. nuuEnergy company rules (from nuuenergy.com, read 24 Oct 2026). These override the defaults below
Sources: home page, /haufige-fragen, /kosten-einer-waermepumpe-und-moegliche-ersparnisse, /foerderung-waermepumpe, /ablauf-baustellen, /kontakt, /agb, /datenschutzerklaerung. Copies are in `nuu_site/`.

**Their real sales funnel. Our tool must plug into it, not replace it:**
1. A free online "Wärmepumpen-Check" (Heyflow form; it asks the heating type: radiators / underfloor / both, then the building type: detached / semi / terraced / multi-family, …).
2. A **~30-min phone call** with their technical planning office.
3. An **on-site visit by a heating master (Heizungsbaumeister), ~2 h**, with a professional heat-load calculation plus a feasibility check. Their site calls it "indispensable" before a quote. **This is the expensive step we filter for.** Our tool never replaces it; it decides *who gets it* and makes it shorter.
4. Quote. 5. They handle the subsidy application. 6. Installation in ~5 working days.

→ **Change the visit tiers to match their wording:**
- **A** = "Book the on-site heat-load visit".
- **B** = "30-min technical phone call first". This is their existing step 2, so use it instead of a "video call".
- **C** = "Ask for missing info / photos".
- **D** = "Not now: info and subsidy guide".
- Label the briefing pack "for the Heizungsbaumeister".

**Service area rule (hard):** they work **only in Greater Munich, Greater Hamburg (within ~1.5 h) and Lower Bavaria (Niederbayern)**. Add a deterministic `serviceArea` check on the postcode area, configurable in `config.ts`. Defaults: Munich 80–85xxx, Hamburg 20–22xxx and 21xxx, Lower Bavaria 84xxx and 94xxx; mark the list "approximate, nuuEnergy to confirm". **Outside the area → tier D with "outside nuuEnergy service area"**, never as a bad lead. The technical verdict stays unchanged. All 5 dataset houses are inside the area (82xxx, 85xxx Munich; 21xxx Hamburg).

**Technical stance (their words):**
- "Einrohrsysteme sind z. B. meist nicht geeignet" (single-pipe systems are mostly not suitable). Keep the strong single-pipe flag, and show their "way forward" options as text:
  - "size the heat pump smaller and bridge with a heating rod (Heizstab)";
  - "staged renovation: heating now, insulation later".
- **Oversizing is a costly mistake** (the unit cycles on and off constantly). Show the heat-pump size as a **range** and say "exact size only after the on-site heat-load calculation". Map it to their unit sizes **5 / 7 / 10 / 12 / 16 / 20 kW** (nearest size covering the best estimate). Never recommend "bigger to be safe".
- Old houses with radiators can work if enough heat output can be transferred. Do not make "old house" a red flag on its own.
- **Noise / outdoor unit:** it must keep the minimum distance to the neighbour's plot, with sound-optimised placement (TA Lärm). Per the AGB 7.7, the **customer** is responsible for neighbour/noise compliance. So the outdoor-spot photo task should ask for the distance to the neighbour's boundary and the house type (terraced or semi = tighter). Flag "tight placement, noise check needed".

**Price preview (replace the placeholders with their published ranges; show "rough guide, before subsidy, final price after the on-site visit"):**
- Small single-family house (~7 kW, short pipe runs, no extras): **€29,000–34,000 gross**.
- Medium/large or complex (10 kW+, longer runs, PV, buffer tanks): **€35,000–45,000 gross**.
- Cost drivers to list: heat-pump size, earthworks/core drilling, storage, solar thermal/PV integration, **condition of the existing electrics** (this ties to the meter-cabinet flag) and insulation.
- Their payment terms, if shown: 10% on order / 40% on material delivery / 50% after commissioning.
- Their stated payback: an old house pays back in ~7–10 years; heating costs typically fall 30–50%. If shown, attribute it to them; never present it as our calculation.

**Subsidy (KfW 458, rules as of 21 Jul 2026, per their /foerderung-waermepumpe page; show "check current rules, nuuEnergy confirms"):**
- 30% base for owner-occupied existing buildings.
- **+16% climate-speed bonus** when replacing an oil/gas boiler that is **at least 20 years old** (drops 4 points every 6 months from Feb 2027).
- Up to +40% income bonus, staged by taxable household income (≤30k 40%, 30–40k 30%, 40–50k 10%, >50k 0%; €10k lower if a minor child lives there).
- Max eligible cost **€28,000 per unit**. Most households reach up to 70%.
- City top-up: Munich FKG up to +15% (fills up to 60% total); Hamburg IFB +20% (max €9,000, excludes the speed/income bonus).
- **"Antrag vor Auftrag":** the subsidy is lost if the order is placed before the application. Show this warning in the price preview.

**How to use the subsidy data, fairly:**
- Never score leads on income.
- The income bonus is **only an optional homeowner-side calculator** ("prefer not to say" is the default). It is never sent to sales and never used in tiers.
- The boiler-age question (≥20 years) **is** legitimate and useful twice: it unlocks the +16% bonus, and it is an urgency signal.
- Owner-occupied matters because the KfW base subsidy needs it. Tenants and landlords get a different path ("involve the owner").

**Customer data accuracy (AGB 4.1):** the customer guarantees their information is correct; false information lets nuuEnergy cancel and charge extra costs. So:
- Before submitting to sales, show a **"Please confirm your details are correct"** step listing the key inputs.
- Show our **contradiction flags to the homeowner too**, phrased kindly ("Your consumption looks high for a 2006 house. Can you check the bill?"), so they can fix the data before a visit is booked. This is better than silently down-ranking them.

**Privacy (their Datenschutzerklärung: GDPR, consent-based tracking, right to object to profiling for direct marketing):**
- Add a consent checkbox before anything goes to the sales view.
- Add a visible line: "You can object to profiling for marketing at any time".
- The tier logic is shown to sales only as reasons, not as a "score of the person".
- Store locally in the demo; collect no real personal data.

**Visit-credit / paid-visit idea:** the website advertises the check as **"kostenlos und unverbindlich" (free, no obligation)** and says nothing about a paid visit. So keep "credited visit fee" as an **optional config idea, OFF by default**. Pitch it as "a lever nuuEnergy could choose", not as a feature that contradicts their current offer.

**Tone:** their site promises honesty ("a heat pump only pays off if it really fits the house") and fair, transparent prices with no hidden costs. Match this: show every assumption, never pressure, and never use urgency tricks beyond the factual subsidy dates.

---

## 1. Features, by priority (≈5 h left; P0 must be done and demo-ready first)

### P0-1. Two views: Homeowner and Sales
- Add a top-level route or toggle: `/` (homeowner, as now) and `/sales` (dashboard). It needs no real login. Use a "Sales view" switch labelled "demo, would be behind login".
- The sales view lists all assessments, the 5 demo houses plus any typed in. Columns:
  - ID / area code.
  - Technical verdict.
  - Data completeness %.
  - Commitment level.
  - **Visit decision.**
  - Estimated value.
  - Top reason.
- Sort and filter by visit decision. Export to CSV.

### P0-2. Commitment questions (added as wizard step 4, ~30 seconds, all optional)
Ask plain, respectful questions, each with "prefer not to say":
- Do you own the house? (owner / co-owner / tenant / landlord). A tenant can't decide alone, so the right step is to include the owner, not a visit.
- How old is your current boiler? Is it working? (broken / >20 years / 10–20 / <10). A broken or old boiler means real urgency.
- When would you like to switch? (as soon as possible / within 6 months / within 1–2 years / just curious).
- Are all the decision-makers involved? (yes / no / unsure).
- Have you looked into subsidies or financing? (yes / no). Show the "subsidy info" link as help, not as a score. Label any subsidy figure "check current rules".
- Would you share extra photos now so the expert's visit is shorter? (yes / later). This feeds P0-3.

### P0-3. Remote pre-check: replace visit work with photos
Turn the technician checklist into **photo tasks** the homeowner can do from their phone. Each one done removes or shortens an on-site check:
- **Meter cabinet photo (Zählerschrank):** the most important one, because the guardrails say it must always be checked, often needs an upgrade and raises the price a lot. The AI or manual questions classify it as "looks modern / looks old or full / unclear" plus an upgrade-cost risk flag.
- **Outdoor-unit spot:** photo(s) of the garden, wall or yard where the unit could go. Hints: space ≥ ~1 × 1 m? distance to the neighbour? (mark as "rough hint, technician confirms"). This is the bonus (b) from the challenge, so it counts double.
- **Boiler room / heating system photo.**
- **Radiator nameplate or side view** (Type 11/22/33) and a pipe photo. This already exists.
- **Energy bill.** This already exists.

Show a **"Pre-check completeness"** bar (0–100%) and say which technician checks are now *answered remotely* and which still *need the visit*.

### P0-4. Visit decision engine (`src/sales/visitDecision.ts`, deterministic)
Inputs: the technical assessment (verdict, confidence, obstacles, unknowns, contradictions), the commitment answers and the pre-check completeness.
Output, one of 4 tiers, plus the reasons:

| Tier | When (default rules, configurable) | Action for sales |
|---|---|---|
| **A: Send expert now** | Verdict green, or yellow with no confirmed obstacle; owner; timeline ≤ 6 months or boiler broken/old; pre-check ≥ 60% | Book the on-site visit |
| **B: 30-min technical phone call first** | Yellow with open unknowns, OR commitment medium, OR pre-check < 60% | their existing 30-min technical call; upgrade to a visit if the gaps close |
| **C: Ask for info first** | Contradictions in the data (e.g. B-05), key photos missing, tenant without the owner | Automated message: "please send X, Y" |
| **D: Not now / nurture** | Red obstacle with no realistic fix, OR "just curious" with no timeline | Send the info pack and subsidy guide; re-contact later. Never say "rejected" |

Rules are evaluated top-down, and every rule that fires adds a human-readable reason. The rules must be visible in a "Why this decision?" panel and editable in `config.ts`.

### P0-5. Value vs. visit cost (simple, transparent)
```
expected_value = P(sale | tier, signals) × average_margin − visit_cost
```
- `visit_cost`, `average_margin` and the base `P(sale)` for each tier are **company inputs**, editable on the sales dashboard. Use defaults clearly labelled "placeholder, nuuEnergy to set".
- P(sale) starts from the base rate for the tier and moves up or down by fixed, visible amounts for each signal (owner, timeline, boiler age, pre-check completeness, technical verdict). Cap it between 5% and 90%.
- Show it as: "Expected value of a visit: +€X. Worth it / Not worth it yet". **Never present it as a measured accuracy.** Label it "estimate from your own assumptions".

### P0-6. Technician briefing pack (printable page / PDF)
For tier A and B leads, generate one page:
- House facts, heat-load range (both methods plus the chosen estimate and why), a suggested heat-pump size range, and the flow-temperature/JAZ assumption.
- All photos with the AI or manual findings and their confidence.
- **What is already answered** and **what to check on site**. This is the shorter checklist, sorted by importance: meter cabinet, outdoor spot, pipe system, radiator sizes, exact heat load.
- **What to bring/measure** (e.g., "check the end radiators of the single-pipe loop").
- Estimated visit duration (shorter when the pre-check is more complete).

Use `window.print()` with a print CSS; no PDF library needed.

## 2. P1 (only after P0 is demo-ready)
- **"Visit credit" option:** shown to the homeowner as "Book an expert visit: €X, fully credited if you buy". This is a common industry practice and the strongest filter against free visits that never lead to a sale. Make it a config toggle and show it only for tier B/C. It's a mock button; no payments.
- **Rough price and payback preview for the homeowner** before booking: heat-pump price range (placeholder, company-set), the meter-cabinet upgrade risk shown as a range, a "check current subsidy rules" note, and yearly savings from the existing cost engine. People who see the real cost and still book are serious.
- **Visit outcome logging** in the sales view: "visited → bought / didn't buy / not feasible", with the real heat load measured. Show a small table comparing predictions with outcomes. Pitch it as the scalability story: "over time nuuEnergy tunes the rules with real outcomes". It stays rule-based.
- **Repeat-booking check:** warn if the same address area plus the same building facts already had a visit and no purchase (local data only). Phrase it neutrally: "previous visit on record".

## 3. P2 (skip unless there's lots of time)
- A map/satellite hint for the outdoor-unit spot from the address.
- A German language toggle.

## 4. Demo script (the 5 houses, ~3 min)
1. Homeowner flow with B-02: green, then the commitment questions (owner, boiler 18 years, within 6 months), then the photos. Result: **Tier A**. Show the briefing pack.
2. B-05: yellow with contradictions, so **Tier C: ask for info first**. "We just saved a €X visit that would have found bad data."
3. B-04: yellow with the single-pipe warning, so **Tier B: video call first**. The briefing tells the technician exactly what to check.
4. Open the sales dashboard and sort the 5 houses by visit decision, then change `visit_cost` live and watch the decisions update.

## 5. Tests to add
- For each tier: one fixture that hits it, plus a check that the reasons list is non-empty.
- Sales logic never changes `verdict` (property test over all 5 houses × the answer combinations).
- Unknown commitment answers → never tier D on their own.
- The expected-value maths with the default config.

## 6. README additions
- The two-user concept.
- How to change the config (visit cost, margin, tier rules).
- The fairness/GDPR notes from section 0.
- An honest limitation: the conversion probabilities are company assumptions, not learned from data.
