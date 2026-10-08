import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mermaidDocsApi } from './vite-plugin-api.js';

export default defineConfig({
  root: 'src/web',
  // Relative, so the one bundle works at the live server's root and from whatever subpath
  // a published site lands on - `/<repo>/` for a GitHub Pages project site.
  base: './',
  // The API and its file watcher run inside `npm run dev`, mounted by mermaidDocsApi() as
  // middleware. Set MERMAID_DOCS_ROOT to document a workspace other than examples/.
  plugins: [react(), mermaidDocsApi()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    // Mermaid is the size. Its core alone is past Vite's 500 kB default, and its heaviest
    // pieces (ELK at ~1.4 MB, the langium parser, cytoscape, katex) are its own lazy
    // imports, fetched only when a diagram needs them. Splitting cannot bring either under
    // the default, so the limit sits just above ELK and still catches real growth.
    chunkSizeWarningLimit: 1600,
  },
});
