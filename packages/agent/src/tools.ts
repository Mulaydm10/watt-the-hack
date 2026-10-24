// One tool registry, two transports: the MCP server lists these, and the orchestrator offers them to Astra as
// function tools. Every number the assistant may say comes from a result here.
import { resultAreas } from '@hpr/core/engine/areas';
import { assess } from '@hpr/core/engine/assess';
import { pathToGreen } from '@hpr/core/engine/pathToGreen';
import { explainPlainly } from '@hpr/core/ai/explain';
import { hasLlmKey } from '@hpr/core/ai/provider';
import { priceBand, sizeToUnits, subsidyEstimate, COST_DRIVERS, NUU_PAYBACK, type IncomeBand } from '@hpr/core/sales/offer';
import { tightPlacement } from '@hpr/core/sales/types';
import { visitDecision } from '@hpr/core/sales/visitDecision';
import { lookupLocation } from './location';
import { nextQuestions, photoTasks } from './nextQuestions';
import { outcomeKey, outcomeText, DEFAULT_OUTCOME_CONFIG, type OutcomeConfig } from './outcomes';
import { meterCabinetFromPhoto, pipeFromPhotos, billFromDocument } from './photoAi';
import { setSlot, toBuilding, toCommitment, toPreCheck, type Provenance } from './profile';
import { buildLead, buildReport, deliverReport, type MailConfig } from './report';
import { deriveState, progress, type Session } from './session';
import { SLOT_BY_ID, SLOTS, type Lang } from './slots';

export type ToolConfig = { reportsDir: string; webhookUrl?: string; publicBaseUrl: string; outcome?: OutcomeConfig; consentTextVersion?: string; mail?: MailConfig };
export type ToolCtx = { session: Session; config: ToolConfig };
export type JsonSchema = Record<string, unknown>;
export type Tool = { name: string; description: string; parameters: JsonSchema; handler: (ctx: ToolCtx, args: any) => Promise<unknown> | unknown };

