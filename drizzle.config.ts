import './scripts/load-env';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL must be set to run drizzle-kit. See .env.example.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  // Explicit migrations, never `push`, so publish/rollback history is
  // reproducible on Railway via the pre-deploy step.
  strict: true,
  verbose: true,
});
