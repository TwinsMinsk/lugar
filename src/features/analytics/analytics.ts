'use client';

import { CONSENT_CHANGED_EVENT, readConsentCookie, type ConsentState } from '../consent/consent';

/**
 * Analytics adapter.
 *
 * The only way to emit an event. Two rules it enforces so that no call site has
 * to remember them:
 *
 *  1. **Nothing leaves the browser without analytics consent.** Events raised
 *     before consent are dropped, not queued — replaying them the moment
 *     someone opts in would attribute behaviour they had not agreed to share.
 *  2. **No event may carry personal data.** The payload type admits only
 *     non-identifying context, and `sanitize` strips anything that looks like a
 *     name, phone number or free-text comment even if a future call site tries.
 *
 * The brief's event list is closed on purpose: adding an event is a decision,
 * not a convenience.
 */
export type AnalyticsEvent =
  | { name: 'cta_whatsapp_click'; placement: string }
  | { name: 'form_open'; form: string; placement?: string }
  | { name: 'lead_form_submit_success'; form: string; service?: string }
  | { name: 'portfolio_project_view'; slug: string }
  | { name: 'portfolio_filter_change'; category: string }
  | { name: 'phone_click'; placement: string };

type Payload = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let consent: ConsentState | null = null;
let listening = false;

function ensureListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  consent = readConsentCookie();
  window.addEventListener(CONSENT_CHANGED_EVENT, (event) => {
    consent = (event as CustomEvent<ConsentState>).detail ?? readConsentCookie();
  });
}

/**
 * Defence in depth: even though the event type forbids it, drop any value that
 * resembles personal data. A leak here would be an ordinary-looking one-line
 * change at a call site.
 */
const FORBIDDEN_KEYS = new Set(['name', 'phone', 'email', 'comment', 'city', 'message']);
const PHONE_LIKE = /(?:\+?\d[\s-]?){7,}/;

function sanitize(payload: Payload): Payload {
  const clean: Payload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') {
      if (PHONE_LIKE.test(value)) continue;
      clean[key] = value.slice(0, 120);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  ensureListening();

  // No consent, no transmission. Not queued — dropped.
  if (!consent?.analytics) return;

  const { name, ...rest } = event;
  const payload = sanitize(rest as Payload);

  if (typeof window.gtag === 'function') {
    window.gtag('event', name, payload);
    return;
  }
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: name, ...payload });
  }
}

export function hasAnalyticsConsent(): boolean {
  ensureListening();
  return consent?.analytics === true;
}
