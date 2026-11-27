import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Relative asset paths so the bundle loads from Capacitor's capacitor://localhost origin.
  base: './',
  define: {
    // App Store builds: BLOQ_RELEASE=1 npm run build. Developer tools are removed from the bundle.
    __RELEASE__: JSON.stringify(process.env.BLOQ_RELEASE === '1'),
  },
  build: {
    target: 'es2022',
    outDir: mode === 'preview' ? 'preview' : 'dist',
    // The single-file web preview needs one script with no lazy chunks.
    rollupOptions: mode === 'preview' ? { output: { inlineDynamicImports: true } } : undefined,
  },
  server: { host: true },
  test: { globals: false },
}));
