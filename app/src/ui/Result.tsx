import { useState } from 'react';
import type { Assessment, Building, Flag } from '../engine/types';

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

export function Result({ a, b, onBack }: { a: Assessment; b: Building; onBack: () => void }) {
  const [maths, setMaths] = useState(false);
  const L = LIGHT[a.verdict];
  const h = a.heatLoad;
  const c = a.costs;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-800">← Start over</button>

      <section className={`flex flex-col gap-5 rounded-2xl bg-white p-6 shadow-sm ring-4 ${L.ring} sm:flex-row sm:items-center`}>
        <div className="flex shrink-0 gap-2 rounded-full bg-slate-900 p-2">
          {(['red', 'yellow', 'green'] as const).map((k) => (
            <span key={k} className={`h-10 w-10 rounded-full ${k === a.verdict ? LIGHT[k].dot : 'bg-slate-700'}`} />
          ))}
        </div>
        <div>
          <p className={`text-sm font-semibold ${L.text}`}>{L.label} · confidence {a.confidence}</p>
          <h2 className="text-2xl font-bold text-slate-900">{a.headline}</h2>
          <ul className="mt-2 list-disc pl-5 text-slate-700">
            {a.verdictReasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          {b.building_id && <p className="mt-2 text-xs text-slate-400">{b.building_id} · {b.location}</p>}
        </div>
      </section>

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
