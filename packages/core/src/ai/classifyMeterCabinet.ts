// Meter cabinet (Zählerschrank) from a photo: modern with free space, old or full, or unclear.
// Three independent looks with a majority vote, like the radiator classifier. An electrician confirms in every case.
import { PHOTO_MIN_CONFIDENCE } from '../engine/constants';
import type { MeterCabinet } from '../sales/types';
import { askJson, fileToImage, image, text } from './provider';
import { clampConfidence, majority, meanConfidence, oneOf, round2, shortList } from './vote';

export type MeterCabinetLook = { finding: MeterCabinet; confidence: number; evidence: string[] };
export type MeterCabinetFinding = MeterCabinetLook & { agreement?: number; looks?: number };

const FINDINGS = ['modern', 'old-or-full', 'unclear'] as const;

const SYSTEM = `You look at a photo of a German electricity meter cabinet (Zählerschrank).
Judge only what is visible: is it a modern cabinet with free space (e.g. DIN rail, modern circuit breakers, free slots), or old/full
(e.g. fuses with screw caps, no free space, old wiring, wooden panel)? If you cannot tell, or the photo is not a meter cabinet, say "unclear".
An electrician must confirm in every case. Reply ONLY JSON: {"finding":"modern"|"old-or-full"|"unclear","confidence":0..1,"evidence":["..."]}`;

export function normaliseMeterLook(r: Partial<Record<keyof MeterCabinetLook, unknown>>): MeterCabinetLook {
  return { finding: oneOf(r.finding, FINDINGS, 'unclear'), confidence: clampConfidence(r.confidence), evidence: shortList(r.evidence) };
}

export async function lookAtMeterCabinet(file: Blob): Promise<MeterCabinetLook> {
  const r = await askJson<Partial<Record<keyof MeterCabinetLook, unknown>>>(SYSTEM, [image(await fileToImage(file)), text('Assess this meter cabinet.')]);
  return normaliseMeterLook(r);
}

/** Majority vote; confidence = mean confidence of the majority × share that agreed. Below the threshold → "unclear". */
export function voteMeterCabinet(looks: MeterCabinetLook[]): MeterCabinetFinding {
  const n = looks.length;
  const m = majority(looks.map((l) => l.finding), 'unclear');
  const group = looks.filter((l) => l.finding === m.value);
  const agreement = n ? m.count / n : 0;
  const confidence = round2(meanConfidence(group.length ? group : looks) * agreement);
  const finding: MeterCabinet = m.value !== 'unclear' && confidence >= PHOTO_MIN_CONFIDENCE ? m.value : 'unclear';
  return {
    finding,
    confidence,
    evidence: [`${m.count}/${n} independent looks agreed`, ...(group[0]?.evidence ?? [])].slice(0, 4),
    agreement: round2(agreement),
    looks: n,
  };
}

export async function classifyMeterCabinet(file: Blob, opts: { looks?: number } = {}): Promise<MeterCabinetFinding> {
  const looks = await Promise.all(Array.from({ length: opts.looks ?? 3 }, () => lookAtMeterCabinet(file)));
  return voteMeterCabinet(looks);
}
