/**
 * Drizzle wraps driver errors, so `error.message` is only ever
 * "Failed query: …". The constraint name, SQLSTATE and detail live on
 * `error.cause` (the postgres-js PostgresError). Asserting on the wrapper
 * message would pass for ANY failed query, which is exactly the kind of test
 * that gives false confidence.
 */
export type PgErrorInfo = {
  code?: string;
  constraint?: string;
  detail?: string;
  message: string;
};

export async function captureDbError(operation: Promise<unknown>): Promise<PgErrorInfo> {
  try {
    await operation;
  } catch (error) {
    const cause = (error as { cause?: Record<string, unknown> }).cause ?? {};
    return {
      code: cause.code as string | undefined,
      constraint: (cause.constraint_name ?? cause.constraint) as string | undefined,
      detail: cause.detail as string | undefined,
      message: (cause.message as string) ?? (error as Error).message,
    };
  }
  throw new Error('Expected the database to reject this operation, but it succeeded.');
}

/** Postgres SQLSTATE codes worth asserting on by name. */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  RESTRICT_VIOLATION: '23001',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
} as const;

/**
 * The codes a blocked `ON DELETE RESTRICT` can raise, across versions.
 *
 * Postgres 18 reports `23001 restrict_violation` where 17 and earlier reported
 * `23503 foreign_key_violation` for the same refusal. Asserting on one of them
 * makes a test that is right on the developer's machine and wrong about the
 * deployed database — which is exactly what happened here: local Postgres is
 * 17, production is 18.6, and this suite had never run against 18 until CI
 * started building with a service container that mirrors production.
 *
 * What matters is that the deletion was refused and by which constraint, not
 * which of the two spellings the server chose.
 */
export const RESTRICT_CODES: readonly string[] = [PG.RESTRICT_VIOLATION, PG.FOREIGN_KEY_VIOLATION];
