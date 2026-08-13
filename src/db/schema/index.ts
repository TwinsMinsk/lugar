/**
 * Schema barrel. drizzle.config.ts points here, so every table must be
 * re-exported or it will not appear in generated migrations.
 */
export * from './_shared';
export * from './auth';
export * from './content';
export * from './media';
export * from './portfolio';
export * from './crm';
export * from './whatsapp';
export * from './settings';
