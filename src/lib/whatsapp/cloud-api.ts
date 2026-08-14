import 'server-only';

import { env } from '@/env';
import {
  classifyError,
  type SendResult,
  type SendTemplateParams,
  type SendTextParams,
} from './provider';

/**
 * Meta Cloud API transport.
 *
 * Deliberately thin: build the request, post it, and turn whatever comes back
 * into one of the four outcomes the outbox knows how to act on. No retrying
 * happens here — the worker owns that, because a retry has to survive the
 * process dying, which an in-memory loop does not.
 */

/** A hung request holds a worker slot; Meta answers in well under this. */
const REQUEST_TIMEOUT_MS = 15_000;

type GraphError = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
    fbtrace_id?: string;
  };
};

type GraphSuccess = { messages?: Array<{ id?: string }> };

function endpoint(): string {
  const version = env.WHATSAPP_GRAPH_API_VERSION;
  return `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

/** Cloud API wants digits only — a leading '+' is rejected on some numbers. */
function normalizeRecipient(to: string): string {
  return to.replace(/\D/g, '');
}

/**
 * Ordered template parameters.
 *
 * Meta matches body parameters by position, not by name, so {"2": …, "1": …}
 * must not be sent in object order — a template that renders the phone number
 * where the customer's name belongs is worse than one that fails outright.
 */
function orderedParameters(variables?: Record<string, string>) {
  if (!variables) return [];
  return Object.keys(variables)
    .map((key) => ({ key, index: Number(key) }))
    .filter((entry) => Number.isFinite(entry.index))
    .sort((a, b) => a.index - b.index)
    .map((entry) => ({ type: 'text' as const, text: variables[entry.key]! }));
}

async function post(payload: unknown): Promise<SendResult> {
  let response: Response;
  let body: GraphSuccess & GraphError;

  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Never cached: this is a side effect, not a read.
      cache: 'no-store',
    });
  } catch (error) {
    // Network failure, DNS, or our own timeout. All worth another attempt —
    // and note the message may well have been delivered, which is why the
    // outbox carries a dedupe key rather than assuming exactly-once.
    return {
      status: 'retryable',
      code: 0,
      message: error instanceof Error ? error.message : 'network error',
    };
  }

  try {
    body = (await response.json()) as GraphSuccess & GraphError;
  } catch {
    body = {};
  }

  if (response.ok) {
    const id = body.messages?.[0]?.id;
    if (id) return { status: 'sent', providerMessageId: id };
    // 200 with no message id is not something to retry blindly; treat it as
    // needing a human rather than silently claiming success.
    return { status: 'permanent', code: -1, message: 'Cloud API returned no message id' };
  }

  const code = body.error?.code ?? -1;
  const message =
    body.error?.error_data?.details ?? body.error?.message ?? `HTTP ${response.status}`;
  const classification = classifyError(code, response.status);

  if (classification === 'needs_template') return { status: 'needs_template', code };

  if (classification === 'retryable') {
    // 429 may carry a hint; honour it rather than guessing.
    const retryAfter = Number(response.headers.get('retry-after'));
    return {
      status: 'retryable',
      code,
      message,
      retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    };
  }

  return { status: 'permanent', code, message };
}

export async function sendTextViaCloudApi(params: SendTextParams): Promise<SendResult> {
  return post({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeRecipient(params.to),
    type: 'text',
    text: { body: params.body, preview_url: params.previewUrl ?? false },
  });
}

export async function sendTemplateViaCloudApi(params: SendTemplateParams): Promise<SendResult> {
  const parameters = orderedParameters(params.variables);

  return post({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeRecipient(params.to),
    type: 'template',
    template: {
      name: params.name,
      language: { code: params.language },
      ...(parameters.length > 0 ? { components: [{ type: 'body', parameters }] } : {}),
    },
  });
}

export { normalizeRecipient, orderedParameters };
