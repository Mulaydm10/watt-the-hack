// Follow the caller's language: if they speak German or English, the session switches to it (both ways).
// Deterministic word-count heuristic; needs a clear signal so single words like "ja"/"ok" don't flip it by accident.
import { setSlot, type Session } from '@hpr/agent';

const DE = /\b(ich|wir|ja|nein|das|ist|und|nicht|bitte|danke|gerne|haben|haus|heizung|wohnung|weiß|keine|ahnung|genau|ungefähr|jahr|liter|baujahr|sprechen|deutsch|guten|tag|hallo)\b/gi;
const EN = /\b(i|we|yes|no|the|is|and|not|please|thanks|have|house|heating|home|know|about|year|litres|liters|built|speak|english|hello|sure|okay)\b/gi;

export function detectLanguage(text: string): 'de' | 'en' | null {
  if (/\b(auf deutsch|deutsch bitte|lieber deutsch|german please|in german)\b/i.test(text)) return 'de';
  if (/\b(in english|english please|auf englisch|lieber englisch)\b/i.test(text)) return 'en';
  const de = (text.match(DE) ?? []).length + (/[äöüß]/i.test(text) ? 1 : 0);
  const en = (text.match(EN) ?? []).length;
  if (de >= 2 && de > en * 2) return 'de';
  if (en >= 2 && en > de * 2) return 'en';
  return null;
}

/** Switch the session language if the caller clearly speaks the other one. Returns true when it changed. */
export function followLanguage(s: Session, text: string): boolean {
  const l = detectLanguage(text);
  if (!l || l === s.lang) {
    if (l && !s.profile.slots.lang) setSlot(s.profile, 'lang', { value: l });
    return false;
  }
  s.lang = l;
  setSlot(s.profile, 'lang', { value: l });
  return true;
}
