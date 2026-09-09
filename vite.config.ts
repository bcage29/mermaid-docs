import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mermaidDocsApi } from './vite-plugin-api.js';

export default defineConfig({
  root: 'src/web',
  base: process.env.VITE_MERMAID_DOCS_BASE ?? '/',
  // The API and its file watcher run inside `npm run dev`, mounted by mermaidDocsApi() as
  // middleware. Set MERMAID_DOCS_ROOT to document a workspace other than examples/.
  plugins: [react(), mermaidDocsApi()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
});
