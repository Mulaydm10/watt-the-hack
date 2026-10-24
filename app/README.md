# Heat Pump Ready? (nuuEnergy challenge, WATT THE HACK Munich 2026)

An honest first heat-pump-readiness check in under three minutes: traffic light, reason,
what we can't tell yet, technician checklist and yearly running costs.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 65 tests (engine, bad input, AI guard, path to green, sales tiers, offer rules)
npm run build
```
Optional AI helper: copy `.env.example` to `.env` and set
- `VITE_LLM_PROVIDER` = `claude` | `openai` | `astra` (default `claude`)
- `VITE_LLM_API_KEY`
- `VITE_LLM_BASE_URL` (OpenAI-compatible endpoint; required for `astra`)
- `VITE_LLM_MODEL` (optional override)

This enables the radiator-photo classifier, the bill reader and the plain-language rephrase.
Without a key the app works fully: the photo step falls back to three plain questions, and the
engine's reasons are the full answer.

## How it works
- `src/engine/` is pure TypeScript, no UI, unit-tested. All numbers and the verdict come from here.
  - Inputs are sanitized first: implausible values (negative, NaN, out of range, unknown enums) become
    "unknown", never a bad value.
  - Heat load: method A (area × age band) and method B (bill → useful heat → minus hot water ÷ 2,000 h),
    combined by a short list of named rules (other heat source → bill is a lower bound; implausibly low
    bill → distrust it; partial renovation / unused floor → trust the bill).
  - Radiators → flow temperature → JAZ (4.0 / 3.5 / 2.8), shown as a range when not measured.
  - Flags in three separate kinds: obstacles, can't-tell-yet, contradictions. Unknowns never make red.
  - Technician checklist always includes the meter cabinet as a cost risk.
  - No machine learning, no per-building special cases: the 5 houses are only demo buttons that run the
    same engine. All constants live in `src/engine/constants.ts` with their source and are shown in the
    "Assumptions" table on every result.
- `src/ai/`: every AI call goes through one interface (`provider.ts`), so Claude, OpenAI or Astra can be
  swapped by config. Calls time out after 30 s and the app falls back to the no-AI path.
  - Photo classifier: few-shot with the 5 installer-confirmed photos. Below 70 % confidence the result
    is "unclear". It never overrides stated data.
  - Bill reader (bonus): prefills consumption and carrier; the user confirms.
  - Plain-language rephrase: shown beside the engine's reasons. It is rejected if it contains any
    number the engine did not produce or names a different verdict.

## Results
| Building | Best estimate | Reference | Verdict |
|---|---|---|---|
| B-01 | 9.8 kW | 9.6 kW | green (expected green) |
| B-02 | 9.9 kW | 9.7 kW | green (expected green) |
| B-03 | 16.6 kW | 14.5 kW | yellow (expected yellow) |
| B-04 | 9.5 kW | hidden | yellow + strong warning: confirmed single-pipe (way forward shown) |
| B-05 | 10.4 kW | hidden | yellow: bill vs. age band 2× apart, 216 kWh/m², 14 rooms in 125 m² |

Running costs per year: B-04 heat pump €2,043 vs oil €4,250; B-05 heat pump €1,765–2,206 vs gas €2,970.

## Assumptions and limits
- Fixed challenge prices: 26 ct/kWh electricity, 11 ct/kWh gas, 1.70 €/L oil. LPG is priced as gas (labelled).
- Calibrated on only 3 labelled houses; we claim no accuracy beyond matching those.
- Confirmed single-pipe is shown as yellow with a strong warning (`SINGLE_PIPE_VERDICT`); other confirmed
  obstacles (no outdoor-unit spot, load > 120 W/m², flow > 60 °C) give red.
- Costs exclude purchase, installation and a meter-cabinet upgrade.
- When the flow temperature is not measured, costs are shown as a JAZ 3.5–2.8 range.
- Not built: outdoor-unit hints from photos (bonus b), a radiator-output check from known
  Type 11/22/33 sizes (shown as a technician check instead), a German toggle.
- The AI paths need a key and were only tested with mocked responses.

## Sales side: "Should we send an expert?"
Two users, one engine:
1. **Homeowner** gets the honest green/yellow/red answer (unchanged). The "Next step: free expert check"
   button leads to a remote photo pre-check and a few optional questions about their plans.
2. **nuuEnergy sales** (header toggle "Sales view", or `#/sales`; would be behind a login) sees every
   lead with a visit decision mapped to nuuEnergy's own process:
   - **A: Book the on-site heat-load visit** (~2 h Heizungsbaumeister visit)
   - **B: 30-min technical phone call first** (their existing planning-office call)
   - **C: Ask for missing info / photos** (contradictions, tenant without owner, no heat-load data)
   - **D: Not now: info and subsidy guide** (red obstacle, "just curious"), or **Outside nuuEnergy service
     area** (Greater Munich 80-83/85, Greater Hamburg 20-22, Lower Bavaria 84/94 by postcode; approximate,
     nuuEnergy to confirm). That one is a logistics fact, never a lead-quality label.
   Each decision has a "Why?" panel, the P(sale) steps and the expected value
   `P(sale) × margin − visit cost`. A/B leads get a printable technician briefing (window.print).

The technical traffic light is never changed by sales logic (tested for all 5 houses × answer combinations).

### Configuration (`src/sales/config.ts`, `src/sales/offer.ts`)
- Visit cost, average margin and base P(sale) per tier are **placeholders, nuuEnergy to set**; they are
  editable live on the sales dashboard and the decisions update immediately.
- P(sale) nudges per signal (owner, timeline, boiler age, pre-check, verdict) and the 5–90 % cap.
- Tier A needs ≥ 60 % remote pre-check (meter cabinet 30, outdoor spot 25, bill 20, radiators 15, boiler room 10).
- Units 5/7/10/12/16/20 kW, published price bands (€29–34k small, €35–45k bigger, before subsidy),
  KfW 458 rules of 21 Jul 2026 (30 % base for owner-occupied, +16 % climate-speed bonus for an oil/gas boiler
  ≥ 20 years, staged income bonus 40/30/10/0 % with a €10k shift for a minor child, max 70 % on max €28k per unit;
  Munich FKG up to +15 % filling to 60 %, Hamburg IFB +20 % max €9k excluding speed/income bonus).
  Size maps to their units: "exact size only after the on-site heat-load calculation", never bigger to be safe.
  The outdoor step asks house type and distance to the neighbour's boundary → "tight placement, noise check needed". Always labelled "check current rules";
  apply before ordering or the subsidy is lost.
- "Visit fee credited if you buy" is **off by default**: nuuEnergy promises a free, no-obligation check.

### Fairness and GDPR
- No ML and no hidden scores; every rule and weight is visible.
- Never scored on income, nationality, age, gender or name. The optional income question only feeds the
  homeowner's own subsidy calculator and never leaves their device.
- The homeowner sees our data warnings and confirms their details (nuuEnergy's terms make the customer
  responsible for correct information), sees exactly what is shared, gives consent, and is told they can
  object to marketing profiling at any time.
- Demo data is stored only in the browser (localStorage); no real personal data.
- We use "commitment signals", "readiness to buy" and "visit priority", never suspicion.

### Honest limitation
The conversion probabilities are company assumptions, not learned from data. Logging visit outcomes
(P1, not built) would let nuuEnergy tune the rules over time; they stay rule-based.
