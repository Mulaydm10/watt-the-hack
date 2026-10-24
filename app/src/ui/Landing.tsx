import { useEffect, useMemo, useState } from 'react';
import { assess } from '@core/engine/assess';
import type { Building } from '@core/engine/types';
import { CountUp, Ember, Eyebrow, HeatField, Stage, VERDICT_COLOR } from './hearth';
import { ThermalScan } from './ThermalScan';

// "The Scan Room": an editorial hero next to a live thermal pre-scan that cycles through real example homes.
export function Landing({ demos, onStart, onOpen }: { demos: Building[]; onStart: () => void; onOpen: (b: Building) => void }) {
  const rows = useMemo(() => demos.map((b) => ({ b, a: assess(b) })), [demos]);
  const [i, setI] = useState(3); // start on B-04, the most interesting house
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % rows.length), 5200);
    return () => clearInterval(t);
  }, [paused, rows.length]);
  const cur = rows[i];

  return (
    <Stage>
      <HeatField />
      <section className="relative grid items-center gap-[clamp(32px,5vw,72px)] pt-[clamp(36px,6vw,88px)]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,460px),1fr))' }}>
        <div className="hpr-rise min-w-0">
          <Eyebrow className="text-[var(--amber)]">nuuEnergy · free first check · about 5 minutes</Eyebrow>
          <h1 className="font-serif-h mt-5 text-[clamp(52px,7.4vw,112px)] font-normal leading-[0.92] tracking-[-0.035em]">
            Would a heat pump <em className="text-[var(--amber-soft)]">work</em> in my home?
          </h1>
          <p className="mt-6 max-w-[520px] text-[19px] leading-relaxed text-[var(--sand)]">
            An honest first answer from your energy bill and a few facts about the house. We tell you what we can't know yet,
            and what a technician must check. Missing answers never count against you.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button onClick={onStart} className="group rounded-full bg-[var(--amber)] px-8 py-4 text-lg font-semibold text-[var(--bg)] shadow-[0_0_60px_-10px_oklch(0.8_0.14_70/.7)] transition hover:bg-[var(--amber-soft)]">
              Start my check <span className="inline-block transition group-hover:translate-x-1">→</span>
            </button>
            <span className="text-sm text-[var(--sand)]">No sign-up · no obligation · never asks for bank details</span>
          </div>
        </div>

        <figure className="min-w-0" style={{ animation: 'hpr-rise 1.1s .15s cubic-bezier(.2,.7,.2,1) both' }}
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <Eyebrow>Live pre-scan · example home {cur.b.building_id}</Eyebrow>
            <span className="text-xs text-[var(--sand)]">illustrative, modelled from the facts</span>
          </div>
          <ThermalScan b={cur.b} scanKey={i} />
          <figcaption className="mt-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-serif-h text-[clamp(28px,3vw,40px)] leading-none">
                <CountUp value={cur.a.heatLoad.bestKw ?? 0} format={(n) => n.toFixed(1)} /> <span className="text-lg text-[var(--sand)]">kW</span>
              </div>
              <div className="mt-1 text-sm text-[var(--sand)]">{cur.b.construction_year} · {cur.b.floor_area_m2} m² · {cur.b.heat_distribution} · {cur.b.energy_carrier}</div>
            </div>
            <Ember verdict={cur.a.verdict} size={56} />
          </figcaption>
          <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Example homes">
            {rows.map((r, k) => (
              <button key={r.b.building_id} role="tab" aria-selected={k === i} onClick={() => setI(k)} aria-label={`Show ${r.b.building_id}`}
                className="h-1.5 flex-1 rounded-full transition" style={{ background: k === i ? 'var(--amber)' : 'var(--line)' }} />
            ))}
          </div>
        </figure>
      </section>

      <section className="relative mt-[clamp(56px,8vw,120px)]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--line)] pt-6">
          <h2 className="font-serif-h text-[clamp(28px,3.4vw,44px)] font-normal leading-none">Five real homes, <em className="text-[var(--amber-soft)]">five honest answers</em></h2>
          <span className="text-sm text-[var(--sand)]">From nuuEnergy's challenge data. Open one to see the full result.</span>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {rows.map(({ b, a }, k) => (
            <button key={b.building_id} onClick={() => onOpen(b)}
              className="hpr-lift group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-left"
              style={{ animation: `hpr-rise .8s ${200 + k * 90}ms cubic-bezier(.2,.7,.2,1) both` }}>
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-60 blur-2xl transition group-hover:opacity-100" style={{ background: VERDICT_COLOR[a.verdict].glow }} />
              <Eyebrow>{b.building_id} · {b.expected_verdict ? 'reference case' : 'jury case'}</Eyebrow>
              <div className="font-serif-h mt-3 text-[40px] leading-none">{a.heatLoad.bestKw}<span className="text-base text-[var(--sand)]"> kW</span></div>
              <div className="mt-2 text-sm text-[var(--sand)]">{b.construction_year} · {b.floor_area_m2} m² · {b.energy_carrier}</div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: VERDICT_COLOR[a.verdict].core, boxShadow: `0 0 12px ${VERDICT_COLOR[a.verdict].glow}` }} />
                <span className="capitalize">{a.verdict}</span><span className="text-[var(--sand)]">· {a.confidence} confidence</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="relative mt-[clamp(56px,8vw,110px)] grid gap-px border border-[var(--line)] bg-[var(--line)]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        {[
          ['01', 'Tell us what you know', 'Your yearly energy use, the year built, the heated area. "I don\'t know" is always fine.'],
          ['02', 'Get an honest answer', 'Green, yellow or red with the reason, four clear areas, rough costs and subsidy.'],
          ['03', 'A shorter expert visit', 'With your consent, our planning team gets a briefing, so the visit focuses on what matters.'],
        ].map(([n, t, d]) => (
          <div key={n} className="bg-[var(--bg)] p-7">
            <div className="font-mono-h text-sm text-[var(--amber)]">{n}</div>
            <div className="font-serif-h mt-3 text-2xl">{t}</div>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--sand)]">{d}</p>
          </div>
        ))}
      </section>
    </Stage>
  );
}
