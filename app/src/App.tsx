import { Component, useState, type ReactNode } from 'react';
import dev from './data/buildings_dev.json';
import evalSet from './data/buildings_eval.json';
import { assess } from './engine/assess';
import type { Assessment, Building, PhotoFindings } from './engine/types';
import { Result } from './ui/Result';
import { Wizard } from './ui/Wizard';

const DEMOS = [...(dev as Building[]), ...(evalSet as Building[])];
const DOT = { green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-rose-500' };

/** Keeps a live demo alive: any render error shows a recoverable card instead of a blank page. */
class Guard extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-rose-200">
        <p className="font-semibold text-rose-700">Something went wrong showing this result.</p>
        <p className="text-sm text-slate-500">{this.state.error.message}</p>
        <button className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-white" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>Back to start</button>
      </div>
    );
  }
}

type View ={ kind: 'home' } | { kind: 'wizard' } | { kind: 'eval' } | { kind: 'result'; b: Building; a: Assessment };

function EvalTable({ onOpen }: { onOpen: (b: Building) => void }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{['Building', 'Set', 'Method A', 'Method B', 'Best estimate', 'Reference', 'Verdict', 'Expected', 'HP cost / today'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {DEMOS.map((b) => {
            const a = assess(b);
            const h = a.heatLoad;
            const ref = b.reference_heating_load_kw;
            return (
              <tr key={b.building_id} onClick={() => onOpen(b)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-semibold">{b.building_id}</td>
                <td className="px-3 py-2">{ref != null ? 'dev' : 'eval'}</td>
                <td className="px-3 py-2">{h.methodA ? `${h.methodA.low}–${h.methodA.high}` : '—'} kW</td>
                <td className="px-3 py-2">{h.methodB?.kw ?? '—'} kW</td>
                <td className="px-3 py-2 font-semibold">{h.bestKw} kW</td>
                <td className="px-3 py-2">{ref != null ? `${ref} kW (${Math.round(((h.bestKw! - ref) / ref) * 100)}%)` : 'hidden'}</td>
                <td className="px-3 py-2"><span className={`mr-2 inline-block h-3 w-3 rounded-full ${DOT[a.verdict]}`} />{a.verdict} · {a.confidence}</td>
                <td className="px-3 py-2">{b.expected_verdict ?? 'hidden'}</td>
                <td className="px-3 py-2">€{a.costs?.heatPumpEur.toLocaleString('en-US')}{a.costs && a.costs.heatPumpEurWorst !== a.costs.heatPumpEur ? `–${a.costs.heatPumpEurWorst.toLocaleString('en-US')}` : ''} / €{a.costs?.currentEur?.toLocaleString('en-US') ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="p-3 text-xs text-slate-500">Calibrated on only 3 labelled houses: our estimates match those references within the shown %; we do not claim accuracy beyond that. Click a row for the full result.</p>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const open = (b: Building, photo?: PhotoFindings) => setView({ kind: 'result', b, a: assess(b, photo) });

  return (
    <div className="min-h-screen font-sans bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button onClick={() => setView({ kind: 'home' })} className="text-lg font-bold">Heat Pump Ready<span className="text-emerald-600">?</span></button>
          <button onClick={() => setView({ kind: 'eval' })} className="text-sm text-slate-600 hover:text-slate-900">All 5 buildings</button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8"><Guard onReset={() => setView({ kind: 'home' })}>
        {view.kind === 'home' && (
          <div className="space-y-8">
            <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
              <h1 className="text-3xl font-bold">Would a heat pump work in my home?</h1>
              <p className="mt-2 max-w-2xl text-slate-600">An honest first answer in under three minutes, from your energy bill, a few facts about the house and optional radiator photos. We tell you what we can't know yet, and what a technician must check.</p>
              <button onClick={() => setView({ kind: 'wizard' })} className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 text-lg font-semibold text-white hover:bg-emerald-700">Start check</button>
            </section>
            <section>
              <h2 className="mb-3 font-semibold text-slate-700">Or try a demo house</h2>
              <div className="grid gap-3 sm:grid-cols-5">
                {DEMOS.map((b) => (
                  <button key={b.building_id} onClick={() => open(b)} className="rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 hover:ring-emerald-400">
                    <p className="font-bold">{b.building_id}</p>
                    <p className="text-sm text-slate-600">{b.construction_year} · {b.floor_area_m2} m² · {b.energy_carrier}</p>
                    <p className="text-xs text-slate-400">{b.heat_distribution} · {b.reference_heating_load_kw != null ? 'dev' : 'eval'}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
        {view.kind === 'wizard' && <Wizard onDone={open} />}
        {view.kind === 'eval' && <EvalTable onOpen={(b) => open(b)} />}
        {view.kind === 'result' && <Result a={view.a} b={view.b} onBack={() => setView({ kind: 'home' })} />}
      </Guard></main>
    </div>
  );
}
