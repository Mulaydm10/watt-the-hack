// Runtime wiring shared by the MCP server and the orchestrator: env, LLM config, few-shot photos, store, paths.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureLlm } from '@hpr/core/ai/provider';
import { setExampleLoader } from '@hpr/core/ai/classifyPipePhoto';
import { mergeOutcomeConfig, SqliteStore, type OutcomeConfig, type ToolConfig } from '@hpr/agent';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const DATA_DIR = process.env.HPR_DATA_DIR ?? join(ROOT, 'services', 'data');

export function initRuntime() {
  // services/.env holds LLM_* and optional SALES_WEBHOOK_URL / PUBLIC_BASE_URL (gitignored).
  const envFile = join(ROOT, 'services', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  configureLlm({
    provider: (process.env.LLM_PROVIDER as 'openai' | 'claude' | 'astra' | undefined) ?? 'openai',
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    model: process.env.LLM_MODEL || 'gpt-6-astra',
  });
  const examples = join(ROOT, 'packages', 'core', 'assets', 'examples');
  setExampleLoader(async (file) => new Blob([await readFile(join(examples, file))], { type: 'image/jpeg' }));
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(join(DATA_DIR, 'uploads'), { recursive: true });
  const store = new SqliteStore(join(DATA_DIR, 'sessions.db'));
  const toolConfig: ToolConfig = {
    reportsDir: join(DATA_DIR, 'reports'),
    webhookUrl: process.env.SALES_WEBHOOK_URL || undefined,
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:8787',
    consentTextVersion: process.env.CONSENT_TEXT_VERSION ?? 'v0-draft',
    outcome: loadOutcomeConfig(),
    mail: mailConfigFromEnv(),
  };
  return { store, toolConfig };
}

export const OUTCOMES_FILE = () => join(DATA_DIR, 'outcomes.json');

/** Customer promises per outcome (callback working days, text overrides, holidays). Editable without code changes. */
export function loadOutcomeConfig(): OutcomeConfig {
  const f = OUTCOMES_FILE();
  return mergeOutcomeConfig(existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined);
}
export function saveOutcomeConfig(c: OutcomeConfig) { writeFileSync(OUTCOMES_FILE(), JSON.stringify(c, null, 2)); }

/** E-mail delivery of sales reports (SMTP). Inactive until MAIL_TO and SMTP_* are set in services/.env. */
export function mailConfigFromEnv() {
  const e = process.env;
  if (!e.MAIL_TO || !e.SMTP_HOST) return undefined;
  return { to: e.MAIL_TO, from: e.MAIL_FROM ?? e.SMTP_USER ?? 'heatpump-assistant@localhost', host: e.SMTP_HOST, port: Number(e.SMTP_PORT ?? 465), user: e.SMTP_USER, pass: e.SMTP_PASS };
}
