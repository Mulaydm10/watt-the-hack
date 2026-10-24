// Drive one real B-04 conversation through the orchestrator; save the transcript.
import { writeFileSync } from "node:fs";
const B = "http://localhost:8787";
const post = async (p, b) => (await fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
const answers = ["English please.", "My postcode is 85221, Dachau.", "A detached house.", "It was built in 1987.", "About 160 square metres.", "Heating oil, about 2,500 litres a year.", "Radiators.", "Two of us.", "Yes, the boiler does the hot water too.", "I think it is a single-pipe system.", "The boiler is about 20 years old.", "Nothing renovated really.", "No wood stove, no solar.", "Yes, that is all correct."];
const s = await post("/sessions", { channel: "voice", lang: "en" });
const log = [{ who: "agent", text: s.messages[0] }];
for (const a of answers) {
  const r = await post(`/sessions/${s.session_id}/messages`, { text: a });
  log.push({ who: "caller", text: a }, { who: "agent", text: r.messages[0] });
  console.error(r.state?.phase ?? r.state, "|", String(r.messages[0]).slice(0, 90));
  if (/9[.,]5\s?kW|yellow|gelb/i.test(r.messages[0])) break;
}
const res = await (await fetch(`${B}/sessions/${s.session_id}/result`)).json();
writeFileSync("convo.json", JSON.stringify({ session: s.session_id, log, result: res }, null, 1));
