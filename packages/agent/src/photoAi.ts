// Photo/document helpers for the agent. Vision AI only describes; findings never override stated data.
import { readFileSync } from 'node:fs';
import { askJson, fileToImage, hasLlmKey, image, text } from '@hpr/core/ai/provider';
import { classifyPipePhotosVoted } from '@hpr/core/ai/classifyPipePhoto';
import { readBill, type BillReading } from '@hpr/core/ai/readBill';
import type { PhotoFindings } from '@hpr/core/engine/types';

const fileFrom = (path: string, name = 'photo.jpg') => {
  const type = /\.pdf$/i.test(path) ? 'application/pdf' : /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
  return new File([readFileSync(path)], name, { type });
};

export async function pipeFromPhotos(paths: string[], year: number | null): Promise<PhotoFindings> {
  if (!hasLlmKey()) throw new Error('AI not configured');
  return classifyPipePhotosVoted(paths.map((p) => fileFrom(p)), year);
}

export type MeterCabinetFinding = { finding: 'modern' | 'old-or-full' | 'unclear'; confidence: number; evidence: string[] };

const METER_SYSTEM = `You look at a photo of a German electricity meter cabinet (Zählerschrank).
Judge only what is visible: is it a modern cabinet with free space (e.g. DIN rail, modern breakers, free slots), or old/full
(e.g. fuses with screw caps, no free space, old wiring, wooden panel)? If you cannot tell, say "unclear".
An electrician must confirm in every case. Reply ONLY JSON: {"finding":"modern"|"old-or-full"|"unclear","confidence":0..1,"evidence":["..."]}`;

export async function meterCabinetFromPhoto(path: string): Promise<MeterCabinetFinding> {
  if (!hasLlmKey()) throw new Error('AI not configured');
  const r = await askJson<MeterCabinetFinding>(METER_SYSTEM, [image(await fileToImage(fileFrom(path))), text('Assess this meter cabinet.')]);
  return r.confidence >= 0.7 ? r : { ...r, finding: 'unclear' };
}

export async function billFromDocument(path: string): Promise<BillReading> {
  if (!hasLlmKey()) throw new Error('AI not configured');
  return readBill(fileFrom(path, /\.pdf$/i.test(path) ? 'bill.pdf' : 'bill.jpg'));
}
