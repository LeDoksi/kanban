import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // GitHub Pages отдаёт проектный сайт с подпути /kanban/, а не с корня —
  // без base ссылки на собранные assets будут битыми.
  base: '/kanban/',
  plugins: [react(), tailwindcss()],
});
