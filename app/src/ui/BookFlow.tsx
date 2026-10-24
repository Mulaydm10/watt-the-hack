import { useState } from 'react';
import { assess } from '../engine/assess';
import type { Assessment, Building, PhotoFindings } from '../engine/types';
import { priceBand, serviceArea, sizeToUnits, subsidyEstimate } from '../sales/offer';
import { loadConfig } from '../sales/store';
import { NO_COMMITMENT, NO_PRECHECK, type Commitment, type Lead, type PreCheck, type YesNoUnsure } from '../sales/types';

const SKIP = 'Prefer not to say';

function Choice<T extends string>({ label, value, options, onChange, none = SKIP }: { label: string; value: T | null; options: [T, string][]; onChange: (v: T | null) => void; none?: string }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button type="button" key={v} onClick={() => onChange(v)} className={`rounded-lg px-3 py-1.5 text-sm ${value === v ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{l}</button>
        ))}
        <button type="button" onClick={() => onChange(null)} className={`rounded-lg px-3 py-1.5 text-sm ${value == null ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>{none}</button>
      </div>
    </div>
  );
}

function PhotoTask({ title, why, done, children }: { title: string; why: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${done ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-slate-200'}`}>
      <p className="font-semibold">{done ? '✓ ' : ''}{title}</p>
      <p className="mb-2 text-sm text-slate-500">{why}</p>
      {children}
    </div>
  );
}

/** Homeowner-only price and subsidy preview. The income checkbox never leaves this component. */
function PricePreview({ a, building, boilerOld }: { a: Assessment; building: Building; boilerOld: boolean }) {
  const [incomeBonus, setIncomeBonus] = useState(false);
  const size = sizeToUnits(a.heatLoad.bestKw, a.heatLoad.range?.high);
  const band = priceBand(size.units[0]);
  const area = serviceArea(building.location);
  const sub = subsidyEstimate({ oldBoiler20Plus: boilerOld, incomeBonus, region: area.region });
  const saving = a.costs && a.costs.currentEur != null ? a.costs.currentEur - a.costs.heatPumpEurWorst : null;
  const eur = (n: number) => `€${n.toLocaleString('en-US')}`;
  return (
    <div className="rounded-xl bg-emerald-50 p-4 text-sm">
      <p className="font-semibold">Rough price and subsidy preview</p>
      {size.units.length > 0 && <p>Likely size: <b>{size.units.join(' or ')} kW</b>. {size.note}</p>}
      <p>Typical price before subsidy: <b>{eur(band.low)}–{eur(band.high)}</b> ({band.label}). A meter-cabinet upgrade can add to this.</p>
      <ul className="list-disc pl-5">{sub.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={incomeBonus} onChange={(e) => setIncomeBonus(e.target.checked)} /> My household income may qualify for the income bonus (stays on this device, never sent).</label>
      {saving != null && <p className="mt-1">Running costs: about <b>{eur(saving)}</b> less per year than today (worst case).</p>}
      <p className="mt-1 font-semibold text-amber-800">Apply for the subsidy before you order, or it is lost. Check current rules.</p>
    </div>
  );
}

const YNU: [YesNoUnsure, string][] = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']];

/** Homeowner "book an expert" flow: remote pre-check photos, then plans + consent. Creates a local lead. */
export function BookFlow({ building, photo, onDone, onCancel }: { building: Building; photo?: PhotoFindings; onDone: (l: Lead) => void; onCancel: () => void }) {
  const cfg = loadConfig();
  const [step, setStep] = useState(0);
  const [pre, setPre] = useState<PreCheck>(NO_PRECHECK);
  const [c, setC] = useState<Commitment>(NO_COMMITMENT);
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const a = assess(building, photo);
  const set = (p: Partial<Commitment>) => setC((x) => ({ ...x, ...p }));

  const submit = () => onDone({
    id: `H-${Date.now().toString(36).toUpperCase()}`,
    building, photo, commitment: c, preCheck: pre, consent, source: 'homeowner', createdAt: new Date().toISOString(),
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-6 flex gap-2">
        {['Remote pre-check', 'Your plans'].map((s, i) => <div key={s} className={`flex-1 rounded-full py-1 text-center text-xs ${i === step ? 'bg-emerald-600 text-white' : i < step ? 'bg-emerald-100' : 'bg-slate-100'}`}>{i + 1}. {s}</div>)}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-slate-600">Each photo you add now answers a question the expert would otherwise check on site, so the visit is shorter. All optional.</p>
          <PhotoTask title="Meter cabinet (Zählerschrank)" why="Most important: it often needs an upgrade, which changes the price a lot." done={pre.meterCabinet != null}>
            <input type="file" accept="image/*" className="mb-2 block text-sm" onChange={() => pre.meterCabinet == null && setPre({ ...pre, meterCabinet: 'unclear' })} />
            <Choice label="How does it look?" none="No photo" value={pre.meterCabinet} onChange={(v) => setPre({ ...pre, meterCabinet: v })}
              options={[['modern', 'Modern, free space'], ['old-or-full', 'Old or full'], ['unclear', "Can't tell"]]} />
          </PhotoTask>
          <PhotoTask title="Outdoor-unit spot" why="Garden, wall or yard where the outdoor unit could go. Rough hint only; the technician confirms." done={pre.outdoorSpot != null}>
            <input type="file" accept="image/*" multiple className="mb-2 block text-sm" onChange={() => pre.outdoorSpot == null && setPre({ ...pre, outdoorSpot: { space1x1: 'unsure', neighbourOk: 'unsure' } })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice label="Free space of at least 1 × 1 m?" none="No photo" value={pre.outdoorSpot?.space1x1 ?? null} options={YNU}
                onChange={(v) => setPre({ ...pre, outdoorSpot: v ? { space1x1: v, neighbourOk: pre.outdoorSpot?.neighbourOk ?? 'unsure' } : null })} />
              <Choice label="Keeps the minimum distance to the neighbour? (noise rules are the homeowner's responsibility)" none="No photo" value={pre.outdoorSpot?.neighbourOk ?? null} options={YNU}
                onChange={(v) => setPre({ ...pre, outdoorSpot: v ? { space1x1: pre.outdoorSpot?.space1x1 ?? 'unsure', neighbourOk: v } : null })} />
            </div>
          </PhotoTask>
          <div className="grid gap-4 sm:grid-cols-2">
            <PhotoTask title="Boiler room / heating system" why="Shows the boiler, pipes and space for the indoor unit." done={pre.boilerRoomPhoto}>
              <input type="file" accept="image/*" className="block text-sm" onChange={(e) => setPre({ ...pre, boilerRoomPhoto: Boolean(e.target.files?.length) })} />
            </PhotoTask>
            <PhotoTask title="Radiator side view / pipes" why="Type 11/22/33 and the pipe connections." done={pre.radiatorPhoto}>
              <input type="file" accept="image/*" className="block text-sm" onChange={(e) => setPre({ ...pre, radiatorPhoto: Boolean(e.target.files?.length) })} />
            </PhotoTask>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-slate-600">About 30 seconds. All optional; this helps us plan the right next step for you.</p>
          <Choice label="Do you own the house?" value={c.ownership} onChange={(v) => set({ ownership: v })} options={[['owner', 'Owner'], ['co-owner', 'Co-owner'], ['tenant', 'Tenant'], ['landlord', 'Landlord']]} />
          <Choice label="How old is your current boiler?" value={c.boiler} onChange={(v) => set({ boiler: v })} options={[['broken', 'Broken'], ['over20', 'Over 20 years'], ['10to20', '10–20 years'], ['under10', 'Under 10 years']]} />
          <Choice label="When would you like to switch?" value={c.timeline} onChange={(v) => set({ timeline: v })} options={[['asap', 'As soon as possible'], ['within6m', 'Within 6 months'], ['within2y', 'Within 1–2 years'], ['curious', 'Just curious']]} />
          <Choice label="Are all the decision-makers involved?" value={c.decisionMakers} onChange={(v) => set({ decisionMakers: v })} options={YNU} />
          <Choice label="Have you looked into subsidies or financing?" value={c.subsidiesLooked} onChange={(v) => set({ subsidiesLooked: v })} options={[['yes', 'Yes'], ['no', 'No']]} />
          <p className="text-xs text-slate-500">Subsidy info: see the BAFA/KfW heat-pump funding pages (check current rules).</p>
          <Choice label="Would you share extra photos now so the visit is shorter?" value={c.sharePhotos} onChange={(v) => set({ sharePhotos: v })} options={[['yes', 'Yes'], ['later', 'Later']]} />

          <PricePreview a={a} building={building} boilerOld={c.boiler === 'over20' || c.boiler === 'broken'} />

          <div className="rounded-xl bg-amber-50 p-4 text-sm">
            <p className="font-semibold">Please check your details</p>
            <p className="text-slate-700">nuuEnergy's terms ask you to confirm your information is correct. {a.flags.contradictions.length ? 'We noticed:' : 'We found no contradictions.'}</p>
            {a.flags.contradictions.length > 0 && <ul className="list-disc pl-5 text-slate-700">{a.flags.contradictions.map((x) => <li key={x.title}><b>{x.title}</b>: {x.detail}</li>)}</ul>}
            <p className="text-slate-600">Facts: {building.construction_year ?? '?'} · {building.floor_area_m2 ?? '?'} m² · {building.annual_consumption_kwh?.toLocaleString('en-US') ?? '?'} kWh/yr · {building.rooms ?? '?'} rooms. If something is wrong, go back and fix it.</p>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> My details are correct to the best of my knowledge.</label>
          </div>

          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-semibold">What is shared with nuuEnergy</p>
            <p className="text-slate-600">Building facts, your energy figures, the photos and answers above, and the assessment result. Never your name, age, income or nationality; the income question in the subsidy calculator stays on your device. Demo: stored only in this browser.</p>
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I agree to share this with nuuEnergy to plan the next step.</label>
            <p className="mt-1 text-xs text-slate-500">You can object to the use of your data for marketing profiling at any time.</p>
          </div>
          {cfg.visitCreditEnabled && <p className="text-xs text-slate-500">Expert visits may cost €{cfg.visitCreditEur}, fully credited if you buy (shown when relevant).</p>}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button type="button" onClick={step === 0 ? onCancel : () => setStep(0)} className="rounded-lg px-4 py-2 text-slate-600">Back</button>
        {step === 0
          ? <button type="button" onClick={() => setStep(1)} className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white">Next</button>
          : <button type="button" disabled={!consent || !confirmed} onClick={submit} className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white disabled:opacity-40">Send request</button>}
      </div>
    </div>
  );
}
