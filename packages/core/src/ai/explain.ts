import type { Assessment } from '../engine/types';
import { askText, text } from './provider';

const SYSTEM = `You rewrite a heat-pump readiness assessment for a homeowner with no technical background.
Rules:
- Only rephrase the facts you are given. Do not add, change, round or invent any number.
- Do not change the verdict (green/yellow/red) or soften/strengthen it.
- Keep what is unknown clearly unknown, and keep every technician check.
- 4-6 short sentences, warm and plain English, no jargon (explain JAZ as "efficiency" if you mention it). No headings, no lists.`;

/** The engine's own facts, as the only input the LLM sees. */
export function engineFacts(a: Assessment): string {
  const c = a.costs;
  return [
    `Verdict: ${a.verdict} (confidence ${a.confidence}). ${a.headline}`,
    ...a.verdictReasons.map((r) => `Reason: ${r}`),
    a.heatLoad.bestKw != null ? `Estimated heat load: ${a.heatLoad.bestKw} kW.` : 'Heat load could not be estimated.',
    c && c.currentEur != null ? `Yearly cost: heat pump €${c.heatPumpEur}${c.heatPumpEurWorst !== c.heatPumpEur ? `–€${c.heatPumpEurWorst}` : ''} vs ${c.currentLabel} €${c.currentEur}.` : '',
    ...a.flags.obstacles.map((f) => `Obstacle: ${f.title}. ${f.detail}`),
    ...a.flags.unknowns.map((f) => `Unknown: ${f.title}.`),
    ...a.flags.contradictions.map((f) => `Contradiction: ${f.title}.`),
    `Technician must check: ${a.flags.technicianChecks.map((t) => t.title).join('; ')}.`,
  ].filter(Boolean).join('\n');
}

const numbersIn = (s: string) => (s.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(\.\d+)?/g) ?? []).map(Number);

/**
 * Rephrase the engine's reasons. Guard: if the text contains any number that is not in the
 * engine's facts, it is rejected, so the LLM can never introduce a figure.
 */
export async function explainPlainly(a: Assessment): Promise<string> {
  const facts = engineFacts(a);
  const out = (await askText(SYSTEM, [text(facts)])).trim();
  const allowed = new Set(numbersIn(facts));
  const invented = numbersIn(out).filter((n) => !allowed.has(n));
  if (invented.length) throw new Error(`rejected: the AI introduced numbers not from the engine (${invented.join(', ')})`);
  if (!new RegExp(`\\b${a.verdict}\\b`, 'i').test(out) && /\b(green|yellow|red)\b/i.test(out)) {
    throw new Error('rejected: the AI changed the verdict');
  }
  return out;
}
