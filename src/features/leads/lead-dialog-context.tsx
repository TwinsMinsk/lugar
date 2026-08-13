'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { FormKey } from './schema';

export type LeadDialogRequest = {
  form: FormKey;
  /** Pre-selects the service and is recorded on the lead. */
  service?: string;
  /** Which block on which page opened the dialog — kept for attribution. */
  blockContext?: string;
};

type LeadDialogContextValue = {
  request: LeadDialogRequest | null;
  open: (request: LeadDialogRequest) => void;
  close: () => void;
};

const LeadDialogContext = createContext<LeadDialogContextValue | null>(null);

export function LeadDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<LeadDialogRequest | null>(null);

  const open = useCallback((next: LeadDialogRequest) => setRequest(next), []);
  const close = useCallback(() => setRequest(null), []);

  const value = useMemo(() => ({ request, open, close }), [request, open, close]);

  return <LeadDialogContext.Provider value={value}>{children}</LeadDialogContext.Provider>;
}

export function useLeadDialog(): LeadDialogContextValue {
  const context = useContext(LeadDialogContext);
  if (!context) {
    throw new Error('useLeadDialog must be used inside <LeadDialogProvider>.');
  }
  return context;
}
