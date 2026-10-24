// Boiler room and access-route photos: rough hints that shorten the technician's visit.
// They never feed the verdict or any number. Below the photo threshold the answer is "unclear".
import { PHOTO_MIN_CONFIDENCE } from '../engine/constants';
import { askJson, fileToImage, image, text } from './provider';
import { clampConfidence, oneOf, shortList } from './vote';

export type BoilerRoomFinding = {
  /** Visible floor/wall space for a heat pump indoor unit and a hot-water tank. */
  indoor_space: 'enough' | 'tight' | 'unclear';
  /** The current heater as read from a visible label or its look, e.g. "gas condensing boiler"; null if not visible. */
  heater: string | null;
  evidence: string[];
  confidence: number;
  source: 'ai';
};

export type AccessFinding = {
  /** Can a hot-water tank and the outdoor unit be brought in along this route? */
  route: 'ok' | 'narrow' | 'unclear';
  obstacles: string[];
  evidence: string[];
  confidence: number;
  source: 'ai';
};

const BOILER_SYSTEM = `You look at homeowner photos of a German boiler room or heating room.
Judge only what is visible:
- indoor_space: is there free floor or wall space for a heat pump indoor unit and a hot-water tank (roughly the footprint of a fridge)? "enough", "tight" or "unclear".
- heater: the current heater if a type label or the device makes it clear (e.g. "gas condensing boiler", "oil boiler with tank"), else null. Never invent a brand or model.
- evidence: up to 3 short phrases of exactly what you see.
If the photos do not show a boiler or heating room, use "unclear" and null with low confidence.
Reply with ONLY JSON: {"indoor_space":"enough"|"tight"|"unclear","heater":string|null,"evidence":["..."],"confidence":0..1}`;

const ACCESS_SYSTEM = `You look at homeowner photos of the route installers would take: entrance, doors, hallways, stairs (also cellar stairs), gates, garden path.
Judge only what is visible: could a hot-water tank and an outdoor unit be carried along this route?
- route: "ok", "narrow" (e.g. narrow or winding stairs, low or narrow doors, steps without space to turn) or "unclear".
- obstacles: up to 3 short phrases.
- evidence: up to 3 short phrases of exactly what you see.
Never estimate widths you cannot see. If the photos do not show such a route, use "unclear" with low confidence.
Reply with ONLY JSON: {"route":"ok"|"narrow"|"unclear","obstacles":["..."],"evidence":["..."],"confidence":0..1}`;

export function normaliseBoilerRoom(r: Record<string, unknown>): BoilerRoomFinding {
  const confidence = clampConfidence(r.confidence);
  const ok = confidence >= PHOTO_MIN_CONFIDENCE;
  const heater = typeof r.heater === 'string' && r.heater.trim() ? r.heater.trim().slice(0, 80) : null;
  return {
    indoor_space: ok ? oneOf(r.indoor_space, ['enough', 'tight', 'unclear'] as const, 'unclear') : 'unclear',
    heater: ok ? heater : null,
    evidence: shortList(r.evidence),
    confidence,
    source: 'ai',
  };
}

export function normaliseAccess(r: Record<string, unknown>): AccessFinding {
  const confidence = clampConfidence(r.confidence);
  const ok = confidence >= PHOTO_MIN_CONFIDENCE;
  return {
    route: ok ? oneOf(r.route, ['ok', 'narrow', 'unclear'] as const, 'unclear') : 'unclear',
    obstacles: ok ? shortList(r.obstacles) : [],
    evidence: shortList(r.evidence),
    confidence,
    source: 'ai',
  };
}

const photos = async (files: Blob[]) => (await Promise.all(files.slice(0, 4).map(fileToImage))).map(image);

export async function classifyBoilerRoom(files: Blob[]): Promise<BoilerRoomFinding> {
  return normaliseBoilerRoom(await askJson<Record<string, unknown>>(BOILER_SYSTEM, [text('Boiler room photos:'), ...(await photos(files))]));
}

export async function classifyAccess(files: Blob[]): Promise<AccessFinding> {
  return normaliseAccess(await askJson<Record<string, unknown>>(ACCESS_SYSTEM, [text('Access route photos:'), ...(await photos(files))]));
}
