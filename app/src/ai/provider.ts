// One interface for every AI helper. Swap the backend by config, no code change:
//   VITE_LLM_PROVIDER = claude | openai | astra   (default: claude)
//   VITE_LLM_API_KEY  = the key for that provider
//   VITE_LLM_BASE_URL = OpenAI-compatible endpoint (required for astra, optional for openai)
//   VITE_LLM_MODEL    = optional model override
// The AI only reads photos/bills and rephrases text. It never produces numbers or the verdict.
const env = import.meta.env;
const PROVIDER = ((env.VITE_LLM_PROVIDER as string) || 'claude').toLowerCase() as 'claude' | 'openai' | 'astra';
const KEY = env.VITE_LLM_API_KEY as string | undefined;
const BASE_URL = (env.VITE_LLM_BASE_URL as string | undefined) || (PROVIDER === 'openai' ? 'https://api.openai.com/v1' : undefined);
const MODEL = (env.VITE_LLM_MODEL as string | undefined) || (PROVIDER === 'claude' ? 'claude-sonnet-5-5' : 'gpt-4o');
const TIMEOUT_MS = 30_000;

export const providerName = () => PROVIDER;
export const hasLlmKey = () => Boolean(KEY) && (PROVIDER === 'claude' || Boolean(BASE_URL));

export type ImagePart = { mediaType: string; data: string };
export type Content = { type: 'text'; text: string } | { type: 'image'; image: ImagePart };

export const text = (t: string): Content => ({ type: 'text', text: t });
export const image = (img: ImagePart): Content => ({ type: 'image', image: img });

export async function fileToImage(file: Blob): Promise<ImagePart> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { mediaType: file.type || 'image/jpeg', data: btoa(bin) };
}

async function callClaude(system: string, content: Content[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{
        role: 'user',
        content: content.map((c) => c.type === 'text' ? c : {
          type: c.image.mediaType === 'application/pdf' ? 'document' : 'image',
          source: { type: 'base64', media_type: c.image.mediaType, data: c.image.data },
        }),
      }],
    }),
  });
  if (!res.ok) throw new Error(`${PROVIDER} error ${res.status}`);
  const body = await res.json();
  return body.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
}

/** OpenAI chat-completions format; Astra and other compatible endpoints use the same shape. */
async function callOpenAiCompatible(system: string, content: Content[]): Promise<string> {
  const res = await fetch(`${BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: content.map((c) => c.type === 'text' ? c : { type: 'image_url', image_url: { url: `data:${c.image.mediaType};base64,${c.image.data}` } }),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${PROVIDER} error ${res.status}`);
  const body = await res.json();
  return body.choices?.[0]?.message?.content ?? '';
}

export async function askText(system: string, content: Content[]): Promise<string> {
  if (!hasLlmKey()) throw new Error('No AI provider configured');
  return PROVIDER === 'claude' ? callClaude(system, content) : callOpenAiCompatible(system, content);
}

/** One call; asks for a single JSON object and parses it. */
export async function askJson<T>(system: string, content: Content[]): Promise<T> {
  const out = await askText(system, content);
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI returned no JSON');
  return JSON.parse(match[0]) as T;
}
