import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Building } from '@core/engine/types';
import { CountUp, Ember, Eyebrow, HeatField, Stage, STATUS_GLYPH, VERDICT_COLOR, type Verdict } from './hearth';
import { LeadMap } from './LeadMap';
import { ThermalScan } from './ThermalScan';

// Live leads, "Who do we call first?": real requests from the voice agent and the app, ranked, on a map.
const DEFAULT_API = (import.meta.env.VITE_API_BASE as string | undefined) ?? `${location.protocol}//${location.hostname}:8787`;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

type Row = {
  lead_id: string; created_at: string; channel: string; language: string; area: string | null; region: string | null; service_area: string | null;
  verdict: Verdict; confidence: string; heat_load_kw: number | null; tier: string; decision: string; top_reason: string | null;
  expected_value_eur: number; pre_check_pct: number; contact: { name: string | null; phone: string | null; preferred_time: string | null } | null;
  promised: string; status: string; status_updated_at: string | null;
};
type Area = { key: string; title: string; status: 'good' | 'check' | 'issue'; reason: string; nextCheck: string };
type Report = Record<string, any>;
type Detail = { report: Report; status: { status: string; notes: { at: string; text: string }[] } };

const TIER_C: Record<string, string> = { A: 'var(--tier-a)', B: 'var(--tier-b)', C: 'var(--tier-c)', D: 'var(--tier-d)' };
const PROV: Record<string, string> = { user_said: 'said', user_estimate: 'estimated', user_unknown: 'unknown', bill_ai: 'bill', certificate: 'certificate', photo_ai: 'photo AI', location_lookup: 'location' };
const eur = (n: number | null | undefined) => (n == null ? '—' : `€${Math.round(n).toLocaleString('en-US')}`);
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Photo thumbnail loaded with the sales token in the header (blob URL), revoked on unmount. */
function PhotoThumb({ lead, photo, kind, fetcher }: { lead: string; photo: string; kind: string; fetcher: (path: string) => Promise<string> }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    fetcher(`/leads/${lead}/photos/${photo}`).then((u) => { url = u; setSrc(u); }).catch(() => setFailed(true));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [lead, photo, fetcher]);
  if (failed) return <div className="flex aspect-[4/3] items-center justify-center text-xs text-[var(--sand)]">{kind}: preview unavailable (e.g. PDF)</div>;
  return src ? <img src={src} alt={`${kind} photo`} className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3] animate-pulse bg-[var(--surface-2)]" />;
}

function TierChip({ tier, label }: { tier: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: TIER_C[tier], color: TIER_C[tier] }}>
      <span className="font-mono-h font-semibold">{tier}</span><span className="text-[var(--ink)]">{label.replace(/^[A-D]: /, '')}</span>
    </span>
  );
}

