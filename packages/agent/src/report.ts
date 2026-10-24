// Sales report (spec §7): JSON for a webhook/CRM + a readable summary. Never contains age, income or health.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resultAreas } from '@hpr/core/engine/areas';
import { assess } from '@hpr/core/engine/assess';
import { pathToGreen } from '@hpr/core/engine/pathToGreen';
import { TIER_INFO } from '@hpr/core/sales/config';
import { priceBand, sizeToUnits, subsidyEstimate } from '@hpr/core/sales/offer';
import { preCheckTasks } from '@hpr/core/sales/preCheck';
import type { Lead } from '@hpr/core/sales/types';
import { tightPlacement } from '@hpr/core/sales/types';
import { visitDecision } from '@hpr/core/sales/visitDecision';
import { photoFindingSentence } from '@hpr/core/ai/photoSentence';
import { toBuilding, toCommitment, toPreCheck } from './profile';
import type { Session } from './session';

export function buildLead(s: Session, leadId: string): Lead {
  return {
    id: leadId, building: toBuilding(s.profile, leadId), photo: s.profile.pipePhoto,
    commitment: toCommitment(s.profile), preCheck: toPreCheck(s.profile),
    consent: Boolean(s.consent?.share), source: 'homeowner', createdAt: new Date().toISOString(),
  };
}

export function buildReport(s: Session, leadId: string, promised: string) {
  const lead = buildLead(s, leadId);
  const b = lead.building;
  const a = assess(b, lead.photo);
  const d = visitDecision(lead, undefined, a);
  const p = pathToGreen(b, lead.photo);
  const size = sizeToUnits(a.heatLoad.bestKw, a.heatLoad.range?.high);
  const tasks = preCheckTasks(b, a, lead.preCheck);
  const ownerOccupied = lead.commitment.ownership == null ? null : ['owner', 'co-owner'].includes(lead.commitment.ownership);
  const sub = subsidyEstimate({ ownerOccupied, oldBoiler20Plus: lead.commitment.boiler === 'over20', income: 'not-said', minorChild: false, region: s.profile.location?.region });
  const contact = s.consent?.contact ? {
    name: s.profile.slots.contact_name?.value ?? null,
    phone: s.profile.slots.contact_phone?.value ?? null,
    preferred_time: s.profile.slots.contact_time?.value ?? null,
    address: s.profile.slots.contact_address?.value ?? null,
    geo: s.profile.geo ?? null,
  } : null;
  return {
    lead_id: leadId,
    created_at: lead.createdAt,
    channel: s.channel,
    language: s.lang,
    consent: s.consent,
    contact,
    location: s.profile.location ?? null,
    facts: Object.fromEntries(Object.entries(s.profile.slots)
      .filter(([k]) => !k.startsWith('contact_'))
      .map(([k, v]) => [k, { value: v.value, provenance: v.provenance }])),
    building: b,
    assessment: {
      verdict: a.verdict, confidence: a.confidence, headline: a.headline, reasons: a.verdictReasons,
      heat_load: { best_kw: a.heatLoad.bestKw, w_per_m2: a.heatLoad.bestWPerM2, range: a.heatLoad.range, method_a: a.heatLoad.methodA && { low: a.heatLoad.methodA.low, high: a.heatLoad.methodA.high }, method_b_kw: a.heatLoad.methodB?.kw ?? null, rules: a.heatLoad.rules },
      areas: resultAreas(b, a, { meterCabinet: lead.preCheck.meterCabinet, outdoorTightPlacement: tightPlacement(lead.preCheck.outdoorSpot) }),
      obstacles: a.flags.obstacles, unknowns: a.flags.unknowns, contradictions: a.flags.contradictions, technician_checks: a.flags.technicianChecks,
    },
    path_to_green: p,
    costs: {
      heat_pump_eur: a.costs ? [a.costs.heatPumpEur, a.costs.heatPumpEurWorst] : null,
      current_eur: a.costs?.currentEur ?? null,
      unit_kw: size.units,
      price_band_eur: [priceBand(size.units[0]).low, priceBand(size.units[0]).high],
      subsidy_pct: sub.pct,
      subsidy_lines: sub.lines,
    },
    visit_decision: { tier: d.tier, label: d.outOfArea ? 'Outside nuuEnergy service area' : TIER_INFO[d.tier].label, action: TIER_INFO[d.tier].action, reasons: d.reasons, commitment: d.commitment, p_sale: d.saleProbability, p_sale_steps: d.probabilitySteps, expected_value_eur: d.expectedValueEur },
    pre_check: { completeness_pct: d.preCheck, tasks: tasks.map((t) => ({ title: t.title, done: t.done, finding: t.finding })) },
    photos: s.profile.photos.map((x) => ({ kind: x.kind, id: x.id, finding: x.finding ?? null, sentence: photoFindingSentence(x.kind, x.finding ?? null) })),
    photo_requests: s.photoRequests,
    conversation: {
      user_turns: s.messages.filter((m) => m.role === 'user').length,
      duration_min: Math.round((Date.parse(s.updatedAt) - Date.parse(s.createdAt)) / 60000),
      handoff: s.flags.handoff ?? null,
    },
    promised_to_customer: promised,
  };
}

