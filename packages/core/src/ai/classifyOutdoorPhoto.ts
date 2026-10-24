// Bonus (b): a rough hint about where an outdoor unit could go, from the homeowner's photos.
// The AI only describes what is visible. It never sets the verdict or a number, the homeowner's own answers
// always win, and every hint says a technician confirms (noise: TA Lärm; compliance is the customer's
// responsibility, AGB 7.7).
import { PHOTO_MIN_CONFIDENCE } from '../engine/constants';
import type { HouseType, YesNoUnsure } from '../sales/types';
import { askJson, fileToImage, image, text } from './provider';
import { clampConfidence, majority, meanConfidence, oneOf, round2, shortList } from './vote';

export type Tri = 'yes' | 'no' | 'unclear';
const TRI = ['yes', 'no', 'unclear'] as const;
const HOUSE = ['detached', 'semi', 'terraced', 'multi', 'unknown'] as const;
const ACCESS = ['ok', 'narrow', 'unclear'] as const;

export type OutdoorLook = {
  /** Free, level, reachable ground or wall space of about 1 × 1 m next to the house. */
  space_1x1: Tri;
  /** The likely spot is close to the neighbour's plot boundary, a neighbouring house or a neighbour's windows. */
  near_neighbour: Tri;
  house_type: HouseType | 'unknown';
  /** Can installers bring equipment to the spot? */
  access: 'ok' | 'narrow' | 'unclear';
  obstacles: string[];
  evidence: string[];
  confidence: number;
};
export type OutdoorFinding = OutdoorLook & { agreement: number; looks: number; source: 'ai' };

const SYSTEM = `You look at homeowner photos of the outside of a German house (garden, yard, side wall, facade) and give a ROUGH hint about where the outdoor unit of an air-source heat pump could go. A technician always decides on site.
Judge only what is visible:
- space_1x1: is there free, level, reachable ground or wall space of about 1 x 1 m next to the house that is not a path, driveway, door or window? "yes", "no" or "unclear".
- near_neighbour: would such a spot be close to the neighbour's plot boundary, a neighbouring house or a neighbour's windows? Close spots need a noise check. "yes", "no" or "unclear".
- house_type: "detached", "semi" (semi-detached), "terraced", "multi" (apartment building) or "unknown".
- access: can installers bring equipment to the spot (path or gate wide enough)? "ok", "narrow" or "unclear".
- obstacles: up to 3 short phrases, for example "steep slope", "bins and bikes", "tree".
- evidence: up to 3 short phrases of exactly what you see.
Rules: never estimate distances or sizes you cannot see; use "unclear" when the photos do not show enough. If the photos do not show the outside of a house, answer "unclear" or "unknown" everywhere with low confidence.
Reply with ONLY JSON: {"space_1x1":"yes"|"no"|"unclear","near_neighbour":"yes"|"no"|"unclear","house_type":"detached"|"semi"|"terraced"|"multi"|"unknown","access":"ok"|"narrow"|"unclear","obstacles":["..."],"evidence":["..."],"confidence":0..1}`;

/** Coerce a raw model reply into allowed values: anything odd becomes "unclear" / "unknown" / 0. */
export function normaliseOutdoorLook(r: Partial<Record<keyof OutdoorLook, unknown>>): OutdoorLook {
  return {
    space_1x1: oneOf(r.space_1x1, TRI, 'unclear'),
    near_neighbour: oneOf(r.near_neighbour, TRI, 'unclear'),
    house_type: oneOf(r.house_type, HOUSE, 'unknown'),
    access: oneOf(r.access, ACCESS, 'unclear'),
    obstacles: shortList(r.obstacles),
    evidence: shortList(r.evidence),
    confidence: clampConfidence(r.confidence),
  };
}

/** One independent look at up to 4 photos. */
export async function lookAtOutdoorPhotos(files: Blob[]): Promise<OutdoorLook> {
  const content = [
    text("The homeowner's photos of the possible outdoor-unit spot:"),
    ...(await Promise.all(files.slice(0, 4).map(fileToImage))).map(image),
  ];
  return normaliseOutdoorLook(await askJson<Partial<Record<keyof OutdoorLook, unknown>>>(SYSTEM, content));
}

/**
 * Majority vote per field over independent looks. Confidence = mean confidence × share of looks that agreed on
 * the two fields that matter (space, neighbour). Below the photo threshold every field becomes "unclear".
 */
export function voteOutdoor(looks: OutdoorLook[]): OutdoorFinding {
  const n = looks.length;
  const space = majority(looks.map((l) => l.space_1x1), 'unclear');
  const near = majority(looks.map((l) => l.near_neighbour), 'unclear');
  const house = majority(looks.map((l) => l.house_type), 'unknown');
  const access = majority(looks.map((l) => l.access), 'unclear');
  const agreed = Math.min(space.count, near.count);
  const agreement = n ? agreed / n : 0;
  const confidence = round2(meanConfidence(looks) * agreement);
  const ok = confidence >= PHOTO_MIN_CONFIDENCE;
  return {
    space_1x1: ok ? space.value : 'unclear',
    near_neighbour: ok ? near.value : 'unclear',
    house_type: ok ? house.value : 'unknown',
    access: ok ? access.value : 'unclear',
    obstacles: [...new Set(looks.flatMap((l) => l.obstacles))].slice(0, 3),
    evidence: [`${agreed}/${n} independent looks agreed`, ...(looks[0]?.evidence ?? [])].slice(0, 4),
    confidence,
    agreement: round2(agreement),
    looks: n,
    source: 'ai',
  };
}

/** Three independent looks (default) and a majority vote, like the radiator classifier. */
export async function classifyOutdoorPhotos(files: Blob[], opts: { looks?: number } = {}): Promise<OutdoorFinding> {
  const looks = await Promise.all(Array.from({ length: opts.looks ?? 3 }, () => lookAtOutdoorPhotos(files)));
  return voteOutdoor(looks);
}

export type OutdoorAnswers = { space1x1: YesNoUnsure; neighbourOk: YesNoUnsure };

/**
 * Fill only what the homeowner left open ("unsure" or missing); stated answers always win over a photo.
 * A spot that looks close to the neighbour means the minimum distance is doubtful, so neighbourOk becomes "no",
 * which raises the existing "tight placement, noise check needed" flag.
 */
export function mergeOutdoorFinding<T extends Partial<OutdoorAnswers>>(current: T | null | undefined, f: OutdoorFinding): T & OutdoorAnswers {
  const open = (v: YesNoUnsure | undefined) => v == null || v === 'unsure';
  const space: YesNoUnsure = f.space_1x1 === 'unclear' ? 'unsure' : f.space_1x1;
  const neighbour: YesNoUnsure = f.near_neighbour === 'yes' ? 'no' : f.near_neighbour === 'no' ? 'yes' : 'unsure';
  return {
    ...(current ?? ({} as T)),
    space1x1: open(current?.space1x1) ? space : (current!.space1x1 as YesNoUnsure),
    neighbourOk: open(current?.neighbourOk) ? neighbour : (current!.neighbourOk as YesNoUnsure),
  };
}
