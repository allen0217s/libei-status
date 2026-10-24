import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
  plugins: [vue()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2022',
    lib: { entry: 'src/index.ts', name: 'LibeiStatusV2', formats: ['es'], fileName: () => 'index.js', cssFileName: 'index' },
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
    sourcemap: false,
  },
});
