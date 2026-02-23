import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to running WeaveLink HTTP server
      '/api': {
        target: 'http://localhost:3000',
        rewrite: path => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
