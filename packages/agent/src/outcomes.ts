// What the homeowner hears at the end (spec §6). Templates only state what the tier supports.
// Dynamic: the callback deadline is computed from working days per outcome (skipping weekends and listed holidays),
// the caller's preferred call time is added, and every template can be overridden per language in config
// (services/data/outcomes.json, editable via GET/PUT /settings/outcomes) without code changes.
import type { Assessment } from '@hpr/core/engine/types';
import type { VisitDecision } from '@hpr/core/sales/visitDecision';
import type { PathToGreen } from '@hpr/core/engine/pathToGreen';
import type { Lang } from './slots';

export type OutcomeKey = 'green_A' | 'green_B' | 'yellow_unknowns' | 'yellow_contradictions' | 'obstacle' | 'red' | 'out_of_area' | 'not_enough_data' | 'no_consent';
export const OUTCOME_KEYS: OutcomeKey[] = ['green_A', 'green_B', 'yellow_unknowns', 'yellow_contradictions', 'obstacle', 'red', 'out_of_area', 'not_enough_data', 'no_consent'];

export type OutcomeRule = {
  /** Working days until nuuEnergy calls back; null = no callback promised for this outcome. */
  callbackWorkingDays: number | null;
  /** Optional replacement text per language. Placeholders: {callback} {ref} {open} {obstacle} {contradiction} {blocker} */
  override?: Partial<Record<Lang, string>>;
};
export type OutcomeConfig = {
  rules: Record<OutcomeKey, OutcomeRule>;
  /** ISO dates (YYYY-MM-DD) that are not working days. */
  holidays: string[];
  /** Add the standard closing (free, subsidy before order, right to object). */
  closing: boolean;
};

// Placeholders until nuuEnergy confirms its promise per outcome.
export const DEFAULT_OUTCOME_CONFIG: OutcomeConfig = {
  rules: {
    green_A: { callbackWorkingDays: 2 },
    green_B: { callbackWorkingDays: 2 },
    yellow_unknowns: { callbackWorkingDays: 3 },
    yellow_contradictions: { callbackWorkingDays: null },
    obstacle: { callbackWorkingDays: 3 },
    red: { callbackWorkingDays: null },
    out_of_area: { callbackWorkingDays: null },
    not_enough_data: { callbackWorkingDays: null },
    no_consent: { callbackWorkingDays: null },
  },
  holidays: [],
  closing: true,
};

export function outcomeKey(a: Assessment, d: VisitDecision | null, consented: boolean): OutcomeKey {
  if (d?.outOfArea) return 'out_of_area';
  if (a.heatLoad.bestKw == null) return 'not_enough_data';
  if (!consented) return 'no_consent';
  if (a.verdict === 'red') return 'red';
  if (a.flags.obstacles.length) return 'obstacle';
  if (d?.tier === 'C') return 'yellow_contradictions';
  if (a.verdict === 'green') return d?.tier === 'A' ? 'green_A' : 'green_B';
  return 'yellow_unknowns';
}

/** Date that is `days` working days after `from` (Mon–Fri, minus holidays). */
export function addWorkingDays(from: Date, days: number, holidays: string[] = []): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !holidays.includes(iso)) left--;
  }
  return d;
}

const TIME_WORDS: Record<string, Record<Lang, string>> = {
  morning: { en: 'in the morning', de: 'vormittags' },
  afternoon: { en: 'in the afternoon', de: 'nachmittags' },
  evening: { en: 'in the evening', de: 'abends' },
};

/** "by Tuesday, 27 October, in the morning" / "bis Dienstag, 27. Oktober, vormittags". */
export function callbackPhrase(lang: Lang, days: number, now: Date, holidays: string[], preferredTime?: string): string {
  const by = addWorkingDays(now, days, holidays);
  const date = by.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = preferredTime && TIME_WORDS[preferredTime] ? `, ${TIME_WORDS[preferredTime][lang]}` : '';
  return lang === 'de' ? `bis ${date}${time}` : `by ${date}${time}`;
}

