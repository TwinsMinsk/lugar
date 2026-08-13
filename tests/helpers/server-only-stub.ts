/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * The real package throws on import outside an RSC graph. Vitest externalizes
 * it (it lives in node_modules and loads through Node's CJS require), so
 * resolve.conditions never reaches it — an explicit alias is the only reliable
 * way to neutralise it. Tests run in Node and are server-side by definition.
 */
export {};
