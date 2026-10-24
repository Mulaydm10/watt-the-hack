// Slot catalogue: every question the assistant may ask, its mode, wording (en/de), answer type and when it applies.
// Modes follow docs/AGENT_BACKEND_SPEC.md §4.6. Wording is a draft until the teammate's final text arrives;
// slot ids are stable, so only the text changes.
import type { Profile } from './profile';

export type Mode = 'ASK' | 'ADAPT' | 'PHOTO' | 'TECH' | 'SALES' | 'CONTACT';
export type Lang = 'en' | 'de';
export type AnswerType = 'postcode' | 'year' | 'number' | 'enum' | 'multi' | 'boolean' | 'consumption' | 'text' | 'photo';
export type Group = 'home' | 'building' | 'heating' | 'distribution' | 'hotwater' | 'feasibility' | 'project' | 'contact';

export type Option = { value: string; en: string; de: string };

export type Slot = {
  id: string;
  group: Group;
  mode: Mode;
  type: AnswerType;
  question: Record<Lang, string>;
  /** Why we ask (said when the caller asks "why do you need that?"). */
  why: Record<Lang, string>;
  options?: Option[];
  min?: number;
  max?: number;
  /** Applies only when this returns true (skip logic). */
  when?: (p: Profile) => boolean;
  /** ADAPT: candidate values tried in the assessment; asked only if they change the outcome. */
  candidates?: unknown[];
  /** ADAPT: ask whenever `when` holds (permissions etc.), without the decisive test. */
  askWhenApplicable?: boolean;
  /** Lower = earlier. */
  order: number;
};

const yn: Option[] = [
  { value: 'yes', en: 'Yes', de: 'Ja' },
  { value: 'no', en: 'No', de: 'Nein' },
];

const v = (p: Profile, id: string) => p.slots[id]?.value;
const known = (p: Profile, id: string) => p.slots[id] != null && p.slots[id].value !== 'unknown';
const hasRadiators = (p: Profile) => !['underfloor', 'wall', 'ceiling'].includes(String(v(p, 'heat_distribution') ?? 'radiators'));

