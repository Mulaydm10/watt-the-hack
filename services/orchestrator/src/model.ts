// Model clients with native tool calling. Swappable for a mock in tests.
//  - ResponsesModel: OpenAI /v1/responses (required for gpt-6-astra with function tools).
//  - OpenAiCompatibleModel: /v1/chat/completions (other OpenAI-compatible endpoints).
import { llmConfig } from '@hpr/core/ai/provider';
import type { ChatMessage, Tool } from '@hpr/agent';

export type AssistantMessage = Extract<ChatMessage, { role: 'assistant' }>;
export interface ModelClient { complete(messages: ChatMessage[], tools: Tool[]): Promise<AssistantMessage>; }

function requireConfig() {
  const c = llmConfig();
  if (!c.apiKey || !c.baseUrl) throw new Error('LLM not configured (LLM_API_KEY / LLM_BASE_URL)');
  return c;
}

export class OpenAiCompatibleModel implements ModelClient {
  constructor(private timeoutMs = 60_000) {}
  async complete(messages: ChatMessage[], tools: Tool[]): Promise<AssistantMessage> {
    const c = requireConfig();
    const res = await fetch(`${c.baseUrl!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: c.model,
        messages,
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
      }),
    });
    if (!res.ok) throw new Error(`model error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const m = (await res.json()).choices?.[0]?.message ?? {};
    return { role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls?.length ? m.tool_calls : undefined };
  }
}

type ResponsesItem = Record<string, unknown>;

/** Map our chat history to Responses API input items. */
function toInput(messages: ChatMessage[]): ResponsesItem[] {
  const out: ResponsesItem[] = [];
  for (const m of messages) {
    if (m.role === 'tool') out.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content });
    else if (m.role === 'assistant') {
      if (m.content) out.push({ role: 'assistant', content: m.content });
      for (const c of m.tool_calls ?? []) out.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments });
    } else out.push({ role: m.role === 'system' ? 'developer' : 'user', content: m.content });
  }
  return out;
}

export class ResponsesModel implements ModelClient {
  constructor(private timeoutMs = 90_000, private effort = process.env.LLM_REASONING_EFFORT ?? 'low') {}
  async complete(messages: ChatMessage[], tools: Tool[]): Promise<AssistantMessage> {
    const c = requireConfig();
    const res = await fetch(`${c.baseUrl!.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: c.model,
        input: toInput(messages),
        tools: tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false })),
        tool_choice: 'auto',
        reasoning: { effort: this.effort },
        store: false,
      }),
    });
    if (!res.ok) throw new Error(`model error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const items = (body.output ?? []) as ResponsesItem[];
    const calls = items.filter((i) => i.type === 'function_call').map((i) => ({ id: String(i.call_id), type: 'function' as const, function: { name: String(i.name), arguments: String(i.arguments ?? '{}') } }));
    const textOut = items.filter((i) => i.type === 'message')
      .flatMap((i) => (i.content as { type: string; text?: string }[]) ?? [])
      .filter((p) => p.type === 'output_text').map((p) => p.text).join('').trim();
    return { role: 'assistant', content: textOut || null, tool_calls: calls.length ? calls : undefined };
  }
}

/** Astra (gpt-6-*) needs the Responses API for tools; LLM_API_STYLE=chat|responses overrides. */
export function defaultModel(): ModelClient {
  const style = process.env.LLM_API_STYLE ?? (/^gpt-6/.test(llmConfig().model) ? 'responses' : 'chat');
  return style === 'responses' ? new ResponsesModel() : new OpenAiCompatibleModel();
}
