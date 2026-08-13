import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * Locale-aware navigation primitives. Always import Link/redirect/useRouter
 * from here rather than from `next/link` or `next/navigation`, so locale
 * prefixes are applied automatically and never hand-assembled.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
