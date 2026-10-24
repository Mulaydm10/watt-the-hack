// What the homeowner hears at the end (spec §6). Templates only state what the tier supports.
import type { Assessment } from '@hpr/core/engine/types';
import type { VisitDecision } from '@hpr/core/sales/visitDecision';
import type { PathToGreen } from '@hpr/core/engine/pathToGreen';
import type { Lang } from './slots';

export type OutcomeKey = 'green_A' | 'green_B' | 'yellow_unknowns' | 'yellow_contradictions' | 'obstacle' | 'red' | 'out_of_area' | 'not_enough_data' | 'no_consent';

export type OutcomeConfig = { callbackPromise: Record<Lang, string> };
export const DEFAULT_OUTCOME_CONFIG: OutcomeConfig = {
  // Placeholder until nuuEnergy confirms the promise per tier.
  callbackPromise: { en: 'as soon as possible, usually within two working days', de: 'so bald wie möglich, meist innerhalb von zwei Werktagen' },
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

export function outcomeText(key: OutcomeKey, lang: Lang, ctx: { a: Assessment; d: VisitDecision | null; path?: PathToGreen; ref?: string; cfg?: OutcomeConfig }): string {
  const cfg = ctx.cfg ?? DEFAULT_OUTCOME_CONFIG;
  const open = ctx.a.flags.unknowns.slice(0, 2).map((u) => u.title.toLowerCase()).join(lang === 'de' ? ' und ' : ' and ');
  const contra = ctx.a.flags.contradictions[0]?.title.toLowerCase() ?? '';
  const obstacle = ctx.a.flags.obstacles[0]?.title ?? '';
  const blocker = ctx.path?.blockers[0] ?? '';
  const ref = ctx.ref ? (lang === 'de' ? ` Ihre Referenz: ${ctx.ref}.` : ` Your reference is ${ctx.ref}.`) : '';
  const closing = lang === 'de'
    ? ' Die Beratung ist kostenlos und unverbindlich. Wichtig: Förderung immer vor der Auftragsvergabe beantragen. Sie können der Nutzung Ihrer Daten für Werbung jederzeit widersprechen.'
    : ' The check is free and without obligation. Important: apply for the subsidy before you place an order. You can object to the use of your data for marketing at any time.';
  const t: Record<OutcomeKey, Record<Lang, string>> = {
    green_A: {
      en: `Good news: from what you told me, a heat pump very likely suits your home. One of our planning team will call you ${cfg.callbackPromise.en} to arrange the free visit by our heating master.`,
      de: `Gute Nachricht: Nach Ihren Angaben passt eine Wärmepumpe sehr wahrscheinlich zu Ihrem Haus. Jemand aus unserem Planungsteam ruft Sie ${cfg.callbackPromise.de} an, um den kostenlosen Termin mit unserem Heizungsbaumeister zu vereinbaren.`,
    },
    green_B: {
      en: `It looks promising. The next step is a short phone call, about 30 minutes, with our technical planning team. They will call you ${cfg.callbackPromise.en}.`,
      de: `Das sieht vielversprechend aus. Der nächste Schritt ist ein kurzes Telefonat, etwa 30 Minuten, mit unserem technischen Planungsteam. Es ruft Sie ${cfg.callbackPromise.de} an.`,
    },
    yellow_unknowns: {
      en: `It may well work, but a few things can't be told from here${open ? `, for example ${open}` : ''}. That's normal. Our planning team will call you for a short technical chat; photos will make that call even quicker.`,
      de: `Es kann gut passen, aber einiges lässt sich von hier nicht sagen${open ? `, zum Beispiel ${open}` : ''}. Das ist normal. Unser Planungsteam ruft Sie für ein kurzes technisches Gespräch an; Fotos machen es noch schneller.`,
    },
    yellow_contradictions: {
      en: `Some numbers don't quite fit together${contra ? `: ${contra}` : ''}. Could you check your bill when you have a moment? I've sent you a link; once that's clear, our team will get in touch.`,
      de: `Einige Angaben passen noch nicht ganz zusammen${contra ? `: ${contra}` : ''}. Könnten Sie bei Gelegenheit Ihre Rechnung prüfen? Ich habe Ihnen einen Link geschickt; danach meldet sich unser Team.`,
    },
    obstacle: {
      en: `There is one thing that needs a closer look: ${obstacle.toLowerCase()}. It does not rule a heat pump out. A technician checks the options, for example larger end radiators or a smaller heat pump with a heating rod. Our team can talk you through them by phone.`,
      de: `Eine Sache muss genauer angeschaut werden: ${obstacle}. Das schließt eine Wärmepumpe nicht aus. Ein Techniker prüft die Möglichkeiten, zum Beispiel größere Heizkörper am Ende oder eine kleinere Wärmepumpe mit Heizstab. Unser Team erklärt sie Ihnen gern am Telefon.`,
    },
    red: {
      en: `To be honest, with what we know now a heat pump isn't a good fit${obstacle ? `, because of ${obstacle.toLowerCase()}` : ''}.${blocker ? ` That could change: ${blocker}` : ''} I'll send you our guide on insulation and subsidies, and you're welcome to check again later.`,
      de: `Ehrlich gesagt passt eine Wärmepumpe nach heutigem Stand nicht gut${obstacle ? `, wegen: ${obstacle}` : ''}.${blocker ? ` Das kann sich ändern: ${blocker}` : ''} Ich schicke Ihnen unseren Ratgeber zu Dämmung und Förderung; Sie können gern später erneut prüfen.`,
    },
    out_of_area: {
      en: 'Thank you. Your home is outside the area where our team works, so we can\'t send an expert. Here is your free first assessment anyway, and a tip: look for a certified heat-pump installer near you.',
      de: 'Vielen Dank. Ihr Haus liegt außerhalb unseres Einsatzgebiets, daher können wir keinen Experten schicken. Hier ist trotzdem Ihre kostenlose Ersteinschätzung, und ein Tipp: Suchen Sie einen zertifizierten Wärmepumpen-Installateur in Ihrer Nähe.',
    },
    not_enough_data: {
      en: 'I can\'t give you a reliable answer yet without your yearly energy use or the size of the home. Would you like to continue later, or have our team call you to help?',
      de: 'Ohne Ihren Jahresverbrauch oder die Größe des Hauses kann ich noch keine verlässliche Antwort geben. Möchten Sie später weitermachen, oder soll unser Team Sie anrufen?',
    },
    no_consent: {
      en: 'Thank you. As you prefer, we won\'t share anything with our team. You can come back and continue any time.',
      de: 'Vielen Dank. Wie gewünscht geben wir nichts an unser Team weiter. Sie können jederzeit wiederkommen.',
    },
  };
  return t[key][lang] + ref + (key === 'no_consent' || key === 'out_of_area' ? '' : closing);
}
