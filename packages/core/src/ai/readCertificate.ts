// Energy certificate (Energieausweis): read the final-energy figure in kWh per m² and year.
// A proposal only, like the bill: read it back and store it (slot certificate_kwh_m2a, provenance "certificate")
// after the homeowner confirms. The engine uses it only as a cross-check against the bill, never instead of it.
// It is not stored automatically because a bill/certificate mismatch is a critical contradiction, so an AI
// misread would otherwise change the verdict.
import { askJson, fileToImage, image, text } from './provider';
import { shortList } from './vote';

export type CertificateReading = {
  /** Final energy (Endenergie) in kWh/(m²·a); null if not readable. */
  kwh_m2a: number | null;
  /** Demand certificate (Bedarfsausweis) or consumption certificate (Verbrauchsausweis). */
  kind: 'demand' | 'consumption' | null;
  issued: string | null;
  valid_until: string | null;
  evidence: string[];
};

// Same plausible range the engine accepts for this field (packages/core/src/engine/sanitize.ts).
const MIN_KWH_M2A = 5;
const MAX_KWH_M2A = 800;

const SYSTEM = `You read German energy certificates for residential buildings (Energieausweis für Wohngebäude).
Extract the FINAL energy figure in kWh/(m²·a): "Endenergiebedarf" on a demand certificate (Bedarfsausweis) or "Endenergieverbrauch" on a consumption certificate (Verbrauchsausweis). Do NOT use the primary energy figure (Primärenergie).
Also extract whether it is a demand or a consumption certificate, the issue date and the valid-until date.
If a value is not visible, use null. Never guess numbers.
Reply with ONLY JSON: {"kwh_m2a":number|null,"kind":"demand"|"consumption"|null,"issued":string|null,"valid_until":string|null,"evidence":["short quote of where you read it"]}`;

export function normaliseCertificate(r: Record<string, unknown>): CertificateReading {
  const n = typeof r.kwh_m2a === 'number' ? r.kwh_m2a : typeof r.kwh_m2a === 'string' ? Number(r.kwh_m2a.replace(',', '.')) : NaN;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null);
  return {
    kwh_m2a: Number.isFinite(n) && n >= MIN_KWH_M2A && n <= MAX_KWH_M2A ? Math.round(n) : null,
    kind: r.kind === 'demand' || r.kind === 'consumption' ? r.kind : null,
    issued: str(r.issued),
    valid_until: str(r.valid_until),
    evidence: shortList(r.evidence),
  };
}

/** Photo or PDF of the certificate's first pages. */
export async function readCertificate(file: Blob): Promise<CertificateReading> {
  const r = await askJson<Record<string, unknown>>(SYSTEM, [image(await fileToImage(file)), text('Read this energy certificate.')]);
  return normaliseCertificate(r);
}
