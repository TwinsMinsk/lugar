'use client';

import { useEffect } from 'react';

/**
 * The last resort.
 *
 * Fires only when a root layout itself throws — `(site)/[locale]/layout.tsx`
 * or `(admin)/admin/layout.tsx` failing outright, not a page or block beneath
 * them (that is `(site)/[locale]/error.tsx`). Next requires this file to
 * supply its own complete `<html>`/`<body>`, because at this point neither
 * root layout can be trusted to have rendered at all — so nothing here reaches
 * for next-intl, Tailwind's compiled classes, or any other part of the app
 * that might be exactly what just broke. Plain markup, inline styles, one
 * language: this page's job is to still be there when everything else isn't.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#f7f6f3',
          color: '#1c1a17',
        }}
      >
        <div style={{ maxWidth: '420px', padding: '32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', marginBottom: '12px' }}>Что-то пошло не так</h1>
          <p style={{ marginBottom: '24px', lineHeight: 1.6 }}>
            Мы уже разбираемся. Попробуйте обновить страницу.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              padding: '12px 24px',
              background: '#3f4a3a',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
