import 'server-only';

import type { z } from 'zod';

/**
 * What a server action returns.
 *
 * `error` is a *code*, never a sentence. The panel owns the wording, in one
 * dictionary per screen merged over a shared base, so a message can be fixed
 * without touching an action and an action cannot leak English into a Russian
 * interface.
 */
export type ActionFailure = {
  ok: false;
  error: string;
  /** Rows that stand in the way, named so a refusal can be acted on. */
  blockedBy?: Array<Record<string, string>>;
  /** Per-field codes, for forms that mark the field rather than the form. */
  fieldErrors?: Record<string, string>;
};

export type ActionOutcome = { ok: true } | ActionFailure;

/** A code looks like this. Anything else is a sentence that escaped. */
const CODE = /^[a-z0-9_]+$/;

/**
 * Turn a Zod failure into a code.
 *
 * Schemas here carry codes as their messages — `.regex(pattern, 'slug_format')`
 * — so the first issue usually *is* the code. When it is not, the message is
 * Zod's own English default ("String must contain at least 2 character(s)"),
 * and returning that verbatim is how English got in front of the owner. Those
 * collapse to `invalid_input`, which the dictionary always has a phrase for.
 */
export function codeFromZod(error: z.ZodError, fallback = 'invalid_input'): string {
  const message = error.issues[0]?.message;
  return message && CODE.test(message) ? message : fallback;
}

export function failFromZod(error: z.ZodError, fallback = 'invalid_input'): ActionFailure {
  return { ok: false, error: codeFromZod(error, fallback) };
}
