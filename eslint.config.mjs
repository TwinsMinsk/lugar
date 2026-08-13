import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

/**
 * Flat config. eslint-config-next 16 exports flat config natively, so there is
 * no FlatCompat/@eslint/eslintrc shim here — and `next lint` no longer exists,
 * so this runs directly via `npm run lint`.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.tools/**',
      'drizzle/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // The database client must never be pulled into a component module.
    // Reads go through src/data/**, which is `import 'server-only'`.
    files: ['src/components/**', 'src/features/**/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/db/client', '@/db/client'],
              message: 'Query the database from src/data/** (server-only), not from a component.',
            },
          ],
        },
      ],
    },
  },
);
