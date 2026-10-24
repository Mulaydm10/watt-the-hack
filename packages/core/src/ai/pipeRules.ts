import { PHOTO_MIN_CONFIDENCE } from '../engine/constants';
import type { PhotoFindings } from '../engine/types';

/** What the vision model reports seeing. It does not decide the label; the rules below do. */
export type PipeFeatures = {
  pipe_runs_along_wall_between_radiators: boolean | null;
  bypass_or_extra_side_port: boolean | null;
  valve_top_with_separate_bottom_return: boolean | null;
  single_bottom_connection_both_pipes_from_floor: boolean | null;
  compact_valve_block: boolean | null;
  radiator_type: '11' | '22' | '33' | 'unknown';
  evidence: string[];
};

/** Majority vote per feature across several independent looks; null when the looks disagree evenly or all abstain. */
export function voteFeatures(looks: PipeFeatures[]): { features: PipeFeatures; agreement: number } {
  const keys = ['pipe_runs_along_wall_between_radiators', 'bypass_or_extra_side_port', 'valve_top_with_separate_bottom_return',
    'single_bottom_connection_both_pipes_from_floor', 'compact_valve_block'] as const;
  let agreeSum = 0;
  const out = { radiator_type: 'unknown', evidence: [] } as unknown as PipeFeatures;
  for (const k of keys) {
    const yes = looks.filter((l) => l[k] === true).length;
    const no = looks.filter((l) => l[k] === false).length;
    out[k] = yes > no ? true : no > yes ? false : null;
    agreeSum += Math.max(yes, no) / looks.length;
  }
  const types = looks.map((l) => l.radiator_type).filter((t) => t && t !== 'unknown');
  out.radiator_type = types.length > looks.length / 2 && types.every((t) => t === types[0]) ? types[0] : 'unknown';
  out.evidence = [...new Set(looks.flatMap((l) => l.evidence ?? []))].slice(0, 4);
  return { features: out, agreement: agreeSum / keys.length };
}

/**
 * Official visual cues (nuuEnergy background page) as fixed rules:
 * - one pipe along the wall from radiator to radiator, or a bypass / extra side port → single-pipe
 * - valve on top plus a separate bottom return, no bypass → two-pipe
 * - single bottom connection with both pipes from the floor → leans single-pipe (two-pipe versions exist)
 * - compact valve block with two pipes and no side port → can't tell
 * - construction year 1960–1979 → single-pipe more likely, but never proof on its own
 */
export function pipeRules(f: PipeFeatures, agreement: number, year: number | null): Omit<PhotoFindings, 'source'> & { rule: string } {
  let single = 0;
  let two = 0;
  const why: string[] = [];
  if (f.pipe_runs_along_wall_between_radiators) { single += 2; why.push('one pipe runs along the wall between radiators'); }
  if (f.bypass_or_extra_side_port) { single += 2; why.push('bypass / extra side port'); }
  if (f.single_bottom_connection_both_pipes_from_floor && !f.valve_top_with_separate_bottom_return) { single += 1; why.push('single bottom connection, both pipes from the floor'); }
  if (f.valve_top_with_separate_bottom_return && !f.bypass_or_extra_side_port && !f.pipe_runs_along_wall_between_radiators) { two += 2; why.push('valve on top with a separate bottom return'); }
  if (year != null && year >= 1960 && year <= 1979 && single > 0) { single += 0.5; why.push(`built ${year}: single-pipe more common`); }

  const margin = Math.abs(single - two);
  let label: PhotoFindings['label'] = 'unclear';
  if (single >= 2 && single > two) label = 'single-pipe';
  else if (two >= 2 && two > single) label = 'two-pipe';
  const rule = label === 'unclear'
    ? (f.compact_valve_block ? 'compact valve block without a side port: exists in both systems' : 'no decisive cue visible')
    : why.join('; ');
  // Confidence: strength of the cues times how much the independent looks agreed.
  const confidence = label === 'unclear' ? Math.min(0.6, 0.3 + agreement * 0.3) : Math.min(0.95, (0.55 + 0.1 * margin) * (0.6 + 0.4 * agreement));
  return {
    label: confidence >= PHOTO_MIN_CONFIDENCE || label === 'unclear' ? label : 'unclear',
    confidence: Math.round(confidence * 100) / 100,
    evidence: [rule, ...f.evidence].slice(0, 4),
    radiator_type: f.radiator_type,
    rule,
  };
}
