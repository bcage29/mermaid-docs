import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mmdocsApi } from './vite-plugin-api.js';

export default defineConfig({
  root: 'src/web',
  // Copied to the root of dist/web and served as-is, so the icons live in one place
  // rather than being duplicated under src/.
  publicDir: '../../icons',
  // The API and its file watcher run inside `npm run dev`, mounted by mmdocsApi() as
  // middleware. Set MMDOCS_ROOT to document a workspace other than examples/.
  plugins: [react(), mmdocsApi()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
});
