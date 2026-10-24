import { useCallback, useEffect, useMemo, useState } from 'react';

// Live sales dashboard: real leads from the backend (voice agent, chat, app). Needs the sales token.
const DEFAULT_API = (import.meta.env.VITE_API_BASE as string | undefined) ?? `${location.protocol}//${location.hostname}:8787`;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

type Row = {
  lead_id: string; created_at: string; channel: string; language: string; area: string | null; region: string | null; service_area: string | null;
  verdict: 'green' | 'yellow' | 'red'; confidence: string; heat_load_kw: number | null; tier: string; decision: string; top_reason: string | null;
  expected_value_eur: number; pre_check_pct: number; contact: { name: string | null; phone: string | null; preferred_time: string | null } | null;
  promised: string; status: string; status_updated_at: string | null;
};
type Area = { key: string; title: string; status: 'good' | 'check' | 'issue'; reason: string; nextCheck: string };
type Report = Record<string, any>;

const DOT = { green: 'bg-emerald-500', yellow: 'bg-amber-400', red: 'bg-rose-500' };
const TIER = { A: 'bg-emerald-100 text-emerald-800', B: 'bg-sky-100 text-sky-800', C: 'bg-amber-100 text-amber-800', D: 'bg-slate-200 text-slate-700' } as Record<string, string>;
const AREA = { good: ['✓', 'bg-emerald-50 ring-emerald-200 text-emerald-800'], check: ['?', 'bg-amber-50 ring-amber-200 text-amber-900'], issue: ['!', 'bg-rose-50 ring-rose-200 text-rose-800'] } as const;
const PROV: Record<string, string> = { user_said: 'said', user_estimate: 'estimated', user_unknown: 'unknown', bill_ai: 'bill', certificate: 'certificate', photo_ai: 'photo AI', location_lookup: 'location' };
const eur = (n: number | null | undefined) => (n == null ? '—' : `€${Math.round(n).toLocaleString('en-US')}`);
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function LiveSales() {
  const [api, setApi] = useState(store.get('hpr.api') || DEFAULT_API);
  const [token, setToken] = useState(store.get('hpr.salesToken'));
  const [rows, setRows] = useState<Row[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<{ report: Report; status: { status: string; notes: { at: string; text: string }[] } } | null>(null);
  const [filter, setFilter] = useState('all');
  const [note, setNote] = useState('');

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(`${api.replace(/\/$/, '')}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    if (r.status === 401) throw new Error('Wrong or missing sales token.');
    if (!r.ok) throw new Error(`Backend error ${r.status}`);
    return r.json();
  }, [api, token]);

  const load = useCallback(async () => {
    try {
      const d = await call('/leads');
      setRows(d.leads); setStatuses(d.statuses); setError('');
    } catch (e) { setError((e as Error).message); }
  }, [call]);

  useEffect(() => { if (token) { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); } }, [token, load]);

  const shown = useMemo(() => rows.filter((r) => filter === 'all' || r.tier === filter || r.status === filter), [rows, filter]);
  const openLead = async (id: string) => { try { setOpen(await call(`/leads/${id}`)); setNote(''); } catch (e) { setError((e as Error).message); } };
  const update = async (id: string, patch: { status?: string; note?: string }) => {
    try { const st = await call(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); if (open?.report.lead_id === id) setOpen({ ...open, status: st }); setNote(''); load(); }
    catch (e) { setError((e as Error).message); }
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold">Sales sign-in</h1>
        <p className="mt-1 text-sm text-slate-600">Live leads contain customer contact data. Enter the sales token (demo stand-in for a real login).</p>
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const t = String(f.get('t') ?? ''); const a = String(f.get('a') ?? api); store.set('hpr.salesToken', t); store.set('hpr.api', a); setApi(a); setToken(t); }}>
          <label className="mt-4 block text-sm font-medium">Backend URL<input name="a" defaultValue={api} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="mt-3 block text-sm font-medium">Sales token<input name="t" type="password" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <button className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">Open dashboard</button>
        </form>
      </div>
    );
  }

  const r = open?.report;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Live leads</h1>
          <p className="text-slate-600">Real requests from the voice assistant and the app. Updates every 10 s. The technical light is never changed by sales logic.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button onClick={load} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">Refresh</button>
          <button onClick={() => { store.set('hpr.salesToken', ''); setToken(''); }} className="rounded-lg bg-white px-3 py-1.5 text-slate-500 ring-1 ring-slate-200">Sign out</button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        {['all', 'A', 'B', 'C', 'D', ...statuses].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 ${filter === f ? 'bg-slate-800 text-white' : 'bg-white ring-1 ring-slate-200'}`}>
            {f === 'all' ? `All (${rows.length})` : `${f.replace('_', ' ')} (${rows.filter((x) => x.tier === f || x.status === f).length})`}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr>{['Lead', 'Received', 'Area', 'Technical', 'Next step', 'Contact', 'Expected value', 'Status'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No leads yet.</td></tr>}
            {shown.map((l) => (
              <tr key={l.lead_id} onClick={() => openLead(l.lead_id)} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50">
                <td className="px-3 py-2"><b>{l.lead_id}</b><br /><span className="text-xs text-slate-500">{l.channel} · {l.language}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{when(l.created_at)}</td>
                <td className="px-3 py-2">{l.region ?? '—'}<br /><span className="text-xs text-slate-500">{l.area}{l.service_area === 'out' ? ' · outside area' : ''}</span></td>
                <td className="px-3 py-2"><span className={`mr-1 inline-block h-3 w-3 rounded-full ${DOT[l.verdict]}`} />{l.verdict} · {l.confidence}<br /><span className="text-xs text-slate-500">{l.heat_load_kw ?? '?'} kW</span></td>
                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${TIER[l.tier]}`}>{l.decision}</span><br /><span className="text-xs text-slate-600">{l.top_reason}</span></td>
                <td className="px-3 py-2">{l.contact ? <>{l.contact.name}<br /><span className="text-xs text-slate-500">{l.contact.phone} · {l.contact.preferred_time ?? 'any time'}</span></> : <span className="text-xs text-slate-400">not shared</span>}</td>
                <td className={`px-3 py-2 font-semibold ${l.expected_value_eur > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{eur(l.expected_value_eur)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <select value={l.status} onChange={(e) => update(l.lead_id, { status: e.target.value })} className="rounded border px-2 py-1">
                    {statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Scored only on building facts and the homeowner's own answers, never on age, income or personal traits. Expected value uses company placeholder assumptions.</p>

      {r && (
        <div className="fixed inset-0 z-10 flex justify-end bg-black/30 print:static print:bg-white" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-xl print:max-w-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Lead · briefing for the Heizungsbaumeister</p>
                <h2 className="text-2xl font-bold">{r.lead_id} · {r.location?.region ?? '—'} ({r.location?.area})</h2>
                <p className="text-sm text-slate-600">{when(r.created_at)} · {r.channel} · {r.language}{r.contact ? ` · ${r.contact.name} · ${r.contact.phone} · ${r.contact.preferred_time ?? 'any time'}` : ' · contact not shared'}</p>
              </div>
              <div className="flex gap-2 print:hidden">
                <button onClick={() => window.print()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">Print briefing</button>
                <button onClick={() => setOpen(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">Close</button>
              </div>
            </div>

            <section className="mt-4 rounded-xl bg-slate-50 p-4">
              <p><span className={`mr-2 inline-block h-3 w-3 rounded-full ${DOT[r.assessment.verdict as 'green']}`} /><b>{r.assessment.verdict}</b> ({r.assessment.confidence} confidence) · {r.assessment.headline}</p>
              <p className="mt-1"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${TIER[r.visit_decision.tier]}`}>{r.visit_decision.label}</span> <span className="text-sm text-slate-600">{r.visit_decision.action}</span></p>
              <p className="mt-2 text-sm"><b>Promised to the customer:</b> {r.promised_to_customer}</p>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-2">
              {(r.assessment.areas as Area[]).map((a) => (
                <div key={a.key} className={`rounded-xl p-3 ring-1 ${AREA[a.status][1]}`}>
                  <p className="font-semibold">{AREA[a.status][0]} {a.title} · {a.status}</p>
                  <p className="text-sm">{a.reason}</p>
                  <p className="mt-1 text-xs opacity-80">Next: {a.nextCheck}</p>
                </div>
              ))}
            </section>

            <section className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="font-semibold">Heat load and sizing</h3>
                <p className="text-sm">Best estimate <b>{r.assessment.heat_load.best_kw ?? '?'} kW</b> ({r.assessment.heat_load.w_per_m2 ?? '?'} W/m²){r.assessment.heat_load.range ? `, range ${r.assessment.heat_load.range.low}–${r.assessment.heat_load.range.high} kW` : ''}. Unit {r.costs.unit_kw.join(' or ') || '?'} kW.</p>
                <p className="text-xs text-slate-500">{r.assessment.heat_load.rules?.[0]?.reason}</p>
                <h3 className="mt-3 font-semibold">Costs (per year / project)</h3>
                <p className="text-sm">Heat pump {eur(r.costs.heat_pump_eur?.[0])}–{eur(r.costs.heat_pump_eur?.[1])} vs today {eur(r.costs.current_eur)} · price {eur(r.costs.price_band_eur[0])}–{eur(r.costs.price_band_eur[1])} gross · subsidy up to {r.costs.subsidy_pct}%</p>
              </div>
              <div>
                <h3 className="font-semibold">Why this next step</h3>
                <ul className="list-disc pl-5 text-sm">{r.visit_decision.reasons.map((x: string) => <li key={x}>{x}</li>)}</ul>
                <p className="mt-1 text-xs text-slate-500">P(sale) {Math.round(r.visit_decision.p_sale * 100)}% · expected value {eur(r.visit_decision.expected_value_eur)} (placeholder assumptions)</p>
              </div>
            </section>

            <section className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="font-semibold">Check on site</h3>
                <ol className="list-decimal pl-5 text-sm">{r.assessment.technician_checks.map((t: { title: string; detail: string }) => <li key={t.title}><b>{t.title}</b>: {t.detail}</li>)}</ol>
              </div>
              <div>
                <h3 className="font-semibold">Obstacles / open / contradictions</h3>
                <ul className="text-sm">
                  {r.assessment.obstacles.map((x: { title: string }) => <li key={x.title}>⛔ {x.title}</li>)}
                  {r.assessment.unknowns.map((x: { title: string }) => <li key={x.title}>❔ {x.title}</li>)}
                  {r.assessment.contradictions.map((x: { title: string }) => <li key={x.title}>⚠️ {x.title}</li>)}
                </ul>
                <h3 className="mt-3 font-semibold">Remote pre-check {r.pre_check.completeness_pct}%</h3>
                <ul className="text-sm">{r.pre_check.tasks.map((t: { title: string; done: boolean; finding: string }) => <li key={t.title} className={t.done ? '' : 'text-slate-400'}>{t.done ? '✓' : '·'} {t.title}: {t.finding}</li>)}</ul>
              </div>
            </section>

            <section className="mt-4">
              <h3 className="font-semibold">What the customer told us</h3>
              <table className="mt-1 w-full text-sm"><tbody>
                {Object.entries(r.facts as Record<string, { value: unknown; provenance: string }>).map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100"><td className="py-1 pr-3 text-slate-600">{k.replace(/_/g, ' ')}</td><td className="py-1 pr-3 font-medium">{typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value)}</td><td className="py-1 text-xs text-slate-400">{PROV[v.provenance] ?? v.provenance}</td></tr>
                ))}
              </tbody></table>
            </section>

            {r.photos.length > 0 && (
              <section className="mt-4"><h3 className="font-semibold">Photos</h3>
                <ul className="text-sm">{r.photos.map((p: { id: string; kind: string; finding: unknown }) => <li key={p.id}>{p.kind}: {p.finding ? JSON.stringify(p.finding) : 'not analysed'}</li>)}</ul>
              </section>
            )}

            <section className="mt-4 print:hidden">
              <h3 className="font-semibold">Status and notes</h3>
              <div className="mt-1 flex gap-2">
                <select value={open!.status.status} onChange={(e) => update(r.lead_id, { status: e.target.value })} className="rounded border px-2 py-1">{statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (e.g. called, voicemail)" className="flex-1 rounded border px-2 py-1" />
                <button onClick={() => update(r.lead_id, { note })} className="rounded bg-slate-800 px-3 py-1 text-white">Save</button>
              </div>
              <ul className="mt-2 text-sm text-slate-600">{open!.status.notes.map((n) => <li key={n.at}>{when(n.at)}: {n.text}</li>)}</ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
