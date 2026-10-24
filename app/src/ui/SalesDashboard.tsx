import { Fragment, useMemo, useState } from 'react';
import { assess } from '../engine/assess';
import { TIER_INFO, type SalesConfig } from '../sales/config';
import { DEFAULT_CONFIG } from '../sales/config';
import { allLeads, clearLeads, saveConfig } from '../sales/store';
import type { Lead, Tier } from '../sales/types';
import { visitDecision } from '../sales/visitDecision';

const TIER_STYLE: Record<Tier, string> = { A: 'bg-emerald-100 text-emerald-800', B: 'bg-sky-100 text-sky-800', C: 'bg-amber-100 text-amber-800', D: 'bg-slate-200 text-slate-700' };
const DOT = { green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-rose-500' };

function completeness(l: Lead) {
  const b = l.building;
  const fields = [b.construction_year, b.floor_area_m2, b.renovation_status, b.heat_distribution, b.annual_consumption_kwh, b.energy_carrier,
    b.pipe_system !== 'unknown' ? 1 : null, b.flow_temperature_c, b.persons_in_household, b.hot_water_via_heating, b.rooms];
  return Math.round((fields.filter((x) => x != null).length / fields.length) * 100);
}

function csvCell(v: unknown) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

export function SalesDashboard({ cfg, setCfg, onBrief }: { cfg: SalesConfig; setCfg: (c: SalesConfig) => void; onBrief: (l: Lead) => void }) {
  const [filter, setFilter] = useState<Tier | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const rows = useMemo(() => allLeads().map((l) => {
    const a = assess(l.building, l.photo);
    return { l, a, d: visitDecision(l, cfg, a), data: completeness(l) };
  }).sort((x, y) => x.d.tier.localeCompare(y.d.tier) || y.d.expectedValueEur - x.d.expectedValueEur), [cfg, version]);
  const shown = rows.filter((r) => filter === 'all' || r.d.tier === filter);

  const update = (p: Partial<SalesConfig>) => { const n = { ...cfg, ...p }; setCfg(n); saveConfig(n); };

  const exportCsv = () => {
    const head = ['id', 'area', 'verdict', 'confidence', 'data_completeness_pct', 'commitment', 'pre_check_pct', 'visit_decision', 'p_sale', 'expected_value_eur', 'top_reason'];
    const lines = rows.map(({ l, a, d, data }) => [l.id, l.building.location, a.verdict, a.confidence, data, d.commitment, d.preCheck, TIER_INFO[d.tier].label, d.saleProbability.toFixed(2), d.expectedValueEur, d.reasons[0]].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'visit-decisions.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Should we send an expert?</h1>
        <p className="text-slate-600">Visit decisions from transparent rules. The technical traffic light is never changed by sales logic.</p>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Company inputs <span className="normal-case text-amber-700">(placeholder, nuuEnergy to set)</span></h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">Visit cost (€)<input type="number" className="mt-1 block w-28 rounded-lg border px-2 py-1" value={cfg.visitCostEur} onChange={(e) => update({ visitCostEur: Number(e.target.value) || 0 })} /></label>
          <label className="text-sm">Average margin per sale (€)<input type="number" className="mt-1 block w-32 rounded-lg border px-2 py-1" value={cfg.averageMarginEur} onChange={(e) => update({ averageMarginEur: Number(e.target.value) || 0 })} /></label>
          {(['A', 'B', 'C', 'D'] as Tier[]).map((t) => (
            <label key={t} className="text-sm">Base P(sale) {t} (%)<input type="number" className="mt-1 block w-20 rounded-lg border px-2 py-1" value={Math.round(cfg.baseSaleProbability[t] * 100)}
              onChange={(e) => update({ baseSaleProbability: { ...cfg.baseSaleProbability, [t]: (Number(e.target.value) || 0) / 100 } })} /></label>
          ))}
          <button onClick={() => update(DEFAULT_CONFIG)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">Reset</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Expected value = P(sale) × margin − visit cost. An estimate from your own assumptions, not a measured accuracy.</p>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'A', 'B', 'C', 'D'] as const).map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={`rounded-lg px-3 py-1.5 text-sm ${filter === t ? 'bg-slate-800 text-white' : 'bg-white ring-1 ring-slate-200'}`}>
            {t === 'all' ? `All (${rows.length})` : `${TIER_INFO[t].label} (${rows.filter((r) => r.d.tier === t).length})`}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={exportCsv} className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200">Export CSV</button>
        <button onClick={() => { clearLeads(); setVersion(version + 1); }} className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-500 ring-1 ring-slate-200">Clear typed-in leads</button>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['ID / area', 'Technical', 'Data', 'Commitment', 'Pre-check', 'Visit decision', 'Expected value', 'Top reason', ''].map((x) => <th key={x} className="px-3 py-2 font-medium">{x}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map(({ l, a, d, data }) => (
              <Fragment key={l.id}>
                <tr className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2"><b>{l.id}</b><br /><span className="text-xs text-slate-500">{l.building.location || '—'}{l.source === 'homeowner' ? ' · new' : ''}</span></td>
                  <td className="px-3 py-2"><span className={`mr-1 inline-block h-3 w-3 rounded-full ${DOT[a.verdict]}`} />{a.verdict}</td>
                  <td className="px-3 py-2">{data}%</td>
                  <td className="px-3 py-2">{d.commitment}</td>
                  <td className="px-3 py-2">{d.preCheck}%</td>
                  <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[d.tier]}`}>{d.outOfArea ? 'Outside nuuEnergy service area' : TIER_INFO[d.tier].label}</span></td>
                  <td className={`px-3 py-2 font-semibold ${d.worthIt ? 'text-emerald-700' : 'text-slate-500'}`}>{d.expectedValueEur >= 0 ? '+' : '−'}€{Math.abs(d.expectedValueEur).toLocaleString('en-US')}<br /><span className="text-xs font-normal">{d.worthIt ? 'Worth it' : 'Not worth it yet'}</span></td>
                  <td className="px-3 py-2 text-slate-600">{d.reasons[0]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => setOpen(open === l.id ? null : l.id)} className="text-sky-700 underline">Why?</button>
                    {(d.tier === 'A' || d.tier === 'B') && <button onClick={() => onBrief(l)} className="ml-3 text-emerald-700 underline">Briefing</button>}
                  </td>
                </tr>
                {open === l.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={9} className="px-5 py-3">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div><p className="font-semibold">Why this decision?</p><ul className="list-disc pl-5">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul><p className="mt-1 text-slate-600">Next: {TIER_INFO[d.tier].action}</p></div>
                        <div><p className="font-semibold">Commitment signals</p><ul className="list-disc pl-5">{d.commitmentSignals.map((r) => <li key={r}>{r}</li>)}</ul></div>
                        <div><p className="font-semibold">P(sale) = {Math.round(d.saleProbability * 100)}%</p><ul className="list-disc pl-5">{d.probabilitySteps.map((r) => <li key={r}>{r}</li>)}</ul>
                          {cfg.visitCreditEnabled && (d.tier === 'B' || d.tier === 'C') && <p className="mt-1 text-xs text-slate-500">Offer: expert visit €{cfg.visitCreditEur}, fully credited if they buy (mock, no payment).</p>}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Scored only on building facts and the homeowner's own answers: never on income, nationality, age, gender or name. Demo data is stored in this browser only.</p>
    </div>
  );
}
