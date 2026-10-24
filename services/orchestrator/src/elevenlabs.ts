// ElevenLabs "custom LLM" bridge: ElevenLabs does speech-to-text, turn-taking and the voice; it sends each caller
// turn as an OpenAI-style /v1/chat/completions request (stream: true). We map it to our session, run the normal
// guarded turn and stream the reply back as SSE chunks.
//
// Session mapping: prefer a filled-in `conversation_id: <id>` in the system message; ElevenLabs does not always
// substitute the dynamic variable, so otherwise the request's earlier caller messages are matched against stored
// voice sessions (every request carries the whole history).
//
// Language: when the caller switches language, we also call ElevenLabs' built-in `language_detection` tool so its
// speech recognition and voice switch too.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { newSession, type Session, type SessionStore, type ToolConfig } from '@hpr/agent';
import { handleTurn, startConversation } from './agent';
import type { ModelClient } from './model';

type OaiMessage = { role: string; content: string | { type: string; text?: string }[] | null; tool_calls?: unknown[] };
type OaiTool = { type: string; function?: { name: string; description?: string; parameters?: unknown } };
type OaiRequest = { messages: OaiMessage[]; stream?: boolean; user?: string; model?: string; tools?: OaiTool[] };

const textOf = (m?: OaiMessage) => (typeof m?.content === 'string' ? m.content : (m?.content ?? []).map((p) => p.text ?? '').join(''));
const MATCH_WINDOW_MS = 45 * 60 * 1000;

export function conversationId(body: OaiRequest): string | null {
  const sys = body.messages.filter((m) => m.role === 'system').map(textOf).join('\n');
  return sys.match(/conversation_id:\s*([A-Za-z0-9_-]{6,})/)?.[1] ?? body.user ?? null;
}

export function detectLang(body: OaiRequest): 'de' | 'en' {
  const sys = body.messages.filter((m) => m.role === 'system').map(textOf).join('\n');
  const m = sys.match(/language:\s*(de|en)\b/i);
  return (m?.[1].toLowerCase() as 'de' | 'en') ?? 'de'; // "auto" → start German, follow the caller
}

const userTurns = (msgs: { role: string; content?: unknown }[]) =>
  msgs.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : textOf(m as OaiMessage)).trim());

/** Find the stored voice session whose caller turns equal the request's earlier caller turns. */
export function findByHistory(store: SessionStore, earlier: string[]): Session | undefined {
  const now = Date.now();
  return store.list()
    .filter((s) => s.channel === 'voice' && s.id.startsWith('el-') && !s.flags.finished && now - Date.parse(s.updatedAt) < MATCH_WINDOW_MS)
    .find((s) => { const u = userTurns(s.messages); return u.length === earlier.length && u.every((x, i) => x === earlier[i]); });
}

function sseChunk(res: ServerResponse, id: string, model: string, delta: Record<string, unknown>, finish: string | null = null) {
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
}

export async function handleChatCompletions(_req: IncomingMessage, res: ServerResponse, body: OaiRequest, store: SessionStore, config: ToolConfig, model: ModelClient) {
  const id = `chatcmpl-${Date.now()}`;
  const mdl = body.model ?? 'heatpump-orchestrator';
  const last = body.messages.at(-1);

  // Follow-up after our language_detection tool call: nothing new from the caller, so say nothing more.
  if (last && (last.role === 'tool' || (last.role === 'assistant' && last.tool_calls))) {
    return send(res, body, id, mdl, '', null);
  }

  const turns = body.messages.filter((m) => m.role === 'user').map((m) => textOf(m).trim());
  const userText = turns.at(-1) ?? '';
  const cid = conversationId(body);
  let s = (cid ? store.get(`el-${cid}`) : undefined) ?? findByHistory(store, turns.slice(0, -1));
  if (!s) {
    s = newSession(`el-${cid ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`}`, 'voice', detectLang(body));
    startConversation(s); // ElevenLabs speaks the same greeting as its first_message
  }

  const before = s.speak ?? s.lang;
  let reply = '';
  if (userText) reply = (await handleTurn(s, userText, model, config)).reply;
  store.save(s);

  const after = s.speak ?? s.lang;
  const canSwitch = body.tools?.some((t) => t.function?.name === 'language_detection');
  const switchTo = canSwitch && after !== before ? after : null;
  return send(res, body, id, mdl, reply, switchTo);
}

function send(res: ServerResponse, body: OaiRequest, id: string, mdl: string, reply: string, switchTo: string | null) {
  const toolCall = switchTo
    ? { index: 0, id: `call_lang_${Date.now()}`, type: 'function', function: { name: 'language_detection', arguments: JSON.stringify({ reason: `The caller is speaking ${switchTo}.`, language: switchTo }) } }
    : null;
  if (body.stream === false) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: mdl,
      choices: [{ index: 0, message: { role: 'assistant', content: reply, ...(toolCall ? { tool_calls: [{ ...toolCall, index: undefined }] } : {}) }, finish_reason: toolCall ? 'tool_calls' : 'stop' }],
    }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  sseChunk(res, id, mdl, { role: 'assistant' });
  // Sentence-sized chunks let ElevenLabs start speaking before the whole reply is out.
  if (reply) for (const part of reply.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [reply]) sseChunk(res, id, mdl, { content: part });
  if (toolCall) sseChunk(res, id, mdl, { tool_calls: [toolCall] });
  sseChunk(res, id, mdl, {}, toolCall ? 'tool_calls' : 'stop');
  res.write('data: [DONE]\n\n');
  res.end();
}

/** Prompt text for the ElevenLabs agent. Rules live in our orchestrator, not here. */
export const ELEVENLABS_AGENT_PROMPT = `conversation_id: {{system__conversation_id}}
language: auto
You are a voice front end. All answers come from the custom LLM; do not add content.`;
