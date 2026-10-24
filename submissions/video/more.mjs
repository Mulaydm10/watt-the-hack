import { readFileSync, writeFileSync } from "node:fs";
const B = "http://localhost:8787";
const d = JSON.parse(readFileSync("convo.json"));
const post = async (p, b) => (await fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
const ans = ["Yes, that is all correct.", "Yes, go ahead.", "Yes."];
for (const a of ans) {
  const r = await post(`/sessions/${d.session}/messages`, { text: a });
  d.log.push({ who: "caller", text: a }, { who: "agent", text: r.messages[0] });
  console.error(String(r.messages[0]).slice(0, 160));
  if (/kilowatt|kW/i.test(r.messages[0]) && /yellow|green|red|closer look/i.test(r.messages[0])) break;
}
writeFileSync("convo.json", JSON.stringify(d, null, 1));