const obj = (properties: Record<string, unknown>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const lang = (ctx: ToolCtx): Lang => ctx.session.lang;

function engine(ctx: ToolCtx) {
  const p = ctx.session.profile;
  const b = toBuilding(p, ctx.session.id);
  const a = assess(b, p.pipePhoto);
  return { b, a };
}

function decision(ctx: ToolCtx) {
  const { a } = engine(ctx);
  const lead = buildLead(ctx.session, ctx.session.leadId ?? 'pending');
  return { a, d: visitDecision(lead, undefined, a), lead };
}

function slotView(id: string, l: Lang) {
  const s = SLOT_BY_ID[id];
  return { slot: id, mode: s.mode, type: s.type, question: s.question[l], why: s.why[l], options: s.options?.map((o) => ({ value: o.value, label: o[l] })), allows_unknown: true };
}

export const TOOLS: Tool[] = [
  {
    name: 'get_state',
    description: 'Current conversation state, progress and the single next question to ask (with suggested wording). Call at the start of every turn.',
    parameters: obj({}),
    handler: (ctx) => {
      const s = ctx.session;
      const nq = nextQuestions(s.profile, 1);
      const state = deriveState(s);
      const next = state === 'LOCATION' ? (!s.profile.slots.lang ? 'lang' : 'postcode')
        : state === 'SALES_QUESTIONS' ? ['ownership', 'timeline', 'decision_makers'].find((x) => !s.profile.slots[x])
        : state === 'CONSENT_CONTACT' && s.consent?.contact ? ['contact_name', 'contact_phone', 'contact_time'].find((x) => !s.profile.slots[x])
        : nq.questions[0]?.slot;
      return { state, progress: progress(s), lang: s.lang, channel: s.channel, next_question: next ? { ...slotView(next, s.lang), reason: nq.questions[0]?.reason } : null };
    },
  },
  {
    name: 'start_assessment',
    description: 'Call once the caller agrees to start the check after the greeting.',
    parameters: obj({}),
    handler: (ctx) => { ctx.session.flags.started = true; return { ok: true }; },
  },
  {
    name: 'set_language',
    description: 'Set the conversation language (de or en).',
    parameters: obj({ lang: { type: 'string', enum: ['de', 'en'] } }, ['lang']),
    handler: (ctx, { lang: l }) => { ctx.session.lang = l; return setSlot(ctx.session.profile, 'lang', { value: l }); },
  },
  {
    name: 'lookup_location',
    description: 'Store the postcode and check the service area and subsidy region. Location never changes technical suitability.',
    parameters: obj({ postcode: { type: 'string' } }, ['postcode']),
    handler: (ctx, { postcode }) => {
      const r = setSlot(ctx.session.profile, 'postcode', { value: postcode });
      if (!r.ok) return r;
      const loc = lookupLocation(String(r.value));
      ctx.session.profile.location = loc;
      return { ...r, location: loc };
    },
  },
  {
    name: 'update_profile',
    description: 'Store one or more answers. Use slot ids from get_state / list_slots. Use value "unknown" when the caller does not know. For consumption pass value and unit (kwh, litres, m3). Returns read-back text to confirm with the caller, or a validation hint.',
    parameters: obj({
      answers: { type: 'array', items: obj({
        slot: { type: 'string' },
        value: { description: 'number, string, boolean or array (multi)' },
        unit: { type: 'string' },
        estimate: { type: 'boolean', description: 'true if the caller guessed (e.g. "the seventies")' },
        provenance: { type: 'string', enum: ['user_said', 'user_estimate', 'bill_ai', 'certificate', 'photo_ai'] },
      }, ['slot', 'value']) },
    }, ['answers']),
    handler: (ctx, { answers }) => {
      const results = (answers as { slot: string; value: unknown; unit?: string; estimate?: boolean; provenance?: Provenance }[]).map((x) => {
        if (x.slot === 'postcode') return { ok: false, slot: 'postcode', error: 'use lookup_location' };
        if (x.slot === 'lang' && (x.value === 'de' || x.value === 'en')) ctx.session.lang = x.value;
        return setSlot(ctx.session.profile, x.slot, x);
      });
      const nq = nextQuestions(ctx.session.profile, 1).questions[0];
      return { results, state: deriveState(ctx.session), next_question: nq ? slotView(nq.slot, lang(ctx)) : null };
    },
  },
  {
    name: 'list_slots',
    description: 'All questions with mode, wording and options (for "why do you ask" or when the caller volunteers facts).',
    parameters: obj({ mode: { type: 'string', enum: ['ASK', 'ADAPT', 'PHOTO', 'TECH', 'SALES', 'CONTACT'] } }),
    handler: (ctx, { mode }) => SLOTS.filter((s) => !mode || s.mode === mode).map((s) => slotView(s.id, lang(ctx))),
  },
  {
    name: 'get_profile',
    description: 'Everything collected so far with provenance, and which core facts are still unknown.',
    parameters: obj({}),
    handler: (ctx) => ({ slots: ctx.session.profile.slots, location: ctx.session.profile.location, building: toBuilding(ctx.session.profile) }),
  },
  {
    name: 'get_next_questions',
    description: 'Ranked questions still worth asking (only those that change the result), and whether there is enough for a result.',
    parameters: obj({ max: { type: 'number' } }),
    handler: (ctx, { max }) => {
      const r = nextQuestions(ctx.session.profile, max ?? 3);
      return { ...r, questions: r.questions.map((q) => ({ ...slotView(q.slot, lang(ctx)), reason: q.reason })), photo_tasks: photoTasks(ctx.session.profile) };
    },
  },
  {
    name: 'stop_questions',
    description: 'The caller wants to finish: skip remaining optional questions and go to the read-back.',
    parameters: obj({}),
    handler: (ctx) => { ctx.session.flags.stopQuestions = true; return { state: deriveState(ctx.session) }; },
  },
  {
    name: 'acknowledge_out_of_area',
    description: 'Caller was told the home is outside the service area and wants the free self-check anyway.',
    parameters: obj({}),
    handler: (ctx) => { ctx.session.flags.outOfAreaAck = true; return { state: deriveState(ctx.session) }; },
  },
  {
    name: 'get_confirmation_summary',
    description: 'Key facts to read back before the result, plus kindly-phrased data warnings the caller can fix.',
    parameters: obj({}),
    handler: (ctx) => {
      const { b, a } = engine(ctx);
      return {
        facts: { postcode_area: ctx.session.profile.location?.area, year: b.construction_year, area_m2: b.floor_area_m2, fuel: ctx.session.profile.slots.energy_carrier?.value, yearly_kwh: b.annual_consumption_kwh, heating: b.heat_distribution, people: b.persons_in_household, hot_water_via_heating: b.hot_water_via_heating, renovation: b.renovation_status, boiler_age: ctx.session.profile.slots.boiler_age?.value },
        warnings: a.flags.contradictions.map((c) => c.detail),
      };
    },
  },
  {
    name: 'confirm_details',
    description: 'Call when the caller confirms the read-back is correct (required before the result and before anything goes to sales).',
    parameters: obj({ confirmed: { type: 'boolean' } }, ['confirmed']),
    handler: (ctx, { confirmed }) => { ctx.session.flags.confirmed = Boolean(confirmed); return { state: deriveState(ctx.session) }; },
  },
  {
    name: 'assess_building',
    description: 'Run the deterministic assessment: verdict, confidence, heat load (both methods, chosen estimate and why), flags, technician checks and the four result areas.',
    parameters: obj({}),
    handler: (ctx) => {
      const { b, a } = engine(ctx);
      const pre = toPreCheck(ctx.session.profile);
      return {
        verdict: a.verdict, confidence: a.confidence, headline: a.headline, reasons: a.verdictReasons,
        heat_load: { best_kw: a.heatLoad.bestKw, w_per_m2: a.heatLoad.bestWPerM2, range_kw: a.heatLoad.range, rules: a.heatLoad.rules },
        areas: resultAreas(b, a, { meterCabinet: pre.meterCabinet, outdoorTightPlacement: tightPlacement(pre.outdoorSpot) }),
        obstacles: a.flags.obstacles, unknowns: a.flags.unknowns, contradictions: a.flags.contradictions,
        technician_checks: a.flags.technicianChecks.map((t) => t.title),
        pipe_system: a.pipeSystem,
      };
    },
  },
  {
    name: 'path_to_green',
    description: 'Which technician checks (assumed positive) would turn the result green with high confidence, or what still blocks it.',
    parameters: obj({}),
    handler: (ctx) => { const { b } = engine(ctx); return pathToGreen(b, ctx.session.profile.pipePhoto); },
  },
  {
    name: 'estimate_costs',
    description: 'Yearly running costs (heat pump vs today), suggested unit size, published price band and subsidy lines. income_band only if the caller volunteers it; it is never stored or sent.',
    parameters: obj({ income_band: { type: 'string', enum: ['not-said', 'le30', '30to40', '40to50', 'gt50'] }, minor_child: { type: 'boolean' } }),
    handler: (ctx, { income_band, minor_child }) => {
      const { a } = engine(ctx);
      const c = toCommitment(ctx.session.profile);
      const size = sizeToUnits(a.heatLoad.bestKw, a.heatLoad.range?.high);
      const band = priceBand(size.units[0]);
      const owner = c.ownership == null ? null : ['owner', 'co-owner'].includes(c.ownership);
      const sub = subsidyEstimate({ ownerOccupied: owner, oldBoiler20Plus: c.boiler === 'over20', income: (income_band ?? 'not-said') as IncomeBand, minorChild: Boolean(minor_child), region: ctx.session.profile.location?.region });
      return {
        running_costs: a.costs && { heat_pump_eur_per_year: a.costs.heatPumpEur, heat_pump_worst_eur_per_year: a.costs.heatPumpEurWorst, current_eur_per_year: a.costs.currentEur, current_label: a.costs.currentLabel, saving_eur_per_year_worst: a.costs.currentEur != null ? a.costs.currentEur - a.costs.heatPumpEurWorst : null, assumptions: a.costs.assumptions },
        unit_kw: size.units, sizing_note: size.note,
        price_band_eur: { low: band.low, high: band.high, label: band.label, note: 'Rough guide, gross, before subsidy; final price after the on-site visit.' },
        cost_drivers: COST_DRIVERS,
        subsidy: { pct: sub.pct, max_eur: sub.maxEur, lines: sub.lines, warning: 'Apply for the subsidy before placing the order, or it is lost. Check current rules; nuuEnergy confirms.' },
        nuu_payback_claim: NUU_PAYBACK,
      };
    },
  },
  {
    name: 'deliver_result',
    description: 'Mark the result as told to the caller. Call after you have explained the verdict, the four areas and the rough costs.',
    parameters: obj({}),
    handler: (ctx) => { ctx.session.flags.resultDelivered = true; return { state: deriveState(ctx.session) }; },
  },
  {
    name: 'explain_result',
    description: 'Plain-language version of the result for the caller (AI, guarded: no new numbers, same verdict). Falls back to the engine reasons.',
    parameters: obj({}),
    handler: async (ctx) => {
      const { a } = engine(ctx);
      if (!hasLlmKey()) return { text: null, fallback_reasons: a.verdictReasons };
      try { return { text: await explainPlainly(a) }; } catch (e) { return { text: null, error: (e as Error).message, fallback_reasons: a.verdictReasons }; }
    },
  },
  {
    name: 'request_photo_link',
    description: 'Send the caller (or a family member) a link to upload photos or documents. Voice cannot carry photos.',
    parameters: obj({ kinds: { type: 'array', items: { type: 'string', enum: ['meter_cabinet', 'outdoor', 'radiator', 'boiler_room', 'access', 'bill', 'certificate'] } }, send_to: { type: 'string', description: 'phone or e-mail; optional' } }, ['kinds']),
    handler: (ctx, { kinds, send_to }) => {
      const link = `${ctx.config.publicBaseUrl}/upload/${ctx.session.id}`;
      ctx.session.photoRequests.push({ kinds, to: send_to, link, at: new Date().toISOString() });
      return { link, sent: Boolean(send_to), note: send_to ? 'Link queued for sending (SMS/e-mail provider not configured in the demo).' : 'Read the link out or show it in the app.' };
    },
  },
  {
    name: 'record_outdoor_spot',
    description: 'Store the caller\'s description of the outdoor-unit spot: free space of about 1x1 m, distance to the neighbour\'s boundary.',
    parameters: obj({ space_1x1: { type: 'string', enum: ['yes', 'no', 'unsure'] }, neighbour_distance_ok: { type: 'string', enum: ['yes', 'no', 'unsure'] }, distance_m: { type: 'number' } }, ['space_1x1', 'neighbour_distance_ok']),
    handler: (ctx, { space_1x1, neighbour_distance_ok, distance_m }) => {
      ctx.session.profile.outdoor = { space1x1: space_1x1, neighbourOk: neighbour_distance_ok, distance_m };
      return { tight_placement: tightPlacement(toPreCheck(ctx.session.profile).outdoorSpot), note: 'Rough hint only; the technician confirms placement and noise rules.' };
    },
  },
  {
    name: 'analyse_photo',
    description: 'Analyse an uploaded photo/document by id (radiator → pipe system, meter_cabinet → upgrade risk, bill → proposed consumption to confirm). Takes ~20 s; tell the caller you are checking.',
    parameters: obj({ photo_id: { type: 'string' } }, ['photo_id']),
    handler: async (ctx, { photo_id }) => {
      const p = ctx.session.profile;
      const ph = p.photos.find((x) => x.id === photo_id);
      if (!ph) return { error: 'photo not found' };
      try {
        if (ph.kind === 'radiator') {
          const f = await pipeFromPhotos(p.photos.filter((x) => x.kind === 'radiator').map((x) => x.path), toBuilding(p).construction_year);
          p.pipePhoto = f; ph.finding = f;
          return { kind: 'radiator', finding: f, note: f.label === 'unclear' ? 'Heating pipe system unclear from the photos. A technician should check whether this is a single-pipe system, because that can require a higher flow temperature.' : 'Used only if the caller did not state the pipe system.' };
        }
        if (ph.kind === 'meter_cabinet') {
          const f = await meterCabinetFromPhoto(ph.path);
          p.meterCabinet = f.finding; ph.finding = f;
          return { kind: 'meter_cabinet', finding: f, note: 'An electrician confirms in every case.' };
        }
        if (ph.kind === 'bill') {
          const f = await billFromDocument(ph.path);
          ph.finding = f;
          return { kind: 'bill', proposed: f, note: 'Read these values back and store them with update_profile (provenance bill_ai) only after the caller confirms.' };
        }
        return { kind: ph.kind, note: 'Stored for the technician; no automatic analysis for this kind.' };
      } catch (e) {
        return { error: (e as Error).message, note: 'Photo kept for the technician.' };
      }
    },
  },
  {
    name: 'visit_decision',
    description: 'Sales next step (A on-site visit, B 30-min call, C ask for info, D not now / outside area) with reasons. Internal: do not read P(sale) or expected value to the caller.',
    parameters: obj({}),
    handler: (ctx) => { const { d } = decision(ctx); return { tier: d.tier, out_of_area: d.outOfArea, reasons: d.reasons, commitment: d.commitment, pre_check_pct: d.preCheck }; },
  },
  {
    name: 'mark_sales_questions_done',
    description: 'Call after the optional sales questions were asked or the caller declined them.',
    parameters: obj({}),
    handler: (ctx) => { ctx.session.flags.salesDone = true; return { state: deriveState(ctx.session) }; },
  },
  {
    name: 'record_consent',
    description: 'Record what the caller agreed to share. share=true is required for a callback and the sales report.',
    parameters: obj({ share: { type: 'boolean' }, contact: { type: 'boolean' }, photos: { type: 'boolean' }, recording: { type: 'boolean' } }, ['share']),
    handler: (ctx, { share, contact, photos, recording }) => {
      ctx.session.consent = { share: Boolean(share), contact: Boolean(share && contact), photos: Boolean(share && photos), recording: Boolean(recording), at: new Date().toISOString(), textVersion: ctx.config.consentTextVersion ?? 'v0-draft' };
      return { consent: ctx.session.consent, state: deriveState(ctx.session), next: share && contact ? 'Ask for contact_name, contact_phone, contact_time via update_profile.' : 'Call finish_session.' };
    },
  },
  {
    name: 'finish_session',
    description: 'Create the lead and send the sales report (only with consent), then return the closing statement to say to the caller.',
    parameters: obj({}),
    handler: async (ctx) => {
      const s = ctx.session;
      const { a, d } = decision(ctx);
      const consented = Boolean(s.consent?.share);
      const preferredTime = s.consent?.contact ? (s.profile.slots.contact_time?.value as string | undefined) : undefined;
      const key = outcomeKey(a, d, consented);
      let report: { lead_id: string; files: string[]; webhook?: number; mail?: string; mailError?: string } | null = null;
      if (consented) {
        s.leadId ??= `L-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${s.id.slice(-4).toUpperCase()}`;
        const promised = outcomeText(key, 'en', { a, d, cfg: ctx.config.outcome ?? DEFAULT_OUTCOME_CONFIG, preferredTime });
        const r = buildReport(s, s.leadId, promised);
        const sent = await deliverReport(r, { dir: ctx.config.reportsDir, webhookUrl: ctx.config.webhookUrl, mail: ctx.config.mail });
        report = { lead_id: s.leadId, ...sent };
      }
      const closing = outcomeText(key, s.lang, { a, d, path: pathToGreen(toBuilding(s.profile), s.profile.pipePhoto), ref: s.leadId, cfg: ctx.config.outcome, preferredTime });
      s.outcomeText = closing;
      s.flags.finished = true;
      return { outcome: key, closing_statement: closing, report };
    },
  },
  {
    name: 'handoff_to_human',
    description: 'The caller wants a person, is confused or upset, or a safety rule triggered.',
    parameters: obj({ reason: { type: 'string' } }, ['reason']),
    handler: (ctx, { reason }) => {
      ctx.session.flags.handoff = reason;
      return { message: ctx.session.lang === 'de' ? 'Ich verbinde Sie mit einem Kollegen. Falls gerade niemand frei ist, rufen wir Sie zurück.' : "I'll connect you with a colleague. If nobody is free right now, we'll call you back." };
    },
  },
  {
    name: 'pause_session',
    description: 'The caller wants to continue later: returns a resume code.',
    parameters: obj({}),
    handler: (ctx) => {
      ctx.session.resumeCode ??= Math.random().toString(36).slice(2, 8).toUpperCase();
      ctx.session.flags.paused = true;
      return { resume_code: ctx.session.resumeCode, valid_days: 14 };
    },
  },
];

export const TOOL_BY_NAME: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

/** Run a tool and log it on the session (audit + number guard). */
export async function runTool(ctx: ToolCtx, name: string, args: unknown): Promise<unknown> {
  const t = TOOL_BY_NAME[name];
  if (!t) return { error: `unknown tool ${name}` };
  const t0 = Date.now();
  let result: unknown;
  try { result = await t.handler(ctx, args ?? {}); } catch (e) { result = { error: (e as Error).message }; }
  ctx.session.toolLog.push({ at: new Date().toISOString(), tool: name, args, result, ms: Date.now() - t0 });
  return result;
}
