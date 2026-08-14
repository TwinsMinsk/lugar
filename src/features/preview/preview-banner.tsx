import { draftMode } from 'next/headers';

/**
 * Preview indicator.
 *
 * A preview render is indistinguishable from the live site without this, which
 * is how someone ends up reporting a bug about content that was never
 * published — or worse, approving a page they believe is already live. It also
 * carries the only exit route out of draft mode.
 */
export async function PreviewBanner() {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return null;

  return (
    <div className="sticky top-0 z-[90] bg-[oklch(0.55_0.18_25)] px-4 py-2 text-center text-white">
      <p className="text-[13px] leading-snug">
        <strong className="font-semibold">Черновик.</strong> Так страница будет выглядеть после
        публикации. Посетители сейчас видят опубликованную версию.{' '}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
            this is a Route Handler, not a page. next/link would soft-navigate
            on the client and never issue the request that clears the
            draft-mode cookie. */}
        <a href="/api/preview/exit" className="underline underline-offset-2">
          Выйти из черновика
        </a>
      </p>
    </div>
  );
}
