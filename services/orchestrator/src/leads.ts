// Sales lead store over the delivered reports (services/data/reports/*.json) + a small status file.
// Everything here is behind the sales token: it contains customer contact data.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Report } from '@hpr/agent';

export type LeadStatus = 'new' | 'contacted' | 'call_scheduled' | 'visit_booked' | 'not_interested' | 'not_feasible' | 'won' | 'lost';
export const LEAD_STATUSES: LeadStatus[] = ['new', 'contacted', 'call_scheduled', 'visit_booked', 'not_interested', 'not_feasible', 'won', 'lost'];
type StatusEntry = { status: LeadStatus; notes: { at: string; text: string }[]; updatedAt: string };

export class LeadBook {
  constructor(private reportsDir: string, private statusFile: string) {}

  private statuses(): Record<string, StatusEntry> {
    return existsSync(this.statusFile) ? JSON.parse(readFileSync(this.statusFile, 'utf8')) : {};
  }

  report(id: string): Report | null {
    const f = join(this.reportsDir, `${id}.json`);
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Report) : null;
  }

  status(id: string): StatusEntry {
    return this.statuses()[id] ?? { status: 'new', notes: [], updatedAt: '' };
  }

  /** Summary rows for the dashboard list, newest first. */
  list() {
    if (!existsSync(this.reportsDir)) return [];
    return readdirSync(this.reportsDir).filter((f) => f.endsWith('.json')).map((f) => {
      const r = JSON.parse(readFileSync(join(this.reportsDir, f), 'utf8')) as Report;
      const st = this.status(r.lead_id);
      return {
        lead_id: r.lead_id,
        created_at: r.created_at,
        channel: r.channel,
        language: r.language,
        area: r.location?.area ?? null,
        region: r.location?.region ?? null,
        service_area: r.location?.status ?? null,
        verdict: r.assessment.verdict,
        confidence: r.assessment.confidence,
        heat_load_kw: r.assessment.heat_load.best_kw,
        tier: r.visit_decision.tier,
        decision: r.visit_decision.label,
        top_reason: r.visit_decision.reasons[0] ?? null,
        expected_value_eur: r.visit_decision.expected_value_eur,
        pre_check_pct: r.pre_check.completeness_pct,
        contact: r.contact,
        promised: r.promised_to_customer,
        status: st.status,
        status_updated_at: st.updatedAt || null,
      };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  update(id: string, patch: { status?: LeadStatus; note?: string }): StatusEntry | null {
    if (!this.report(id)) return null;
    const all = this.statuses();
    const cur = all[id] ?? { status: 'new', notes: [], updatedAt: '' };
    if (patch.status && LEAD_STATUSES.includes(patch.status)) cur.status = patch.status;
    if (patch.note?.trim()) cur.notes.push({ at: new Date().toISOString(), text: patch.note.trim().slice(0, 1000) });
    cur.updatedAt = new Date().toISOString();
    all[id] = cur;
    writeFileSync(this.statusFile, JSON.stringify(all, null, 2));
    return cur;
  }
}