export type OutcomeContext = {
  a: Assessment;
  d: VisitDecision | null;
  path?: PathToGreen;
  ref?: string;
  cfg?: OutcomeConfig;
  now?: Date;
  preferredTime?: string;
};

const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export function outcomeText(key: OutcomeKey, lang: Lang, ctx: OutcomeContext): string {
  const cfg = ctx.cfg ?? DEFAULT_OUTCOME_CONFIG;
  const rule = cfg.rules[key] ?? DEFAULT_OUTCOME_CONFIG.rules[key];
  const days = rule.callbackWorkingDays;
  const vars: Record<string, string> = {
    callback: days != null ? callbackPhrase(lang, days, ctx.now ?? new Date(), cfg.holidays, ctx.preferredTime) : '',
    ref: ctx.ref ?? '',
    open: ctx.a.flags.unknowns.slice(0, 2).map((u) => u.title.toLowerCase()).join(lang === 'de' ? ' und ' : ' and '),
    obstacle: ctx.a.flags.obstacles[0]?.title ?? '',
    contradiction: ctx.a.flags.contradictions[0]?.title.toLowerCase() ?? '',
    blocker: ctx.path?.blockers[0] ?? '',
  };
  const call = (en: string, de: string) => (days != null ? (lang === 'de' ? de : en) : '');
  const t: Record<OutcomeKey, Record<Lang, string>> = {
    green_A: {
      en: `Good news: from what you told me, a heat pump very likely suits your home. One of our planning team will call you ${vars.callback} to arrange the free visit by our heating master.`,
      de: `Gute Nachricht: Nach Ihren Angaben passt eine Wärmepumpe sehr wahrscheinlich zu Ihrem Haus. Jemand aus unserem Planungsteam ruft Sie ${vars.callback} an, um den kostenlosen Termin mit unserem Heizungsbaumeister zu vereinbaren.`,
    },
    green_B: {
      en: `It looks promising. The next step is a short phone call, about 30 minutes, with our technical planning team. They will call you ${vars.callback}.`,
      de: `Das sieht vielversprechend aus. Der nächste Schritt ist ein kurzes Telefonat, etwa 30 Minuten, mit unserem technischen Planungsteam. Es ruft Sie ${vars.callback} an.`,
    },
    yellow_unknowns: {
      en: `It may well work, but a few things can't be told from here${vars.open ? `, for example ${vars.open}` : ''}. That's normal.${call(` Our planning team will call you ${vars.callback} for a short technical chat;`, '')} photos will make that${days != null ? '' : ' next step'} even quicker.`,
      de: `Es kann gut passen, aber einiges lässt sich von hier nicht sagen${vars.open ? `, zum Beispiel ${vars.open}` : ''}. Das ist normal.${call('', ` Unser Planungsteam ruft Sie ${vars.callback} für ein kurzes technisches Gespräch an;`)} Fotos machen es noch schneller.`,
    },
    yellow_contradictions: {
      en: `Some numbers don't quite fit together${vars.contradiction ? `: ${vars.contradiction}` : ''}. Could you check your bill when you have a moment? I've sent you a link; once that's clear, our team will get in touch${call(` ${vars.callback}`, '')}.`,
      de: `Einige Angaben passen noch nicht ganz zusammen${vars.contradiction ? `: ${vars.contradiction}` : ''}. Könnten Sie bei Gelegenheit Ihre Rechnung prüfen? Ich habe Ihnen einen Link geschickt; danach meldet sich unser Team${call('', ` ${vars.callback}`)}.`,
    },
    obstacle: {
      en: `There is one thing that needs a closer look: ${vars.obstacle.toLowerCase()}. It does not rule a heat pump out. A technician checks the options, for example larger end radiators or a smaller heat pump with a heating rod.${call(` Our team will call you ${vars.callback} to talk you through them.`, '')}`,
      de: `Eine Sache muss genauer angeschaut werden: ${vars.obstacle}. Das schließt eine Wärmepumpe nicht aus. Ein Techniker prüft die Möglichkeiten, zum Beispiel größere Heizkörper am Ende oder eine kleinere Wärmepumpe mit Heizstab.${call('', ` Unser Team ruft Sie ${vars.callback} an und erklärt sie Ihnen.`)}`,
    },
    red: {
      en: `To be honest, with what we know now a heat pump isn't a good fit${vars.obstacle ? `, because of ${vars.obstacle.toLowerCase()}` : ''}.${vars.blocker ? ` That could change: ${vars.blocker}` : ''}${call(` Our team will call you ${vars.callback} to explain the options.`, '')} You're welcome to check again later.`,
      de: `Ehrlich gesagt passt eine Wärmepumpe nach heutigem Stand nicht gut${vars.obstacle ? `, wegen: ${vars.obstacle}` : ''}.${vars.blocker ? ` Das kann sich ändern: ${vars.blocker}` : ''}${call('', ` Unser Team ruft Sie ${vars.callback} an und erklärt die Möglichkeiten.`)} Sie können gern später erneut prüfen.`,
    },
    out_of_area: {
      en: "Thank you. Your home is outside the area where our team works, so we can't send an expert. Here is your free first assessment anyway, and a tip: look for a certified heat-pump installer near you.",
      de: 'Vielen Dank. Ihr Haus liegt außerhalb unseres Einsatzgebiets, daher können wir keinen Experten schicken. Hier ist trotzdem Ihre kostenlose Ersteinschätzung, und ein Tipp: Suchen Sie einen zertifizierten Wärmepumpen-Installateur in Ihrer Nähe.',
    },
    not_enough_data: {
      en: `I can't give you a reliable answer yet without your yearly energy use or the size of the home. Would you like to continue later${call(`, or have our team call you ${vars.callback} to help`, '')}?`,
      de: `Ohne Ihren Jahresverbrauch oder die Größe des Hauses kann ich noch keine verlässliche Antwort geben. Möchten Sie später weitermachen${call('', `, oder soll unser Team Sie ${vars.callback} anrufen`)}?`,
    },
    no_consent: {
      en: "Thank you. As you prefer, we won't share anything with our team. You can come back and continue any time.",
      de: 'Vielen Dank. Wie gewünscht geben wir nichts an unser Team weiter. Sie können jederzeit wiederkommen.',
    },
  };
  const body = rule.override?.[lang] ? fill(rule.override[lang]!, vars) : t[key][lang];
  const ref = ctx.ref ? (lang === 'de' ? ` Ihre Referenz: ${ctx.ref}.` : ` Your reference is ${ctx.ref}.`) : '';
  const closing = cfg.closing && key !== 'no_consent' && key !== 'out_of_area'
    ? (lang === 'de'
      ? ' Die Beratung ist kostenlos und unverbindlich. Wichtig: Förderung immer vor der Auftragsvergabe beantragen. Sie können der Nutzung Ihrer Daten für Werbung jederzeit widersprechen.'
      : ' The check is free and without obligation. Important: apply for the subsidy before you place an order. You can object to the use of your data for marketing at any time.')
    : '';
  return body.replace(/\s+/g, ' ').trim() + ref + closing;
}

/** Merge a partial config (from JSON or the settings API) onto the defaults. */
export function mergeOutcomeConfig(partial: Partial<OutcomeConfig> | undefined): OutcomeConfig {
  const rules = { ...DEFAULT_OUTCOME_CONFIG.rules };
  for (const k of OUTCOME_KEYS) if (partial?.rules?.[k]) rules[k] = { ...rules[k], ...partial.rules[k] };
  return { rules, holidays: partial?.holidays ?? DEFAULT_OUTCOME_CONFIG.holidays, closing: partial?.closing ?? DEFAULT_OUTCOME_CONFIG.closing };
}
