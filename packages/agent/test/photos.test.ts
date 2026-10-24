import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// AI mocked: these tests check the wiring of analyse_photo (merge rules, sentences, no automatic storing of documents).
vi.mock('../src/photoAi', () => ({
  pipeFromPhotos: vi.fn(),
  meterCabinetFromPhoto: vi.fn(async () => ({ finding: 'old-or-full', confidence: 0.9, evidence: ['screw-in fuses'], agreement: 1, looks: 3 })),
  outdoorFromPhotos: vi.fn(async () => ({
    space_1x1: 'yes', near_neighbour: 'yes', house_type: 'semi', access: 'ok', obstacles: [], evidence: ['strip next to the fence'],
    confidence: 0.85, agreement: 1, looks: 3, source: 'ai',
  })),
  boilerRoomFromPhotos: vi.fn(async () => ({ indoor_space: 'tight', heater: 'oil boiler with tank', evidence: [], confidence: 0.8, source: 'ai' })),
  accessFromPhotos: vi.fn(async () => ({ route: 'narrow', obstacles: ['winding cellar stairs'], evidence: [], confidence: 0.8, source: 'ai' })),
  billFromDocument: vi.fn(),
  certificateFromDocument: vi.fn(async () => ({ kwh_m2a: 143, kind: 'demand', issued: null, valid_until: null, evidence: [] })),
}));

const { newSession, runTool, toPreCheck } = await import('../src');

const ctxFor = () => {
  const s = newSession('photo-' + Math.random().toString(36).slice(2, 8), 'chat', 'en');
  return { session: s, config: { reportsDir: mkdtempSync(join(tmpdir(), 'hpr-photo-')), publicBaseUrl: 'http://localhost:8787' } };
};
const addPhoto = (c: ReturnType<typeof ctxFor>, kind: string) => {
  const id = `p${c.session.profile.photos.length + 1}`;
  c.session.profile.photos.push({ id, kind, path: `/tmp/${id}.jpg`, at: new Date().toISOString() });
  return id;
};

describe('analyse_photo: new kinds', () => {
  it('outdoor photo fills open answers and raises the noise-check flag', async () => {
    const c = ctxFor();
    const r = (await runTool(c, 'analyse_photo', { photo_id: addPhoto(c, 'outdoor') })) as { sentence: string; tight_placement: boolean };
    expect(c.session.profile.outdoor).toMatchObject({ space1x1: 'yes', neighbourOk: 'no' });
    expect(r.tight_placement).toBe(true);
    expect(r.sentence).toMatch(/noise check.*technician confirms/);
    expect(toPreCheck(c.session.profile).outdoorSpot).toMatchObject({ space1x1: 'yes', neighbourOk: 'no' });
  });

  it("the caller's own outdoor answers win over the photo", async () => {
    const c = ctxFor();
    await runTool(c, 'record_outdoor_spot', { space_1x1: 'yes', neighbour_distance_ok: 'yes' });
    await runTool(c, 'analyse_photo', { photo_id: addPhoto(c, 'outdoor') });
    expect(c.session.profile.outdoor).toMatchObject({ space1x1: 'yes', neighbourOk: 'yes' });
  });

  it('boiler room and access give a sentence for the technician', async () => {
    const c = ctxFor();
    const b = (await runTool(c, 'analyse_photo', { photo_id: addPhoto(c, 'boiler_room') })) as { sentence: string };
    const a = (await runTool(c, 'analyse_photo', { photo_id: addPhoto(c, 'access') })) as { sentence: string };
    expect(b.sentence).toMatch(/tight/);
    expect(a.sentence).toMatch(/narrow \(winding cellar stairs\)/);
  });

  it('a certificate is only proposed: nothing is stored until the caller confirms', async () => {
    const c = ctxFor();
    const r = (await runTool(c, 'analyse_photo', { photo_id: addPhoto(c, 'certificate') })) as { proposed: { kwh_m2a: number }; note: string };
    expect(r.proposed.kwh_m2a).toBe(143);
    expect(c.session.profile.slots.certificate_kwh_m2a).toBeUndefined();
    expect(r.note).toMatch(/only after the caller confirms/);
  });

  it('meter cabinet uses the voted finding', async () => {
    const c = ctxFor();
    const r = (await runTool(c, 'analyse_photo', { photo_id: addPhoto(c, 'meter_cabinet') })) as { sentence: string };
    expect(c.session.profile.meterCabinet).toBe('old-or-full');
    expect(r.sentence).toMatch(/electrician confirms/);
  });
});
