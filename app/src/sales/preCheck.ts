import type { Assessment, Building } from '../engine/types';
import { tightPlacement, type PreCheck } from './types';

type Task = { key: string; title: string; weight: number; done: boolean; finding: string; siteCheck: string };

/** Each photo task that is done answers (or shortens) one technician check. Weights sum to 100. */
export function preCheckTasks(b: Building, a: Assessment, p: PreCheck): Task[] {
  const radiatorKnown = p.radiatorPhoto || a.pipeSystem.value !== 'unknown' || b.heat_distribution === 'underfloor';
  return [
    {
      key: 'meter', title: 'Meter cabinet photo (Zählerschrank)', weight: 30, done: p.meterCabinet != null,
      finding: p.meterCabinet === 'modern' ? 'Looks modern: upgrade less likely (technician confirms).'
        : p.meterCabinet === 'old-or-full' ? 'Looks old or full: upgrade likely, plan the cost.'
        : p.meterCabinet === 'unclear' ? 'Unclear from the photo.' : 'Not provided.',
      siteCheck: 'Meter cabinet / electrical connection',
    },
    {
      key: 'outdoor', title: 'Outdoor-unit spot photo', weight: 25, done: p.outdoorSpot != null,
      finding: p.outdoorSpot
        ? `Space ≥ 1 × 1 m: ${p.outdoorSpot.space1x1}; minimum distance to neighbour's boundary: ${p.outdoorSpot.neighbourOk}${p.outdoorSpot.houseType ? `; house: ${p.outdoorSpot.houseType}` : ''}.${tightPlacement(p.outdoorSpot) ? ' Tight placement, noise check needed (TA Lärm; neighbour/noise compliance is the customer\'s responsibility, AGB 7.7).' : ''} Rough hint, technician confirms.`
        : 'Not provided.',
      siteCheck: 'Outdoor-unit location',
    },
    {
      key: 'bill', title: 'Energy bill', weight: 20, done: b.annual_consumption_kwh != null,
      finding: b.annual_consumption_kwh != null ? `${b.annual_consumption_kwh.toLocaleString('en-US')} kWh per year provided.` : 'Not provided.',
      siteCheck: 'Verify the input data',
    },
    {
      key: 'radiator', title: 'Radiator / pipe photo', weight: 15, done: radiatorKnown,
      finding: a.pipeSystem.value !== 'unknown' ? `Pipe system: ${a.pipeSystem.value} (${a.pipeSystem.source}).`
        : p.radiatorPhoto ? 'Photo provided; pipe system still unclear.' : b.heat_distribution === 'underfloor' ? 'Underfloor heating, no radiators to check.' : 'Not provided.',
      siteCheck: 'Pipe system',
    },
    {
      key: 'boiler', title: 'Boiler room / heating system photo', weight: 10, done: p.boilerRoomPhoto,
      finding: p.boilerRoomPhoto ? 'Provided.' : 'Not provided.', siteCheck: 'Boiler room',
    },
  ];
}

export function preCheckCompleteness(b: Building, a: Assessment, p: PreCheck): number {
  return preCheckTasks(b, a, p).reduce((s, t) => s + (t.done ? t.weight : 0), 0);
}
