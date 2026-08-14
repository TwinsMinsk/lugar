import 'server-only';

import pino from 'pino';

/**
 * Structured logging.
 *
 * Railway captures stdout, so JSON lines are what makes a log searchable there
 * — a pretty-printed transport would be unreadable in the deploy and is not
 * worth the extra dependency locally either.
 *
 * The redaction list is not decoration. The WhatsApp access token and the
 * signature header both routinely appear inside error objects that this logger
 * is asked to print, and a token in a log line is a leaked credential with a
 * long tail.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers["x-hub-signature-256"]',
      '*.accessToken',
      '*.password',
      '*.token',
    ],
    censor: '[redacted]',
  },
  base: undefined,
});
