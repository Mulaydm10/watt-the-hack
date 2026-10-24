// Follow the caller's language (German, English, French, Italian, Spanish, Dutch, Polish, Portuguese), both ways,
// mid-call. Fixed texts exist in de/en (s.lang); for other languages the model translates them faithfully (s.speak).
// Deterministic word-count heuristic; needs a clear signal so a single "ok"/"ja" never flips the language.
import { setSlot, type Session } from '@hpr/agent';

export const LANGS = {
  de: { name: 'German', words: ['ich', 'wir', 'ja', 'nein', 'das', 'ist', 'und', 'nicht', 'bitte', 'danke', 'gerne', 'haben', 'haus', 'heizung', 'wohnung', 'weiß', 'keine', 'genau', 'ungefähr', 'jahr', 'liter', 'sprechen', 'deutsch', 'guten', 'hallo'] },
  en: { name: 'English', words: ['i', 'we', 'yes', 'no', 'the', 'is', 'and', 'not', 'please', 'thanks', 'have', 'house', 'heating', 'home', 'know', 'about', 'year', 'litres', 'built', 'speak', 'english', 'hello', 'sure', 'okay'] },
  fr: { name: 'French', words: ['je', 'nous', 'oui', 'non', 'le', 'la', 'est', 'et', 'pas', "s'il", 'merci', 'maison', 'chauffage', 'avons', 'ai', 'sais', 'environ', 'année', 'parler', 'français', 'bonjour', 'avec', 'une'] },
  it: { name: 'Italian', words: ['io', 'noi', 'sì', 'si', 'no', 'il', 'la', 'è', 'e', 'non', 'grazie', 'casa', 'riscaldamento', 'abbiamo', 'ho', 'so', 'circa', 'anno', 'parlare', 'italiano', 'buongiorno', 'con', 'una'] },
  es: { name: 'Spanish', words: ['yo', 'nosotros', 'sí', 'no', 'el', 'la', 'es', 'y', 'gracias', 'casa', 'calefacción', 'tenemos', 'tengo', 'sé', 'aproximadamente', 'año', 'hablar', 'español', 'hola', 'con', 'una', 'por', 'favor'] },
  nl: { name: 'Dutch', words: ['ik', 'wij', 'we', 'ja', 'nee', 'het', 'de', 'is', 'en', 'niet', 'alstublieft', 'dank', 'huis', 'verwarming', 'hebben', 'weet', 'ongeveer', 'jaar', 'spreken', 'nederlands', 'hallo', 'met', 'een'] },
  pl: { name: 'Polish', words: ['ja', 'my', 'tak', 'nie', 'jest', 'i', 'proszę', 'dziękuję', 'dom', 'ogrzewanie', 'mamy', 'mam', 'wiem', 'około', 'rok', 'mówić', 'polsku', 'dzień', 'dobry', 'z', 'jestem'] },
  pt: { name: 'Portuguese', words: ['eu', 'nós', 'sim', 'não', 'o', 'a', 'é', 'e', 'obrigado', 'obrigada', 'casa', 'aquecimento', 'temos', 'tenho', 'sei', 'cerca', 'ano', 'falar', 'português', 'olá', 'com', 'uma'] },
} as const;
export type SpokenLang = keyof typeof LANGS;

const tokenize = (t: string) => t.toLowerCase().match(/[\p{L}']+/gu) ?? [];

const EXPLICIT: [RegExp, SpokenLang][] = [
  [/\b(auf deutsch|deutsch bitte|in german)\b/i, 'de'], [/\b(in english|english please|auf englisch)\b/i, 'en'],
  [/\b(en français|in french|français)\b/i, 'fr'], [/\b(in italiano|in italian|italiano)\b/i, 'it'],
  [/\b(en español|in spanish|español)\b/i, 'es'], [/\b(in het nederlands|in dutch|nederlands)\b/i, 'nl'],
  [/\b(po polsku|in polish)\b/i, 'pl'], [/\b(em português|in portuguese|português)\b/i, 'pt'],
];

export function detectLanguage(text: string): SpokenLang | null {
  for (const [re, l] of EXPLICIT) if (re.test(text)) return l;
  const toks = tokenize(text);
  if (toks.length === 0) return null;
  const scores = (Object.keys(LANGS) as SpokenLang[]).map((l) => {
    let n = toks.filter((t) => (LANGS[l].words as readonly string[]).includes(t)).length;
    if (l === 'de' && /[äöüß]/i.test(text)) n += 1;
    if (l === 'pl' && /[ąćęłńśźż]/i.test(text)) n += 2;
    if (l === 'pt' && /[ãõç]/i.test(text)) n += 1;
    if (l === 'es' && /[ñ¿¡]/i.test(text)) n += 2;
    return [l, n] as const;
  }).sort((a, b) => b[1] - a[1]);
  const [[best, top], [, second]] = scores;
  return top >= 2 && top >= second * 2 ? best : null;
}

/** Switch the session language if the caller clearly speaks another one. Returns true when it changed. */
export function followLanguage(s: Session, text: string): boolean {
  const l = detectLanguage(text);
  const current = (s.speak ?? s.lang) as SpokenLang;
  if (!l || l === current) {
    if (l && !s.profile.slots.lang) setSlot(s.profile, 'lang', { value: l === 'de' ? 'de' : 'en' });
    return false;
  }
  s.speak = l;
  s.lang = l === 'de' ? 'de' : 'en'; // fixed texts: German for German, English as the base for every other language
  setSlot(s.profile, 'lang', { value: s.lang });
  return true;
}

export const languageName = (s: Session) => LANGS[(s.speak ?? s.lang) as SpokenLang]?.name ?? 'German';
