import { describe, expect, it } from 'vitest';

import { CAPABILITIES, roleCan, type Capability } from '@/lib/auth/guards';
import { ROLES, type Role } from '@/lib/auth/server';

/**
 * The capability matrix is the single source of truth for authorization, so it
 * gets tested as data rather than as behaviour scattered across call sites.
 *
 * These assertions encode product rules from the brief, not just the current
 * contents of the table — if someone widens a capability, one of these fails.
 */
describe('role capability matrix', () => {
  it('grants owner every capability', () => {
    for (const capability of Object.keys(CAPABILITIES) as Capability[]) {
      expect(roleCan('owner', capability), `owner should have ${capability}`).toBe(true);
    }
  });

  it('denies content_editor all access to CRM personal data', () => {
    const crmCapabilities = (Object.keys(CAPABILITIES) as Capability[]).filter((c) =>
      c.startsWith('crm.'),
    );
    expect(crmCapabilities.length).toBeGreaterThan(0);
    for (const capability of crmCapabilities) {
      expect(
        roleCan('content_editor', capability),
        `content_editor must not have ${capability}`,
      ).toBe(false);
    }
  });

  it('denies manager user management, settings and audit', () => {
    expect(roleCan('manager', 'users.manage')).toBe(false);
    expect(roleCan('manager', 'settings.write')).toBe(false);
    expect(roleCan('manager', 'audit.read')).toBe(false);
  });

  it('denies manager the ability to publish content', () => {
    expect(roleCan('manager', 'content.publish')).toBe(false);
    expect(roleCan('manager', 'content.write')).toBe(false);
    // Read-only visibility into content is fine.
    expect(roleCan('manager', 'content.read')).toBe(true);
  });

  it('reserves destructive and recovery actions for owner alone', () => {
    for (const capability of ['media.delete', 'crm.delete', 'whatsapp.requeue'] as Capability[]) {
      for (const role of ROLES.filter((r) => r !== 'owner')) {
        expect(roleCan(role as Role, capability), `${role} must not have ${capability}`).toBe(
          false,
        );
      }
      expect(roleCan('owner', capability)).toBe(true);
    }
  });

  it('lets content_editor publish content but not send WhatsApp messages', () => {
    expect(roleCan('content_editor', 'content.publish')).toBe(true);
    expect(roleCan('content_editor', 'whatsapp.send')).toBe(false);
  });

  it('lists only known roles in every capability entry', () => {
    for (const [capability, roles] of Object.entries(CAPABILITIES)) {
      for (const role of roles) {
        expect(ROLES, `${capability} references unknown role ${role}`).toContain(role);
      }
    }
  });
});
