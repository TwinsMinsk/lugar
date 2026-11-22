/**
 * `AbortSignal.any`, without the part that never lets go.
 *
 * The site's server process grew by about 70 MB a day — 0.3 GB after a deploy,
 * 2 GB three weeks later — and memory is nearly the whole Railway invoice. A
 * heap snapshot traced it to three pieces of code that are each reasonable
 * alone:
 *
 *  1. Next fills every `'use cache'` function during a prerender through
 *     `prerender(…, { signal: AbortSignal.any([dynamicAccess, timeout]) })`
 *     (`next/dist/server/use-cache/use-cache-wrapper.js`).
 *  2. React adds an `abort` listener to that signal and removes it only if the
 *     signal fires. A fill that succeeds leaves it attached.
 *  3. Node keeps every composite signal that has an `abort` listener in a
 *     process-wide set (`gcPersistentSignals`), so the listener can still run,
 *     and takes it out once the source signals are collected. Here they never
 *     are: the listener reaches the request, the request reaches Next's
 *     `onError`, and the timeout controller lives in that same scope. The set
 *     holds the composite, the composite holds its own sources.
 *
 * The listener closes over React's request, which closes over the whole
 * prerender: the response object, its gzip buffer, every rendered chunk. One
 * such bundle is pinned per cache fill, and a prerender happens for every URL
 * the server has not seen — which is what vulnerability scanners send, around a
 * thousand a day. Measured on the standalone build: 150 kB of heap and 200 kB
 * of buffers retained per unique 404, none of it per repeated request.
 *
 * A signal built from a plain `AbortController` is not in that set. Its
 * lifetime is the ordinary one: the sources hold the listeners that reach it,
 * so it lives as long as something could still abort it, and a cycle between
 * the two is collected like any other. With this in place the same test
 * retains nothing beyond Next's own bounded page cache.
 *
 * The trade against the native version: there, a composite nobody listens to
 * can be collected while its sources live on; here it lasts as long as any
 * source does. Nothing in this process combines a long-lived signal with
 * short-lived ones, and holding on too long is the safe direction — an abort is
 * never missed.
 *
 * Remove this once Next stops handing a composite to React, React detaches on
 * completion, or Node unpins a composite that is reachable only through its own
 * listener. The unit test carries a tripwire for the last of those.
 */
export function unpinnedAny(signals: Iterable<AbortSignal>): AbortSignal {
  const sources = [...signals];
  for (const source of sources) {
    if (!(source instanceof AbortSignal)) {
      throw new TypeError('AbortSignal.any: every item must be an AbortSignal');
    }
  }

  const controller = new AbortController();

  // Already aborted: the result is aborted too, with the first such reason.
  const aborted = sources.find((source) => source.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
    return controller.signal;
  }

  const listeners = new Map<AbortSignal, () => void>();
  for (const source of sources) {
    const listener = () => {
      // The first abort wins, and the other sources should not go on holding a
      // listener for a signal that is already settled.
      for (const [other, registered] of listeners) other.removeEventListener('abort', registered);
      listeners.clear();
      controller.abort(source.reason);
    };
    listeners.set(source, listener);
    source.addEventListener('abort', listener, { once: true });
  }

  return controller.signal;
}

/** Called once, when the server instance starts — see `src/instrumentation.ts`. */
export function installUnpinnedAbortSignalAny(): void {
  AbortSignal.any = unpinnedAny;
}
