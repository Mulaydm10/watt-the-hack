// One plain sentence per photo finding, for the assistant to say once and for the sales dashboard.
// Every sentence says who confirms. Numbers shown here were read from the homeowner's own document and are
// marked "to confirm"; nothing here is calculated.
import type { PhotoFindings } from '../engine/types';
import type { OutdoorFinding } from './classifyOutdoorPhoto';
import type { MeterCabinetFinding } from './classifyMeterCabinet';
import type { AccessFinding, BoilerRoomFinding } from './classifySitePhoto';
import type { CertificateReading } from './readCertificate';
import type { BillReading } from './readBill';

const pct = (c: unknown) => (typeof c === 'number' && Number.isFinite(c) ? ` (${Math.round(c * 100)}% confident)` : '');
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function outdoorSentence(f: OutdoorFinding): string {
  if (f.space_1x1 === 'unclear' && f.near_neighbour === 'unclear') {
    return 'Outdoor photo: we could not judge the spot for the outdoor unit from these photos. A technician checks on site.';
  }
  const parts: string[] = [];
  if (f.space_1x1 === 'yes') parts.push('free space of about 1 × 1 m looks available');
  if (f.space_1x1 === 'no') parts.push('no free space of about 1 × 1 m is visible');
  if (f.near_neighbour === 'yes') parts.push("the spot looks close to the neighbour, so a noise check is needed (TA Lärm; the homeowner is responsible for noise rules)");
  if (f.near_neighbour === 'no') parts.push('the spot does not look close to the neighbour');
  if (f.access === 'narrow') parts.push('access for installers looks narrow');
  return `Outdoor photo${pct(f.confidence)}: ${parts.join('; ')}. A rough hint only; a technician confirms on site.`;
}

/** Plain sentence for any photo kind. Unknown kinds and missing findings get an honest default. */
export function photoFindingSentence(kind: string, finding: unknown): string {
  if (finding == null) return 'Photo received; the analysis is still running.';
  if (isObj(finding) && typeof finding.error === 'string') return 'We could not analyse this photo; it is kept for the technician.';
  switch (kind) {
    case 'radiator': {
      const f = finding as PhotoFindings;
      if (f.label === 'single-pipe') return `Radiator photo${pct(f.confidence)}: looks like a single-pipe system, which can need a higher flow temperature. A technician confirms.`;
      if (f.label === 'two-pipe') return `Radiator photo${pct(f.confidence)}: looks like a two-pipe system. A technician confirms.`;
      return 'Radiator photo: the pipe system is unclear from the photo. A technician checks whether it is a single-pipe system.';
    }
    case 'meter_cabinet': {
      const f = finding as MeterCabinetFinding;
      if (f.finding === 'modern') return `Meter cabinet photo${pct(f.confidence)}: looks modern with free space, so an upgrade is less likely. An electrician confirms.`;
      if (f.finding === 'old-or-full') return `Meter cabinet photo${pct(f.confidence)}: looks old or full, so an upgrade is likely; plan for the cost. An electrician confirms.`;
      return "Meter cabinet photo: we can't tell from the photo. An electrician checks on site.";
    }
    case 'outdoor':
      return outdoorSentence(finding as OutdoorFinding);
    case 'boiler_room': {
      const f = finding as BoilerRoomFinding;
      const heater = f.heater ? ` Current heater: ${f.heater}.` : '';
      if (f.indoor_space === 'enough') return `Boiler room photo${pct(f.confidence)}: there looks to be space for the indoor unit and a hot-water tank.${heater} A technician confirms.`;
      if (f.indoor_space === 'tight') return `Boiler room photo${pct(f.confidence)}: space for the indoor unit and a tank looks tight.${heater} A technician checks the layout.`;
      return `Boiler room photo: the space for the indoor unit is unclear from the photo.${heater} A technician checks on site.`;
    }
    case 'access': {
      const f = finding as AccessFinding;
      const obstacles = f.obstacles?.length ? ` (${f.obstacles.join(', ')})` : '';
      if (f.route === 'narrow') return `Access photo${pct(f.confidence)}: the route looks narrow${obstacles}; plan how to bring in the tank and the outdoor unit. A technician confirms.`;
      if (f.route === 'ok') return `Access photo${pct(f.confidence)}: the route looks passable. A technician confirms.`;
      return 'Access photo: the route is unclear from the photo. A technician checks on site.';
    }
    case 'bill': {
      const f = finding as BillReading;
      if (f.annual_consumption_kwh == null) return 'Bill: we could not read the yearly consumption. Please type it in or confirm it with the homeowner.';
      return `Bill: reads about ${f.annual_consumption_kwh.toLocaleString('en-US')} kWh per year${f.energy_carrier ? ` (${f.energy_carrier})` : ''}, to confirm with the homeowner before it is used.`;
    }
    case 'certificate': {
      const f = finding as CertificateReading;
      if (f.kwh_m2a == null) return 'Energy certificate: we could not read the final-energy figure. A technician can check the certificate on site.';
      const kind = f.kind === 'demand' ? 'final energy demand' : f.kind === 'consumption' ? 'final energy consumption' : 'final energy';
      return `Energy certificate: reads ${f.kwh_m2a} kWh/m² per year (${kind}), to confirm with the homeowner. It is only a cross-check against the bill.`;
    }
    default:
      return 'Photo stored for the technician.';
  }
}
