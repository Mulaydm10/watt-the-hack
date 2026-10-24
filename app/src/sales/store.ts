import dev from '../data/buildings_dev.json';
import evalSet from '../data/buildings_eval.json';
import type { Building } from '../engine/types';
import { DEFAULT_CONFIG, type SalesConfig } from './config';
import { NO_COMMITMENT, NO_PRECHECK, type Lead } from './types';

// Demo only: everything stays in this browser (localStorage). No real personal data.
const LEADS_KEY = 'hpr.leads.v1';
const CONFIG_KEY = 'hpr.salesConfig.v1';

export const demoLeads = (): Lead[] =>
  [...(dev as Building[]), ...(evalSet as Building[])].map((b) => ({
    id: b.building_id!, building: b, commitment: NO_COMMITMENT, preCheck: NO_PRECHECK,
    consent: true, source: 'demo', createdAt: '2026-10-24T09:00:00Z',
  }));

function read<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep in memory only */ }
}

export const loadLeads = (): Lead[] => read<Lead[]>(LEADS_KEY, []);
export function saveLead(l: Lead) {
  write(LEADS_KEY, [...loadLeads().filter((x) => x.id !== l.id), l]);
}
export const clearLeads = () => write(LEADS_KEY, []);

export const loadConfig = (): SalesConfig => ({ ...DEFAULT_CONFIG, ...read<Partial<SalesConfig>>(CONFIG_KEY, {}) });
export const saveConfig = (c: SalesConfig) => write(CONFIG_KEY, c);

export const allLeads = (): Lead[] => [...demoLeads(), ...loadLeads()];
