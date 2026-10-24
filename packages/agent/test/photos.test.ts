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

const { MemoryStore, newSession, runTool, saveKeepingPhotos, toPreCheck } = await import('../src');

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

describe('saving after a long turn keeps what arrived meanwhile', () => {
  const at = new Date().toISOString();
  const setup = () => {
    const store = new MemoryStore();
    const s = newSession('race-' + Math.random().toString(36).slice(2, 8), 'voice', 'en');
    store.save(s);
    return { store, id: s.id };
  };

  it('a photo uploaded during the turn is not lost', () => {
    const { store, id } = setup();
    const turn = store.get(id)!; // the turn loads its copy, then waits for the model
    const upload = store.get(id)!;
    upload.profile.photos.push({ id: 'u1', kind: 'meter_cabinet', path: '/tmp/u1.jpg', at });
    store.save(upload);
    turn.messages.push({ role: 'user', content: 'hello' });
    saveKeepingPhotos(store, turn);
    const saved = store.get(id)!;
    expect(saved.profile.photos.map((p) => p.id)).toEqual(['u1']);
    expect(saved.messages.at(-1)).toMatchObject({ content: 'hello' });
  });

  it("a result that lands meanwhile is kept, and the caller's outdoor answer from the turn still wins", () => {
    const { store, id } = setup();
    const first = store.get(id)!;
    first.profile.photos.push({ id: 'o1', kind: 'outdoor', path: '/tmp/o1.jpg', at });
    store.save(first);
    const turn = store.get(id)!;
    turn.profile.outdoor = { space1x1: 'yes', neighbourOk: 'yes' }; // the caller answered during the turn
    const background = store.get(id)!;
    const finding = { space_1x1: 'no', near_neighbour: 'yes', house_type: 'semi', access: 'ok', obstacles: [], evidence: [], confidence: 0.9, agreement: 1, looks: 3, source: 'ai' };
    background.profile.photos[0].finding = finding;
    background.profile.outdoor = { space1x1: 'no', neighbourOk: 'no' };
    store.save(background);
    saveKeepingPhotos(store, turn);
    const saved = store.get(id)!;
    expect(saved.profile.photos[0].finding).toEqual(finding);
    expect(saved.profile.outdoor).toEqual({ space1x1: 'yes', neighbourOk: 'yes' });
  });

  it('a radiator result that lands meanwhile sets the pipe photo', () => {
    const { store, id } = setup();
    const first = store.get(id)!;
    first.profile.photos.push({ id: 'r1', kind: 'radiator', path: '/tmp/r1.jpg', at });
    store.save(first);
    const turn = store.get(id)!;
    const background = store.get(id)!;
    const pipe = { label: 'two-pipe' as const, confidence: 0.9, evidence: [], source: 'ai' as const };
    background.profile.photos[0].finding = pipe;
    background.profile.pipePhoto = pipe;
    store.save(background);
    saveKeepingPhotos(store, turn);
    expect(store.get(id)!.profile.pipePhoto).toEqual(pipe);
  });
});
