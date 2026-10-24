// Deterministic stand-in for Astra: follows the system-prompt rules with simple logic, so the orchestrator loop,
// tools, guard and HTTP API can be tested without an LLM.
import type { ChatMessage, Tool } from '@hpr/agent';
import type { AssistantMessage, ModelClient } from '../src/model';

let n = 0;
const call = (name: string, args: unknown = {}): AssistantMessage => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${++n}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

export class RuleModel implements ModelClient {
  public badRepliesLeft = 0;
  async complete(messages: ChatMessage[], _tools: Tool[]): Promise<AssistantMessage> {
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    const userText = String(messages[lastUserIdx].content);
    const since = messages.slice(lastUserIdx + 1);
    const calls = since.flatMap((m) => (m.role === 'assistant' && m.tool_calls ? m.tool_calls.map((c) => c.function.name) : []));
    const results = since.filter((m) => m.role === 'tool').map((m) => JSON.parse(String(m.content)));
    const states = results.filter((r) => r && 'state' in r && 'next_question' in r);

    if (calls.length === 0) return call('get_state');
    const first = states[0];
    const acted = calls.length > 1;
    if (!acted) {
      switch (first.state) {
        case 'GREETING': return call('start_assessment');
        case 'LOCATION': return /^(en|english|de|deutsch|german)$/i.test(userText.trim())
          ? call('set_language', { lang: /^(en|english)$/i.test(userText.trim()) ? 'en' : 'de' })
          : call('lookup_location', { postcode: userText });
        case 'MUST_HAVE': case 'DEEPEN': return call('update_profile', { answers: [{ slot: first.next_question.slot, value: userText }] });
        case 'CONFIRM': return call('confirm_details', { confirmed: true });
        case 'RESULT': return call('assess_building');
        case 'SALES_QUESTIONS': return /no|skip/i.test(userText) || !first.next_question ? call('mark_sales_questions_done') : call('update_profile', { answers: [{ slot: first.next_question.slot, value: userText }] });
        case 'CONSENT_CONTACT': return call('record_consent', { share: !/^no/i.test(userText), contact: false });
        default: break;
      }
    }
    if (calls.at(-1) === 'assess_building') return call('estimate_costs');
    if (calls.at(-1) === 'estimate_costs') return call('deliver_result');
    if (calls.at(-1) === 'record_consent' && results.at(-1)?.consent?.share !== undefined) return call('finish_session');
    if (calls.at(-1) !== 'get_state' || states.length < 2) return call('get_state');

    // Reply.
    if (this.badRepliesLeft > 0) { this.badRepliesLeft--; return { role: 'assistant', content: 'You will save exactly 9999 euros, guaranteed.' }; }
    const fin = results.find((r) => r && 'closing_statement' in r);
    if (fin) return { role: 'assistant', content: fin.closing_statement };
    const assessed = results.find((r) => r && 'verdict' in r && 'areas' in r);
    const costs = results.find((r) => r && 'running_costs' in r);
    const next = states.at(-1).next_question?.question ?? 'Thank you.';
    if (assessed) return { role: 'assistant', content: `Your result is ${assessed.verdict}. ${assessed.headline} Heat pump about ${costs?.running_costs?.heat_pump_eur_per_year} euros a year. ${next}` };
    return { role: 'assistant', content: next };
  }
}
