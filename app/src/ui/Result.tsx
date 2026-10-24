import { useState } from 'react';
import { explainPlainly } from '@core/ai/explain';
import { hasLlmKey, providerName } from '@core/ai/provider';
import { ASSUMPTIONS } from '@core/engine/constants';
import { resultAreas } from '@core/engine/areas';
import { CountUp, Ember, Eyebrow, HeatField, STATUS_GLYPH } from './hearth';
import { pathToGreen } from '@core/engine/pathToGreen';
import type { Assessment, Building, Flag } from '@core/engine/types';

const LIGHT = {
  green: { dot: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700', label: 'Green: likely suitable' },
  yellow: { dot: 'bg-amber-400', ring: 'ring-amber-200', text: 'text-amber-700', label: 'Yellow: potentially suitable, checks remain' },
  red: { dot: 'bg-rose-500', ring: 'ring-rose-200', text: 'text-rose-700', label: 'Red: obstacle found' },
};

const eur = (n: number) => `€${n.toLocaleString('en-US')}`;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function FlagList({ items, empty, tone }: { items: Flag[]; empty: string; tone: string }) {
  if (!items.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f.title} className={`border-l-4 pl-3 ${tone}`}>
          <p className="font-medium text-slate-800">{f.title}{f.critical ? ' •' : ''}</p>
          <p className="text-sm text-slate-600">{f.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function PlainLanguage({ a }: { a: Assessment }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; text: string }>({ status: 'idle', text: '' });
  const run = async () => {
    setState({ status: 'loading', text: '' });
    try { setState({ status: 'done', text: await explainPlainly(a) }); }
    catch (e) { setState({ status: 'error', text: (e as Error).message }); }
  };
  return (
    <Card title="In plain words">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-400">AI rephrasing ({providerName()}) · no new numbers allowed</p>
          {!hasLlmKey() && <p className="text-sm text-slate-400">AI helper is off (no key). The engine's reasons on the right are the full answer.</p>}
          {hasLlmKey() && state.status === 'idle' && <button onClick={run} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Explain in plain words</button>}
          {state.status === 'loading' && <p className="text-sm text-slate-500">Writing…</p>}
          {state.status === 'done' && <p className="text-slate-800">{state.text}</p>}
          {state.status === 'error' && <p className="text-sm text-amber-700">Not shown: {state.text}. The engine's reasons on the right stay authoritative.</p>}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-400">Engine reasons (deterministic, source of truth)</p>
          <ul className="list-disc pl-5 text-sm text-slate-700">{a.verdictReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      </div>
    </Card>
  );
}

const EFFORT = { check: 'bg-slate-100 text-slate-600', 'small work': 'bg-amber-100 text-amber-800', 'bigger work': 'bg-rose-100 text-rose-700' };

function PathToGreenCard({ a, b }: { a: Assessment; b: Building }) {
  if (a.verdict === 'green' && a.confidence === 'high') return null;
  const p = pathToGreen(b);
  return (
    <Card title={a.verdict === 'green' ? 'Path to high confidence' : 'Path to green'}>
      <p className="mb-3 text-sm text-slate-500">If each technician check comes back positive, the same engine gives:</p>
      <ol className="space-y-2">
        <li className="flex items-center gap-3 text-sm text-slate-500">
          <span className={`h-3 w-3 shrink-0 rounded-full ${LIGHT[a.verdict].dot}`} /> Today: {a.verdict}, {a.confidence} confidence
        </li>
        {p.steps.map((s, i) => (
          <li key={s.check} className="flex items-start gap-3">
            <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${LIGHT[s.verdict].dot}`} />
            <div className="flex-1">
              <p className="font-medium text-slate-800">{i + 1}. {s.check} <span className={`ml-1 rounded px-1.5 text-xs ${EFFORT[s.effort]}`}>{s.effort}</span></p>
              <p className="text-sm text-slate-600">If: {s.outcome} → <b>{s.verdict}, {s.confidence} confidence</b></p>
            </div>
          </li>
        ))}
      </ol>
      {p.reachesGreenHigh
        ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">These {p.steps.length} step{p.steps.length === 1 ? '' : 's'} would make this a <b>green with high confidence</b>.</p>
        : (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Even with every check positive, it stays {p.steps[p.steps.length - 1]?.verdict ?? a.verdict}:</p>
            <ul className="list-disc pl-5">{p.blockers.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
      <p className="mt-2 text-xs text-slate-400">A simulation, not a promise: the real answers come from the on-site checks.</p>
    </Card>
  );
}

export function Result({ a, b, onBack, onBook }: { a: Assessment; b: Building; onBack: () => void; onBook?: () => void }) {
  const [maths, setMaths] = useState(false);
  const h = a.heatLoad;
  const c = a.costs;

  return (
    <div className="space-y-6">
      {/* "The Verdict": ember orb + editorial headline + the four areas */}
      <section className="relative -mx-4 overflow-hidden px-[clamp(20px,4vw,56px)] pb-4 pt-2">
        <HeatField />
        <div className="relative flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">← Start over</button>
          {onBook && <button onClick={onBook} className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Next step: free expert check →</button>}
        </div>
        <div className="relative mt-8 grid items-center gap-[clamp(28px,5vw,64px)]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))' }}>
          <div className="hpr-rise flex justify-center" style={{ gridColumn: 'span 1' }}>
            <Ember verdict={a.verdict} size={200} />
          </div>
          <div className="min-w-0" style={{ animation: 'hpr-rise .9s .12s cubic-bezier(.2,.7,.2,1) both', gridColumn: 'span 2' }}>
            <Eyebrow className="text-[var(--amber)]">Your first answer · {a.confidence} confidence{b.building_id ? ` · ${b.building_id}` : ''}</Eyebrow>
            <h1 className="font-serif-h mt-4 text-[clamp(36px,4.8vw,68px)] font-normal leading-[1.02] tracking-[-0.025em]">{a.headline}</h1>
            <ul className="mt-5 space-y-2 text-[17px] leading-relaxed text-slate-700">
              {a.verdictReasons.map((r) => <li key={r} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber)]" />{r}</li>)}
            </ul>
            {h.bestKw != null && (
              <div className="mt-7 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--line)] pt-5">
                <div><Eyebrow>Heat load</Eyebrow><div className="font-serif-h text-[44px] leading-none"><CountUp value={h.bestKw} format={(n) => n.toFixed(1)} /><span className="text-lg text-slate-500"> kW</span></div></div>
                {c && <div><Eyebrow>Heat pump per year</Eyebrow><div className="font-serif-h text-[44px] leading-none">€<CountUp value={c.heatPumpEur} /></div></div>}
                {c?.currentEur != null && <div><Eyebrow>{c.currentLabel} today</Eyebrow><div className="font-serif-h text-[44px] leading-none text-slate-500">€<CountUp value={c.currentEur} /></div></div>}
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Four result areas" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        {resultAreas(b, a).map((x, k) => (
          <article key={x.key} className="hpr-lift relative overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-5"
            style={{ animation: `hpr-rise .8s ${250 + k * 90}ms cubic-bezier(.2,.7,.2,1) both` }}>
            <div className="flex items-center justify-between">
              <Eyebrow>{x.title}</Eyebrow>
              <span aria-label={x.status} className="font-mono-h flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold"
                style={{ color: 'var(--bg)', background: STATUS_GLYPH[x.status][1] }}>{STATUS_GLYPH[x.status][0]}</span>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{x.reason}</p>
            <p className="mt-3 border-t border-[var(--line)] pt-3 text-sm text-slate-500"><span className="text-[var(--amber-soft)]">Next ·</span> {x.nextCheck}</p>
          </article>
        ))}
      </section>

      <PathToGreenCard a={a} b={b} />

      <PlainLanguage key={b.building_id ?? 'custom'} a={a} />

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Heat load">
          {h.bestKw != null ? (
            <p className="text-3xl font-bold text-slate-900">{h.bestKw} kW <span className="text-base font-normal text-slate-500">≈ {h.bestWPerM2} W/m²</span></p>
          ) : <p className="text-slate-500">Not enough data.</p>}
          {h.range && <p className="text-sm text-slate-500">Plausible range {h.range.low}–{h.range.high} kW</p>}
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Method A: floor area × age band</dt><dd>{h.methodA ? `${h.methodA.low}–${h.methodA.high} kW` : '—'}</dd></div>
            <div className="flex justify-between"><dt>Method B: from your bill</dt><dd>{h.methodB ? `${h.methodB.kw} kW (${h.methodB.wPerM2} W/m²)` : '—'}</dd></div>
          </dl>
          {h.rules.map((r) => (
            <p key={r.effect} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><b>{r.effect}.</b> {r.reason}</p>
          ))}
        </Card>

        <Card title="Running costs per year">
          {c ? (
            <>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-xs text-slate-500">Heat pump</p>
                  <p className="text-3xl font-bold text-emerald-700">{eur(c.heatPumpEur)}{c.heatPumpEurWorst !== c.heatPumpEur && <span className="text-lg">–{eur(c.heatPumpEurWorst)}</span>}</p>
                </div>
                {c.currentEur != null && (
                  <div>
                    <p className="text-xs text-slate-500">{c.currentLabel} today</p>
                    <p className="text-3xl font-bold text-slate-700">{eur(c.currentEur)}</p>
                  </div>
                )}
              </div>
              {c.currentEur != null && (
                <p className="mt-2 text-sm text-slate-600">
                  Difference: about <b>{eur(c.currentEur - c.heatPumpEurWorst)}{c.heatPumpEurWorst !== c.heatPumpEur && `–${eur(c.currentEur - c.heatPumpEur)}`}</b> per year
                </p>
              )}
              <p className="mt-2 text-sm text-slate-600">JAZ {a.radiators.jaz}{a.radiators.jazWorst !== a.radiators.jaz && `–${a.radiators.jazWorst}`} · flow {a.radiators.flowTemp}. {a.radiators.reason}</p>
              <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">{c.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          ) : <p className="text-slate-500">Add your yearly consumption to compare costs.</p>}
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Card title="Obstacles (known problems)"><FlagList items={a.flags.obstacles} empty="No known obstacle." tone="border-rose-400" /></Card>
        <Card title="Can't tell yet"><FlagList items={a.flags.unknowns} empty="Nothing important missing." tone="border-amber-300" /></Card>
        <Card title="Contradictions in the data"><FlagList items={a.flags.contradictions} empty="No contradictions found." tone="border-violet-400" /></Card>
      </div>
      <p className="-mt-3 text-xs text-slate-400">• = affects the traffic light. Missing data never makes a home "red" on its own.</p>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Technician checklist">
          <ol className="list-decimal space-y-2 pl-5">
            {a.flags.technicianChecks.map((t) => (
              <li key={t.title}><b>{t.title}</b>{t.critical && <span className="ml-2 rounded bg-rose-100 px-1.5 text-xs text-rose-700">cost risk</span>}<br /><span className="text-sm text-slate-600">{t.detail}</span></li>
            ))}
          </ol>
        </Card>
        <Card title="What would make this greener">
          {a.flags.tips.length ? <ul className="list-disc space-y-1 pl-5 text-slate-700">{a.flags.tips.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-sm text-slate-400">Nothing obvious: this home is already a good fit.</p>}
          <p className="mt-3 text-sm text-slate-500">Pipe system: <b>{a.pipeSystem.value}</b> ({a.pipeSystem.source})</p>
        </Card>
      </div>

      <Card title="Assumptions">
        <table className="w-full text-sm">
          <tbody>
            {ASSUMPTIONS.map((x) => (
              <tr key={x.label} className="border-t border-slate-100">
                <td className="py-1 pr-3 text-slate-600">{x.label}</td>
                <td className="py-1 pr-3 font-medium">{x.value}</td>
                <td className="py-1 text-xs text-slate-400">{x.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <button onClick={() => setMaths(!maths)} className="font-semibold text-slate-700">{maths ? '▾' : '▸'} Show the maths</button>
        {maths && (
          <div className="mt-3 space-y-2 font-mono text-sm text-slate-700">
            {h.methodA && <p>Method A: {b.floor_area_m2} m² × {h.methodA.wPerM2.low}–{h.methodA.wPerM2.high} W/m² ({h.methodA.band}) = {h.methodA.low}–{h.methodA.high} kW</p>}
            {h.methodA?.notes.map((n) => <p key={n}>  note: {n}</p>)}
            {h.methodB?.steps.map((s) => <p key={s}>Method B: {s}</p>)}
            {c?.assumptions.map((s) => <p key={s}>Cost: {s}</p>)}
          </div>
        )}
      </section>
    </div>
  );
}
