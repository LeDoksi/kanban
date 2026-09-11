import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveProject } from './db.ts';

export function registerTools(server: McpServer) {
  server.registerTool(
    'board',
    {
      description: 'Сводка доски проекта',
      inputSchema: { project: z.string().optional() },
    },
    async ({ project }) => {
      const p = await resolveProject(project);
      return { content: [{ type: 'text', text: `${p.id} · пусто` }] };
    },
  );
}
