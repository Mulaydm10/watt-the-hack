// Create (or update) the ElevenLabs voice agent that uses our orchestrator as its custom LLM.
//   PUBLIC_LLM_URL=https://<public-host> npx tsx services/orchestrator/scripts/create-elevenlabs-agent.mts
// Needs ELEVENLABS_API_KEY, ELEVENLABS_LLM_TOKEN, ELEVENLABS_VOICE_ID in services/.env. Writes ELEVENLABS_AGENT_ID back.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV = join(import.meta.dirname, '..', '..', '.env');
if (existsSync(ENV)) process.loadEnvFile(ENV);
const { ELEVENLABS_API_KEY: KEY, ELEVENLABS_LLM_TOKEN: TOKEN, ELEVENLABS_VOICE_ID: VOICE, ELEVENLABS_AGENT_ID: EXISTING } = process.env;
const PUBLIC = process.env.PUBLIC_LLM_URL?.replace(/\/$/, '');
if (!KEY || !TOKEN || !VOICE || !PUBLIC) { console.error('Missing ELEVENLABS_API_KEY / ELEVENLABS_LLM_TOKEN / ELEVENLABS_VOICE_ID / PUBLIC_LLM_URL'); process.exit(1); }

const api = async (path: string, method: string, body?: unknown) => {
  const r = await fetch(`https://api.elevenlabs.io${path}`, { method, headers: { 'xi-api-key': KEY, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
};

// Token for our endpoint, stored as an ElevenLabs workspace secret (never in the agent config itself).
const secret = await api('/v1/convai/secrets', 'POST', { type: 'new', name: `heatpump-llm-token-${Date.now()}`, value: TOKEN });

const greeting = "Guten Tag, hier ist der Assistent von nuuEnergy. Hello, this is nuuEnergy's assistant. Sie können Deutsch oder Englisch mit mir sprechen, you can speak German or English. In etwa 5 bis 10 Minuten prüfen wir kostenlos und unverbindlich, ob eine Wärmepumpe zu Ihrem Haus passt. nuuEnergy fragt nie nach Bankdaten oder Passwörtern. Sollen wir anfangen? Shall we start?";

const config = {
  name: 'nuuEnergy Heat Pump Ready (voice)',
  conversation_config: {
    agent: {
      first_message: greeting,
      language: 'de',
      prompt: {
        prompt: 'conversation_id: {{system__conversation_id}}\nlanguage: auto\nYou are a voice front end. All answers come from the custom LLM; do not add content.',
        llm: 'custom-llm',
        custom_llm: { url: `${PUBLIC}/v1`, model_id: 'heatpump-orchestrator', api_key: { secret_id: secret.secret_id } },
      },
    },
    // Multilingual, low-latency model: the same voice speaks German and English.
    tts: { voice_id: VOICE, model_id: 'eleven_flash_v2_5', stability: 0.6, speed: 0.92 },
    // Patience for older callers: wait longer before deciding the caller has finished.
    turn: { turn_timeout: 12 },
    conversation: { max_duration_seconds: 1500 },
  },
};

const res = EXISTING
  ? await api(`/v1/convai/agents/${EXISTING}`, 'PATCH', config)
  : await api('/v1/convai/agents/create', 'POST', config);
const agentId = EXISTING ?? res.agent_id;
if (!EXISTING) {
  const env = readFileSync(ENV, 'utf8').split('\n').filter((l) => !l.startsWith('ELEVENLABS_AGENT_ID=')).join('\n').trim();
  writeFileSync(ENV, `${env}\nELEVENLABS_AGENT_ID=${agentId}\n`, { mode: 0o600 });
}
console.log(`agent ${EXISTING ? 'updated' : 'created'}: ${agentId}`);
console.log(`talk to it: https://elevenlabs.io/app/talk-to?agent_id=${agentId}`);
