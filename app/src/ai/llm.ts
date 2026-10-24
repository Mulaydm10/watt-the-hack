// Minimal vision-LLM client. The app works fully without a key; these calls are optional extras.
const KEY = import.meta.env.VITE_LLM_API_KEY as string | undefined;
const MODEL = 'claude-sonnet-5-5';

export const hasLlmKey = () => Boolean(KEY);

export type ImagePart = { mediaType: string; data: string };

export async function fileToImage(file: Blob): Promise<ImagePart> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { mediaType: file.type || 'image/jpeg', data: btoa(bin) };
}

type Content = { type: 'text'; text: string } | { type: 'image' | 'document'; source: { type: 'base64'; media_type: string; data: string } };

export const text = (t: string): Content => ({ type: 'text', text: t });
export const image = (img: ImagePart): Content => ({
  type: img.mediaType === 'application/pdf' ? 'document' : 'image',
  source: { type: 'base64', media_type: img.mediaType, data: img.data },
});

/** One call; asks for a single JSON object and parses it. */
export async function askJson<T>(system: string, content: Content[]): Promise<T> {
  if (!KEY) throw new Error('No API key configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const body = await res.json();
  const out: string = body.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM returned no JSON');
  return JSON.parse(match[0]) as T;
}
