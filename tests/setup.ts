import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

// Vitest already sets NODE_ENV=test (and @types/node types it readonly).
// Integration tests run against a dedicated database on the same local
// Postgres so they can TRUNCATE freely without touching dev data.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://lugar:lugar@localhost:5432/lugar_test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-not-used-in-production-0000000000';
process.env.PREVIEW_SECRET ??= 'test-preview-secret-0000000000000000000000';
