// Photo/document helpers for the agent. Vision AI only describes; findings never override stated data.
// The classifiers live in @hpr/core/ai so the web app and the agent share one implementation.
import { readFileSync } from 'node:fs';
import { hasLlmKey } from '@hpr/core/ai/provider';
import { classifyPipePhotosVoted } from '@hpr/core/ai/classifyPipePhoto';
import { classifyMeterCabinet, type MeterCabinetFinding } from '@hpr/core/ai/classifyMeterCabinet';
import { classifyOutdoorPhotos, type OutdoorFinding } from '@hpr/core/ai/classifyOutdoorPhoto';
import { classifyAccess, classifyBoilerRoom, type AccessFinding, type BoilerRoomFinding } from '@hpr/core/ai/classifySitePhoto';
import { readBill, type BillReading } from '@hpr/core/ai/readBill';
import { readCertificate, type CertificateReading } from '@hpr/core/ai/readCertificate';
import type { PhotoFindings } from '@hpr/core/engine/types';

export type { AccessFinding, BoilerRoomFinding, CertificateReading, MeterCabinetFinding, OutdoorFinding };

const fileFrom = (path: string, name = 'photo.jpg') => {
  const type = /\.pdf$/i.test(path) ? 'application/pdf' : /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
  return new File([readFileSync(path)], name, { type });
};

const needKey = () => { if (!hasLlmKey()) throw new Error('AI not configured'); };

export async function pipeFromPhotos(paths: string[], year: number | null): Promise<PhotoFindings> {
  needKey();
  return classifyPipePhotosVoted(paths.map((p) => fileFrom(p)), year);
}

/** 3 independent looks + majority vote, like radiators. Below 70% → "unclear". */
export async function meterCabinetFromPhoto(path: string): Promise<MeterCabinetFinding> {
  needKey();
  return classifyMeterCabinet(fileFrom(path));
}

/** Bonus (b): rough outdoor-unit spot hint from all outdoor photos of the session (3 looks + vote). */
export async function outdoorFromPhotos(paths: string[]): Promise<OutdoorFinding> {
  needKey();
  return classifyOutdoorPhotos(paths.map((p) => fileFrom(p)));
}

export async function boilerRoomFromPhotos(paths: string[]): Promise<BoilerRoomFinding> {
  needKey();
  return classifyBoilerRoom(paths.map((p) => fileFrom(p)));
}

export async function accessFromPhotos(paths: string[]): Promise<AccessFinding> {
  needKey();
  return classifyAccess(paths.map((p) => fileFrom(p)));
}

export async function billFromDocument(path: string): Promise<BillReading> {
  needKey();
  return readBill(fileFrom(path, /\.pdf$/i.test(path) ? 'bill.pdf' : 'bill.jpg'));
}

/** Proposal only: read back and store with provenance "certificate" after the caller confirms. */
export async function certificateFromDocument(path: string): Promise<CertificateReading> {
  needKey();
  return readCertificate(fileFrom(path, /\.pdf$/i.test(path) ? 'certificate.pdf' : 'certificate.jpg'));
}
