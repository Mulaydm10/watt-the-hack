import { describe, expect, it, vi } from 'vitest';
import evalSet from '../data/buildings_eval.json';
import { assess } from '../engine/assess';
import type { Building } from '../engine/types';

const askText = vi.fn();
vi.mock('./provider', () => ({ askText: (...a: unknown[]) => askText(...a), text: (t: string) => ({ type: 'text', text: t }) }));
const { explainPlainly, engineFacts } = await import('./explain');

const a = assess((evalSet as Building[])[1]); // B-05

describe('plain-language rephrase guard', () => {
  it('passes text that only reuses engine numbers', async () => {
    askText.mockResolvedValueOnce(`Your home is yellow for now. We estimate ${a.heatLoad.bestKw} kW, and gas costs you €${a.costs!.currentEur!.toLocaleString('en-US')} a year.`);
    await expect(explainPlainly(a)).resolves.toMatch(/yellow/);
  });
  it('rejects an invented number', async () => {
    askText.mockResolvedValueOnce('You would save €5,000 a year.');
    await expect(explainPlainly(a)).rejects.toThrow(/introduced numbers/);
  });
  it('rejects a changed verdict', async () => {
    askText.mockResolvedValueOnce('Good news: your home is green.');
    await expect(explainPlainly(a)).rejects.toThrow(/changed the verdict/);
  });
  it('feeds the LLM only engine facts', () => {
    expect(engineFacts(a)).toMatch(/Verdict: yellow/);
  });
});
