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

  // The same three were pinned against manager only, so a change granting them
  // to the CMS role would have gone through unopposed.
  it('denies content_editor user management, settings and audit', () => {
    expect(roleCan('content_editor', 'users.manage')).toBe(false);
    expect(roleCan('content_editor', 'settings.write')).toBe(false);
    expect(roleCan('content_editor', 'audit.read')).toBe(false);
  });

  it('keeps a manager out of the CMS entirely', () => {
    expect(roleCan('manager', 'content.publish')).toBe(false);
    expect(roleCan('manager', 'content.write')).toBe(false);
    /**
     * Including reads.
     *
     * Read-only visibility sounded harmless and was not: it put Страницы,
     * Наши работы and Фотографии in the manager's menu, all of which they
     * could open and none of which they could save in — `saveDraft` throws
     * `notFound()`, so the panel answered with an unhandled rejection rather
     * than a message.
     */
    expect(roleCan('manager', 'content.read')).toBe(false);
    expect(roleCan('manager', 'media.read')).toBe(false);
  });

  it('reserves destructive and recovery actions for owner alone', () => {
    /**
     * `content.delete` was missing from this list, which is how the panel came
     * to render "Убрать", "Вернуть" and "Удалить навсегда" to a content editor
     * on every page and project row: nothing pinned the capability as
     * owner-only, so nothing contradicted the interface that assumed everyone
     * had it. The list is the claim — an owner-only capability absent from it
     * is an owner-only capability nobody is checking.
     */
    for (const capability of [
      'content.delete',
      'media.delete',
      'crm.delete',
      'whatsapp.requeue',
    ] as Capability[]) {
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
