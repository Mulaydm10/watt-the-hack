import { PHOTO_MIN_CONFIDENCE } from '../engine/constants';
import type { PhotoFindings } from '../engine/types';
import { askJson, fileToImage, image, text } from './llm';
import { pipeRules, voteFeatures, type PipeFeatures } from './pipeRules';

// Installer-confirmed examples from nuuEnergy (filenames carry the true label).
const EXAMPLES = [
  { file: '1_single-pipe_classic-loop.jpg', label: 'single-pipe', why: 'one pipe runs along the wall from radiator to radiator with a short bypass piece' },
  { file: '2_single-pipe_hidden-in-valve-block.jpeg', label: 'single-pipe', why: 'H-block valve with an extra adjustable side port (bypass)' },
  { file: '3_two-pipe_classic.jpeg', label: 'two-pipe', why: 'valve on top, return fitting at the bottom, two separate pipes not connected' },
  { file: '4_two-pipe_modern-valve-block.jpeg', label: 'two-pipe', why: 'modern valve block, two pipes, no bypass port' },
  { file: '5_cant-tell.jpeg', label: 'unclear', why: 'multi-block connection that exists in both systems; an installer could not tell' },
];

const SYSTEM = `You classify German hot-water heating systems as single-pipe (Einrohr) or two-pipe (Zweirohr) from radiator photos.
Visual cues:
- Valve on top plus return at the bottom on two separate pipes -> likely two-pipe.
- One pipe running along the wall/skirting from radiator to radiator, often with a short bypass piece -> likely single-pipe.
- A single bottom connection with both pipes from the floor into one valve -> often single-pipe (two-pipe versions exist).
- Compact H-block with two pipes -> often can't tell; an extra adjustable side port (bypass) points to single-pipe.
- Built 1960s-70s or apartment building -> single-pipe more likely, but not proof.
Rules: two pipes at a radiator do NOT prove two-pipe. The system belongs to the building, not one radiator. Even installers are often unsure; be honest and use "unclear" when the cues are weak.
Also estimate the radiator panel type (11/22/33) if visible, else "unknown".
Reply with ONLY JSON: {"label":"single-pipe"|"two-pipe"|"unclear","confidence":0..1,"evidence":["short cue", ...],"radiator_type":"11"|"22"|"33"|"unknown"}`;

let examplesCache: Awaited<ReturnType<typeof fileToImage>>[] | null = null;
// Browser default: the app serves the photos at /examples/. Servers inject a loader that reads from disk.
let exampleLoader: (file: string) => Promise<Blob> = async (file) => (await fetch(`/examples/${file}`)).blob();
export function setExampleLoader(loader: (file: string) => Promise<Blob>) { exampleLoader = loader; examplesCache = null; }

async function loadExamples() {
  if (!examplesCache) {
    examplesCache = await Promise.all(EXAMPLES.map(async (e) => fileToImage(await exampleLoader(e.file))));
  }
  return examplesCache;
}

/** `excludeExample` drops one few-shot example (used for honest leave-one-out evaluation). */
export async function classifyPipePhotos(files: File[], constructionYear: number | null, excludeExample?: string): Promise<PhotoFindings> {
  const ex = await loadExamples();
  const content = [
    text('Installer-confirmed examples:'),
    ...EXAMPLES.flatMap((e, i) => e.file === excludeExample ? [] : [image(ex[i]), text(`Example ${i + 1}: ${e.label} because ${e.why}.`)]),
    text(`Now the homeowner's photos (building year: ${constructionYear ?? 'unknown'}):`),
    ...(await Promise.all(files.slice(0, 5).map(fileToImage))).map(image),
  ];
  const r = await askJson<Omit<PhotoFindings, 'source'>>(SYSTEM, content);
  const confident = r.label !== 'unclear' && r.confidence >= PHOTO_MIN_CONFIDENCE;
  return { ...r, label: confident ? r.label : 'unclear', evidence: r.evidence ?? [], source: 'ai' };
}

/**
 * Direct classifier asked `looks` times independently; majority label wins.
 * Confidence = mean confidence of the majority × share of looks that agreed, so disagreement lowers it.
 */
export async function classifyPipePhotosVoted(files: File[], constructionYear: number | null, opts: { excludeExample?: string; looks?: number } = {}): Promise<PhotoFindings & { agreement: number }> {
  const n = opts.looks ?? 3;
  const runs = await Promise.all(Array.from({ length: n }, () => classifyPipePhotos(files, constructionYear, opts.excludeExample)));
  const counts = new Map<PhotoFindings['label'], PhotoFindings[]>();
  runs.forEach((r) => counts.set(r.label, [...(counts.get(r.label) ?? []), r]));
  const [label, group] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const agreement = group.length / n;
  const majority = group.length > n / 2;
  const conf = (group.reduce((s, r) => s + r.confidence, 0) / group.length) * agreement;
  const finalLabel = majority && (label === 'unclear' || conf >= PHOTO_MIN_CONFIDENCE) ? label : 'unclear';
  return {
    label: finalLabel,
    confidence: Math.round(conf * 100) / 100,
    evidence: [`${group.length}/${n} independent looks agreed`, ...group[0].evidence].slice(0, 4),
    radiator_type: group[0].radiator_type,
    source: 'ai',
    agreement,
  };
}