export const SLOTS: Slot[] = [
  // ---------- ASK: always (≈ 9 spoken questions) ----------
  { id: 'lang', group: 'contact', mode: 'ASK', type: 'enum', order: 0,
    question: { en: 'Would you like to talk in English or German?', de: 'Möchten Sie lieber Deutsch oder Englisch sprechen?' },
    why: { en: 'So I can speak your language.', de: 'Damit ich in Ihrer Sprache spreche.' },
    options: [{ value: 'de', en: 'German', de: 'Deutsch' }, { value: 'en', en: 'English', de: 'Englisch' }] },
  { id: 'postcode', group: 'home', mode: 'ASK', type: 'postcode', order: 1,
    question: { en: 'What is the postcode of the house? Five digits are enough.', de: 'Wie lautet die Postleitzahl des Hauses?' },
    why: { en: 'To check that our team works in your area and which local subsidies apply. It does not affect whether a heat pump suits your home.', de: 'Damit wir prüfen, ob unser Team in Ihrer Region arbeitet und welche Förderung gilt.' } },
  { id: 'house_type', group: 'home', mode: 'ASK', type: 'enum', order: 2,
    question: { en: 'What kind of home is it: a detached house, semi-detached, terraced, or an apartment?', de: 'Was für ein Gebäude ist es: freistehendes Haus, Doppelhaushälfte, Reihenhaus oder Wohnung?' },
    why: { en: 'It tells us about the space for an outdoor unit and whether others need to agree.', de: 'Das sagt uns etwas über den Platz für das Außengerät und ob andere zustimmen müssen.' },
    options: [
      { value: 'detached', en: 'Detached house', de: 'Freistehendes Haus' },
      { value: 'semi', en: 'Semi-detached', de: 'Doppelhaushälfte' },
      { value: 'terraced', en: 'Terraced house', de: 'Reihenhaus' },
      { value: 'apartment', en: 'Apartment', de: 'Wohnung' },
      { value: 'other', en: 'Other', de: 'Anderes' },
    ] },
  { id: 'construction_year', group: 'building', mode: 'ASK', type: 'year', order: 3, min: 1800, max: 2030,
    question: { en: 'Roughly when was the house built? The decade is enough.', de: 'Wann wurde das Haus ungefähr gebaut? Das Jahrzehnt reicht.' },
    why: { en: 'It gives a first idea of the building standard. Age alone never rules a heat pump out.', de: 'Es gibt einen ersten Hinweis auf den Baustandard. Das Alter allein schließt nichts aus.' } },
  { id: 'floor_area_m2', group: 'building', mode: 'ASK', type: 'number', order: 4, min: 15, max: 5000,
    question: { en: 'About how many square metres do you heat?', de: 'Wie viele Quadratmeter heizen Sie ungefähr?' },
    why: { en: 'Together with your energy use it shows how much heat the house needs.', de: 'Zusammen mit dem Verbrauch zeigt es, wie viel Wärme das Haus braucht.' } },
  { id: 'energy_carrier', group: 'heating', mode: 'ASK', type: 'enum', order: 5,
    question: { en: 'What do you heat with today: gas, oil, liquid gas, district heating, electricity, wood or pellets?', de: 'Womit heizen Sie heute: Gas, Öl, Flüssiggas, Fernwärme, Strom, Holz oder Pellets?' },
    why: { en: 'To read your consumption correctly and compare costs.', de: 'Um Ihren Verbrauch richtig zu lesen und Kosten zu vergleichen.' },
    options: [
      { value: 'gas', en: 'Natural gas', de: 'Erdgas' },
      { value: 'oil', en: 'Heating oil', de: 'Heizöl' },
      { value: 'lpg', en: 'Liquid gas (LPG)', de: 'Flüssiggas' },
      { value: 'district', en: 'District heating', de: 'Fernwärme' },
      { value: 'electric', en: 'Electricity', de: 'Strom' },
      { value: 'biomass', en: 'Wood / pellets', de: 'Holz / Pellets' },
      { value: 'other', en: 'Other', de: 'Anderes' },
    ] },
  { id: 'consumption', group: 'heating', mode: 'ASK', type: 'consumption', order: 6,
    question: { en: 'How much do you use in a year? It is on your yearly bill. kWh, litres of oil or cubic metres of gas are all fine. Or I can send you a link to photograph the bill.', de: 'Wie viel verbrauchen Sie im Jahr? Das steht auf der Jahresabrechnung: kWh, Liter Öl oder Kubikmeter Gas. Oder ich schicke Ihnen einen Link für ein Foto der Rechnung.' },
    why: { en: 'Your real use is the best clue to how much heat the house needs.', de: 'Ihr echter Verbrauch ist der beste Hinweis auf den Wärmebedarf.' } },
  { id: 'heat_distribution', group: 'distribution', mode: 'ASK', type: 'enum', order: 7,
    question: { en: 'How are the rooms heated: radiators, floor heating, wall or ceiling heating, or a mix?', de: 'Wie werden die Räume beheizt: Heizkörper, Fußbodenheizung, Wand- oder Deckenheizung, oder gemischt?' },
    why: { en: 'It shows how warm the heating water must be. Lower is better for a heat pump.', de: 'Es zeigt, wie warm das Heizwasser sein muss. Niedriger ist besser für eine Wärmepumpe.' },
    options: [
      { value: 'radiators', en: 'Radiators', de: 'Heizkörper' },
      { value: 'underfloor', en: 'Floor heating', de: 'Fußbodenheizung' },
      { value: 'wall', en: 'Wall heating', de: 'Wandheizung' },
      { value: 'ceiling', en: 'Ceiling heating', de: 'Deckenheizung' },
      { value: 'mixed', en: 'A mix', de: 'Gemischt' },
    ] },
  { id: 'persons_in_household', group: 'hotwater', mode: 'ASK', type: 'number', order: 8, min: 0, max: 30,
    question: { en: 'How many people live in the home?', de: 'Wie viele Personen wohnen im Haushalt?' },
    why: { en: 'A rough guide to how much hot water you use.', de: 'Ein grober Hinweis auf Ihren Warmwasserverbrauch.' } },
  { id: 'hot_water_via_heating', group: 'hotwater', mode: 'ASK', type: 'boolean', order: 9, options: yn,
    question: { en: 'Does the same boiler also make your hot water?', de: 'Macht dieselbe Heizung auch Ihr warmes Wasser?' },
    why: { en: 'Then part of your bill is for hot water, not heating.', de: 'Dann ist ein Teil der Rechnung für Warmwasser, nicht fürs Heizen.' } },
  { id: 'boiler_age', group: 'heating', mode: 'ASK', type: 'enum', order: 10,
    question: { en: 'How old is your boiler, roughly? Or is it broken?', de: 'Wie alt ist Ihre Heizung ungefähr? Oder ist sie kaputt?' },
    why: { en: 'If it is over 20 years old, there is an extra 16% subsidy. It does not change whether a heat pump suits the house.', de: 'Ist sie über 20 Jahre alt, gibt es 16 % extra Förderung.' },
    options: [
      { value: 'broken', en: 'Broken', de: 'Kaputt' },
      { value: 'over20', en: 'Over 20 years', de: 'Über 20 Jahre' },
      { value: '10to20', en: '10 to 20 years', de: '10 bis 20 Jahre' },
      { value: 'under10', en: 'Under 10 years', de: 'Unter 10 Jahre' },
    ] },
  { id: 'renovation_status', group: 'building', mode: 'ASK', type: 'enum', order: 11,
    question: { en: 'Has anything been insulated or replaced since it was built, like windows, walls or the roof?', de: 'Wurde seit dem Bau etwas gedämmt oder erneuert, zum Beispiel Fenster, Wände oder Dach?' },
    why: { en: 'Better insulation means the house needs less heat.', de: 'Bessere Dämmung heißt weniger Wärmebedarf.' },
    options: [
      { value: 'unrenovated', en: 'Nothing', de: 'Nichts' },
      { value: 'partially', en: 'Some of it', de: 'Teilweise' },
      { value: 'fully', en: 'Most or all of it', de: 'Größtenteils oder alles' },
    ] },

  // ---------- ADAPT: only when it changes the outcome ----------
  { id: 'pipe_system', group: 'distribution', mode: 'ADAPT', type: 'enum', order: 20, when: hasRadiators,
    candidates: ['two-pipe', 'single-pipe'],
    question: { en: 'Do you know if the radiators are on a single-pipe or a two-pipe system? "Not sure" is fine.', de: 'Wissen Sie, ob die Heizkörper an einem Einrohr- oder Zweirohrsystem hängen? „Weiß nicht" ist in Ordnung.' },
    why: { en: 'In a single-pipe loop the last radiators get cooler water; a technician then takes a closer look.', de: 'Bei Einrohr bekommen die letzten Heizkörper kühleres Wasser; dann schaut ein Techniker genauer hin.' },
    options: [{ value: 'two-pipe', en: 'Two-pipe', de: 'Zweirohr' }, { value: 'single-pipe', en: 'Single-pipe', de: 'Einrohr' }] },
  { id: 'other_heat_sources', group: 'heating', mode: 'ADAPT', type: 'multi', order: 21,
    candidates: [[], ['wood stove']],
    question: { en: 'Do you also heat with something else, like a wood stove or fireplace, or have solar panels for hot water?', de: 'Heizen Sie zusätzlich, zum Beispiel mit einem Kaminofen, oder haben Sie Solarthermie für Warmwasser?' },
    why: { en: 'Then your bill shows only part of the heat the house needs.', de: 'Dann zeigt Ihre Rechnung nur einen Teil des Wärmebedarfs.' },
    options: [
      { value: 'wood stove', en: 'Wood stove / fireplace', de: 'Kaminofen' },
      { value: 'solar thermal', en: 'Solar for hot water', de: 'Solarthermie' },
      { value: 'none', en: 'Nothing else', de: 'Nichts weiter' },
    ] },
  { id: 'unused_areas', group: 'building', mode: 'ADAPT', type: 'boolean', order: 22, options: yn,
    candidates: [false, true],
    question: { en: 'Are there parts of the house you don\'t heat, like an empty top floor?', de: 'Gibt es Bereiche, die Sie nicht heizen, zum Beispiel ein leeres Dachgeschoss?' },
    why: { en: 'Unheated areas lower the real heat need.', de: 'Unbeheizte Bereiche senken den echten Wärmebedarf.' } },
  { id: 'renovation_measures', group: 'building', mode: 'ADAPT', type: 'multi', order: 23, askWhenApplicable: true,
    when: (p) => ['partially', 'fully'].includes(String(v(p, 'renovation_status'))),
    question: { en: 'What was done, and roughly when? For example new windows in 2010, roof insulated.', de: 'Was wurde gemacht und wann ungefähr? Zum Beispiel neue Fenster 2010, Dach gedämmt.' },
    why: { en: 'It helps us read your energy use correctly.', de: 'So lesen wir Ihren Verbrauch richtig.' },
    options: [
      { value: 'windows', en: 'Windows', de: 'Fenster' }, { value: 'roof', en: 'Roof', de: 'Dach' },
      { value: 'facade', en: 'Walls / facade', de: 'Fassade' }, { value: 'doors', en: 'Doors', de: 'Türen' },
      { value: 'other', en: 'Other', de: 'Anderes' },
    ] },
  { id: 'uneven_heating', group: 'distribution', mode: 'ADAPT', type: 'boolean', order: 24, options: yn, when: hasRadiators,
    candidates: [false, true],
    question: { en: 'Do all rooms get warm evenly, or are some rooms hard to heat?', de: 'Werden alle Räume gleichmäßig warm, oder sind manche schwer zu heizen?' },
    why: { en: 'Cold rooms can point to small radiators, which a technician should check.', de: 'Kalte Räume können auf zu kleine Heizkörper hinweisen.' } },
  { id: 'units_in_building', group: 'home', mode: 'ADAPT', type: 'number', order: 25, min: 1, max: 500, askWhenApplicable: true,
    when: (p) => v(p, 'house_type') === 'apartment',
    question: { en: 'How many homes are in the building?', de: 'Wie viele Wohnungen hat das Gebäude?' },
    why: { en: 'A shared heating system usually needs others to agree.', de: 'Eine gemeinsame Heizung braucht meist die Zustimmung anderer.' } },
  { id: 'approval_needed', group: 'home', mode: 'ADAPT', type: 'boolean', order: 26, options: yn, askWhenApplicable: true,
    when: (p) => v(p, 'house_type') === 'apartment' || Number(v(p, 'units_in_building') ?? 1) > 1 || v(p, 'ownership') === 'tenant',
    question: { en: 'Does a landlord, the owners\' association or a co-owner need to agree to changes to the heating?', de: 'Müssen Vermieter, Eigentümergemeinschaft oder Miteigentümer einer Änderung der Heizung zustimmen?' },
    why: { en: 'It is about permission and planning, not about how well a heat pump would work.', de: 'Es geht um Genehmigung und Planung, nicht um die Eignung.' } },
  { id: 'hot_water_system', group: 'hotwater', mode: 'ADAPT', type: 'enum', order: 27, askWhenApplicable: true,
    when: (p) => v(p, 'hot_water_via_heating') === false || v(p, 'hot_water_via_heating') === 'unknown',
    question: { en: 'How is your hot water made then: an electric heater, a separate heat-pump water heater, or something else?', de: 'Wie wird Ihr Warmwasser dann gemacht: elektrisch, mit einer Warmwasser-Wärmepumpe oder anders?' },
    why: { en: 'So we know whether your bill includes hot water.', de: 'Damit wir wissen, ob Ihre Rechnung Warmwasser enthält.' },
    options: [
      { value: 'electric', en: 'Electric heater', de: 'Elektrisch' },
      { value: 'hp_water_heater', en: 'Heat-pump water heater', de: 'Warmwasser-Wärmepumpe' },
      { value: 'central', en: 'With the heating after all', de: 'Doch über die Heizung' },
      { value: 'other', en: 'Other', de: 'Anderes' },
    ] },
  { id: 'certificate_kwh_m2a', group: 'building', mode: 'ADAPT', type: 'number', order: 28, min: 5, max: 800,
    candidates: [], // only asked if the caller mentions an energy certificate (or via document upload)
    question: { en: 'Do you have an energy certificate? If so, what energy demand does it show, in kWh per square metre?', de: 'Haben Sie einen Energieausweis? Welcher Energiebedarf steht darauf, in kWh pro Quadratmeter?' },
    why: { en: 'A useful cross-check. It never replaces your real bill.', de: 'Ein nützlicher Abgleich, ersetzt aber nie die echte Rechnung.' } },
  { id: 'pv_battery', group: 'feasibility', mode: 'ADAPT', type: 'boolean', order: 29, options: yn, askWhenApplicable: true,
    question: { en: 'Do you have solar panels for electricity, or a battery?', de: 'Haben Sie eine Photovoltaikanlage oder einen Stromspeicher?' },
    why: { en: 'Optional: it can help with running costs. A heat pump does not need it.', de: 'Optional: hilft bei den Betriebskosten, ist aber keine Voraussetzung.' } },
  { id: 'removals', group: 'feasibility', mode: 'ADAPT', type: 'multi', order: 30, askWhenApplicable: true,
    when: (p) => v(p, 'energy_carrier') === 'oil' || v(p, 'boiler_age') === 'over20',
    question: { en: 'Is there an oil tank or a chimney that would need to be removed or closed?', de: 'Gibt es einen Öltank oder einen Schornstein, der entfernt oder stillgelegt werden müsste?' },
    why: { en: 'It can add some work and cost, which our team plans in.', de: 'Das kann Aufwand und Kosten hinzufügen.' },
    options: [{ value: 'oil_tank', en: 'Oil tank', de: 'Öltank' }, { value: 'chimney', en: 'Chimney', de: 'Schornstein' }, { value: 'none', en: 'Neither', de: 'Nichts davon' }] },
  { id: 'planned_changes', group: 'hotwater', mode: 'ADAPT', type: 'text', order: 31, askWhenApplicable: true,
    question: { en: 'Do you expect changes soon, like more people living there or using more rooms?', de: 'Erwarten Sie Änderungen, zum Beispiel mehr Bewohner oder mehr genutzte Räume?' },
    why: { en: 'It can change how big the heat pump should be.', de: 'Das kann die richtige Größe ändern.' } },
  { id: 'noise_concerns', group: 'feasibility', mode: 'ADAPT', type: 'text', order: 32, askWhenApplicable: true,
    when: (p) => ['semi', 'terraced', 'apartment'].includes(String(v(p, 'house_type'))),
    question: { en: 'Are there any worries about noise or neighbours where an outdoor unit could go?', de: 'Gibt es Bedenken wegen Lärm oder Nachbarn am möglichen Platz für das Außengerät?' },
    why: { en: 'Placement and noise rules must be checked on site.', de: 'Aufstellung und Lärmschutz werden vor Ort geprüft.' } },
  { id: 'rooms', group: 'building', mode: 'ADAPT', type: 'number', order: 33, min: 1, max: 200,
    candidates: [],
    question: { en: 'How many heated rooms are there?', de: 'Wie viele beheizte Räume gibt es?' },
    why: { en: 'It helps spot rooms that might stay cold.', de: 'So erkennen wir Räume, die kalt bleiben könnten.' } },
  { id: 'flow_temperature_c', group: 'distribution', mode: 'ADAPT', type: 'number', order: 34, min: 20, max: 95, when: hasRadiators,
    candidates: [],
    question: { en: 'Do you happen to know the temperature setting of your heating water?', de: 'Wissen Sie zufällig, auf welche Vorlauftemperatur die Heizung eingestellt ist?' },
    why: { en: 'Lower water temperatures suit a heat pump better. Around 55 °C is a guide, not a hard limit.', de: 'Niedrigere Temperaturen passen besser. Etwa 55 °C ist ein Richtwert.' } },

  // ---------- PHOTO / DOC: by upload link, never typed ----------
  ...([
    ['photo_meter_cabinet', 'A photo of your electricity meter cabinet.', 'Ein Foto Ihres Zählerschranks.', 'It often needs an upgrade, which changes the price a lot.', 40],
    ['photo_outdoor', 'A photo of where an outdoor unit could go, and about how many metres it is to the neighbour\'s boundary.', 'Ein Foto vom möglichen Platz für das Außengerät und der Abstand zur Grundstücksgrenze.', 'Placement and noise are checked by the technician.', 41],
    ['photo_radiator', 'A photo where the pipes meet a radiator, or of the floor-heating manifold.', 'Ein Foto vom Heizkörperanschluss oder vom Fußbodenheizungsverteiler.', 'It helps tell single-pipe from two-pipe.', 42],
    ['photo_boiler_room', 'A photo of the heating room.', 'Ein Foto vom Heizungsraum.', 'Shows space and connections for the indoor unit.', 43],
    ['photo_access', 'A photo of the way in for the equipment: doors, stairs.', 'Ein Foto vom Zugangsweg: Türen, Treppen.', 'Narrow access affects installation.', 44],
    ['doc_bill', 'A photo or PDF of your yearly energy bill.', 'Ein Foto oder PDF der Jahresabrechnung.', 'We read your consumption from it; you confirm the numbers.', 45],
    ['doc_certificate', 'Your energy certificate, if you have one.', 'Ihr Energieausweis, falls vorhanden.', 'A useful cross-check.', 46],
  ] as const).map(([id, en, de, whyEn, order]) => ({
    id, group: 'feasibility' as Group, mode: 'PHOTO' as Mode, type: 'photo' as AnswerType, order,
    question: { en, de }, why: { en: whyEn, de: whyEn },
  })),

  // ---------- TECH: never asked, listed for the technician ----------
  ...([
    ['heater_model', 'Heater type and model'], ['heater_location', 'Location of the current heater'], ['floors', 'Number of floors'],
    ['hydraulic_balancing', 'Hydraulic balancing done?'], ['indoor_space', 'Indoor space for equipment'], ['hot_water_tank', 'Hot-water tank present'],
    ['hot_water_usage', 'Hot-water usage'], ['electrical_connection', 'Electrical connection / upgrade needs'], ['emitter_share', 'Share of each emitter type'],
  ] as const).map(([id, label], i) => ({
    id, group: 'feasibility' as Group, mode: 'TECH' as Mode, type: 'text' as AnswerType, order: 60 + i,
    question: { en: label, de: label }, why: { en: 'Checked by the technician.', de: 'Prüft der Techniker.' },
  })),

  // ---------- SALES: after the result, optional ----------
  { id: 'ownership', group: 'project', mode: 'SALES', type: 'enum', order: 70,
    question: { en: 'Do you own the home, act for the owner, or rent it?', de: 'Sind Sie Eigentümer, handeln Sie für den Eigentümer, oder wohnen Sie zur Miete?' },
    why: { en: 'So we know who can decide. It does not change the technical result.', de: 'Damit wir wissen, wer entscheidet. Das ändert nichts am technischen Ergebnis.' },
    options: [
      { value: 'owner', en: 'Owner', de: 'Eigentümer' }, { value: 'co-owner', en: 'Co-owner', de: 'Miteigentümer' },
      { value: 'representative', en: 'For the owner', de: 'Für den Eigentümer' }, { value: 'tenant', en: 'Renting', de: 'Mieter' },
      { value: 'landlord', en: 'Landlord', de: 'Vermieter' },
    ] },
  { id: 'timeline', group: 'project', mode: 'SALES', type: 'enum', order: 71,
    question: { en: 'When would you like to switch?', de: 'Wann möchten Sie umsteigen?' },
    why: { en: 'To plan the next step. It does not change the technical result.', de: 'Zur Planung. Ändert nichts am technischen Ergebnis.' },
    options: [
      { value: 'asap', en: 'As soon as possible', de: 'So bald wie möglich' }, { value: 'within6m', en: 'Within 6 months', de: 'In 6 Monaten' },
      { value: 'within2y', en: 'Within 1–2 years', de: 'In 1–2 Jahren' }, { value: 'curious', en: 'Just finding out', de: 'Nur informieren' },
    ] },
  { id: 'decision_makers', group: 'project', mode: 'SALES', type: 'enum', order: 72,
    question: { en: 'Is everyone who decides about this involved, for example your partner?', de: 'Sind alle beteiligt, die mitentscheiden, zum Beispiel Ihr Partner?' },
    why: { en: 'So the call can include everyone.', de: 'Damit alle beim Gespräch dabei sein können.' },
    options: [...yn, { value: 'unsure', en: 'Not sure', de: 'Weiß nicht' }] },

  // ---------- CONTACT: only with consent ----------
  { id: 'contact_name', group: 'contact', mode: 'CONTACT', type: 'text', order: 80,
    question: { en: 'What name should our team ask for?', de: 'Nach welchem Namen soll unser Team fragen?' },
    why: { en: 'So the caller knows who to ask for.', de: 'Damit wir wissen, nach wem wir fragen.' } },
  { id: 'contact_phone', group: 'contact', mode: 'CONTACT', type: 'text', order: 81,
    question: { en: 'Which phone number should we call?', de: 'Unter welcher Nummer sollen wir anrufen?' },
    why: { en: 'Only to arrange the next step.', de: 'Nur um den nächsten Schritt zu vereinbaren.' } },
  { id: 'contact_time', group: 'contact', mode: 'CONTACT', type: 'enum', order: 82,
    question: { en: 'When is a good time to call: morning, afternoon or evening?', de: 'Wann passt ein Anruf: vormittags, nachmittags oder abends?' },
    why: { en: 'So we call when it suits you.', de: 'Damit wir passend anrufen.' },
    options: [{ value: 'morning', en: 'Morning', de: 'Vormittags' }, { value: 'afternoon', en: 'Afternoon', de: 'Nachmittags' }, { value: 'evening', en: 'Evening', de: 'Abends' }] },
];

export const SLOT_BY_ID: Record<string, Slot> = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
export const slotsByMode = (m: Mode) => SLOTS.filter((s) => s.mode === m).sort((a, b) => a.order - b.order);
export { hasRadiators, known };