export type Report = ReturnType<typeof buildReport>;

export function reportSummary(r: Report): string {
  const e = (n: number | null | undefined) => (n == null ? '—' : `€${n.toLocaleString('en-US')}`);
  return [
    `# Lead ${r.lead_id} — ${r.visit_decision.label}`,
    `${r.location?.region ?? 'Area unknown'} (${r.location?.area ?? '?'}) · ${r.channel} · ${r.language}`,
    '',
    `**Technical:** ${r.assessment.verdict} (${r.assessment.confidence} confidence). ${r.assessment.headline}`,
    `**Heat load:** ${r.assessment.heat_load.best_kw ?? '?'} kW (${r.assessment.heat_load.w_per_m2 ?? '?'} W/m²) · unit ${r.costs.unit_kw.join(' or ') || '?'} kW`,
    `**Running costs:** heat pump ${e(r.costs.heat_pump_eur?.[0])}–${e(r.costs.heat_pump_eur?.[1])} vs today ${e(r.costs.current_eur)} per year`,
    '',
    '## Areas',
    ...r.assessment.areas.map((x) => `- **${x.title}** (${x.status}): ${x.reason} _Next: ${x.nextCheck}_`),
    '',
    '## Why this decision',
    ...r.visit_decision.reasons.map((x) => `- ${x}`),
    `- Expected value: ${e(r.visit_decision.expected_value_eur)} (P(sale) ${Math.round(r.visit_decision.p_sale * 100)}%, company assumptions)`,
    '',
    `## Pre-check ${r.pre_check.completeness_pct}%`,
    ...r.pre_check.tasks.map((t) => `- ${t.done ? '✓' : '·'} ${t.title}: ${t.finding}`),
    ...(r.photos.length ? ['', '## Photos', ...r.photos.map((p) => `- ${p.sentence}`)] : []),
    '',
    `**Promised to customer:** ${r.promised_to_customer}`,
    r.contact ? `**Contact:** ${r.contact.name ?? '—'} · ${r.contact.phone ?? '—'} · ${r.contact.preferred_time ?? 'any time'}` : '**Contact:** not shared',
  ].join('\n');
}

export type MailConfig = { to: string; from: string; host: string; port: number; user?: string; pass?: string };

/** Send the report by e-mail: readable summary in the body, full JSON attached. */
async function mailReport(r: Report, m: MailConfig): Promise<string> {
  const { createTransport } = await import('nodemailer');
  const t = createTransport({ host: m.host, port: m.port, secure: m.port === 465, auth: m.user ? { user: m.user, pass: m.pass } : undefined });
  const info = await t.sendMail({
    from: m.from,
    to: m.to,
    subject: `[Heat Pump Ready] ${r.visit_decision.label} · ${r.assessment.verdict} · ${r.location?.area ?? '?'} · ${r.lead_id}`,
    text: reportSummary(r),
    attachments: [{ filename: `${r.lead_id}.json`, content: JSON.stringify(r, null, 2), contentType: 'application/json' }],
  });
  return info.messageId;
}

/** Delivery: always to disk; also e-mail (MAIL_TO + SMTP_*) and/or webhook (SALES_WEBHOOK_URL) when configured. */
export async function deliverReport(r: Report, opts: { dir: string; webhookUrl?: string; mail?: MailConfig }): Promise<{ files: string[]; webhook?: number; mail?: string; mailError?: string }> {
  mkdirSync(opts.dir, { recursive: true });
  const json = join(opts.dir, `${r.lead_id}.json`);
  const md = join(opts.dir, `${r.lead_id}.md`);
  writeFileSync(json, JSON.stringify(r, null, 2));
  writeFileSync(md, reportSummary(r));
  let webhook: number | undefined;
  if (opts.webhookUrl) {
    const res = await fetch(opts.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: r, summary: reportSummary(r) }), signal: AbortSignal.timeout(10_000) });
    webhook = res.status;
  }
  let mail: string | undefined;
  let mailError: string | undefined;
  if (opts.mail) {
    try { mail = await mailReport(r, opts.mail); } catch (e) { mailError = (e as Error).message; }
  }
  return { files: [json, md], webhook, mail, mailError };
}
