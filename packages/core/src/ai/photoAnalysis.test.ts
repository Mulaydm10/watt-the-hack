import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tightPlacement } from '../sales/types';

// The model is mocked: these tests check the voting, thresholds, merge rules and sentences, not the AI itself.
const askJson = vi.fn();
vi.mock('./provider', () => ({
  askJson: (...a: unknown[]) => askJson(...a),
  fileToImage: async () => ({ mediaType: 'image/jpeg', data: '' }),
  image: (i: unknown) => ({ type: 'image', image: i }),
  text: (t: string) => ({ type: 'text', text: t }),
}));

const { classifyOutdoorPhotos, mergeOutdoorFinding, normaliseOutdoorLook, voteOutdoor } = await import('./classifyOutdoorPhoto');
const { classifyMeterCabinet, voteMeterCabinet } = await import('./classifyMeterCabinet');
const { classifyAccess, classifyBoilerRoom } = await import('./classifySitePhoto');
const { readCertificate } = await import('./readCertificate');
const { photoFindingSentence } = await import('./photoSentence');

const photo = new Blob(['x'], { type: 'image/jpeg' });
const look = (o: Partial<ReturnType<typeof normaliseOutdoorLook>> = {}) =>
  normaliseOutdoorLook({ space_1x1: 'yes', near_neighbour: 'no', house_type: 'detached', access: 'ok', confidence: 0.9, evidence: ['lawn beside the wall'], ...o });

beforeEach(() => askJson.mockReset());

describe('outdoor-unit spot (bonus b)', () => {
  it('keeps the answer when three confident looks agree', () => {
    const f = voteOutdoor([look(), look(), look()]);
    expect(f).toMatchObject({ space_1x1: 'yes', near_neighbour: 'no', house_type: 'detached', confidence: 0.9, agreement: 1, looks: 3 });
  });

  it('says unclear when the looks disagree', () => {
    const f = voteOutdoor([look(), look({ space_1x1: 'no', near_neighbour: 'yes' }), look({ space_1x1: 'unclear', near_neighbour: 'unclear' })]);
    expect(f.space_1x1).toBe('unclear');
    expect(f.near_neighbour).toBe('unclear');
  });

  it('says unclear below the 70% photo threshold', () => {
    const f = voteOutdoor([look({ confidence: 0.6 }), look({ confidence: 0.6 }), look({ confidence: 0.6 })]);
    expect(f).toMatchObject({ space_1x1: 'unclear', near_neighbour: 'unclear', house_type: 'unknown' });
  });

  it('turns odd model output into unclear instead of a guess', () => {
    expect(normaliseOutdoorLook({ space_1x1: 'maybe', near_neighbour: 3, house_type: 'castle', confidence: '0.9' })).toMatchObject({
      space_1x1: 'unclear', near_neighbour: 'unclear', house_type: 'unknown', access: 'unclear', confidence: 0,
    });
  });

  it('asks the model three times and votes', async () => {
    askJson.mockResolvedValue({ space_1x1: 'yes', near_neighbour: 'yes', house_type: 'semi', access: 'ok', confidence: 0.8, evidence: ['narrow strip next to the fence'] });
    const f = await classifyOutdoorPhotos([photo]);
    expect(askJson).toHaveBeenCalledTimes(3);
    expect(f).toMatchObject({ space_1x1: 'yes', near_neighbour: 'yes', house_type: 'semi', confidence: 0.8 });
  });

  it("never overrides the homeowner's own answers", () => {
    const f = voteOutdoor([look({ space_1x1: 'no', near_neighbour: 'yes' }), look({ space_1x1: 'no', near_neighbour: 'yes' }), look({ space_1x1: 'no', near_neighbour: 'yes' })]);
    expect(mergeOutdoorFinding({ space1x1: 'yes', neighbourOk: 'yes', distance_m: 6 }, f)).toEqual({ space1x1: 'yes', neighbourOk: 'yes', distance_m: 6 });
  });

  it('fills open answers and raises the noise-check flag when the spot looks close to the neighbour', () => {
    const f = voteOutdoor([look({ near_neighbour: 'yes' }), look({ near_neighbour: 'yes' }), look({ near_neighbour: 'yes' })]);
    const merged = mergeOutdoorFinding({ space1x1: 'unsure', neighbourOk: 'unsure' }, f);
    expect(merged).toEqual({ space1x1: 'yes', neighbourOk: 'no' });
    expect(tightPlacement(merged)).toBe(true);
  });

  it('an unclear photo leaves open answers open', () => {
    const f = voteOutdoor([look({ confidence: 0.2 }), look({ confidence: 0.2 }), look({ confidence: 0.2 })]);
    expect(mergeOutdoorFinding(null, f)).toEqual({ space1x1: 'unsure', neighbourOk: 'unsure' });
  });
});

