/**
 * Env loader for standalone scripts (drizzle-kit, migrate, seed, worker).
 *
 * Next.js loads .env.local automatically, but plain `node`/`tsx` processes do
 * not. Precedence matches Next's own: .env.local wins over .env.
 */
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
