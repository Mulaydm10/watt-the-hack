import { useState } from 'react';
import { classifyFromAnswers, classifyPipePhotosVoted, type ManualAnswers } from '../ai/classifyPipePhoto';
import { hasLlmKey } from '../ai/llm';
import { readBill } from '../ai/readBill';
import { KWH_PER_LITRE_OIL, KWH_PER_M3_GAS } from '../engine/constants';
import type { Building, PhotoFindings } from '../engine/types';

export const EMPTY: Building = {
  construction_year: null, floor_area_m2: null, renovation_status: null, heat_distribution: null,
  annual_consumption_kwh: null, energy_carrier: null, pipe_system: 'unknown', flow_temperature_c: null,
  persons_in_household: null, hot_water_via_heating: null, rooms: null, building_notes: '',
};

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2';
const DK = "I don't know";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}

function Num({ value, onChange, placeholder }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <div className="flex gap-2">
      <input type="number" className={input} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
      <button type="button" onClick={() => onChange(null)} className={`whitespace-nowrap rounded-lg px-3 text-sm ${value == null ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>{DK}</button>
    </div>
  );
}

function Pick<T extends string>({ value, options, onChange }: { value: T | null; options: [T, string][]; onChange: (v: T | null) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button type="button" key={v} onClick={() => onChange(v)} className={`rounded-lg px-3 py-2 text-sm ${value === v ? 'bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{l}</button>
      ))}
      <button type="button" onClick={() => onChange(null)} className={`rounded-lg px-3 py-2 text-sm ${value == null ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>{DK}</button>
    </div>
  );
}

export function Wizard({ onDone }: { onDone: (b: Building, photo?: PhotoFindings) => void }) {
  const [step, setStep] = useState(0);
  const [b, setB] = useState<Building>(EMPTY);
  const [unit, setUnit] = useState<'kwh' | 'litres' | 'm3'>('kwh');
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [answers, setAnswers] = useState<ManualAnswers>({ oneLoop: 'unsure', separateTopBottom: 'unsure', sidePort: 'unsure' });
  const set = (p: Partial<Building>) => setB((x) => ({ ...x, ...p }));

  const setConsumption = (v: number | null, u = unit) => {
    setAmount(v);
    set({ annual_consumption_kwh: v == null ? null : u === 'kwh' ? v : v * (u === 'litres' ? KWH_PER_LITRE_OIL : KWH_PER_M3_GAS) });
  };

  async function onBill(file: File) {
    setBusy('Reading your bill…');
    try {
      const r = await readBill(file);
      setUnit('kwh');
      setAmount(r.annual_consumption_kwh);
      set({ annual_consumption_kwh: r.annual_consumption_kwh, energy_carrier: r.energy_carrier });
      setBusy(`Read from bill: ${r.annual_consumption_kwh ?? '?'} kWh, ${r.energy_carrier ?? '?'}${r.cost_eur ? `, €${r.cost_eur}` : ''}${r.period ? ` (${r.period})` : ''}. Please check.`);
    } catch (e) {
      setBusy(`Could not read the bill (${(e as Error).message}). Please type the numbers.`);
    }
  }

  async function finish() {
    let photo: PhotoFindings | undefined;
    if (photos.length && hasLlmKey()) {
      setBusy('Looking at your photos (3 independent checks, ~20 s)…');
      try { photo = await classifyPipePhotosVoted(photos, b.construction_year); } catch { photo = classifyFromAnswers(answers); }
    } else if (Object.values(answers).some((x) => x !== 'unsure')) {
      photo = classifyFromAnswers(answers);
    }
    onDone(b, photo);
  }

  const steps = ['Energy bill', 'Your house', 'Radiator photos'];
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-6 flex gap-2">
        {steps.map((s, i) => <div key={s} className={`flex-1 rounded-full py-1 text-center text-xs ${i === step ? 'bg-emerald-600 text-white' : i < step ? 'bg-emerald-100' : 'bg-slate-100'}`}>{i + 1}. {s}</div>)}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          {hasLlmKey() && (
            <Field label="Upload your yearly bill (photo or PDF) — we prefill the numbers">
              <input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && onBill(e.target.files[0])} />
            </Field>
          )}
          <Field label="Yearly heating consumption">
            <div className="mb-2 flex gap-2">
              {(['kwh', 'litres', 'm3'] as const).map((u) => (
                <button type="button" key={u} onClick={() => { setUnit(u); setConsumption(amount, u); }} className={`rounded-lg px-3 py-1 text-sm ${unit === u ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>{u === 'kwh' ? 'kWh' : u === 'litres' ? 'litres oil' : 'm³ gas'}</button>
              ))}
            </div>
            <Num value={amount} onChange={(v) => setConsumption(v)} placeholder="e.g. 18000" />
          </Field>
          <Field label="What do you heat with today?">
            <Pick value={b.energy_carrier} onChange={(v) => set({ energy_carrier: v })} options={[['gas', 'Gas'], ['oil', 'Oil'], ['district', 'District heat'], ['electric', 'Electric']]} />
          </Field>
          {busy && <p className="text-sm text-slate-600">{busy}</p>}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Year built"><Num value={b.construction_year} onChange={(v) => set({ construction_year: v })} placeholder="1985" /></Field>
          <Field label="Heated floor area (m²)"><Num value={b.floor_area_m2} onChange={(v) => set({ floor_area_m2: v })} placeholder="140" /></Field>
          <Field label="People in the household"><Num value={b.persons_in_household} onChange={(v) => set({ persons_in_household: v })} /></Field>
          <Field label="Number of rooms"><Num value={b.rooms} onChange={(v) => set({ rooms: v })} /></Field>
          <div className="sm:col-span-2"><Field label="Is hot water made by the heating?"><Pick value={b.hot_water_via_heating == null ? null : b.hot_water_via_heating ? 'yes' : 'no'} onChange={(v) => set({ hot_water_via_heating: v == null ? null : v === 'yes' })} options={[['yes', 'Yes'], ['no', 'No']]} /></Field></div>
          <div className="sm:col-span-2"><Field label="How is the heat distributed?"><Pick value={b.heat_distribution} onChange={(v) => set({ heat_distribution: v })} options={[['radiators', 'Radiators'], ['underfloor', 'Underfloor'], ['mixed', 'Both']]} /></Field></div>
          <div className="sm:col-span-2"><Field label="Renovation"><Pick value={b.renovation_status} onChange={(v) => set({ renovation_status: v })} options={[['unrenovated', 'None'], ['partially', 'Partly'], ['fully', 'Fully']]} /></Field></div>
          <div className="sm:col-span-2"><Field label="Pipe system (if you know it)"><Pick value={b.pipe_system === 'unknown' ? null : b.pipe_system} onChange={(v) => set({ pipe_system: v ?? 'unknown' })} options={[['two-pipe', 'Two-pipe'], ['single-pipe', 'Single-pipe']]} /></Field></div>
          <Field label="Current flow temperature (°C)"><Num value={b.flow_temperature_c} onChange={(v) => set({ flow_temperature_c: v })} placeholder="55" /></Field>
          <div className="sm:col-span-2"><Field label="Anything else? (wood stove, solar thermal, insulation, unused floors…)"><textarea className={input} rows={2} value={b.building_notes} onChange={(e) => set({ building_notes: e.target.value })} /></Field></div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-slate-600">Photos of where the pipes meet a radiator help us guess the pipe system. Optional.</p>
          {hasLlmKey() ? (
            <Field label="Radiator / pipe photos (up to 5)">
              <input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
              {photos.length > 0 && <p className="mt-1 text-sm text-slate-500">{photos.length} photo(s) selected</p>}
            </Field>
          ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Photo AI is off (no API key). Answer these instead:</p>}
          {([
            ['oneLoop', 'Do you see one pipe running along the wall from radiator to radiator?'],
            ['separateTopBottom', 'Does each radiator have a valve on top and a separate return pipe at the bottom?'],
            ['sidePort', 'Is there a valve block under the radiator with an extra small port on the side?'],
          ] as const).map(([k, q]) => (
            <Field key={k} label={q}>
              <div className="flex gap-2">
                {(['yes', 'no', 'unsure'] as const).map((v) => (
                  <button type="button" key={v} onClick={() => setAnswers({ ...answers, [k]: v })} className={`rounded-lg px-3 py-1 text-sm ${answers[k] === v ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>{v === 'unsure' ? DK : v}</button>
                ))}
              </div>
            </Field>
          ))}
          {busy && <p className="text-sm text-slate-600">{busy}</p>}
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-lg px-4 py-2 text-slate-600 disabled:opacity-30">Back</button>
        {step < 2
          ? <button type="button" onClick={() => setStep(step + 1)} className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white">Next</button>
          : (
            <div className="flex gap-2">
              <button type="button" onClick={() => onDone(b)} className="rounded-lg bg-slate-100 px-5 py-2 text-slate-700">Skip photos</button>
              <button type="button" onClick={finish} className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white">Show my result</button>
            </div>
          )}
      </div>
    </div>
  );
}
