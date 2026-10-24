// One conversation turn: caller text in → tool calls (as many as the model needs) → guarded reply out.
import { deriveState, progress, runTool, TOOLS, type ChatMessage, type Session, type ToolConfig } from '@hpr/agent';
import { guardReply } from './guard';
import { followLanguage, languageName } from './language';
import type { ModelClient } from './model';
import { greeting, systemPrompt, type TurnContext } from './prompt';

const MAX_STEPS = 12;

export type TurnResult = {
  reply: string;
  state: ReturnType<typeof deriveState>;
  progress: ReturnType<typeof progress>;
  guard: { retried: boolean; fallback: boolean; violations: string[] };
  toolsCalled: string[];
};

/** Safe reply when the model fails or keeps breaking a rule: the next question's suggested wording. */
async function fallbackReply(s: Session, config: ToolConfig): Promise<string> {
  const st = (await runTool({ session: s, config }, 'get_state', {})) as { next_question: { question: string } | null };
  if (s.outcomeText && s.flags.finished) return s.outcomeText;
  return st.next_question?.question ?? (s.lang === 'de' ? 'Entschuldigung, können Sie das bitte wiederholen?' : 'Sorry, could you say that again?');
}

export function startConversation(s: Session): string {
  const text = greeting(s);
  s.messages.push({ role: 'assistant', content: text });
  return text;
}

export async function handleTurn(s: Session, userText: string, model: ModelClient, config: ToolConfig): Promise<TurnResult> {
  s.messages.push({ role: 'user', content: userText });
  // Answer in the caller's language, whatever the session started with.
  if (followLanguage(s, userText)) s.messages.push({ role: 'system', content: `The caller is speaking ${languageName(s)}: continue in ${languageName(s)}.` });
  const ctx = { session: s, config };
  const toolsCalled: string[] = [];
  let retried = false;
  let violations: string[] = [];
  let reply: string | null = null;

  for (let step = 0; step < MAX_STEPS && reply == null; step++) {
    const st = (await runTool(ctx, 'get_state', {})) as { next_question: TurnContext['nextQuestion'] };
    s.toolLog.pop(); // internal lookup, not a model tool call
    const sys = systemPrompt(s, { nextQuestion: st.next_question });
    let msg;
    try {
      msg = await model.complete([{ role: 'system', content: sys }, ...s.messages], TOOLS);
    } catch (e) {
      violations = [`model error: ${(e as Error).message}`];
      break;
    }
    if (msg.tool_calls?.length) {
      s.messages.push(msg);
      for (const call of msg.tool_calls) {
        let args: unknown = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        const result = await runTool(ctx, call.function.name, args);
        toolsCalled.push(call.function.name);
        s.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    const text = (msg.content ?? '').trim();
    const g = guardReply(s, text, sys);
    if (g.ok && text) { reply = text; s.messages.push({ role: 'assistant', content: text }); break; }
    violations = g.violations.length ? g.violations : ['empty reply'];
    if (retried) break;
    retried = true;
    // Ask the model to fix it once; the correction note is not shown to the caller.
    s.messages.push({ role: 'assistant', content: text });
    s.messages.push({ role: 'system', content: `Your last reply was not sent to the caller because: ${violations.join('; ')}. Rewrite it using only numbers and the verdict from tool results.` });
  }

  let fallback = false;
  if (reply == null) {
    fallback = true;
    reply = await fallbackReply(s, config);
    s.messages.push({ role: 'assistant', content: reply });
  }
  return { reply, state: deriveState(s), progress: progress(s), guard: { retried, fallback, violations: reply && !fallback ? [] : violations }, toolsCalled };
}
