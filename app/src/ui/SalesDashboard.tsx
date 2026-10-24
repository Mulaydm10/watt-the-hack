import { useMemo, useState } from 'react';
import { assess } from '@core/engine/assess';
import { TIER_INFO, DEFAULT_CONFIG, type SalesConfig } from '@core/sales/config';
import { allLeads, clearLeads, saveConfig } from '@core/sales/store';
import type { Lead, Tier } from '@core/sales/types';
import { visitDecision } from '@core/sales/visitDecision';
import { ThermalScan } from './ThermalScan';
import { useTween } from './useTween';

// Hearth theme. Status always = glyph + text, never colour alone.
const TIER: Record<Tier, { g: string; short: string; c: string }> = {
  A: { g: '→', short: 'Send expert', c: 'var(--tier-a)' },
  B: { g: '☏', short: 'Call first', c: 'var(--tier-b)' },
  C: { g: '?', short: 'Ask for info', c: 'var(--tier-c)' },
  D: { g: '◌', short: 'Not now', c: 'var(--tier-d)' },
};
const VERD = {
  green: { g: '✓', t: 'Ready', c: 'oklch(0.8 0.14 150)' },
  yellow: { g: '!', t: 'Check needed', c: 'oklch(0.85 0.14 88)' },
  red: { g: '✕', t: 'Blocker', c: 'oklch(0.72 0.15 28)' },
} as const;
const TIERS = ['A', 'B', 'C', 'D'] as Tier[];
const eur = (n: number) => `${n >= 0 ? '+' : '−'}€${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const num = (n: number) => Math.round(n).toLocaleString('en-US');

function completeness(l: Lead) {
  const b = l.building;
  const f = [b.construction_year, b.floor_area_m2, b.renovation_status, b.heat_distribution, b.annual_consumption_kwh, b.energy_carrier,
    b.pipe_system !== 'unknown' ? 1 : null, b.flow_temperature_c, b.persons_in_household, b.hot_water_via_heating, b.rooms];
  return Math.round((f.filter((x) => x != null).length / f.length) * 100);
}
function csvCell(v: unknown) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

function Chip({ t, label }: { t: Tier; label?: string }) {
  const c = TIER[t].c;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium"
      style={{ borderColor: c, color: c, background: `color-mix(in oklch, ${c} 12%, transparent)` }}>
      <span className="font-mono-h">{t}</span>{TIER[t].g} {label ?? TIER[t].short}
    </span>
  );
}
function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-mono-h text-[11px] uppercase tracking-[0.1em] text-[var(--sand)] ${className}`}>{children}</div>;
}
function Money({ v, className }: { v: number; className?: string }) {
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(useTween(v))}</span>;
}

