import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts', 'src/core/index.ts', 'src/mcp/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  dts: { entry: { 'core/index': 'src/core/index.ts' } },
  clean: false,
  splitting: false,
  sourcemap: true,
  banner: { js: '' },
});
