// Guard on every assistant message before it reaches the caller:
//  - numbers must come from tool results, the caller's own words or the system prompt (or be tiny counts)
//  - a traffic-light word must match the last assess_building verdict
//  - no pressure phrases, no requests for bank/ID data
import type { Session } from '@hpr/agent';

const NUM = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

/** All readings of a number token ("2,043" → 2043; "9,5" → 9.5; "1.100" → 1100 or 1.1). */
export function readings(tok: string): number[] {
  // "2,043" / "2.043" (groups of three) are thousands in both languages; "9,5" / "9.5" are decimals.
  if (/^\d{1,3}([.,]\d{3})+$/.test(tok)) return [Number(tok.replace(/[.,]/g, ''))];
  const n = Number(tok.replace(',', '.'));
  return Number.isFinite(n) ? [n] : [];
}

export function numbersIn(text: string): number[] {
  return (text.match(NUM) ?? []).flatMap(readings);
}

function allowedNumbers(s: Session, extraText: string): Set<number> {
  const allowed = new Set<number>();
  // Tool values may be said rounded (2042.86 → 2043, 9.46 → 9.5); the caller's numbers only as given.
  const add = (t: string) => numbersIn(t).forEach((n) => { allowed.add(n); allowed.add(Math.round(n)); allowed.add(Math.round(n * 10) / 10); });
  s.toolLog.forEach((t) => add(JSON.stringify(t.result)));
  s.messages.filter((m) => m.role === 'user').forEach((m) => add(String(m.content)));
  add(extraText);
  return allowed;
}

// Traffic-light words in every supported language (de, en, fr, it, es, nl, pl, pt).
const VERDICT_WORDS: Record<string, RegExp> = {
  green: /(?<![\p{L}])(green|grün|gruen|vert|verte|verde|groen|zielon\p{L}*)(?![\p{L}])/iu,
  yellow: /(?<![\p{L}])(yellow|gelb|jaune|giallo|gialla|amarillo|amarilla|geel|żółt\p{L}*|amarelo|amarela)(?![\p{L}])/iu,
  red: /(?<![\p{L}])(red|rot|rouge|rosso|rossa|rojo|roja|rood|czerwon\p{L}*|vermelho|vermelha)(?![\p{L}])/iu,
};
const PRESSURE = /\b(only today|last chance|act now|limited time|nur heute|letzte chance|sofort zugreifen)\b/i;
const SENSITIVE_ASK = /\b(iban|bank (details|account)|credit card|card number|password|passwort|kontonummer|kreditkarte|date of birth|geburtsdatum|how old are you|wie alt sind sie|your income|ihr einkommen)\b/i;

export type GuardResult = { ok: boolean; violations: string[] };

export function guardReply(s: Session, text: string, systemText = ''): GuardResult {
  const violations: string[] = [];
  const allowed = allowedNumbers(s, systemText);
  for (const tok of text.match(NUM) ?? []) {
    const rs = readings(tok);
    if (rs.every((n) => n <= 12)) continue; // small counts ("two more questions")
    if (!rs.some((n) => allowed.has(n))) violations.push(`number not from a tool or the caller: ${tok}`);
  }
  const last = [...s.toolLog].reverse().find((t) => t.tool === 'assess_building')?.result as { verdict?: string } | undefined;
  for (const [v, re] of Object.entries(VERDICT_WORDS)) {
    if (re.test(text) && (!last?.verdict || last.verdict !== v)) violations.push(`verdict word "${v}" without a matching assessment`);
  }
  if (PRESSURE.test(text)) violations.push('pressure phrase');
  if (SENSITIVE_ASK.test(text) && !/never|nie|niemals|won.?t|nicht/i.test(text)) violations.push('asks for sensitive data');
  return { ok: violations.length === 0, violations };
}
