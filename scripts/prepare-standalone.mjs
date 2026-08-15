/**
 * Finish the standalone build.
 *
 * `output: 'standalone'` emits a self-contained server and its node_modules —
 * but deliberately not `public/` or `.next/static/`. Next expects the deploy
 * step to copy them, and when it does not, the server starts, answers, and
 * serves HTML whose every stylesheet, script and font 404s. The page is legible
 * enough to look like a CSS bug rather than a missing directory.
 *
 * Plain Node rather than tsx: this touches no database and no path aliases, and
 * it runs on every deploy, where a TypeScript loader is startup cost for
 * nothing.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.env.NEXT_DIST_DIR || '.next';
const standalone = join(dist, 'standalone');

if (!existsSync(standalone)) {
  console.error(
    `No standalone output at ${standalone}. ` +
      `Either the build failed, or next.config.ts no longer sets output: 'standalone'.`,
  );
  process.exit(1);
}

/** `.next/static` has to land inside the standalone copy of `.next`. */
const staticFrom = join(dist, 'static');
const staticTo = join(standalone, dist, 'static');
if (existsSync(staticFrom)) {
  mkdirSync(join(standalone, dist), { recursive: true });
  cpSync(staticFrom, staticTo, { recursive: true });
  console.log(`copied ${staticFrom} -> ${staticTo}`);
} else {
  console.error(`Missing ${staticFrom}; the deployed site would have no CSS or JS.`);
  process.exit(1);
}

// `public/` is optional — the project may legitimately have none.
if (existsSync('public')) {
  cpSync('public', join(standalone, 'public'), { recursive: true });
  console.log(`copied public -> ${join(standalone, 'public')}`);
}
