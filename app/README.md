# Heat Pump Ready? (nuuEnergy challenge, WATT THE HACK Munich 2026)

An honest first heat-pump-readiness check in under three minutes: traffic light, reason,
what we can't tell yet, technician checklist and yearly running costs.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 33 tests (dev references, bad-input cases, AI guard)
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
