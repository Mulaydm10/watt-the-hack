import { assess } from '../engine/assess';
import type { SalesConfig } from '../sales/config';
import { TIER_INFO } from '../sales/config';
import { sizeToUnits } from '../sales/offer';
import { preCheckTasks } from '../sales/preCheck';
import type { Lead } from '../sales/types';
import { visitDecision, visitMinutes } from '../sales/visitDecision';

// Site checks in order of importance (sales brief P0-6).
const PRIORITY = ['Meter cabinet', 'Outdoor-unit', 'Pipe system', 'Radiator sizes', 'Exact heat load'];
const rank = (t: string) => { const i = PRIORITY.findIndex((p) => t.startsWith(p)); return i < 0 ? 99 : i; };

/** One printable page for the technician (window.print, no PDF library). */
export function Briefing({ lead, cfg, onBack }: { lead: Lead; cfg: SalesConfig; onBack: () => void }) {
  const b = lead.building;
  const a = assess(b, lead.photo);
  const d = visitDecision(lead, cfg, a);
  const h = a.heatLoad;
  const tasks = preCheckTasks(b, a, lead.preCheck);
  const answered = new Set(tasks.filter((t) => t.done && t.key !== 'bill').map((t) => t.siteCheck));
  const onSite = [...a.flags.technicianChecks].sort((x, y) => rank(x.title) - rank(y.title));
  const size = sizeToUnits(h.bestKw, h.range?.high);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <button onClick={onBack} className="rounded-lg bg-slate-100 px-4 py-2">← Back to sales</button>
        <button onClick={() => window.print()} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Print / save as PDF</button>
      </div>
      <article className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between border-b pb-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Technician briefing</p>
            <h1 className="text-2xl font-bold">{lead.id} · {b.location || 'area not given'}</h1>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{TIER_INFO[d.tier].label}</p>
            <p>Technical: {a.verdict} ({a.confidence} confidence)</p>
            <p>Estimated visit: ~{visitMinutes(d.preCheck, cfg)} min (pre-check {d.preCheck}%)</p>
          </div>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="font-semibold">House</h2>
            <p className="text-sm">{b.construction_year ?? '?'} · {b.floor_area_m2 ?? '?'} m² · {b.heat_distribution ?? '?'} · {b.energy_carrier ?? '?'} {b.annual_consumption_kwh ? `${b.annual_consumption_kwh.toLocaleString('en-US')} kWh/yr` : ''}</p>
            {b.building_notes && <p className="text-sm text-slate-600">Notes: {b.building_notes}</p>}
            {b.radiator_info && <p className="text-sm text-slate-600">Radiators: {b.radiator_info}</p>}
          </div>
          <div>
            <h2 className="font-semibold">Heat load and sizing</h2>
            <p className="text-sm">Method A: {h.methodA ? `${h.methodA.low}–${h.methodA.high} kW` : '—'} · Method B: {h.methodB ? `${h.methodB.kw} kW` : '—'}</p>
            <p className="text-sm">Best estimate <b>{h.bestKw ?? '?'} kW</b>{h.range ? ` (range ${h.range.low}–${h.range.high})` : ''}. {h.rules[0]?.reason}</p>
            {size.units.length > 0 && <p className="text-sm">Suggested unit: <b>{size.units.join(' or ')} kW</b>. {size.note}</p>}
            <p className="text-sm">Flow temperature: {a.radiators.flowTemp} · JAZ {a.radiators.jaz}{a.radiators.jazWorst !== a.radiators.jaz ? `–${a.radiators.jazWorst}` : ''}</p>
          </div>
        </section>

        <section className="mt-4">
          <h2 className="font-semibold">Already answered remotely</h2>
          <ul className="list-disc pl-5 text-sm">
            {tasks.map((t) => <li key={t.key} className={t.done ? '' : 'text-slate-400'}>{t.title}: {t.finding}</li>)}
            {lead.photo && <li>Pipe photo AI/manual: {lead.photo.label} ({Math.round(lead.photo.confidence * 100)}%) — {lead.photo.evidence.join('; ')}</li>}
          </ul>
        </section>

        <section className="mt-4">
          <h2 className="font-semibold">Check on site (by importance)</h2>
          <ol className="list-decimal pl-5 text-sm">
            {onSite.map((t) => (
              <li key={t.title} className={answered.has(t.title) ? 'text-slate-400' : ''}>
                <b>{t.title}</b>{answered.has(t.title) ? ' — pre-checked by photo, confirm quickly' : ''}: {t.detail}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-4">
          <h2 className="font-semibold">Bring / measure</h2>
          <ul className="list-disc pl-5 text-sm">
            {a.pipeSystem.value === 'single-pipe' && <li>Check the end radiators of the single-pipe loop (surface temperature, size).</li>}
            {a.pipeSystem.value === 'unknown' && b.heat_distribution !== 'underfloor' && <li>Trace the pipe runs between radiators and in the boiler room (single- vs two-pipe).</li>}
            {b.flow_temperature_c == null && b.heat_distribution !== 'underfloor' && <li>Run a 55 °C flow-temperature test; note which rooms stay cold.</li>}
            {a.flags.contradictions.length > 0 && <li>Verify: {a.flags.contradictions.map((x) => x.title.toLowerCase()).join('; ')}.</li>}
            <li>Measure radiators (type, height, length) in the coldest rooms.</li>
            <li>Photograph the meter cabinet and main fuse for the grid-operator request.</li>
          </ul>
        </section>

        <section className="mt-4 border-t pt-3 text-sm">
          <h2 className="font-semibold">Why this visit</h2>
          <ul className="list-disc pl-5">{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      </article>
    </div>
  );
}
