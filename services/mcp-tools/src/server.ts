// MCP server "heatpump-tools": the same tool registry the orchestrator uses, exposed over MCP.
// Every tool takes a session_id (MCP calls are stateless); create one with `create_session`.
//   stdio:  npx tsx services/mcp-tools/src/server.ts
//   HTTP:   npx tsx services/mcp-tools/src/server.ts --http 8788   (Streamable HTTP at /mcp)
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { newSession, runTool, TOOLS, type SessionStore, type ToolConfig } from '@hpr/agent';
import { initRuntime } from '../../shared/runtime';

export function mcpToolList() {
  return [
    {
      name: 'create_session',
      description: 'Start a new homeowner session. Returns session_id to pass to every other tool.',
      inputSchema: { type: 'object', properties: { channel: { type: 'string', enum: ['chat', 'voice'] }, lang: { type: 'string', enum: ['de', 'en'] } } },
    },
    ...TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        ...t.parameters,
        properties: { session_id: { type: 'string' }, ...(t.parameters.properties as object) },
        required: ['session_id', ...((t.parameters.required as string[]) ?? [])],
      },
    })),
  ];
}

export async function callMcpTool(store: SessionStore, config: ToolConfig, name: string, args: Record<string, unknown>) {
  if (name === 'create_session') {
    const s = newSession(randomUUID(), (args.channel as 'chat' | 'voice') ?? 'voice', (args.lang as 'de' | 'en') ?? 'de');
    store.save(s);
    return { session_id: s.id };
  }
  const { session_id, ...rest } = args;
  const s = store.get(String(session_id));
  if (!s) return { error: 'unknown session_id; call create_session first' };
  const result = await runTool({ session: s, config }, name, rest);
  store.save(s);
  return result;
}

export function buildMcpServer(store: SessionStore, config: ToolConfig) {
  const server = new Server({ name: 'heatpump-tools', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolList() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await callMcpTool(store, config, req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
    const isError = typeof result === 'object' && result != null && 'error' in result;
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError };
  });
  return server;
}

async function main() {
  const { store, toolConfig } = initRuntime();
  const httpIdx = process.argv.indexOf('--http');
  if (httpIdx === -1) {
    await buildMcpServer(store, toolConfig).connect(new StdioServerTransport());
    return;
  }
  const port = Number(process.argv[httpIdx + 1] ?? 8788);
  createServer(async (req, res) => {
    if (!req.url?.startsWith('/mcp')) { res.writeHead(404).end(); return; }
    // Stateless mode: a fresh server + transport per request; session state lives in the SQLite store.
    const server = buildMcpServer(store, toolConfig);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    let body = '';
    for await (const chunk of req) body += chunk;
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  }).listen(port, () => console.error(`heatpump-tools MCP on http://localhost:${port}/mcp`));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
