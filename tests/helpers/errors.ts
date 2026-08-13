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
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
} as const;
