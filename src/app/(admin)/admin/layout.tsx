import type { Metadata } from 'next';

import '../../globals.css';

/**
 * Admin root layout — a separate root from the public site, so the admin never
 * inherits the public shell, fonts or providers, and navigating between them is
 * a clean document load.
 */
export const metadata: Metadata = {
  title: { default: 'LUGAR Admin', template: '%s — LUGAR Admin' },
  // Belt and braces: next.config also sends X-Robots-Tag for /admin/*.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-surface-muted">{children}</body>
    </html>
  );
}
