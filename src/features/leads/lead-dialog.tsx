'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { buttonClasses } from '@/components/ui/button';
import { track } from '@/features/analytics/analytics';
import {
  LAST_TOUCH_KEY,
  decodeTouch,
  FIRST_TOUCH_COOKIE,
  hasAttributionSignal,
  readUtmFromLocation,
} from '@/features/attribution/attribution';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { startLeadForm, submitLead } from './actions';
import type { DwellToken } from './dwell-token';
import { useLeadDialog, type LeadDialogRequest } from './lead-dialog-context';
import type { LeadFormState } from './schema';

export type ServiceOption = { value: string; label: string };

/**
 * The lead dialog.
 *
 * Primary CTAs open this rather than jumping straight to WhatsApp, so every
 * enquiry lands in the CRM with its attribution and consent intact. The
 * WhatsApp hand-off happens *after* a successful submit — the visitor still
 * gets a one-tap conversation, but the lead is captured first and survives
 * regardless of what happens next.
 */
export function LeadDialog({
  services,
  privacyHref,
}: {
  services: ServiceOption[];
  /**
   * Same value the cookie banner links to (`ConsentGate` → `SiteLayout`), so
   * the consent checkbox here points at the real published privacy page
   * rather than a hardcoded slug that would drift the moment the owner
   * renames it.
   */
  privacyHref: string;
}) {
  const { request, close } = useLeadDialog();
  // The panel is a separate component so that closing the dialog unmounts it
  // and mount-time initialisers reset the form state. Resetting via an effect
  // instead would cause a cascading render on every open.
  if (!request) return null;
  return (
    <LeadDialogPanel
      request={request}
      close={close}
      services={services}
      privacyHref={privacyHref}
    />
  );
}

