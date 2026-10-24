import { Component, useEffect, useState, type ReactNode } from 'react';
import { loadConfig, saveLead } from '@core/sales/store';
import type { Lead } from '@core/sales/types';
import { BookFlow } from './ui/BookFlow';
import { Briefing } from './ui/Briefing';
import { SalesDashboard } from './ui/SalesDashboard';
import { LiveSales } from './ui/LiveSales';
import dev from '@core/data/buildings_dev.json';
import evalSet from '@core/data/buildings_eval.json';
import { assess } from '@core/engine/assess';
import type { Assessment, Building, PhotoFindings } from '@core/engine/types';
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

type View =
  | { kind: 'home' } | { kind: 'wizard' } | { kind: 'eval' }
  | { kind: 'result'; b: Building; a: Assessment; photo?: PhotoFindings }
  | { kind: 'book'; b: Building; photo?: PhotoFindings }
  | { kind: 'sent'; lead: Lead }
  | { kind: 'sales' } | { kind: 'brief'; lead: Lead } | { kind: 'live' };

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
  const open = (b: Building, photo?: PhotoFindings) => setView({ kind: 'result', b, a: assess(b, photo), photo });
  const [cfg, setCfg] = useState(loadConfig);
  const isSales = view.kind === 'sales' || view.kind === 'brief';
  useEffect(() => {
    const sync = () => setView((v) =>
      location.hash === '#/live' ? { kind: 'live' }
        : location.hash === '#/sales' ? (v.kind === 'brief' ? v : { kind: 'sales' })
        : (v.kind === 'sales' || v.kind === 'brief' || v.kind === 'live' ? { kind: 'home' } : v));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const toggleSales = () => {
    if (isSales) { history.replaceState(null, '', '#/'); setView({ kind: 'home' }); }
    else { history.replaceState(null, '', '#/sales'); setView({ kind: 'sales' }); }
  };

  return (
    <div className="min-h-screen font-sans bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button onClick={() => setView({ kind: 'home' })} className="text-lg font-bold">Heat Pump Ready<span className="text-emerald-600">?</span></button>
          <div className="flex items-center gap-4 print:hidden">
            <button onClick={() => { history.replaceState(null, '', '#/live'); setView({ kind: 'live' }); }} className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">Live leads</button>
            {!isSales && <button onClick={() => setView({ kind: 'eval' })} className="text-sm text-slate-600 hover:text-slate-900">All 5 buildings</button>}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={isSales} onChange={toggleSales} />
              Sales view <span className="text-xs text-slate-400">(demo, would be behind login)</span>
            </label>
          </div>
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
        {view.kind === 'result' && <Result a={view.a} b={view.b} onBack={() => setView({ kind: 'home' })} onBook={() => setView({ kind: 'book', b: view.b, photo: view.photo })} />}
        {view.kind === 'book' && (
          <BookFlow building={view.b} photo={view.photo} onCancel={() => open(view.b, view.photo)}
            onDone={(lead) => { saveLead(lead); setView({ kind: 'sent', lead }); }} />
        )}
        {view.kind === 'sent' && (
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-2xl font-bold">Thanks, your request is with nuuEnergy</h2>
            <p className="mt-2 text-slate-600">Reference {view.lead.id}. Their technical planning team will contact you about the next step. The check stays free and without obligation.</p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setView({ kind: 'home' })} className="rounded-lg bg-slate-100 px-4 py-2">Back to start</button>
              <button onClick={toggleSales} className="rounded-lg bg-slate-800 px-4 py-2 text-white">Demo: open the sales view</button>
            </div>
          </div>
        )}
        {view.kind === 'live' && <LiveSales />}
        {view.kind === 'sales' && <SalesDashboard cfg={cfg} setCfg={setCfg} onBrief={(lead) => setView({ kind: 'brief', lead })} />}
        {view.kind === 'brief' && <Briefing lead={view.lead} cfg={cfg} onBack={() => setView({ kind: 'sales' })} />}
      </Guard></main>
    </div>
  );
}