const FEATURE_SYSTEM = `You inspect photos of radiator connections in German homes. Report ONLY what is visible; do not classify the heating system.
For each feature answer true, false, or null if it cannot be seen:
- pipe_runs_along_wall_between_radiators: one pipe runs horizontally along the wall/skirting from this radiator towards another radiator (a loop).
- bypass_or_extra_side_port: a short bypass piece between supply and return, or an extra adjustable port on the side of a valve block.
- valve_top_with_separate_bottom_return: a valve at the top fed by its own pipe AND a separate return connection at the bottom on a different pipe.
- single_bottom_connection_both_pipes_from_floor: both pipes come from the floor into one bottom connection.
- compact_valve_block: a compact block (H-block) under the radiator joining two pipes.
Also radiator_type: count panels from the side/top if visible ("11","22","33"), else "unknown".
evidence: up to 3 short phrases of exactly what you see.
Reply with ONLY JSON: {"pipe_runs_along_wall_between_radiators":bool|null,"bypass_or_extra_side_port":bool|null,"valve_top_with_separate_bottom_return":bool|null,"single_bottom_connection_both_pipes_from_floor":bool|null,"compact_valve_block":bool|null,"radiator_type":"11"|"22"|"33"|"unknown","evidence":[...]}`;

// What an installer sees in each example (features only; the label comes from the rules).
const EXAMPLE_FEATURES: Record<string, Partial<PipeFeatures>> = {
  '1_single-pipe_classic-loop.jpg': { pipe_runs_along_wall_between_radiators: true, bypass_or_extra_side_port: true },
  '2_single-pipe_hidden-in-valve-block.jpeg': { compact_valve_block: true, bypass_or_extra_side_port: true, single_bottom_connection_both_pipes_from_floor: true },
  '3_two-pipe_classic.jpeg': { valve_top_with_separate_bottom_return: true, bypass_or_extra_side_port: false, pipe_runs_along_wall_between_radiators: false },
  '4_two-pipe_modern-valve-block.jpeg': { compact_valve_block: true, bypass_or_extra_side_port: false, single_bottom_connection_both_pipes_from_floor: true },
  '5_cant-tell.jpeg': { compact_valve_block: true, bypass_or_extra_side_port: null },
};

/**
 * AI describes visible features (3 independent looks, majority vote); fixed rules from the official cue table decide.
 * `zeroShot` skips the example photos entirely (generalisation test); `excludeExample` drops one (leave-one-out).
 */
export async function classifyPipeFeatures(files: File[], constructionYear: number | null, opts: { excludeExample?: string; zeroShot?: boolean; looks?: number } = {}): Promise<PhotoFindings & { rule: string; agreement: number }> {
  const shots = opts.zeroShot ? [] : await loadExamples();
  const content = [
    ...(opts.zeroShot ? [] : [text('Examples of feature reports:')]),
    ...EXAMPLES.flatMap((e, i) => opts.zeroShot || e.file === opts.excludeExample ? [] : [image(shots[i]), text(`Features: ${JSON.stringify(EXAMPLE_FEATURES[e.file])}`)]),
    text('Now report the features in these photos:'),
    ...(await Promise.all(files.slice(0, 5).map(fileToImage))).map(image),
  ];
  const looks = await Promise.all(Array.from({ length: opts.looks ?? 3 }, () => askJson<PipeFeatures>(FEATURE_SYSTEM, content)));
  const { features, agreement } = voteFeatures(looks);
  return { ...pipeRules(features, agreement, constructionYear), agreement: Math.round(agreement * 100) / 100, source: 'ai' };
}

/** No-key fallback: three plain questions a homeowner can answer by looking. */
export type ManualAnswers = { oneLoop: 'yes' | 'no' | 'unsure'; separateTopBottom: 'yes' | 'no' | 'unsure'; sidePort: 'yes' | 'no' | 'unsure' };

export function classifyFromAnswers(a: ManualAnswers): PhotoFindings {
  const evidence: string[] = [];
  let single = 0;
  let two = 0;
  if (a.oneLoop === 'yes') { single += 2; evidence.push('One pipe runs from radiator to radiator'); }
  if (a.oneLoop === 'no') { two += 1; evidence.push('No pipe loop between radiators'); }
  if (a.separateTopBottom === 'yes') { two += 2; evidence.push('Separate supply on top and return at the bottom'); }
  if (a.sidePort === 'yes') { single += 1; evidence.push('Extra side port on the valve block (bypass)'); }
  const total = single + two;
  if (total === 0 || single === two) return { label: 'unclear', confidence: 0.3, evidence: evidence.length ? evidence : ['No clear cues answered'], source: 'manual' };
  const label = single > two ? 'single-pipe' : 'two-pipe';
  const confidence = Math.min(0.85, 0.5 + Math.abs(single - two) * 0.12);
  return { label: confidence >= PHOTO_MIN_CONFIDENCE ? label : 'unclear', confidence, evidence, source: 'manual' };
}
