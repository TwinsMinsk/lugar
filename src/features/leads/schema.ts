import { z } from 'zod';

import { LOCALES } from '@/i18n/routing';

/**
 * Lead form contract, shared by the client form and the server action.
 *
 * One schema, two consumers — so a field the browser accepts is exactly the
 * field the server accepts. Client-side validation is a convenience; the server
 * re-parses everything regardless, because the client is not a trust boundary.
 */

export const FORM_KEYS = ['calculate', 'price', 'measure'] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export const BUDGET_BANDS = ['under_5k', '5k_15k', '15k_30k', 'over_30k', 'unsure'] as const;

/** Free-form UTM values are attacker-controlled; every field is length-capped. */
export const attributionSchema = z
  .object({
    utmSource: z.string().max(200).nullish().catch(null),
    utmMedium: z.string().max(200).nullish().catch(null),
    utmCampaign: z.string().max(200).nullish().catch(null),
    utmContent: z.string().max(200).nullish().catch(null),
    utmTerm: z.string().max(200).nullish().catch(null),
    referrer: z.string().max(1000).nullish().catch(null),
    landingFirst: z.string().max(1000).nullish().catch(null),
    landingLast: z.string().max(1000).nullish().catch(null),
  })
  // A mangled or truncated attribution cookie must never cost us a lead.
  .catch({});

export type Attribution = z.infer<typeof attributionSchema>;

export const leadFormSchema = z.object({
  formKey: z.enum(FORM_KEYS),
  locale: z.enum(LOCALES),

  name: z.string().trim().min(2, 'nameRequired').max(120, 'nameTooLong'),
  /** Normalised to E.164 on the server; validated loosely here. */
  phone: z.string().trim().min(5, 'phoneRequired').max(32),
  service: z.string().trim().max(48).optional(),
  city: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(2000, 'commentTooLong').optional(),
  budget: z.enum(BUDGET_BANDS).optional(),

  consentPersonalData: z
    .boolean()
    .refine((value) => value === true, { message: 'consentRequired' }),
  consentWhatsapp: z.boolean().default(false),

  /**
   * Minted once per dialog mount. A double-click or a bfcache POST replay
   * reuses it and produces one lead; reopening the form mints a new one, so two
   * genuine enquiries from the same person still both land.
   */
  idempotencyKey: z.uuid(),

  /** Page/block/project context, passed down as props from the server. */
  pageContext: z.string().max(500).optional(),
  blockContext: z.string().max(64).optional(),
  projectSlug: z.string().max(96).optional(),

  attribution: attributionSchema.optional(),

  /** Uploaded before submission; bound to the lead inside the transaction. */
  fileIds: z.array(z.uuid()).max(5).optional(),

  /** Honeypot — must stay empty. Named to look attractive to a bot. */
  companyWebsite: z.string().max(0).optional().or(z.literal('')),
  /** Client render timestamp, used to reject impossibly fast submissions. */
  renderedAt: z.coerce.number().int().nonnegative(),
});

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormValues = z.infer<typeof leadFormSchema>;

export type LeadFormState =
  | { status: 'idle' }
  | { status: 'error'; formError?: string; fieldErrors?: Record<string, string[]> }
  | { status: 'success'; publicId: string; whatsappUrl: string };
