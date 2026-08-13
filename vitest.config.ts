import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      // `server-only` throws on import outside an RSC graph. Vitest runs in
      // Node, which IS the server, so it is neutralised here.
      'server-only': resolve(import.meta.dirname, './tests/helpers/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Integration tests share one Postgres database; running files in parallel
    // would interleave TRUNCATEs across suites.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
