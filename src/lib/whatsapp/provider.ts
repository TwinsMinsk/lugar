/**
 * WhatsApp provider contract.
 *
 * Three implementations sit behind this: `fallback` (wa.me links only),
 * `mock` (records without touching the network) and `cloud_api` (Meta Graph).
 * The CRM and the outbox worker only ever see this interface, so switching
 * modes is an environment variable rather than a code path — and the whole
 * pipeline stays exercisable in tests without sending a real message.
 */

export type SendResult =
  | { status: 'sent'; providerMessageId: string }
  | { status: 'skipped'; reason: 'mock' | 'no_programmatic_send' }
  /** Transient — worth retrying with backoff. */
  | { status: 'retryable'; code: number; message: string; retryAfterMs?: number }
  /** Terminal — retrying will never succeed. */
  | { status: 'permanent'; code: number; message: string }
  /** Outside the 24h service window; an approved template is required. */
  | { status: 'needs_template'; code: number };

export type SendTextParams = { to: string; body: string; previewUrl?: boolean };

export type SendTemplateParams = {
  to: string;
  name: string;
  language: string;
  variables?: Record<string, string>;
};

export type WhatsAppMode = 'fallback' | 'mock' | 'cloud_api';

export interface WhatsAppProvider {
  readonly mode: WhatsAppMode;
  /** False for `fallback`, where the only capability is building a link. */
  readonly canSendProgrammatically: boolean;
  sendText(params: SendTextParams): Promise<SendResult>;
  sendTemplate(params: SendTemplateParams): Promise<SendResult>;
  /** Every mode implements this — the wa.me hand-off is always available. */
  buildHandoffLink(params: { text?: string }): string;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
}

/**
 * Meta error codes worth classifying explicitly.
 *
 * Classification is a table rather than scattered conditionals so that adding a
 * code is a one-line change and the retry policy stays inspectable.
 */
export const ERROR_CLASSIFICATION: Record<number, SendResult['status']> = {
  4: 'retryable', // app-level rate limit
  80007: 'retryable', // WABA rate limit
  130429: 'retryable', // Cloud API throughput limit
  131056: 'retryable', // too many messages to this recipient
  131047: 'needs_template', // re-engagement required (>24h)
  131026: 'permanent', // undeliverable — no WhatsApp / ToS not accepted
  131049: 'permanent', // not delivered to maintain engagement
  132000: 'permanent', // template param count mismatch
  132001: 'permanent', // template does not exist
  132005: 'permanent', // translated text too long
  132007: 'permanent', // template policy violation
  132012: 'permanent', // template param format mismatch
  132015: 'permanent', // template paused
  132016: 'permanent', // template disabled
};

export function classifyError(code: number, httpStatus?: number): SendResult['status'] {
  const known = ERROR_CLASSIFICATION[code];
  if (known) return known;
  // Unknown 5xx is worth retrying; unknown 4xx almost never is.
  if (httpStatus && httpStatus >= 500) return 'retryable';
  return 'permanent';
}
