/**
 * Where the signed-in owner's session is saved.
 *
 * Its own module because Playwright refuses to let one test file import
 * another, and both `auth.setup.ts` (which writes it) and specs that open an
 * extra authenticated context (which read it) need the path.
 */
export const ADMIN_STORAGE_STATE = 'tests/e2e/.auth/admin.json';
