#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// Knowledge MCP scaffold — tool surface is intentionally empty for now.
// Add knowledge-source tools (docs lookup, type-system reference, etc.) here.
const tools: Tool[] = [
  {
    name: 'knowledge_ping',
    description: 'Smoke-test tool. Returns a static payload to verify the knowledge MCP is wired up correctly.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function main() {
  const server = new Server(
    {
      name: 'hybris-mcp-knowledge',
      version: pkg.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const shutdown = async () => {
    console.error('Shutting down Hybris Knowledge MCP server...');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'knowledge_ping':
          result = {
            ok: true,
            server: 'hybris-mcp-knowledge',
            version: pkg.version,
            note: 'Scaffold — replace with real knowledge tools.',
          };
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          { type: 'text', text: `Error: ${errorMessage}` },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hybris Knowledge MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
