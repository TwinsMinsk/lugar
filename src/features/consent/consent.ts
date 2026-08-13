/**
 * Cookie consent.
 *
 * Three categories, only one of which is on by default. Analytics and marketing
 * tags stay completely inert until the visitor opts in — not "loaded but not
 * firing", but never loaded at all, which is the only reading of consent that
 * actually holds up.
 *
 * The stored record includes the policy version, so a later change to the
 * consent text does not silently inherit an old agreement.
 */
export const CONSENT_COOKIE = 'lg_consent';
export const CONSENT_VERSION = '2026-08-13';
const CONSENT_MAX_AGE_DAYS = 180;

export const CONSENT_CATEGORIES = ['necessary', 'analytics', 'marketing'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

export type ConsentState = {
  version: string;
  /** Epoch milliseconds. Recorded so a consent can be evidenced later. */
  at: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export const DENY_ALL: Omit<ConsentState, 'version' | 'at'> = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export const ALLOW_ALL: Omit<ConsentState, 'version' | 'at'> = {
  necessary: true,
  analytics: true,
  marketing: true,
};

export function serializeConsent(state: ConsentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

/**
 * Parse a stored consent record.
 *
 * Returns null — meaning "ask again" — for anything unparseable OR for a record
 * written against an older policy version. Treating a stale version as valid
 * would be claiming consent the visitor never gave to the current text.
 */
export function parseConsent(raw: string | null | undefined): ConsentState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Partial<ConsentState>;
    if (record.version !== CONSENT_VERSION) return null;
    return {
      version: CONSENT_VERSION,
      at: typeof record.at === 'number' ? record.at : Date.now(),
      necessary: true,
      analytics: record.analytics === true,
      marketing: record.marketing === true,
    };
  } catch {
    return null;
  }
}

export function readConsentCookie(): ConsentState | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  return parseConsent(raw);
}

export function writeConsentCookie(state: ConsentState): void {
  if (typeof document === 'undefined') return;
  const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(state)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function buildConsentState(choice: Omit<ConsentState, 'version' | 'at'>): ConsentState {
  return { ...choice, version: CONSENT_VERSION, at: Date.now() };
}

/** Event other components can listen for to react to a consent change. */
export const CONSENT_CHANGED_EVENT = 'lugar:consent-changed';

/** Custom event the footer link dispatches to reopen the settings panel. */
export const CONSENT_OPEN_EVENT = 'lugar:consent-open';

/**
 * Consent as an external store.
 *
 * The cookie is genuinely external state that can change from more than one
 * place (this tab's banner, another tab, the footer link). Reading it in an
 * effect and mirroring it into component state means a render pass where the
 * component believes consent is unknown, and a cascading re-render to correct
 * itself. `useSyncExternalStore` reads it during render instead, with no
 * effect and no cascade.
 *
 * The snapshot is cached against the raw cookie string because
 * `useSyncExternalStore` requires a referentially stable value — returning a
 * freshly parsed object every call would loop forever.
 */
let snapshotRaw: string | null = null;
let snapshotValue: ConsentState | null = null;

function rawConsentCookie(): string | null {
  if (typeof document === 'undefined') return null;
  return (
    document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`))
      ?.slice(CONSENT_COOKIE.length + 1) ?? null
  );
}

export function getConsentSnapshot(): ConsentState | null {
  const raw = rawConsentCookie();
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshotValue = parseConsent(raw);
  }
  return snapshotValue;
}

/** Server snapshot: consent is per-person, so it is always unknown at build. */
export function getConsentServerSnapshot(): ConsentState | null {
  return null;
}

export function subscribeToConsent(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  // Another tab writing the cookie fires `storage`, not our custom event.
  window.addEventListener('focus', onChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    window.removeEventListener('focus', onChange);
  };
}