export function SalesDashboard({ cfg, setCfg, onBrief }: { cfg: SalesConfig; setCfg: (c: SalesConfig) => void; onBrief: (l: Lead) => void }) {
  const [filter, setFilter] = useState<Tier | 'all'>('all');
  const [version, setVersion] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);

  const rows = useMemo(() => allLeads().map((l) => {
    const a = assess(l.building, l.photo);
    return { l, a, d: visitDecision(l, cfg, a), data: completeness(l) };
  }).sort((x, y) => x.d.tier.localeCompare(y.d.tier) || y.d.expectedValueEur - x.d.expectedValueEur), [cfg, version]);
  const shown = rows.filter((r) => filter === 'all' || r.d.tier === filter);
  const sel = rows.find((r) => r.l.id === selId) ?? rows[0];

  const visits = rows.filter((r) => (r.d.tier === 'A' || r.d.tier === 'B') && r.d.worthIt);
  const held = rows.filter((r) => r.d.tier === 'C' || r.d.tier === 'D');
  const pipeline = useTween(visits.reduce((s, r) => s + r.d.expectedValueEur, 0));
  const saved = useTween(held.length * cfg.visitCostEur);
  const selP = useTween((sel?.d.saleProbability ?? 0) * 100);
  const count = (t: Tier) => rows.filter((r) => r.d.tier === t).length;

  const update = (p: Partial<SalesConfig>) => { const n = { ...cfg, ...p }; setCfg(n); saveConfig(n); };
  const pick = (id: string) => { setSelId(id); setScanKey((k) => k + 1); };

  const exportCsv = () => {
    const head = ['id', 'area', 'verdict', 'confidence', 'data_completeness_pct', 'commitment', 'pre_check_pct', 'visit_decision', 'p_sale', 'expected_value_eur', 'top_reason'];
    const lines = rows.map(({ l, a, d, data }) => [l.id, l.building.location, a.verdict, a.confidence, data, d.commitment, d.preCheck, TIER_INFO[d.tier].label, d.saleProbability.toFixed(2), d.expectedValueEur, d.reasons[0]].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'visit-decisions.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const Slider = ({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (n: number) => void }) => (
    <label className="flex min-w-[110px] flex-1 flex-col gap-1.5 text-[13px] text-[var(--sand)]">
      <span className="flex justify-between">{label}<b className="font-mono-h font-medium text-[var(--ink)]">{show}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--amber)]" />
    </label>
  );

  return (
    <div className="-mx-4 -my-8 min-h-screen bg-[var(--bg)] px-[clamp(20px,4vw,56px)] pb-10 text-[var(--ink)]">
      {/* Hero */}
      <section className="grid items-stretch gap-[clamp(28px,4vw,56px)] py-[clamp(28px,4vw,52px)]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,440px),1fr))' }}>
        <div className="flex min-w-0 flex-col justify-between gap-8">
          <div style={{ animation: 'hpr-rise .9s cubic-bezier(.2,.7,.2,1) both' }}>
            <div className="font-mono-h flex items-center gap-2 text-xs uppercase tracking-[0.1em] text-[var(--amber)]">
              <span className="relative inline-block h-2 w-2"><span className="absolute inset-0 rounded-full bg-[var(--tier-a)]" style={{ animation: 'hpr-ping 1.8s ease-out infinite' }} /><span className="absolute inset-0 rounded-full bg-[var(--tier-a)]" /></span>
              {rows.length} leads in queue
            </div>
            <h1 className="font-serif-h mb-4 mt-4 text-[clamp(48px,6.4vw,92px)] font-normal leading-[0.96] tracking-[-0.03em]">Should we send <em className="text-[var(--amber-soft)]">an expert?</em></h1>
            <p className="max-w-[540px] text-[17px] leading-relaxed text-[var(--sand)]">Every visit decision comes from visible rules and your own assumptions. The technical traffic light is never changed by sales logic.</p>
          </div>
          <div style={{ animation: 'hpr-rise .9s .12s cubic-bezier(.2,.7,.2,1) both' }}>
            <Eyebrow>Expected value · visits worth paying for</Eyebrow>
            <div className="font-serif-h mt-1.5 text-[clamp(64px,8.5vw,124px)] font-[350] leading-none tracking-[-0.035em]" style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(pipeline)}</div>
            <p className="mt-1.5 text-[13px] text-[var(--sand)]">P(sale) × margin − visit cost, summed · an estimate from your own assumptions, not a measured accuracy</p>
          </div>
          <div className="grid border-t border-[oklch(0.94_0.022_80/.5)]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <div className="pr-4 pt-4"><Eyebrow>Worth a visit</Eyebrow><div className="font-serif-h text-[40px]">{visits.length}<span className="text-xl text-[var(--sand)]"> / {rows.length}</span></div></div>
            <div className="border-l border-[var(--line)] px-4 pt-4"><Eyebrow>Visit spend held back</Eyebrow><div className="font-serif-h text-[40px]">€{num(saved)}</div><div className="text-xs text-[var(--sand)]">{held.length} leads to info or nurture</div></div>
            <div className="border-l border-[var(--line)] pl-4 pt-4">
              <Eyebrow>Decision mix</Eyebrow>
              <div className="mt-2.5 flex h-[26px] gap-0.5">
                {TIERS.filter(count).map((t, i) => (
                  <div key={t} title={`${TIER_INFO[t].label}: ${count(t)}`} className="font-mono-h flex origin-left items-center justify-center text-[11px] font-medium text-[var(--bg)]"
                    style={{ flex: count(t), background: TIER[t].c, animation: `hpr-grow 1s ${400 + i * 120}ms cubic-bezier(.2,.7,.2,1) both` }}>{t}</div>
                ))}
              </div>
              <div className="mt-2 text-xs text-[var(--sand)]">A send · B call · C ask · D not now</div>
            </div>
          </div>
        </div>
        {sel && (
          <div className="flex min-w-0 flex-col gap-3" style={{ animation: 'hpr-rise 1s .2s cubic-bezier(.2,.7,.2,1) both' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>Thermal pre-scan · {sel.l.id} · {sel.l.building.location}</Eyebrow>
              <span className="text-xs text-[var(--sand)]">illustrative, modelled from building facts</span>
            </div>
            <ThermalScan b={sel.l.building} scanKey={scanKey} />
            <div className="grid grid-cols-4 gap-px border border-[var(--line)] bg-[var(--line)]">
              {[['Heat load', `${sel.a.heatLoad.bestKw ?? '?'} kW`],
                ['Method A', sel.a.heatLoad.methodA ? `${sel.a.heatLoad.methodA.low}–${sel.a.heatLoad.methodA.high}` : '—'],
                ['Area', `${sel.l.building.floor_area_m2} m²`],
                ['Load / m²', sel.a.heatLoad.bestWPerM2 != null ? `${sel.a.heatLoad.bestWPerM2} W` : '—']].map(([k, v]) => (
                <div key={k} className="bg-[var(--bg)] px-3 py-2.5"><Eyebrow className="!text-[10px]">{k}</Eyebrow><div className="font-serif-h text-2xl">{v}</div></div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Company inputs */}
      <section className="flex flex-wrap items-end gap-x-8 gap-y-5 border-y border-[var(--line)] py-5">
        <div className="min-w-[180px] flex-1">
          <div className="font-serif-h text-[22px]">Company inputs</div>
          <div className="text-[13px] text-[var(--amber-soft)]">placeholder · nuuEnergy to set · drag to re-decide live</div>
        </div>
        <Slider label="Visit cost" value={cfg.visitCostEur} min={200} max={1500} step={10} show={`€${num(cfg.visitCostEur)}`} onChange={(n) => update({ visitCostEur: n })} />
        <Slider label="Margin per sale" value={cfg.averageMarginEur} min={2000} max={10000} step={100} show={`€${num(cfg.averageMarginEur)}`} onChange={(n) => update({ averageMarginEur: n })} />
        {TIERS.map((t) => (
          <Slider key={t} label={`Base P ${t}`} value={Math.round(cfg.baseSaleProbability[t] * 100)} min={0} max={60} step={1} show={`${Math.round(cfg.baseSaleProbability[t] * 100)}%`}
            onChange={(n) => update({ baseSaleProbability: { ...cfg.baseSaleProbability, [t]: n / 100 } })} />
        ))}
        <button onClick={() => update(DEFAULT_CONFIG)} className="rounded-full border border-[oklch(0.45_0.03_60)] px-4 py-2 text-[13px] hover:bg-[oklch(0.27_0.025_55)]">Reset</button>
      </section>

      <main className="flex flex-wrap items-start gap-8 pt-7">
        {/* Lead list */}
        <section className="min-w-0 flex-[1_1_620px]">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(['all', ...TIERS] as const).map((t) => {
                const on = filter === t;
                return (
                  <button key={t} onClick={() => setFilter(t)} className="flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition-colors"
                    style={{ borderColor: on ? 'var(--ink)' : 'oklch(0.4 0.025 58)', background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--bg)' : 'var(--ink)' }}>
                    {t === 'all' ? 'All leads' : `${TIER[t].g} ${TIER[t].short}`}<span className="font-mono-h text-[11px] opacity-80">{t === 'all' ? rows.length : count(t)}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 text-[13px]">
              <button onClick={exportCsv} className="rounded-full border border-[var(--line)] px-3.5 py-2 hover:bg-[var(--surface)]">Export CSV</button>
              <button onClick={() => { clearLeads(); setVersion(version + 1); }} className="rounded-full border border-[var(--line)] px-3.5 py-2 text-[var(--sand)] hover:bg-[var(--surface)]">Clear typed-in leads</button>
            </div>
          </div>
          <div className="flex flex-col border-t border-[var(--line)]">
            {shown.map(({ l, a, d, data }, i) => {
              const on = sel?.l.id === l.id, V = VERD[a.verdict];
              return (
                <button key={l.id} onClick={() => pick(l.id)} aria-pressed={on}
                  className="relative flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-[var(--line)] py-4 pl-[18px] pr-4 text-left transition-colors hover:bg-[oklch(0.25_0.022_52)]"
                  style={{ background: on ? 'oklch(0.26 0.03 55)' : undefined, animation: `hpr-rise .6s ${80 + i * 60}ms cubic-bezier(.2,.7,.2,1) both` }}>
                  <span className="absolute inset-y-0 left-0 w-[3px] transition-colors" style={{ background: on ? 'var(--amber)' : 'transparent' }} />
                  <div className="min-w-[120px] flex-[1_1_130px]">
                    <div className="font-serif-h text-[22px] leading-tight">{l.id}</div>
                    <div className="mt-0.5 text-xs text-[var(--sand)]">{l.building.location || '—'}{l.source === 'homeowner' ? ' · new' : ''} · data {data}%</div>
                  </div>
                  <div className="flex flex-[1_1_120px] items-center gap-2 text-[13px]">
                    <span className="grid h-[22px] w-[22px] place-items-center rounded-full text-xs font-bold text-[var(--bg)]" style={{ background: V.c }}>{V.g}</span>
                    <span><span className="block">{V.t}</span><span className="text-xs text-[var(--sand)]">{a.heatLoad.bestKw} kW · {a.confidence} conf.</span></span>
                  </div>
                  <div className="flex flex-[0_0_96px] items-center gap-2.5">
                    <span className="grid h-[30px] w-[30px] place-items-center rounded-full" style={{ background: `conic-gradient(var(--amber-soft) ${d.preCheck}%, var(--line) 0)` }}><span className="h-[22px] w-[22px] rounded-full bg-[var(--bg)]" /></span>
                    <span className="text-xs leading-tight text-[var(--sand)]"><span className="font-mono-h text-[13px] text-[var(--ink)]">{d.preCheck}%</span><br />pre-check</span>
                  </div>
                  <div className="flex-[1_1_150px]"><Chip t={d.tier} label={d.outOfArea ? 'Outside service area' : undefined} /></div>
                  <div className="flex-[0_0_110px] text-right">
                    <Money v={d.expectedValueEur} className={`font-serif-h text-[22px] ${d.worthIt ? 'text-[var(--ink)]' : 'text-[var(--tier-d)]'}`} />
                    <div className="text-xs text-[var(--sand)]">{d.worthIt ? 'worth it' : 'not worth it yet'}</div>
                  </div>
                  <div className="basis-full text-[13px] text-[var(--sand)]">↳ {d.reasons[0]}</div>
                </button>
              );
            })}
          </div>
          <p className="mt-4 max-w-[640px] text-xs leading-relaxed text-[var(--sand)]">Scored only on building facts and the homeowner's own answers: never on income, nationality, age, gender or name. Homeowners can object to profiling for marketing at any time. Demo data is stored in this browser only.</p>
        </section>

        {/* Inspector */}
        {sel && (
          <aside className="sticky top-5 flex min-w-0 max-w-[560px] flex-[1_1_380px] flex-col gap-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Eyebrow>Why this decision?</Eyebrow>
                <div className="font-serif-h mt-1 text-[38px] leading-tight">{sel.l.id}</div>
                <div className="mt-1 text-[13px] text-[var(--sand)]">{sel.l.building.construction_year} · {sel.l.building.floor_area_m2} m² · {sel.l.building.energy_carrier} · {sel.l.building.heat_distribution}</div>
              </div>
              <Chip t={sel.d.tier} />
            </div>
            <div className="rounded-md bg-[var(--bg)] px-3.5 py-3 text-sm"><span className="text-[var(--sand)]">Next step ·</span> {TIER_INFO[sel.d.tier].action}</div>

            <div>
              <div className="mb-2.5 flex items-baseline justify-between">
                <div className="font-serif-h text-xl">P(sale) build-up</div>
                <div className="font-serif-h text-[28px] text-[var(--amber-soft)]">{Math.round(selP)}%</div>
              </div>
              <div className="mb-2 h-2.5 rounded-sm bg-[var(--bg)]"><div className="h-full rounded-sm bg-[var(--amber-soft)] transition-[width] duration-500" style={{ width: `${selP}%` }} /></div>
              <ul className="flex flex-col gap-1.5 text-[13px]">{sel.d.probabilitySteps.map((s) => <li key={s} className="flex gap-2.5"><span className="text-[var(--amber)]">—</span>{s}</li>)}</ul>
              <p className="mt-2 text-xs text-[var(--sand)]">Fixed, visible adjustments per signal · capped 5–90%</p>
            </div>

            <div className="border-y border-[var(--line)] py-4">
              <div className="font-mono-h text-[13px] text-[var(--sand)]">{Math.round(selP)}% × €{num(cfg.averageMarginEur)} − €{num(cfg.visitCostEur)} =</div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <Money v={sel.d.expectedValueEur} className={`font-serif-h text-[52px] leading-tight ${sel.d.worthIt ? 'text-[var(--amber-soft)]' : 'text-[var(--neg)]'}`} />
                <span className={sel.d.worthIt ? 'text-[var(--amber-soft)]' : 'text-[var(--neg)]'}>{sel.d.worthIt ? 'Worth it' : 'Not worth it yet'}</span>
              </div>
            </div>

            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              <div>
                <div className="font-serif-h mb-2 text-xl">Reasons</div>
                <ul className="flex flex-col gap-1.5 text-sm">{sel.d.reasons.map((r) => <li key={r} className="flex gap-2.5"><span className="text-[var(--amber)]">—</span>{r}</li>)}</ul>
              </div>
              <div>
                <div className="font-serif-h mb-2 text-xl">Commitment signals</div>
                <ul className="flex flex-col gap-1.5 text-sm">{sel.d.commitmentSignals.map((r) => <li key={r} className="border-b border-dashed border-[var(--line)] py-1">{r}</li>)}</ul>
              </div>
            </div>
            {cfg.visitCreditEnabled && (sel.d.tier === 'B' || sel.d.tier === 'C') && <p className="text-xs text-[var(--sand)]">Offer: expert visit €{cfg.visitCreditEur}, fully credited if they buy (mock, no payment).</p>}

            {(sel.d.tier === 'A' || sel.d.tier === 'B') && (
              <button onClick={() => onBrief(sel.l)} className="self-end rounded-full bg-[var(--amber)] px-5 py-2.5 text-sm font-medium text-[var(--bg)] transition-transform hover:-translate-y-px">
                Briefing for the Heizungsbaumeister →
              </button>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
