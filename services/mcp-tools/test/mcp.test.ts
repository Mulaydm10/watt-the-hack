import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryStore, TOOLS } from '@hpr/agent';
import { buildMcpServer } from '../src/server';

async function connect() {
  const store = new MemoryStore();
  const server = buildMcpServer(store, { reportsDir: mkdtempSync(join(tmpdir(), 'mcp-')), publicBaseUrl: 'http://localhost' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return JSON.parse((r.content as { text: string }[])[0].text);
  };
  return { client, call };
}

describe('MCP server', () => {
  it('lists every registry tool plus create_session, each requiring session_id', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['create_session', ...TOOLS.map((t) => t.name)]);
    for (const t of tools.slice(1)) expect((t.inputSchema as { required: string[] }).required).toContain('session_id');
  });

  it('runs a B-04 style session over MCP and gets the same verdict as the engine', async () => {
    const { call } = await connect();
    const { session_id } = await call('create_session', { channel: 'voice', lang: 'en' });
    await call('start_assessment', { session_id });
    await call('set_language', { session_id, lang: 'en' });
    const loc = await call('lookup_location', { session_id, postcode: '85221' });
    expect(loc.location.status).toBe('in');
    await call('update_profile', { session_id, answers: [
      { slot: 'house_type', value: 'semi' }, { slot: 'construction_year', value: 1987 }, { slot: 'floor_area_m2', value: 160 },
      { slot: 'energy_carrier', value: 'oil' }, { slot: 'consumption', value: 2500, unit: 'litres' }, { slot: 'heat_distribution', value: 'radiators' },
      { slot: 'persons_in_household', value: 3 }, { slot: 'hot_water_via_heating', value: true }, { slot: 'boiler_age', value: 'unknown' },
      { slot: 'renovation_status', value: 'unknown' }, { slot: 'pipe_system', value: 'single-pipe' },
    ] });
    const a = await call('assess_building', { session_id });
    expect(a.verdict).toBe('yellow');
    expect(a.heat_load.best_kw).toBe(9.5);
    expect(a.areas.map((x: { key: string }) => x.key)).toEqual(['demand', 'fit', 'feasibility', 'confidence']);
    const costs = await call('estimate_costs', { session_id });
    expect(costs.running_costs.heat_pump_eur_per_year).toBe(2043);
    expect(costs.running_costs.current_eur_per_year).toBe(4250);
  });

  it('unknown session id is an error, not a crash', async () => {
    const { client } = await connect();
    const r = await client.callTool({ name: 'assess_building', arguments: { session_id: 'nope' } });
    expect(r.isError).toBe(true);
  });
});
