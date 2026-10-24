// Live persona eval (costs a few cents): Astra runs the conversation; a second Astra plays an older homeowner.
//   LIVE_AI=1 npx vitest run test/persona.eval.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { askText, text } from '@hpr/core/ai/provider';
import { newSession } from '@hpr/agent';
import { initRuntime } from '../../shared/runtime';
import { handleTurn, startConversation } from '../src/agent';
import { defaultModel } from '../src/model';

const LIVE = process.env.LIVE_AI === '1';

const PERSONAS = {
  'B-04 (single-pipe, oil)': {
    facts: `You are Helga, 74, a polite but slightly hesitant homeowner in a semi-detached house near Munich, postcode 85221.
Built "in the eighties" (1987 if pressed). About 160 square metres heated. Heating oil, about 2,500 litres a year.
Radiators everywhere. Three people live there. The boiler makes the hot water too. You don't know the boiler's age or any renovations.
Your son told you the heating is a "one-pipe system" (single-pipe). No wood stove, no solar, no unused rooms, no oil tank removal plans, no planned changes.
You own the house. You'd like to switch within six months. Your husband decides with you and is involved.
You agree to share your data and want a call: name "Helga Berger", phone "0151 2345678", mornings.`,
    expectVerdict: 'yellow',
  },
  'B-02 (underfloor, wood stove)': {
    facts: `You are Peter, 71, a friendly homeowner in a detached house, postcode 82131. Built 2005. 180 square metres.
Natural gas, 15,500 kilowatt hours last year. Underfloor heating. Three people. The boiler also makes hot water.
The boiler is about 15 years old. No renovations. You use a wood stove all winter and have solar panels for hot water. No unused rooms, no PV.
You own the house, want to switch as soon as possible, all decision-makers involved. You agree to share data and want a call:
name "Peter Lang", phone "0170 1112223", afternoons.`,
    expectVerdict: 'green',
  },
};

const HOMEOWNER_RULES = `Reply as this person in ONE or TWO short spoken sentences, in English. Answer only what was asked, sometimes vaguely
("in the eighties", "about 2,500 litres"). Once during the call ask "Why do you need that?" and once ask the assistant to repeat.
If you don't know something, say so. Never invent facts that are not in your description. If the assistant says goodbye, reply "Goodbye."`;

describe.skipIf(!LIVE)('live persona conversations', () => {
  const { toolConfig } = initRuntime();
  const config = { ...toolConfig, reportsDir: mkdtempSync(join(tmpdir(), 'persona-')) };

  for (const [name, p] of Object.entries(PERSONAS)) {
    it(name, async () => {
      const s = newSession('persona-' + Date.now(), 'voice', 'en');
      const model = defaultModel();
      const transcript: string[] = [];
      let assistant = startConversation(s);
      let turns = 0;
      let fallbacks = 0;
      let multiQuestion = 0;
      const t0 = Date.now();
      while (!s.flags.finished && turns < 45) {
        transcript.push(`ASSISTANT: ${assistant}`);
        if ((assistant.match(/\?/g) ?? []).length > 1) multiQuestion++;
        const user = (await askText(`${p.facts}\n\n${HOMEOWNER_RULES}`, [text(`Conversation so far:\n${transcript.slice(-8).join('\n')}\n\nYour reply:`)])).trim();
        transcript.push(`HOMEOWNER: ${user}`);
        const r = await handleTurn(s, user, model, config);
        if (r.guard.fallback) fallbacks++;
        assistant = r.reply;
        turns++;
      }
      transcript.push(`ASSISTANT: ${assistant}`);
      const assessed = [...s.toolLog].reverse().find((t) => t.tool === 'assess_building')?.result as { verdict: string; heat_load: { best_kw: number } } | undefined;
      console.log(`\n===== ${name}: ${turns} turns, ${Math.round((Date.now() - t0) / 1000)} s, verdict ${assessed?.verdict} (${assessed?.heat_load.best_kw} kW), guard fallbacks ${fallbacks}, multi-question turns ${multiQuestion}, finished ${s.flags.finished}, lead ${s.leadId}\n${transcript.join('\n')}`);
      expect(assessed?.verdict).toBe(p.expectVerdict);
    }, 900_000);
  }
});
