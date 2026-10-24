// One interface for every AI helper. Swap the backend by config, no code change:
//   LLM_PROVIDER = claude | openai | astra   (default: claude)
//   LLM_API_KEY  = the key for that provider
//   LLM_BASE_URL = OpenAI-compatible endpoint (required for astra, optional for openai)
//   LLM_MODEL    = optional model override
// Read as VITE_LLM_* in the browser (Vite) and as LLM_* or VITE_LLM_* on the server; configureLlm() overrides both.
// The AI only reads photos/bills and rephrases text. It never produces numbers or the verdict.
type Provider = 'claude' | 'openai' | 'astra';
export type LlmConfig = { provider: Provider; apiKey?: string; baseUrl?: string; model: string };

const TIMEOUT_MS = 30_000;
let override: Partial<LlmConfig> = {};

/** Server code (agent, MCP tools) sets the config explicitly instead of relying on Vite env. */
export function configureLlm(c: Partial<LlmConfig>) { override = { ...override, ...c }; }

function envVar(name: string): string | undefined {
  const vite = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const node = typeof process !== 'undefined' ? process.env : {};
  return vite[`VITE_${name}`] || node[name] || node[`VITE_${name}`] || undefined;
}

export function llmConfig(): LlmConfig {
  const provider = (override.provider ?? (envVar('LLM_PROVIDER') || 'claude').toLowerCase()) as Provider;
  return {
    provider,
    apiKey: override.apiKey ?? envVar('LLM_API_KEY'),
    baseUrl: override.baseUrl ?? (envVar('LLM_BASE_URL') || (provider === 'openai' ? 'https://api.openai.com/v1' : undefined)),
    model: override.model ?? (envVar('LLM_MODEL') || (provider === 'claude' ? 'claude-sonnet-5-5' : 'gpt-6-astra')),
  };
}

export const providerName = () => llmConfig().provider;
export const hasLlmKey = () => { const c = llmConfig(); return Boolean(c.apiKey) && (c.provider === 'claude' || Boolean(c.baseUrl)); };

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

async function callClaude(c: LlmConfig, system: string, content: Content[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': c.apiKey!,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: c.model,
      max_tokens: 1024,
      system,
      messages: [{
        role: 'user',
        content: content.map((x) => x.type === 'text' ? x : {
          type: x.image.mediaType === 'application/pdf' ? 'document' : 'image',
          source: { type: 'base64', media_type: x.image.mediaType, data: x.image.data },
        }),
      }],
    }),
  });
  if (!res.ok) throw new Error(`${c.provider} error ${res.status}`);
  const body = await res.json();
  return body.content?.find((x: { type: string }) => x.type === 'text')?.text ?? '';
}

/** OpenAI chat-completions format; Astra and other compatible endpoints use the same shape. */
async function callOpenAiCompatible(c: LlmConfig, system: string, content: Content[]): Promise<string> {
  const res = await fetch(`${c.baseUrl!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: c.model,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          // PDFs go as a file part (OpenAI rejects PDFs as image_url); images as image_url.
          content: content.map((x) => x.type === 'text' ? x
            : x.image.mediaType === 'application/pdf'
              ? { type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${x.image.data}` } }
              : { type: 'image_url', image_url: { url: `data:${x.image.mediaType};base64,${x.image.data}` } }),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${c.provider} error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return body.choices?.[0]?.message?.content ?? '';
}

export async function askText(system: string, content: Content[]): Promise<string> {
  if (!hasLlmKey()) throw new Error('No AI provider configured');
  const c = llmConfig();
  return c.provider === 'claude' ? callClaude(c, system, content) : callOpenAiCompatible(c, system, content);
}

/** One call; asks for a single JSON object and parses it. */
export async function askJson<T>(system: string, content: Content[]): Promise<T> {
  const out = await askText(system, content);
  const match = out.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI returned no JSON');
  return JSON.parse(match[0]) as T;
}
