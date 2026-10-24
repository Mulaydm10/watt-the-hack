import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = Object.fromEntries(readFileSync("../../services/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
const K = env.ELEVENLABS_API_KEY;
const V = { vo: "TX3LPaxmHKxFdv7VOQHJ", a: "EXAVITQu4vr4xnSDxMaL", c: "JBFqnCBsd6RMkjVDRZzb" };
const tts = async (voice, text, out, settings) => {
  if (existsSync(out)) return;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": K, "content-type": "application/json" }, body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: settings }) });
  if (!r.ok) throw new Error(out + " " + r.status + " " + (await r.text()).slice(0, 200));
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
};
const L = JSON.parse(readFileSync("lines.json"));
for (const [k, t] of Object.entries(L.vo)) await tts(V.vo, t, `audio/${k}.mp3`, { stability: 0.3, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true });
for (const [i, [w, t]] of L.call.entries()) await tts(V[w], t, `audio/call${String(i).padStart(2, "0")}.mp3`, { stability: w === "c" ? 0.6 : 0.5, similarity_boost: 0.8 });
// Music bed
if (!existsSync("audio/music.mp3")) {
  const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", { method: "POST", headers: { "xi-api-key": K, "content-type": "application/json" }, body: JSON.stringify({ prompt: "Energetic modern tech product launch instrumental, driving electronic beat with warm synths, a tense 14-second build-up then a big drop, upbeat and hyped, no vocals, 3 minutes", music_length_ms: 175000, force_instrumental: true }) });
  if (r.ok) writeFileSync("audio/music.mp3", Buffer.from(await r.arrayBuffer())); else console.log("music", r.status, (await r.text()).slice(0, 300));
}
console.log("tts done");
