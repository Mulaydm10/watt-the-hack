// Give the seeded demo leads a demo address (public town halls, never private homes), geocode it and rebuild the
// lead report, exactly as finish_session does for a real caller who agreed to be contacted.
//   npx tsx services/orchestrator/scripts/demo-addresses.mts
import { buildReport, deliverReport, geocodeAddress, setSlot } from '@hpr/agent';
import { initRuntime } from '../../shared/runtime';

const { store, toolConfig } = initRuntime();
const DEMO: Record<string, string> = {
  '82131': 'Bahnhofstraße 7, 82131 Gauting',             // Rathaus Gauting (demo address)
  '85221': 'Konrad-Adenauer-Straße 2, 85221 Dachau',     // Rathaus Dachau (demo address)
  '85354': 'Obere Hauptstraße 2, 85354 Freising',        // Rathaus Freising (demo address)
};
for (const s of store.list().filter((x) => x.id.startsWith('demo-') && x.leadId && x.consent?.contact)) {
  const pc = s.profile.location?.postcode ?? '';
  const addr = DEMO[pc];
  if (!addr) continue;
  setSlot(s.profile, 'contact_address', { value: addr });
  s.profile.geo = (await geocodeAddress(addr)) ?? undefined;
  store.save(s);
  const promised = s.outcomeText ?? '';
  await deliverReport(buildReport(s, s.leadId!, promised), { dir: toolConfig.reportsDir });
  console.log(s.leadId, addr, '→', s.profile.geo ? `${s.profile.geo.lat.toFixed(5)}, ${s.profile.geo.lon.toFixed(5)} (${s.profile.geo.precision})` : 'not found');
}
