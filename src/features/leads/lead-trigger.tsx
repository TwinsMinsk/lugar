'use client';

import { track } from '@/features/analytics/analytics';
import { useLeadDialog } from './lead-dialog-context';
import type { FormKey } from './schema';

/**
 * Opens the lead dialog.
 *
 * A real `<button>`, not a styled div or an anchor with a fake href: it must be
 * reachable by keyboard, announce itself correctly, and respond to Space and
 * Enter without any of that being reimplemented.
 */
export function LeadTrigger({
  form,
  service,
  blockContext,
  className,
  children,
}: {
  form: FormKey;
  service?: string;
  blockContext?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { open } = useLeadDialog();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        track({ name: 'form_open', form, placement: blockContext });
        open({ form, service, blockContext });
      }}
    >
      {children}
    </button>
  );
}