function LeadDialogPanel({
  request,
  close,
  services,
  privacyHref,
}: {
  request: LeadDialogRequest;
  close: () => void;
  services: ServiceOption[];
  privacyHref: string;
}) {
  const t = useTranslations('form');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LeadFormState>({ status: 'idle' });
  const [pending, setPending] = useState(false);

  /**
   * Minted once per dialog mount. A double-click or a bfcache replay reuses
   * this key and yields one lead; reopening the dialog mounts a fresh panel and
   * mints a new one, so two genuine enquiries from the same person both land.
   */
  const idempotencyKeyRef = useRef<string | null>(null);
  /**
   * When the form opened, attested by the server — not `Date.now()`. A
   * visitor's device clock is not this component's business: see
   * `dwell-token.ts` for why trusting it silently discarded submissions from
   * anyone whose clock ran fast. If this is still null by the time the form is
   * submitted (the request has not returned yet, or failed), the submission
   * is missing its signature and the server treats it exactly like any other
   * malformed one — the same outcome the old code had before the mount effect
   * ran, just reached a different way.
   */
  const dwellTokenRef = useRef<DwellToken | null>(null);

  // Populated on mount rather than during render: crypto.randomUUID() is
  // impure, and a Server Action obviously cannot be called from a render body.
  useEffect(() => {
    idempotencyKeyRef.current ??= crypto.randomUUID();
    startLeadForm()
      .then((token) => {
        dwellTokenRef.current ??= token;
      })
      .catch(() => {
        // Left null. A submission before this resolves is treated as
        // malformed by the server, same as a missing field would be.
      });
  }, []);

  // Focus management: into the panel on open, back to the opener on close,
  // trapped while open, Escape to dismiss.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [close]);

  // The server returns message *codes*; the UI owns the wording. next-intl
  // types keys literally, so a dynamic lookup needs a widened signature.
  const translate = t as unknown as (key: string) => string;

  const fieldError = (field: string): string | undefined => {
    if (state.status !== 'error') return undefined;
    const code = state.fieldErrors?.[field]?.[0];
    if (!code) return undefined;
    return translate(`errors.${code}`);
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);

    const formData = new FormData(event.currentTarget);
    // Fall back defensively in case submit somehow precedes the mount effect.
    idempotencyKeyRef.current ??= crypto.randomUUID();
    formData.set('idempotencyKey', idempotencyKeyRef.current);
    if (dwellTokenRef.current) {
      formData.set('renderedAt', String(dwellTokenRef.current.renderedAt));
      formData.set('renderedAtSignature', dwellTokenRef.current.signature);
    }
    formData.set('locale', locale);
    formData.set('pageContext', window.location.pathname);

    /**
     * Attribution: what is stored, plus what the address bar says right now.
     *
     * The two halves answer to different rules, which is why they are read
     * separately. First and last touch live in a cookie and in sessionStorage,
     * so they exist only once the visitor has accepted marketing cookies — for
     * anyone who declined, both come back empty and that is correct. The
     * campaign parameters in the current URL are not storage: they are part of
     * the request the visitor is deliberately sending, alongside a consent box
     * about processing their data, so they travel with the enquiry either way.
     * Losing them would mean the studio cannot tell which advert produced a
     * lead from a visitor who declined a cookie, which is not what declining a
     * cookie is about.
     */
    try {
      const last = decodeTouch(sessionStorage.getItem(LAST_TOUCH_KEY));
      const firstRaw = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith(`${FIRST_TOUCH_COOKIE}=`))
        ?.split('=')[1];
      const first = decodeTouch(firstRaw);
      const stored = { ...(first ?? {}), ...(last ?? {}) };

      const current = readUtmFromLocation(
        window.location.search,
        document.referrer,
        window.location.href,
      );
      // The address bar wins when it carries a campaign: that is the click that
      // led to this submission. Otherwise only the landing page is refreshed,
      // so an empty current URL cannot erase a stored campaign.
      const attribution = hasAttributionSignal(current)
        ? { ...stored, ...current }
        : { ...stored, landingLast: current.landingLast };

      formData.set('attribution', JSON.stringify(attribution));
    } catch {
      // Attribution is best-effort and must never block a submission.
    }

    try {
      const result = await submitLead(formData);
      setState(result);
      if (result.status === 'success') {
        // Service slug only — never the name, phone or comment.
        track({
          name: 'lead_form_submit_success',
          form: request.form,
          service: (formData.get('service') as string) || undefined,
        });
      }
    } catch {
      setState({ status: 'error', formError: 'generic' });
    } finally {
      setPending(false);
    }
  }

  const labelClass = 'text-ink-muted mb-1.5 block text-[13px] font-medium';
  const inputClass = cn(
    'border-line-strong bg-surface w-full rounded-[--radius-btn] border px-3.5 py-3 text-[15px]',
    'focus:border-accent outline-none transition-colors duration-[--duration-fast]',
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/45 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-bg w-full max-w-[560px] rounded-t-[--radius-card] p-6 motion-safe:animate-[fade-in-up_220ms_ease-out] sm:rounded-[--radius-card] sm:p-8"
      >
        {state.status === 'success' ? (
          <div className="text-center">
            <h2 id={titleId} className="font-display text-[28px] leading-tight">
              {t('successTitle')}
            </h2>
            <p className="text-ink-muted mt-3 text-[15px] leading-relaxed">
              {t('successBody', { publicId: state.publicId })}
            </p>
            <div className="mt-7 flex flex-col gap-2.5">
              {state.whatsappUrl ? (
                <a
                  href={state.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses('primary', 'lg')}
                >
                  {t('successWhatsapp')}
                </a>
              ) : null}
              {/* No number configured in Settings — the only action left is
                  closing, so it takes the weight the WhatsApp button would
                  otherwise carry rather than reading as an afterthought. */}
              <button
                type="button"
                onClick={close}
                className={buttonClasses(state.whatsappUrl ? 'ghost' : 'primary', 'md')}
              >
                {tc('close')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="font-display text-[26px] leading-tight">
                  {t('title')}
                </h2>
                <p className="text-ink-soft mt-2 text-[14px] leading-relaxed">{t('subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={tc('close')}
                className="border-line-strong text-ink-strong flex h-9 w-9 flex-none items-center justify-center rounded-[--radius-btn] border text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <input type="hidden" name="formKey" value={request.form} />
              {request.blockContext ? (
                <input type="hidden" name="blockContext" value={request.blockContext} />
              ) : null}

              {/* Honeypot. Hidden from sight and from assistive technology, but
                  present in the DOM for bots that fill everything they find. */}
              <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor="companyWebsite">Company website</label>
                <input id="companyWebsite" name="companyWebsite" tabIndex={-1} autoComplete="off" />
              </div>

              <div>
                <label htmlFor="lead-name" className={labelClass}>
                  {t('name')}
                </label>
                <input
                  id="lead-name"
                  name="name"
                  required
                  autoComplete="name"
                  placeholder={t('namePlaceholder')}
                  aria-invalid={Boolean(fieldError('name'))}
                  aria-describedby={fieldError('name') ? 'lead-name-error' : undefined}
                  className={inputClass}
                />
                {fieldError('name') ? (
                  <p id="lead-name-error" className="mt-1.5 text-[13px] text-[oklch(0.52_0.17_25)]">
                    {fieldError('name')}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="lead-phone" className={labelClass}>
                  {t('phone')}
                </label>
                <input
                  id="lead-phone"
                  name="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder={t('phonePlaceholder')}
                  aria-invalid={Boolean(fieldError('phone'))}
                  aria-describedby={fieldError('phone') ? 'lead-phone-error' : 'lead-phone-hint'}
                  className={inputClass}
                />
                {fieldError('phone') ? (
                  <p
                    id="lead-phone-error"
                    className="mt-1.5 text-[13px] text-[oklch(0.52_0.17_25)]"
                  >
                    {fieldError('phone')}
                  </p>
                ) : (
                  <p id="lead-phone-hint" className="text-ink-faint mt-1.5 text-[12px]">
                    {t('phoneHint')}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="lead-service" className={labelClass}>
                  {t('service')}
                </label>
                <select
                  id="lead-service"
                  name="service"
                  defaultValue={request.service ?? ''}
                  className={inputClass}
                >
                  <option value="">{t('servicePlaceholder')}</option>
                  {services.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="lead-city" className={labelClass}>
                  {t('city')}
                </label>
                <input
                  id="lead-city"
                  name="city"
                  autoComplete="address-level2"
                  placeholder={t('cityPlaceholder')}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="lead-comment" className={labelClass}>
                  {t('comment')}
                </label>
                <textarea
                  id="lead-comment"
                  name="comment"
                  rows={3}
                  placeholder={t('commentPlaceholder')}
                  className={cn(inputClass, 'resize-y')}
                />
              </div>

              <label className="text-ink-muted flex items-start gap-2.5 text-[13px] leading-relaxed">
                <input
                  type="checkbox"
                  name="consentPersonalData"
                  required
                  className="accent-accent mt-0.5 h-4 w-4 flex-none"
                />
                <span>
                  {t.rich('consentPersonal', {
                    policy: (chunks) => (
                      <Link
                        href={privacyHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        {chunks}
                      </Link>
                    ),
                  })}
                </span>
              </label>
              {fieldError('consentPersonalData') ? (
                <p className="-mt-2 text-[13px] text-[oklch(0.52_0.17_25)]">
                  {fieldError('consentPersonalData')}
                </p>
              ) : null}

              <label className="text-ink-muted flex items-start gap-2.5 text-[13px] leading-relaxed">
                <input
                  type="checkbox"
                  name="consentWhatsapp"
                  defaultChecked
                  className="accent-accent mt-0.5 h-4 w-4 flex-none"
                />
                <span>{t('consentWhatsapp')}</span>
              </label>

              {state.status === 'error' && state.formError ? (
                <p role="alert" className="text-[13px] text-[oklch(0.52_0.17_25)]">
                  {translate(`errors.${state.formError}`)}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={pending}
                className={buttonClasses('primary', 'lg', 'mt-1 w-full')}
              >
                {pending ? t('submitting') : t('submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
