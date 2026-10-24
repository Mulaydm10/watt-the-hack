import { PHOTO_MIN_CONFIDENCE } from './constants';
import { costs } from './costs';
import { flags } from './flags';
import { heatLoad } from './heatLoad';
import { radiators } from './radiators';
import type { Assessment, Building, PhotoFindings, PipeSystem } from './types';
import { verdict } from './verdict';

/** Confirmed data always wins; photos only fill an unknown, and only when confident. */
export function resolvePipe(b: Building, photo?: PhotoFindings): { value: PipeSystem; source: string } {
  if (b.pipe_system !== 'unknown') return { value: b.pipe_system, source: 'stated in the building data' };
  if (photo && photo.label !== 'unclear' && photo.confidence >= PHOTO_MIN_CONFIDENCE) {
    return { value: photo.label, source: `${photo.source === 'ai' ? 'photo AI' : 'your answers'} (${Math.round(photo.confidence * 100)}% confident)` };
  }
  return { value: 'unknown', source: photo ? 'photos inconclusive' : 'not documented' };
}

export function assess(b: Building, photo?: PhotoFindings): Assessment {
  const pipe = resolvePipe(b, photo);
  const h = heatLoad(b);
  const r = radiators(b, h, pipe.value);
  const f = flags(b, h, r, pipe.value, photo);
  const v = verdict(h, r, f, pipe.value);
  return {
    verdict: v.verdict,
    confidence: v.confidence,
    headline: v.headline,
    verdictReasons: v.reasons,
    heatLoad: h,
    radiators: r,
    costs: costs(b, r),
    flags: f,
    pipeSystem: pipe,
  };
}