export function LiveSales() {
  const [api, setApi] = useState(store.get('hpr.api') || DEFAULT_API);
  const [token, setToken] = useState(store.get('hpr.salesToken'));
  const [rows, setRows] = useState<Row[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Detail | null>(null);
  const [filter, setFilter] = useState('all');
  const [note, setNote] = useState('');
  const [scanKey, setScanKey] = useState(0);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(`${api.replace(/\/$/, '')}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    if (r.status === 401) throw new Error('Wrong or missing sales token.');
    if (!r.ok) throw new Error(`Backend error ${r.status}`);
    return r.json();
  }, [api, token]);

  const blob = useCallback(async (path: string) => {
    const r = await fetch(`${api.replace(/\/$/, '')}${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(String(r.status));
    return URL.createObjectURL(await r.blob());
  }, [api, token]);

  const load = useCallback(async () => {
    try { const d = await call('/leads'); setRows(d.leads); setStatuses(d.statuses); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, [call]);
  useEffect(() => { if (token) { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); } }, [token, load]);

  const shown = useMemo(() => rows.filter((r) => filter === 'all' || r.tier === filter || r.status === filter), [rows, filter]);
  const mapLeads = useMemo(() => shown.map((r) => ({ id: r.lead_id, area: r.area, verdict: r.verdict, label: r.decision })), [shown]);
  const kpi = useMemo(() => ({
    total: rows.length,
    visits: rows.filter((r) => r.tier === 'A' || r.tier === 'B').length,
    pipeline: rows.reduce((s, r) => s + Math.max(0, r.expected_value_eur), 0),
    waiting: rows.filter((r) => r.status === 'new').length,
  }), [rows]);

  const openLead = useCallback(async (id: string) => {
    setSelected(id);
    try { setOpen(await call(`/leads/${id}`)); setNote(''); setScanKey((k) => k + 1); } catch (e) { setError((e as Error).message); }
  }, [call]);
  const update = async (id: string, patch: { status?: string; note?: string }) => {
    try { const st = await call(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); if (open?.report.lead_id === id) setOpen({ ...open, status: st }); setNote(''); load(); }
    catch (e) { setError((e as Error).message); }
  };

  if (!token) {
    return (
      <Stage>
        <HeatField />
        <div className="relative mx-auto mt-[12vh] max-w-md">
          <Eyebrow className="text-[var(--amber)]">nuuEnergy · sales desk</Eyebrow>
          <h1 className="font-serif-h mt-3 text-5xl font-normal leading-none">Who do we <em className="text-[var(--amber-soft)]">call first?</em></h1>
          <p className="mt-4 text-[var(--sand)]">Live leads contain customer contact data. Enter the sales token (demo stand-in for a real login).</p>
          <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const t = String(f.get('t') ?? ''); const a = String(f.get('a') ?? api); store.set('hpr.salesToken', t); store.set('hpr.api', a); setApi(a); setToken(t); }}>
            <label className="block text-sm">Backend URL<input name="a" defaultValue={api} className="mt-1 w-full rounded-xl border px-4 py-3" /></label>
            <label className="block text-sm">Sales token<input name="t" type="password" autoComplete="off" className="mt-1 w-full rounded-xl border px-4 py-3" /></label>
            <button className="w-full rounded-full bg-[var(--amber)] px-6 py-3.5 font-semibold text-[var(--bg)]">Open the desk →</button>
          </form>
        </div>
      </Stage>
    );
  }

  const r = open?.report;
  return (
    <Stage>
      <HeatField />
      {/* Hero: headline + live KPIs, map beside it */}
      <section className="relative grid gap-[clamp(24px,4vw,48px)] pt-[clamp(28px,4vw,52px)]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,420px),1fr))' }}>
        <div className="hpr-rise flex min-w-0 flex-col justify-between gap-8">
          <div>
            <div className="font-mono-h flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--amber)]">
              <span className="relative inline-block h-2 w-2"><span className="absolute inset-0 rounded-full bg-[var(--tier-a)]" style={{ animation: 'hpr-ping 1.8s ease-out infinite' }} /><span className="absolute inset-0 rounded-full bg-[var(--tier-a)]" /></span>
              Live · voice agent + app · refreshes every 10 s
            </div>
            <h1 className="font-serif-h mt-4 text-[clamp(48px,6.2vw,96px)] font-normal leading-[0.94] tracking-[-0.035em]">Who do we <em className="text-[var(--amber-soft)]">call first?</em></h1>
            <p className="mt-4 max-w-[520px] text-[17px] leading-relaxed text-[var(--sand)]">Every lead is ranked by visible rules. The technical traffic light comes from the engine and is never changed by sales logic.</p>
          </div>
          <div>
            <Eyebrow>Pipeline · expected value of worthwhile visits</Eyebrow>
            <div className="font-serif-h mt-1 text-[clamp(56px,7vw,104px)] font-[350] leading-none tracking-[-0.035em]">€<CountUp value={kpi.pipeline} /></div>
            <p className="mt-1 text-xs text-[var(--sand)]">P(sale) × margin − visit cost, placeholder company assumptions</p>
          </div>
          <div className="grid border-t border-[oklch(0.94_0.022_80/.4)]" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            {[['Leads', kpi.total], ['Visit or call', kpi.visits], ['Not yet contacted', kpi.waiting]].map(([k, v], i) => (
              <div key={k} className={`pt-4 ${i ? 'border-l border-[var(--line)] pl-4' : 'pr-4'}`}><Eyebrow>{k}</Eyebrow><div className="font-serif-h text-[40px] leading-tight"><CountUp value={Number(v)} /></div></div>
            ))}
          </div>
        </div>
        <div className="relative min-h-[420px] min-w-0" style={{ animation: 'hpr-rise 1s .15s cubic-bezier(.2,.7,.2,1) both' }}>
          <LeadMap leads={mapLeads} selected={selected} onSelect={openLead} />
          <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-lg bg-[oklch(0.2_0.018_50/.85)] px-3 py-2">
            <Eyebrow>Postcode areas · approximate, never an address</Eyebrow>
          </div>
        </div>
      </section>

      {error && <p className="relative mt-6 rounded-xl border border-[var(--neg)] bg-[oklch(0.3_0.06_28)] p-3 text-sm">{error}</p>}

      {/* Filters */}
      <div className="relative mt-10 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-6 text-sm">
        {['all', 'A', 'B', 'C', 'D', ...statuses].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3.5 py-1.5 transition ${filter === f ? 'border-[var(--amber)] bg-[var(--amber)] text-[var(--bg)]' : 'border-[var(--line)] text-[var(--sand)] hover:border-[var(--amber)]'}`}>
            {f === 'all' ? `All · ${rows.length}` : `${f.replace('_', ' ')} · ${rows.filter((x) => x.tier === f || x.status === f).length}`}
          </button>
        ))}
        <span className="flex-1" />
        <button onClick={load} className="rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[var(--sand)] hover:border-[var(--amber)]">Refresh</button>
        <button onClick={() => { store.set('hpr.salesToken', ''); setToken(''); }} className="rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[var(--sand)] hover:border-[var(--amber)]">Sign out</button>
      </div>

      {/* Ranked rows */}
      <ol className="relative mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {shown.length === 0 && <li className="py-10 text-center text-[var(--sand)]">No leads yet.</li>}
        {shown.map((l, k) => (
          <li key={l.lead_id} onClick={() => openLead(l.lead_id)}
            className={`group grid cursor-pointer items-center gap-4 px-2 py-4 transition hover:bg-[var(--surface)] ${selected === l.lead_id ? 'bg-[var(--surface)]' : ''}`}
            style={{ gridTemplateColumns: '2.5rem 1.5fr 1.2fr 1.6fr 1.3fr 0.9fr 9rem', animation: `hpr-rise .7s ${k * 60}ms cubic-bezier(.2,.7,.2,1) both` }}>
            <span className="font-serif-h text-3xl text-[var(--sand)] group-hover:text-[var(--amber)]">{String(k + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: VERDICT_COLOR[l.verdict].core, boxShadow: `0 0 10px ${VERDICT_COLOR[l.verdict].glow}` }} /><b className="font-mono-h text-sm">{l.lead_id}</b></div>
              <div className="mt-1 text-xs text-[var(--sand)]">{when(l.created_at)} · {l.channel} · {l.language}</div>
            </div>
            <div className="min-w-0 text-sm">{l.region ?? '—'}<div className="text-xs text-[var(--sand)]">{l.area}{l.service_area === 'out' ? ' · outside area' : ''}</div></div>
            <div className="min-w-0"><TierChip tier={l.tier} label={l.decision} /><div className="mt-1.5 truncate text-xs text-[var(--sand)]">{l.top_reason}</div></div>
            <div className="min-w-0 text-sm">{l.contact ? <>{l.contact.name}<div className="text-xs text-[var(--sand)]">{l.contact.phone} · {l.contact.preferred_time ?? 'any time'}</div></> : <span className="text-xs text-[var(--sand)]">contact not shared</span>}</div>
            <div className="font-serif-h text-2xl" style={{ color: l.expected_value_eur > 0 ? 'var(--amber-soft)' : 'var(--sand)' }}>{eur(l.expected_value_eur)}</div>
            <div onClick={(e) => e.stopPropagation()}>
              <select value={l.status} onChange={(e) => update(l.lead_id, { status: e.target.value })} className="w-full rounded-full border px-3 py-1.5 text-sm" aria-label={`Status of ${l.lead_id}`}>
                {statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ol>
      <p className="relative mt-4 text-xs text-[var(--sand)]">Scored only on building facts and the homeowner's own answers, never on age, income or personal traits.</p>

      {/* Detail drawer = briefing for the Heizungsbaumeister */}
      {r && (
        <div className="fixed inset-0 z-[1000] flex justify-end bg-black/30 print:static print:bg-white" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-4xl overflow-y-auto border-l border-[var(--line)] bg-[var(--bg)] p-[clamp(20px,3vw,40px)] shadow-2xl print:max-w-none print:shadow-none"
            style={{ animation: 'hpr-rise .5s cubic-bezier(.2,.7,.2,1) both' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow className="text-[var(--amber)]">Briefing for the Heizungsbaumeister</Eyebrow>
                <h2 className="font-serif-h mt-2 text-[clamp(32px,4vw,52px)] font-normal leading-none">{r.lead_id}</h2>
                <p className="mt-2 text-sm text-[var(--sand)]">{r.location?.region ?? '—'} ({r.location?.area}) · {when(r.created_at)} · {r.channel} · {r.language}{r.contact ? ` · ${r.contact.name} · ${r.contact.phone} · ${r.contact.preferred_time ?? 'any time'}` : ' · contact not shared'}</p>
              </div>
              <div className="flex gap-2 print:hidden">
                <button onClick={() => window.print()} className="rounded-full bg-[var(--amber)] px-4 py-2 text-sm font-semibold text-[var(--bg)]">Print briefing</button>
                <button onClick={() => setOpen(null)} className="rounded-full border border-[var(--line)] px-4 py-2 text-sm">Close</button>
              </div>
            </div>

            <section className="mt-7 grid items-center gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))' }}>
              <ThermalScan b={r.building as Building} scanKey={scanKey} />
              <div className="flex flex-col items-start gap-5">
                <div className="flex items-center gap-5">
                  <Ember verdict={r.assessment.verdict} size={84} />
                  <div><div className="font-serif-h text-2xl leading-tight">{r.assessment.headline}</div><div className="mt-1 text-sm text-[var(--sand)]">{r.assessment.confidence} confidence</div></div>
                </div>
                <TierChip tier={r.visit_decision.tier} label={r.visit_decision.label} />
                <p className="text-sm text-[var(--sand)]">{r.visit_decision.action}</p>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm"><Eyebrow>Promised to the customer</Eyebrow><p className="mt-1">{r.promised_to_customer}</p></div>
              </div>
            </section>

            <section className="mt-8 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              {(r.assessment.areas as Area[]).map((a) => (
                <article key={a.key} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between"><Eyebrow>{a.title}</Eyebrow>
                    <span className="font-mono-h flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-[var(--bg)]" style={{ background: STATUS_GLYPH[a.status][1] }} aria-label={a.status}>{STATUS_GLYPH[a.status][0]}</span></div>
                  <p className="mt-2 text-sm leading-relaxed">{a.reason}</p>
                  <p className="mt-2 text-xs text-[var(--sand)]"><span className="text-[var(--amber-soft)]">Next ·</span> {a.nextCheck}</p>
                </article>
              ))}
            </section>

            <section className="mt-8 grid gap-px border border-[var(--line)] bg-[var(--line)]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              {[['Heat load', `${r.assessment.heat_load.best_kw ?? '?'} kW`], ['Unit', `${r.costs.unit_kw.join(' or ') || '?'} kW`], ['Heat pump / yr', `${eur(r.costs.heat_pump_eur?.[0])}`], ['Today / yr', eur(r.costs.current_eur)], ['Price (gross)', `${eur(r.costs.price_band_eur[0])}–${eur(r.costs.price_band_eur[1])}`], ['Subsidy', `up to ${r.costs.subsidy_pct}%`]].map(([k, v]) => (
                <div key={k} className="bg-[var(--bg)] p-4"><Eyebrow>{k}</Eyebrow><div className="font-serif-h mt-1 text-2xl">{v}</div></div>
              ))}
            </section>

            <section className="mt-8 grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
              <div>
                <h3 className="font-serif-h text-xl">Why this next step</h3>
                <ul className="mt-2 space-y-1.5 text-sm">{r.visit_decision.reasons.map((x: string) => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--amber)]" />{x}</li>)}</ul>
                <p className="mt-2 text-xs text-[var(--sand)]">P(sale) {Math.round(r.visit_decision.p_sale * 100)}% · expected value {eur(r.visit_decision.expected_value_eur)} (placeholder assumptions)</p>
                <h3 className="font-serif-h mt-6 text-xl">Check on site</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{r.assessment.technician_checks.map((t: { title: string; detail: string }) => <li key={t.title}><b>{t.title}</b>: <span className="text-[var(--sand)]">{t.detail}</span></li>)}</ol>
              </div>
              <div>
                <h3 className="font-serif-h text-xl">Open points</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {r.assessment.obstacles.map((x: { title: string }) => <li key={x.title}>⛔ {x.title}</li>)}
                  {r.assessment.unknowns.map((x: { title: string }) => <li key={x.title}>❔ {x.title}</li>)}
                  {r.assessment.contradictions.map((x: { title: string }) => <li key={x.title}>⚠️ {x.title}</li>)}
                </ul>
                <h3 className="font-serif-h mt-6 text-xl">Remote pre-check · {r.pre_check.completeness_pct}%</h3>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full origin-left bg-[var(--amber)]" style={{ width: `${r.pre_check.completeness_pct}%`, animation: 'hpr-grow 1s cubic-bezier(.2,.7,.2,1) both' }} /></div>
                <ul className="mt-3 space-y-1 text-sm">{r.pre_check.tasks.map((t: { title: string; done: boolean; finding: string }) => <li key={t.title} className={t.done ? '' : 'text-[var(--sand)] opacity-70'}>{t.done ? '✓' : '·'} {t.title}: {t.finding}</li>)}</ul>
              </div>
            </section>

            <section className="mt-8">
              <h3 className="font-serif-h text-xl">What the customer told us</h3>
              <table className="mt-2 w-full text-sm"><tbody>
                {Object.entries(r.facts as Record<string, { value: unknown; provenance: string }>).map(([k, v]) => (
                  <tr key={k} className="border-t border-[var(--line)]"><td className="py-1.5 pr-3 text-[var(--sand)]">{k.replace(/_/g, ' ')}</td><td className="py-1.5 pr-3">{typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value)}</td><td className="font-mono-h py-1.5 text-[11px] text-[var(--sand)]">{PROV[v.provenance] ?? v.provenance}</td></tr>
                ))}
              </tbody></table>
            </section>

            {r.photos.length > 0 && (
              <section className="mt-8"><h3 className="font-serif-h text-xl">Photos</h3>
                <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
                  {r.photos.map((p: { id: string; kind: string; sentence?: string }) => (
                    <figure key={p.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                      <PhotoThumb lead={r.lead_id} photo={p.id} kind={p.kind} fetcher={blob} />
                      <figcaption className="p-3">
                        <Eyebrow>{p.kind.replace('_', ' ')}</Eyebrow>
                        <p className="mt-1 text-sm leading-snug">{p.sentence ?? 'Not analysed yet.'}</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--sand)]">AI hints from photos; a technician confirms on site. They never change the traffic light.</p>
              </section>
            )}

            <section className="mt-8 print:hidden">
              <h3 className="font-serif-h text-xl">Status and notes</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <select value={open!.status.status} onChange={(e) => update(r.lead_id, { status: e.target.value })} className="rounded-full border px-3 py-2 text-sm">{statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (e.g. called, voicemail)" className="min-w-[220px] flex-1 rounded-full border px-4 py-2 text-sm" />
                <button onClick={() => update(r.lead_id, { note })} className="rounded-full bg-[var(--amber)] px-4 py-2 text-sm font-semibold text-[var(--bg)]">Save</button>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-[var(--sand)]">{open!.status.notes.map((n) => <li key={n.at}>{when(n.at)} · {n.text}</li>)}</ul>
            </section>
          </aside>
        </div>
      )}
    </Stage>
  );
}
