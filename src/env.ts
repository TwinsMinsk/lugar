/**
 * Environment contract.
 *
 * Parsed once, at module load, so a misconfigured deploy fails immediately and
 * loudly rather than at the first request that happens to need a variable.
 *
 * Two exports, deliberately separated:
 *   - `env`       server-only. Importing this from a Client Component throws.
 *   - `publicEnv` safe for the browser. Only NEXT_PUBLIC_* values.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time, so those must be referenced as
 * full literal `process.env.NEXT_PUBLIC_X` expressions — destructuring
 * `process.env` would break the inlining.
 */
import { z } from 'zod';

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

/** Treats "" the same as undefined — Railway/CI often inject empty strings. */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const requiredInProd = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .superRefine((value, ctx) => {
      if (!value && process.env.NODE_ENV === 'production' && !isBuildPhase) {
        ctx.addIssue({ code: 'custom', message: `${label} is required in production` });
      }
    });

const serverSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    /**
     * Connection used only while `next build` prerenders.
     *
     * Railway build containers have no route to the private network, so the
     * address the app uses at runtime is unreachable exactly when the build
     * needs to read published content. Set this to the provider's public
     * connection string; leave it unset anywhere the same address works for
     * both.
     */
    DATABASE_URL_BUILD: optionalString,

    BETTER_AUTH_SECRET: requiredInProd('BETTER_AUTH_SECRET'),
    BETTER_AUTH_URL: optionalString,
    /**
     * Comma-separated extra origins allowed to submit credentials (preview
     * domains, the E2E port). Empty in a normal deploy.
     */
    BETTER_AUTH_TRUSTED_ORIGINS: optionalString,
    INITIAL_OWNER_EMAIL: z
      .email()
      .optional()
      .or(z.literal('').transform(() => undefined)),

    // Object storage. When unset, the storage layer falls back to local disk,
    // which is fine for development and never acceptable in production.
    /**
     * 'local' forces on-disk storage (development only). Otherwise S3/R2 is
     * required — see src/lib/storage for why this is explicit rather than
     * derived from NODE_ENV.
     */
    /**
     * Empty is treated as unset, like every other optional variable here.
     *
     * `.env.example` ships this key blank and a Railway variable added without
     * a value arrives as an empty string — either would otherwise fail
     * validation and take the app down at boot with a message about an enum,
     * for a setting the deployer deliberately left alone.
     */
    STORAGE_DRIVER: z
      .string()
      .trim()
      .transform((value) => (value === '' ? undefined : value))
      .pipe(z.enum(['local', 's3']).optional())
      .optional(),
    /**
     * Where the local driver keeps files. Absolute in a deploy.
     *
     * Defaults to `.storage` under the working directory, which is right for
     * development and wrong everywhere else: the standalone server chdirs into
     * its own build output, so the default would put uploads inside the
     * directory the next release replaces. Point this at a mounted volume.
     */
    STORAGE_LOCAL_ROOT: optionalString,
    S3_ENDPOINT: optionalString,
    S3_REGION: optionalString.pipe(z.string().default('auto').optional()),
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_BUCKET: optionalString,

    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,

    WHATSAPP_MODE: z.enum(['fallback', 'mock', 'cloud_api']).default('fallback'),
    WHATSAPP_GRAPH_API_VERSION: z.string().default('v26.0'),
    WHATSAPP_PHONE_NUMBER_ID: optionalString,
    WHATSAPP_BUSINESS_ACCOUNT_ID: optionalString,
    WHATSAPP_ACCESS_TOKEN: optionalString,
    WHATSAPP_APP_SECRET: optionalString,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalString,
    WHATSAPP_INTERNAL_RECIPIENTS: optionalString,
    WHATSAPP_LEAD_ALERT_TEMPLATE_NAME: optionalString,
    WHATSAPP_LEAD_ALERT_TEMPLATE_LANGUAGE: z.string().default('ru'),

    PREVIEW_SECRET: requiredInProd('PREVIEW_SECRET'),
    CRON_SECRET: optionalString,
  })
  // cloud_api is all-or-nothing: a half-configured provider would silently
  // degrade to dropping internal alerts, which is worse than staying on
  // fallback. Fail the boot instead.
  .superRefine((value, ctx) => {
    if (value.WHATSAPP_MODE !== 'cloud_api') return;
    const required = [
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    ] as const;
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when WHATSAPP_MODE=cloud_api`,
        });
      }
    }
  });

function parseServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n`);
  }
  return parsed.data;
}

let cached: z.infer<typeof serverSchema> | null = null;

/** Server-only environment. Throws if reached from the browser bundle. */
export const env: z.infer<typeof serverSchema> = new Proxy({} as z.infer<typeof serverSchema>, {
  get(_target, prop: string) {
    if (typeof window !== 'undefined') {
      throw new Error(
        `Attempted to read server env "${prop}" from the browser. ` +
          `Use publicEnv for values that may reach the client.`,
      );
    }
    cached ??= parseServerEnv();
    return cached[prop as keyof typeof cached];
  },
});

/** Browser-safe environment. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  mediaBaseUrl: process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '',
  whatsappPhone: process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '34624527303',
  gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '',
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '',
} as const;

export type ServerEnv = z.infer<typeof serverSchema>;
