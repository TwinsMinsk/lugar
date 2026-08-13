import 'server-only';

import { headers } from 'next/headers';
import { forbidden, unauthorized } from 'next/navigation';

import { auth, type Role } from './server';

/**
 * Server-side authorization.
 *
 * Every private read and every mutation calls one of these. Hiding a button in
 * the UI is not access control; `proxy.ts` checking for a cookie is not access
 * control either. This module is.
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
  if (!result?.user) unauthorized();
  if (result.user.banned) forbidden();
  return { session: result.session, user: result.user, role: result.user.role as Role };
}

/** Requires a specific capability. This is the guard almost everything uses. */
export async function requireCapability(capability: Capability) {
  const ctx = await requireUser();
  if (!roleCan(ctx.role, capability)) forbidden();
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
