import { PHOTO_MIN_CONFIDENCE } from '../engine/constants';
import type { PhotoFindings } from '../engine/types';
import { askJson, fileToImage, image, text } from './llm';

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
async function loadExamples() {
  if (!examplesCache) {
    examplesCache = await Promise.all(EXAMPLES.map(async (e) => fileToImage(await (await fetch(`/examples/${e.file}`)).blob())));
  }
  return examplesCache;
}

export async function classifyPipePhotos(files: File[], constructionYear: number | null): Promise<PhotoFindings> {
  const ex = await loadExamples();
  const content = [
    text('Installer-confirmed examples:'),
    ...EXAMPLES.flatMap((e, i) => [image(ex[i]), text(`Example ${i + 1}: ${e.label} because ${e.why}.`)]),
    text(`Now the homeowner's photos (building year: ${constructionYear ?? 'unknown'}):`),
    ...(await Promise.all(files.slice(0, 5).map(fileToImage))).map(image),
  ];
  const r = await askJson<Omit<PhotoFindings, 'source'>>(SYSTEM, content);
  const confident = r.label !== 'unclear' && r.confidence >= PHOTO_MIN_CONFIDENCE;
  return { ...r, label: confident ? r.label : 'unclear', evidence: r.evidence ?? [], source: 'ai' };
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