describe('meter cabinet: 3-look vote', () => {
  const m = (finding: string, confidence = 0.9) => ({ finding: finding as 'modern', confidence, evidence: ['DIN rail with free slots'] });

  it('2 of 3 confident looks win, with confidence lowered by the disagreement', () => {
    const f = voteMeterCabinet([m('old-or-full', 0.95), m('old-or-full', 0.95), m('modern')]);
    expect(f.finding).toBe('unclear'); // 0.95 × 2/3 = 0.63, below the 70% threshold
    const g = voteMeterCabinet([m('modern'), m('modern'), m('modern')]);
    expect(g).toMatchObject({ finding: 'modern', confidence: 0.9, agreement: 1 });
  });

  it('three different answers give unclear', () => {
    expect(voteMeterCabinet([m('modern'), m('old-or-full'), m('unclear')]).finding).toBe('unclear');
  });

  it('asks the model three times', async () => {
    askJson.mockResolvedValue({ finding: 'old-or-full', confidence: 0.85, evidence: ['screw-in fuses'] });
    const f = await classifyMeterCabinet(photo);
    expect(askJson).toHaveBeenCalledTimes(3);
    expect(f.finding).toBe('old-or-full');
  });
});

describe('boiler room, access, certificate', () => {
  it('boiler room below the threshold is unclear and names no heater', async () => {
    askJson.mockResolvedValueOnce({ indoor_space: 'enough', heater: 'gas condensing boiler', confidence: 0.5 });
    expect(await classifyBoilerRoom([photo])).toMatchObject({ indoor_space: 'unclear', heater: null });
  });

  it('access route flagged as narrow', async () => {
    askJson.mockResolvedValueOnce({ route: 'narrow', obstacles: ['winding cellar stairs'], confidence: 0.8 });
    expect(await classifyAccess([photo])).toMatchObject({ route: 'narrow', obstacles: ['winding cellar stairs'] });
  });

  it('certificate value outside the plausible range is dropped, not guessed', async () => {
    askJson.mockResolvedValueOnce({ kwh_m2a: 4200, kind: 'demand' });
    expect((await readCertificate(photo)).kwh_m2a).toBeNull();
    askJson.mockResolvedValueOnce({ kwh_m2a: '142,6', kind: 'consumption', issued: '2019-05-02' });
    expect(await readCertificate(photo)).toMatchObject({ kwh_m2a: 143, kind: 'consumption', issued: '2019-05-02' });
  });
});

describe('plain sentence per finding', () => {
  it('every analysed kind says who confirms', () => {
    const outdoor = voteOutdoor([look({ near_neighbour: 'yes' }), look({ near_neighbour: 'yes' }), look({ near_neighbour: 'yes' })]);
    const cases: [string, unknown][] = [
      ['radiator', { label: 'single-pipe', confidence: 0.82, evidence: [], source: 'ai' }],
      ['meter_cabinet', { finding: 'old-or-full', confidence: 0.9, evidence: [] }],
      ['outdoor', outdoor],
      ['boiler_room', { indoor_space: 'tight', heater: null, evidence: [], confidence: 0.8, source: 'ai' }],
      ['access', { route: 'narrow', obstacles: ['steep stairs'], evidence: [], confidence: 0.8, source: 'ai' }],
    ];
    for (const [kind, f] of cases) expect(photoFindingSentence(kind, f)).toMatch(/(technician|electrician) (confirms|checks)/);
    expect(photoFindingSentence('outdoor', outdoor)).toMatch(/noise check/);
  });

  it('documents are marked "to confirm" and pending or failed photos are honest', () => {
    expect(photoFindingSentence('bill', { annual_consumption_kwh: 25000, energy_carrier: 'oil', cost_eur: null, period: null })).toMatch(/to confirm/);
    expect(photoFindingSentence('certificate', { kwh_m2a: 143, kind: 'demand', issued: null, valid_until: null, evidence: [] })).toMatch(/cross-check/);
    expect(photoFindingSentence('meter_cabinet', null)).toMatch(/still running/);
    expect(photoFindingSentence('outdoor', { error: 'timeout' })).toMatch(/kept for the technician/);
  });
});
