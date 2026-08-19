import 'server-only';

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { auth, type Role } from './server';

/**
 * Server-side authorization.
 *
 * Every private read and every mutation calls one of these. Hiding a button in
 * the UI is not access control; `proxy.ts` checking for a cookie is not access
 * control either. This module is.
 *
 * These deliberately use `redirect()` and `notFound()` rather than Next's
 * `unauthorized()` / `forbidden()`. Those read better, but they are gated
 * behind the experimental `authInterrupts` flag and do nothing without it — an
 * end-to-end test caught /admin/users returning 200 to a content editor for
 * exactly that reason. An authorization boundary must not depend on an
 * experimental flag that a future config change can silently remove.
 *
 * A capability failure renders 404 rather than 403 on purpose: someone who may
 * not see a resource also learns nothing about whether it exists.
 *
 * Capabilities are declared per role in one table so a permission question has
 * exactly one answer, rather than being re-litigated at each call site.
 */
export const CAPABILITIES = {
  // CMS
  'content.read': ['owner', 'manager', 'content_editor'],
  'content.write': ['owner', 'content_editor'],
  'content.publish': ['owner', 'content_editor'],
  'content.rollback': ['owner', 'content_editor'],
  'media.read': ['owner', 'manager', 'content_editor'],
  'media.write': ['owner', 'content_editor'],
  'media.delete': ['owner'],
  /**
   * Removing a document from the panel, and erasing an unpublished one.
   *
   * Owner-only alongside `media.delete` and `crm.delete` rather than following
   * `content.write`: an editor writing the site is a different decision from an
   * editor deciding a page should stop existing.
   */
  'content.delete': ['owner'],
  'navigation.write': ['owner', 'content_editor'],
  'seo.write': ['owner', 'content_editor'],

  // CRM — content editors get no access to personal data by default.
  'crm.read': ['owner', 'manager'],
  'crm.write': ['owner', 'manager'],
  'crm.export': ['owner', 'manager'],
  'crm.delete': ['owner'],

  // WhatsApp
  'whatsapp.read': ['owner', 'manager'],
  'whatsapp.send': ['owner', 'manager'],
  'whatsapp.requeue': ['owner'],

  // Administration
  'settings.write': ['owner'],
  'users.manage': ['owner'],
  'audit.read': ['owner'],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function roleCan(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

/** Returns the session or null. Never throws — for optional-auth surfaces. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Requires any authenticated, non-banned user. */
export async function requireUser() {
  const result = await getSession();
  if (!result?.user) redirect('/admin/login');
  // A banned account keeps its session cookie until it expires, so the ban has
  // to be enforced on read, not only at sign-in.
  if (result.user.banned) notFound();
  return { session: result.session, user: result.user, role: result.user.role as Role };
}

/** Requires a specific capability. This is the guard almost everything uses. */
export async function requireCapability(capability: Capability) {
  const ctx = await requireUser();
  if (!roleCan(ctx.role, capability)) notFound();
  return ctx;
}

/**
 * Non-throwing variant for building navigation and conditional UI. Never use
 * this to protect data — pair it with requireCapability in the data layer.
 */
export async function can(capability: Capability): Promise<boolean> {
  const result = await getSession();
  if (!result?.user || result.user.banned) return false;
  return roleCan(result.user.role as Role, capability);
}
