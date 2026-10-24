// Session store: SQLite (node:sqlite, no native deps) for the service, in-memory for tests.
import { DatabaseSync } from 'node:sqlite';
import { mergeOutdoorFinding, type OutdoorFinding } from '@hpr/core/ai/classifyOutdoorPhoto';
import type { Session } from './session';

/**
 * Save a session that was loaded before a long await (a conversation turn takes seconds). Stores return copies,
 * so a plain save would overwrite photos uploaded meanwhile and photo results merged by the background analysis.
 * This keeps them: new photo records are added, newly arrived findings are copied, and the derived values they
 * set (pipe photo, meter cabinet, outdoor hint) are taken over. Outdoor hints are re-merged so anything the caller
 * said during the turn still wins.
 */
export function saveKeepingPhotos(store: SessionStore, s: Session): void {
  const latest = store.get(s.id);
  if (latest) {
    const arrived = new Set<string>();
    for (const lp of latest.profile.photos) {
      const mine = s.profile.photos.find((p) => p.id === lp.id);
      if (!mine) { s.profile.photos.push(lp); if (lp.finding != null) arrived.add(lp.kind); }
      else if (mine.finding == null && lp.finding != null) { mine.finding = lp.finding; arrived.add(lp.kind); }
    }
    if (arrived.has('radiator') && latest.profile.pipePhoto) s.profile.pipePhoto = latest.profile.pipePhoto;
    if (arrived.has('meter_cabinet') && latest.profile.meterCabinet) s.profile.meterCabinet = latest.profile.meterCabinet;
    if (arrived.has('outdoor')) {
      for (const p of s.profile.photos) {
        if (p.kind === 'outdoor' && p.finding != null) s.profile.outdoor = mergeOutdoorFinding(s.profile.outdoor, p.finding as OutdoorFinding);
      }
    }
  }
  store.save(s);
}

export interface SessionStore {
  get(id: string): Session | undefined;
  save(s: Session): void;
  list(): Session[];
  byResumeCode(code: string): Session | undefined;
}

export class MemoryStore implements SessionStore {
  private m = new Map<string, Session>();
  get(id: string) { const s = this.m.get(id); return s ? structuredClone(s) : undefined; }
  save(s: Session) { s.updatedAt = new Date().toISOString(); this.m.set(s.id, structuredClone(s)); }
  list() { return [...this.m.values()].map((s) => structuredClone(s)); }
  byResumeCode(code: string) { return this.list().find((s) => s.resumeCode === code); }
}

export class SqliteStore implements SessionStore {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, resume_code TEXT, updated_at TEXT, json TEXT NOT NULL)');
  }
  get(id: string) {
    const row = this.db.prepare('SELECT json FROM sessions WHERE id = ?').get(id) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Session) : undefined;
  }
  save(s: Session) {
    s.updatedAt = new Date().toISOString();
    this.db.prepare('INSERT INTO sessions (id, resume_code, updated_at, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET resume_code = excluded.resume_code, updated_at = excluded.updated_at, json = excluded.json')
      .run(s.id, s.resumeCode ?? null, s.updatedAt, JSON.stringify(s));
  }
  list() {
    return (this.db.prepare('SELECT json FROM sessions ORDER BY updated_at DESC').all() as { json: string }[]).map((r) => JSON.parse(r.json) as Session);
  }
  byResumeCode(code: string) {
    const row = this.db.prepare('SELECT json FROM sessions WHERE resume_code = ?').get(code) as { json: string } | undefined;
    return row ? (JSON.parse(row.json) as Session) : undefined;
  }
}
