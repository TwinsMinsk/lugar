'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unstable_rethrow } from 'next/navigation';

import { messagesFor } from './messages';

type Outcome = { ok: boolean; error?: string; blockedBy?: Array<Record<string, string>> };

/**
 * Running a server action from the panel.
 *
 * This existed as seven hand-written copies in three diverging variants, and
 * the differences were not stylistic: two refreshed the route even when the
 * action failed, wiping the message that had just been set; none caught a
 * thrown action, so a capability failure — `requireCapability` calls
 * `notFound()`, which throws — silently did nothing at all.
 *
 * Three behaviours are deliberate and worth stating:
 *
 *   - `busyKey` is set *synchronously*, before `startTransition`. State updates
 *     inside a transition are deferred, so a row set busy in there does not look
 *     busy until the answer arrives — which is exactly the window the feedback
 *     is for.
 *   - a failure reports and stops. No `router.refresh()`, because the screen
 *     still shows the state the failed action was meant to change and the
 *     message is all the reader has.
 *   - `key` scopes the busy flag to one row. Without it a single click disables
 *     an entire list, which reads as the page having frozen.
 */
export function useAction(overrides: Record<string, string> = {}) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<Array<Record<string, string>> | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // The dictionary is stable per screen; rebuilding it each render would make
  // every callback below a new identity.
  const message = useMemo(() => messagesFor(overrides), [overrides]);

  const reset = useCallback(() => {
    setError(null);
    setBlockedBy(null);
    setStatus(null);
  }, []);

  const run = useCallback(
    (
      action: () => Promise<Outcome>,
      options: {
        /** Scopes `isBusy` to one row. */
        key?: string;
        /** Announced on success. Omit only when the change is self-evident. */
        success?: string;
        /** Runs after a successful action, before the refresh. */
        onDone?: () => void;
        /** Skip the route refresh — for actions whose result is local. */
        refresh?: boolean;
      } = {},
    ) => {
      const { key, success, onDone, refresh = true } = options;

      setError(null);
      setBlockedBy(null);
      setStatus(null);
      setBusyKey(key ?? '*');

      startTransition(async () => {
        try {
          const result = await action();
          if (!result.ok) {
            setError(message(result.error));
            setBlockedBy(result.blockedBy ?? null);
            return;
          }
          if (success) setStatus(success);
          onDone?.();
          if (refresh) router.refresh();
        } catch (thrown) {
          // Next's own control-flow exceptions (redirect, notFound) must pass
          // through untouched, or a redirect turns into an error message.
          unstable_rethrow(thrown);
          setError(message('unexpected'));
        } finally {
          setBusyKey(null);
        }
      });
    },
    [message, router],
  );

  const busy = busyKey !== null || transitionPending;

  const isBusy = useCallback(
    (key?: string) => {
      if (busyKey === null) return false;
      if (busyKey === '*') return true;
      return key !== undefined && busyKey === key;
    },
    [busyKey],
  );

  return { busy, isBusy, error, blockedBy, status, run, reset, setStatus, message };
}
