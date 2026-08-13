'use client';

import { useTranslations } from 'next-intl';

import { useLeadDialog } from '@/features/leads/lead-dialog-context';

/**
 * Persistent mobile call-to-action.
 *
 * The prototype pins this to the bottom of the viewport on mobile. Two details
 * matter and are easy to get wrong:
 *
 *  - a spacer of the same height sits in the flow, so the bar never covers the
 *    footer's last row;
 *  - it is hidden while a dialog is open, so it cannot sit on top of the very
 *    form it just opened or steal focus order from it.
 */
export function StickyMobileCta() {
  const t = useTranslations('cta');
  const { open, request } = useLeadDialog();

  if (request) return null;

  return (
    <>
      <div aria-hidden className="bg-dark nav-desktop:hidden h-[88px]" />
      <button
        type="button"
        onClick={() => open({ form: 'calculate', blockContext: 'sticky_mobile' })}
        className="bg-accent hover:bg-accent-hover nav-desktop:hidden fixed right-4 bottom-4 left-4 z-[55] rounded-[--radius-card] px-4 py-[17px] text-center text-[15px] font-medium text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition-colors duration-[--duration-base] active:scale-[0.99]"
      >
        {t('whatsapp')}
      </button>
    </>
  );
}
