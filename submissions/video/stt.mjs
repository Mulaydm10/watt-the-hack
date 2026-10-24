import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const env = Object.fromEntries(readFileSync("../../services/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
execFileSync("/opt/homebrew/bin/ffmpeg", ["-y", "-v", "error", "-i", "raw.mov", "-vn", "-ac", "1", "-ar", "16000", "raw.wav"]);
const fd = new FormData();
fd.append("model_id", "scribe_v1"); fd.append("timestamps_granularity", "word"); fd.append("tag_audio_events", "false");
fd.append("file", new Blob([readFileSync("raw.wav")], { type: "audio/wav" }), "raw.wav");
const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: fd });
const j = await r.json(); writeFileSync("raw.stt.json", JSON.stringify(j, null, 1));
const w = (j.words ?? []).filter((x) => x.type === "word");
let line = "", ls = null;
for (const x of w) { if (ls === null) ls = x.start; line += x.text + " "; if (/[.?!]$/.test(x.text)) { console.log(ls.toFixed(1) + "-" + x.end.toFixed(1), line.trim()); line = ""; ls = null; } }
if (line) console.log(ls.toFixed(1), line);
