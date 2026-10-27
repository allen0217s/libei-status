import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ configFile: false, logLevel: 'error', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, resolve: { alias: { '@': path.join(root, 'src') } }, build: { target: 'es2022', outDir: path.join(root, '.test-api'), emptyOutDir: false, minify: false, lib: { entry: path.join(root, 'tests/universal-entry.ts'), formats: ['es'], fileName: () => 'universal.mjs' } } });
await import('./universal.test.mjs');
