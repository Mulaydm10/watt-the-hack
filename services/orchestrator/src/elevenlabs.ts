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
import { newSession, saveKeepingPhotos, type Session, type SessionStore, type ToolConfig } from '@hpr/agent';
import { handleTurn, startConversation } from './agent';
import type { ModelClient } from './model';

type OaiMessage = { role: string; content: string | { type: string; text?: string }[] | null; tool_calls?: unknown[] };
type OaiTool = { type: string; function?: { name: string; description?: string; parameters?: unknown } };
type OaiRequest = { messages: OaiMessage[]; stream?: boolean; user?: string; model?: string; tools?: OaiTool[] };

const textOf = (m?: OaiMessage) => (typeof m?.content === 'string' ? m.content : (m?.content ?? []).map((p) => p.text ?? '').join(''));
const MATCH_WINDOW_MS = 45 * 60 * 1000;

/** App session passed by the phone app as the dynamic variable `hpr_session` (default "none" when absent). */
export function appSessionId(body: OaiRequest): string | null {
  const sys = body.messages.filter((m) => m.role === 'system').map(textOf).join('\n');
  const m = sys.match(/hpr_session:\s*([A-Za-z0-9-]{8,})/);
  return m && m[1] !== 'none' ? m[1] : null;
}

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
  // Phone app call: continue the app's own session (typing and talking share one session and one result).
  const app = appSessionId(body);
  const appSession = app ? store.get(app) : undefined;
  if (appSession) appSession.channel = 'voice';
  let s = appSession ?? (cid ? store.get(`el-${cid}`) : undefined) ?? findByHistory(store, turns.slice(0, -1));
  if (!s) {
    s = newSession(`el-${cid ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`}`, 'voice', detectLang(body));
    startConversation(s); // ElevenLabs speaks the same greeting as its first_message
  }

  const before = s.speak ?? s.lang;
  const session = s;
  const canSwitch = body.tools?.some((t) => t.function?.name === 'language_detection');
  const turn = (async () => {
    const reply = userText ? (await handleTurn(session, userText, model, config)).reply : '';
    saveKeepingPhotos(store, session); // keeps photos uploaded during the turn (e.g. via the link mid-call)
    const after = session.speak ?? session.lang;
    return { reply, switchTo: canSwitch && after !== before ? after : null };
  })();

  if (body.stream === false) {
    const { reply, switchTo } = await turn;
    return send(res, body, id, mdl, reply, switchTo);
  }

  // Streaming: open the stream at once; if the answer is slow, speak a short filler so the caller never hears silence
  // (and ElevenLabs gets its first words well inside its wait limit). Fillers contain no numbers or verdicts.
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  sseChunk(res, id, mdl, { role: 'assistant' });
  const firstMs = Number(process.env.EL_FILLER_MS ?? 2500);
  const secondMs = Number(process.env.EL_FILLER2_MS ?? 9000);
  let done = false;
  const timers = [
    setTimeout(() => { if (!done) sseChunk(res, id, mdl, { content: filler(session, 0) + ' ' }); }, firstMs),
    setTimeout(() => { if (!done) sseChunk(res, id, mdl, { content: filler(session, 1) + ' ' }); }, secondMs),
  ];
  try {
    const { reply, switchTo } = await turn;
    done = true;
    timers.forEach(clearTimeout);
    finishStream(res, id, mdl, reply, switchTo);
  } catch {
    done = true;
    timers.forEach(clearTimeout);
    finishStream(res, id, mdl, filler(session, 2), null);
  }
}

// First filler rotates so it doesn't sound robotic on every slow turn; then a patience line; then an error line.
const FILLERS: Record<string, { first: string[]; second: string; error: string }> = {
  de: { first: ['Einen Moment bitte.', 'Ich schaue kurz nach.', 'Gleich, einen Augenblick.'], second: 'Danke für Ihre Geduld, ich bin gleich so weit.', error: 'Entschuldigung, das hat nicht geklappt. Können Sie das bitte wiederholen?' },
  en: { first: ['One moment, please.', 'Let me check that.', 'Just a second.'], second: "Thank you for your patience, I'm nearly there.", error: "Sorry, that didn't work. Could you say that again?" },
  fr: { first: ['Un instant, s’il vous plaît.', 'Je vérifie.', 'Une seconde.'], second: 'Merci de votre patience, j’y suis presque.', error: 'Désolé, cela n’a pas fonctionné. Pouvez-vous répéter ?' },
  it: { first: ['Un momento, per favore.', 'Controllo subito.', 'Un attimo.'], second: 'Grazie per la pazienza, ci sono quasi.', error: 'Mi scusi, non ha funzionato. Può ripetere?' },
  es: { first: ['Un momento, por favor.', 'Lo compruebo.', 'Un segundo.'], second: 'Gracias por su paciencia, ya casi está.', error: 'Lo siento, no ha funcionado. ¿Puede repetirlo?' },
  nl: { first: ['Een moment alstublieft.', 'Ik kijk het even na.', 'Een ogenblik.'], second: 'Dank voor uw geduld, ik ben er bijna.', error: 'Sorry, dat ging mis. Kunt u dat herhalen?' },
  pl: { first: ['Chwileczkę, proszę.', 'Już sprawdzam.', 'Moment.'], second: 'Dziękuję za cierpliwość, już prawie gotowe.', error: 'Przepraszam, to się nie udało. Czy może Pan/Pani powtórzyć?' },
  pt: { first: ['Um momento, por favor.', 'Vou verificar.', 'Só um instante.'], second: 'Obrigado pela paciência, estou quase lá.', error: 'Desculpe, não funcionou. Pode repetir?' },
};
/** 0 = first filler (rotates per caller turn), 1 = patience line, 2 = error line. In the caller's current language. */
export const filler = (s: Session, i: 0 | 1 | 2) => {
  const f = FILLERS[s.speak ?? s.lang] ?? FILLERS.de;
  if (i === 1) return f.second;
  if (i === 2) return f.error;
  const turnNo = s.messages.filter((m) => m.role === 'user').length;
  return f.first[(turnNo - 1 + f.first.length) % f.first.length];
};

function finishStream(res: ServerResponse, id: string, mdl: string, reply: string, switchTo: string | null) {
  if (reply) for (const part of reply.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [reply]) sseChunk(res, id, mdl, { content: part });
  if (switchTo) sseChunk(res, id, mdl, { tool_calls: [langToolCall(switchTo)] });
  sseChunk(res, id, mdl, {}, switchTo ? 'tool_calls' : 'stop');
  res.write('data: [DONE]\n\n');
  res.end();
}

const langToolCall = (lang: string) => ({ index: 0, id: `call_lang_${Date.now()}`, type: 'function', function: { name: 'language_detection', arguments: JSON.stringify({ reason: `The caller is speaking ${lang}.`, language: lang }) } });

function send(res: ServerResponse, body: OaiRequest, id: string, mdl: string, reply: string, switchTo: string | null) {
  const toolCall = switchTo ? langToolCall(switchTo) : null;
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
  finishStream(res, id, mdl, reply, switchTo);
}

/** Prompt text for the ElevenLabs agent. Rules live in our orchestrator, not here. */
export const ELEVENLABS_AGENT_PROMPT = `conversation_id: {{system__conversation_id}}
hpr_session: {{hpr_session}}
language: auto
You are a voice front end. All answers come from the custom LLM; do not add content.`;
