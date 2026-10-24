// Create demo leads by running the dataset houses through the real tools (no LLM): same path as a real call.
//   npx tsx services/orchestrator/scripts/seed-demo-leads.mts
import { newSession, runTool } from '@hpr/agent';
import { initRuntime } from '../../shared/runtime';

const { store, toolConfig } = initRuntime();
const houses = [
  { name: 'Demo B-02 (green)', postcode: '82131', lang: 'en', answers: { house_type: 'detached', construction_year: 2005, floor_area_m2: 180, energy_carrier: 'gas', consumption: 15500, heat_distribution: 'underfloor', persons_in_household: 3, hot_water_via_heating: true, boiler_age: 'over20', renovation_status: 'unknown', other_heat_sources: ['wood stove', 'solar thermal'], unused_areas: false, pv_battery: false }, sales: { ownership: 'owner', timeline: 'asap', decision_makers: 'yes' }, contact: { contact_name: 'Peter Lang (demo)', contact_phone: '+49 170 0000001', contact_time: 'afternoon' }, outdoor: { space_1x1: 'yes', neighbour_distance_ok: 'yes' } },
  { name: 'Demo B-04 (single-pipe)', postcode: '85221', lang: 'de', answers: { house_type: 'semi', construction_year: 1987, floor_area_m2: 160, energy_carrier: 'oil', consumption: { value: 2500, unit: 'litres' }, heat_distribution: 'radiators', persons_in_household: 3, hot_water_via_heating: true, boiler_age: 'unknown', renovation_status: 'unknown', pipe_system: 'single-pipe', other_heat_sources: [], unused_areas: false, pv_battery: false }, sales: { ownership: 'owner', timeline: 'within6m', decision_makers: 'yes' }, contact: { contact_name: 'Helga Berger (demo)', contact_phone: '+49 151 0000002', contact_time: 'morning' } },
  { name: 'Demo B-05 (contradictions)', postcode: '85354', lang: 'en', answers: { house_type: 'detached', construction_year: 2006, floor_area_m2: 125, energy_carrier: 'gas', consumption: 27000, heat_distribution: 'mixed', persons_in_household: 3, hot_water_via_heating: true, boiler_age: '10to20', renovation_status: 'unrenovated', other_heat_sources: ['solar thermal'], rooms: 14, unused_areas: false, pv_battery: false }, sales: { ownership: 'owner', timeline: 'within2y', decision_makers: 'unsure' }, contact: { contact_name: 'Anna Weber (demo)', contact_phone: '+49 160 0000003', contact_time: 'evening' } },
];

for (const h of houses) {
  const s = newSession(`demo-${h.postcode}-${Date.now()}`, 'voice', h.lang as 'de' | 'en');
  const ctx = { session: s, config: toolConfig };
  await runTool(ctx, 'start_assessment', {});
  await runTool(ctx, 'set_language', { lang: h.lang });
  await runTool(ctx, 'lookup_location', { postcode: h.postcode });
  await runTool(ctx, 'update_profile', { answers: Object.entries(h.answers).map(([slot, v]) => typeof v === 'object' && v && 'unit' in v ? { slot, value: v.value, unit: v.unit } : { slot, value: v }) });
  if (h.outdoor) await runTool(ctx, 'record_outdoor_spot', h.outdoor);
  await runTool(ctx, 'stop_questions', {});
  await runTool(ctx, 'confirm_details', { confirmed: true });
  await runTool(ctx, 'assess_building', {});
  await runTool(ctx, 'deliver_result', {});
  await runTool(ctx, 'update_profile', { answers: Object.entries(h.sales).map(([slot, value]) => ({ slot, value })) });
  await runTool(ctx, 'mark_sales_questions_done', {});
  await runTool(ctx, 'record_consent', { share: true, contact: true, photos: true });
  await runTool(ctx, 'update_profile', { answers: Object.entries(h.contact).map(([slot, value]) => ({ slot, value })) });
  const fin = (await runTool(ctx, 'finish_session', {})) as { outcome: string; report: { lead_id: string } };
  store.save(s);
  console.log(`${h.name}: ${fin.report.lead_id} → ${fin.outcome}`);
}
