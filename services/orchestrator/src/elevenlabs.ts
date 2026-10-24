// ElevenLabs "custom LLM" bridge: ElevenLabs does speech-to-text, turn-taking and the voice; it sends each caller
// turn as an OpenAI-style /v1/chat/completions request (usually stream: true). We map it to our session, run the
// normal guarded turn and stream the reply back as SSE chunks.
//
// Session mapping: the agent prompt in ElevenLabs contains `conversation_id: {{system__conversation_id}}`
// (a built-in dynamic variable), so every request carries the id in its system message. Fallback: the `user` field.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { newSession, type SessionStore, type ToolConfig } from '@hpr/agent';
import { handleTurn, startConversation } from './agent';
import type { ModelClient } from './model';

type OaiMessage = { role: string; content: string | { type: string; text?: string }[] | null };
type OaiRequest = { messages: OaiMessage[]; stream?: boolean; user?: string; model?: string };

const textOf = (m?: OaiMessage) => (typeof m?.content === 'string' ? m.content : (m?.content ?? []).map((p) => p.text ?? '').join(''));

export function conversationId(body: OaiRequest): string | null {
  const sys = body.messages.filter((m) => m.role === 'system').map(textOf).join('\n');
  return sys.match(/conversation_id:\s*([\w-]+)/)?.[1] ?? body.user ?? null;
}

export function detectLang(body: OaiRequest): 'de' | 'en' {
  const sys = body.messages.filter((m) => m.role === 'system').map(textOf).join('\n');
  const m = sys.match(/language:\s*(de|en)\b/i);
  return (m?.[1].toLowerCase() as 'de' | 'en') ?? 'de'; // "auto" → start German, follow the caller
}

function sseChunk(res: ServerResponse, id: string, model: string, delta: Record<string, unknown>, finish: string | null = null) {
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
}

export async function handleChatCompletions(req: IncomingMessage, res: ServerResponse, body: OaiRequest, store: SessionStore, config: ToolConfig, model: ModelClient) {
  const convId = conversationId(body) ?? `el-${Date.now()}`;
  const sid = `el-${convId}`;
  let s = store.get(sid);
  if (!s) {
    s = newSession(sid, 'voice', detectLang(body));
    startConversation(s); // ElevenLabs speaks the same greeting as its first_message
  }
  const userText = textOf([...body.messages].reverse().find((m) => m.role === 'user')).trim();
  let reply: string;
  if (!userText) reply = s.messages.find((m) => m.role === 'assistant')?.content as string ?? '';
  else {
    const r = await handleTurn(s, userText, model, config);
    reply = r.reply;
  }
  store.save(s);

  const id = `chatcmpl-${Date.now()}`;
  const mdl = body.model ?? 'heatpump-orchestrator';
  if (body.stream === false) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: mdl, choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }] }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  sseChunk(res, id, mdl, { role: 'assistant' });
  // Sentence-sized chunks let ElevenLabs start speaking before the whole reply is out.
  for (const part of reply.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [reply]) sseChunk(res, id, mdl, { content: part });
  sseChunk(res, id, mdl, {}, 'stop');
  res.write('data: [DONE]\n\n');
  res.end();
}

/** Prompt text to paste into (or create with) the ElevenLabs agent. Rules live in our orchestrator, not here. */
export const ELEVENLABS_AGENT_PROMPT = `conversation_id: {{system__conversation_id}}
language: auto
You are a voice front end. All answers come from the custom LLM; do not add content.`;
