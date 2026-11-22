import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import { unpinnedAny } from '@/lib/abort-signal-any';

/**
 * The replacement for `AbortSignal.any` that the server installs at boot.
 *
 * It exists because of what gets collected, so that is tested directly: a
 * composite signal with a listener, dropped along with its sources, has to be
 * gone after a garbage collection. The native one is not — that is the leak
 * that grew the site's server to 2 GB.
 */
setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

/** Several passes with a turn of the event loop between: listeners and their closures go in stages. */
async function settle(): Promise<void> {
  for (let pass = 0; pass < 5; pass += 1) {
    collectGarbage();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * What Next and React do on every `'use cache'` fill: combine two short-lived
 * signals, attach a listener that holds something large, and walk away.
 *
 * The detail that makes it a leak is that the listener can reach the sources —
 * in Next the timeout controller sits in the same scope as the `onError` the
 * request carries. Node unpins a composite once its sources are collected, and
 * here the composite is what keeps them alive. `holdsSources: false` is the
 * same code without that reference, and the native signal lets go of it.
 */
function fillOnce(
  any: (signals: AbortSignal[]) => AbortSignal,
  { holdsSources }: { holdsSources: boolean },
): WeakRef<object> {
  const dynamicAccess = new AbortController();
  const timeout = new AbortController();
  const request = {
    chunks: new Uint8Array(64 * 1024),
    scope: holdsSources ? [dynamicAccess, timeout] : [],
  };
  const signal = any([dynamicAccess.signal, timeout.signal]);
  signal.addEventListener('abort', () => void request.chunks.length);
  return new WeakRef(request);
}

const alive = (refs: WeakRef<object>[]) => refs.filter((ref) => ref.deref() !== undefined).length;

describe('unpinnedAny', () => {
  it('releases a finished fill, even when its listener holds the sources', async () => {
    const requests = Array.from({ length: 20 }, () =>
      fillOnce(unpinnedAny, { holdsSources: true }),
    );
    await settle();

    expect(alive(requests)).toBe(0);
  });

  it('is still needed: the native AbortSignal.any keeps every such fill', async () => {
    // A tripwire, not a requirement. If the first expectation fails, Node has
    // stopped pinning a composite signal that is only reachable through its own
    // listener — delete `src/lib/abort-signal-any.ts`, its call in
    // `src/instrumentation.ts`, and this file.
    const native = AbortSignal.any.bind(AbortSignal);
    const pinned = Array.from({ length: 20 }, () => fillOnce(native, { holdsSources: true }));
    const free = Array.from({ length: 20 }, () => fillOnce(native, { holdsSources: false }));
    await settle();

    expect(alive(pinned)).toBe(20);
    // The control: without the reference back to the sources it was never a leak.
    expect(alive(free)).toBe(0);
  });

  it('aborts with the reason of whichever source aborts first', () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = unpinnedAny([first.signal, second.signal]);
    const reasons: unknown[] = [];
    signal.addEventListener('abort', () => reasons.push(signal.reason));

    expect(signal.aborted).toBe(false);
    second.abort('timeout');
    first.abort('dynamic access');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('timeout');
    expect(reasons).toEqual(['timeout']);
  });

  it('is aborted from the start when a source already is', () => {
    const live = new AbortController();
    const done = new AbortController();
    done.abort('already over');

    const signal = unpinnedAny([live.signal, done.signal]);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('already over');
  });

  it('never aborts for an empty list', () => {
    expect(unpinnedAny([]).aborted).toBe(false);
  });

  it('rejects anything that is not a signal, as the native one does', () => {
    expect(() => unpinnedAny([{} as AbortSignal])).toThrow(TypeError);
  });

  it('returns a real AbortSignal, so fetch and React accept it', () => {
    expect(unpinnedAny([new AbortController().signal])).toBeInstanceOf(AbortSignal);
  });
});
