// Session store: SQLite (node:sqlite, no native deps) for the service, in-memory for tests.
import { DatabaseSync } from 'node:sqlite';
import type { Session } from './session';

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
