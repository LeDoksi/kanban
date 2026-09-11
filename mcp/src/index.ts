/* Точка входа MCP-сервера. Запускается Claude Code по stdio; любой вывод
   в stdout, кроме протокола, ломает связь — поэтому диагностика идёт
   только в stderr. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.ts';

const server = new McpServer({ name: 'kanban', version: '1.0.0' });
registerTools(server);

await server.connect(new StdioServerTransport());
console.error('kanban mcp: подключён');
