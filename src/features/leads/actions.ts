'use server';

import { createHash, randomBytes } from 'node:crypto';

import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { parsePhoneNumberWithError } from 'libphonenumber-js/max';
import { cookies, headers } from 'next/headers';

import { db } from '@/db/client';
import {
  consentRecords,
  contacts,
  formSubmissions,
  leadActivities,
  leads,
  leadStatuses,
  projectFiles,
  whatsappOutbox,
} from '@/db/schema';
import { env } from '@/env';
import { decodeTouch, FIRST_TOUCH_COOKIE } from '@/features/attribution/attribution';
import { consumeRateLimit } from '@/lib/rate-limit';
import { whatsapp } from '@/lib/whatsapp';
import { LOCALE_PHONE_REGION, type Locale } from '@/i18n/routing';
import { attributionSchema, leadFormSchema, type LeadFormState } from './schema';

/** Minimum time a human plausibly needs to fill the form, in milliseconds. */
const MIN_DWELL_MS = 2_500;
const MAX_DWELL_MS = 6 * 60 * 60 * 1000;

const RATE_LIMIT_PER_HOUR = 5;
const RATE_WINDOW_SECONDS = 3_600;

/** Short, unambiguous human reference shown in the UI and in alerts. */
function generatePublicId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return `LG-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

function hashText(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Submit a lead.
 *
 * The whole design hinges on one property: **a valid submission always
 * produces exactly one CRM lead**, regardless of what WhatsApp, object storage
 * or Meta are doing. Messaging is queued inside the same transaction and
 * delivered afterwards by a separate worker, so an outage downstream can delay
 * a notification but can never lose an enquiry.
 */
export async function submitLead(formData: FormData): Promise<LeadFormState> {
  // --- 1. Cheap bot rejections, before any database work ------------------
  const honeypot = formData.get('companyWebsite');
  if (typeof honeypot === 'string' && honeypot.length > 0) {
    // Report success to the bot. Telling it what tripped the filter only helps
    // it try again more convincingly.
    return { status: 'success', publicId: 'LG-000000', whatsappUrl: '#' };
  }

  const renderedAt = Number(formData.get('renderedAt'));
  const dwell = Date.now() - renderedAt;
  if (!Number.isFinite(renderedAt) || dwell < MIN_DWELL_MS || dwell > MAX_DWELL_MS) {
    return { status: 'success', publicId: 'LG-000000', whatsappUrl: '#' };
  }

  // --- 2. Validation -------------------------------------------------------
  const raw = {
    formKey: formData.get('formKey'),
    locale: formData.get('locale'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    service: formData.get('service') || undefined,
    city: formData.get('city') || undefined,
    comment: formData.get('comment') || undefined,
    budget: formData.get('budget') || undefined,
    consentPersonalData: formData.get('consentPersonalData') === 'on',
    consentWhatsapp: formData.get('consentWhatsapp') === 'on',
    idempotencyKey: formData.get('idempotencyKey'),
    pageContext: formData.get('pageContext') || undefined,
    blockContext: formData.get('blockContext') || undefined,
    projectSlug: formData.get('projectSlug') || undefined,
    fileIds: formData.getAll('fileIds').filter((v): v is string => typeof v === 'string'),
    attribution: safeJson(formData.get('attribution')),
    companyWebsite: '',
    renderedAt,
  };

  const parsed = leadFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { status: 'error', fieldErrors };
  }
  const input = parsed.data;

  // --- 3. Phone normalisation ---------------------------------------------
  let phoneE164: string;
  let phoneCountry: string | undefined;
  try {
    const parsedPhone = parsePhoneNumberWithError(input.phone, {
      defaultCountry: LOCALE_PHONE_REGION[input.locale as Locale],
      // Strict: refuse to fish a number out of surrounding prose, which is how
      // "call me on 624527303 after 6" becomes a malformed contact.
      extract: false,
    });
    if (!parsedPhone.isValid()) throw new Error('invalid');
    phoneE164 = parsedPhone.format('E.164');
    phoneCountry = parsedPhone.country;
  } catch {
    return { status: 'error', fieldErrors: { phone: ['phoneInvalid'] } };
  }

  // --- 4. Rate limiting ----------------------------------------------------
  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  const userAgent = headerList.get('user-agent')?.slice(0, 500) ?? null;

  const limit = await consumeRateLimit(
    [`lead:ip:${ip}`, `lead:phone:${phoneE164}`],
    RATE_LIMIT_PER_HOUR,
    RATE_WINDOW_SECONDS,
  );
  if (!limit.allowed) {
    return { status: 'error', formError: 'rateLimited' };
  }

  // --- 5. Attribution ------------------------------------------------------
  const cookieStore = await cookies();
  const firstTouch = decodeTouch(cookieStore.get(FIRST_TOUCH_COOKIE)?.value);
  const attribution = attributionSchema.parse({
    ...(firstTouch ?? {}),
    ...(input.attribution ?? {}),
    landingFirst: firstTouch?.landingFirst ?? input.attribution?.landingFirst ?? null,
  });

  // --- 6. The transaction --------------------------------------------------
  const provider = whatsapp();

  const result = await db.transaction(async (tx) => {
    // The idempotency gate. Whether this INSERT succeeds decides whether a lead
    // is created at all — a replayed POST conflicts here and returns the
    // original lead instead of creating a second one.
    const [submission] = await tx
      .insert(formSubmissions)
      .values({
        idempotencyKey: input.idempotencyKey,
        formKey: input.formKey,
        locale: input.locale,
        payload: {
          name: input.name,
          service: input.service ?? null,
          city: input.city ?? null,
          budget: input.budget ?? null,
          hasComment: Boolean(input.comment),
        },
        attribution,
        ipAddress: ip,
        userAgent,
      })
      .onConflictDoNothing({ target: formSubmissions.idempotencyKey })
      .returning();

    if (!submission) {
      const [prior] = await tx
        .select({ leadId: formSubmissions.leadId })
        .from(formSubmissions)
        .where(eq(formSubmissions.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (!prior?.leadId) return { replayed: true as const, publicId: null };
      const [lead] = await tx
        .select({ publicId: leads.publicId })
        .from(leads)
        .where(eq(leads.id, prior.leadId))
        .limit(1);
      return { replayed: true as const, publicId: lead?.publicId ?? null };
    }

    // Contact upsert on the natural key. Existing names and cities are only
    // filled in, never overwritten with a blank.
    const [contact] = await tx
      .insert(contacts)
      .values({
        phoneE164,
        phoneCountry,
        fullName: input.name,
        city: input.city ?? null,
        preferredLocale: input.locale,
        source: 'web_form',
        waOptIn: input.consentWhatsapp,
      })
      .onConflictDoUpdate({
        target: contacts.phoneE164,
        set: {
          fullName: sql`coalesce(excluded.full_name, ${contacts.fullName})`,
          city: sql`coalesce(excluded.city, ${contacts.city})`,
          waOptIn: sql`${contacts.waOptIn} or excluded.wa_opt_in`,
          lastSeenAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    const consentVersion = '2026-08-13';
    await tx.insert(consentRecords).values([
      {
        contactId: contact!.id,
        submissionId: submission.id,
        purpose: 'personal_data' as const,
        granted: true,
        policyVersion: consentVersion,
        policyTextHash: hashText(`personal_data:${consentVersion}:${input.locale}`),
        locale: input.locale,
        ipAddress: ip,
        userAgent,
      },
      ...(input.consentWhatsapp
        ? [
            {
              contactId: contact!.id,
              submissionId: submission.id,
              purpose: 'whatsapp_contact' as const,
              granted: true,
              policyVersion: consentVersion,
              policyTextHash: hashText(`whatsapp:${consentVersion}:${input.locale}`),
              locale: input.locale,
              ipAddress: ip,
              userAgent,
            },
          ]
        : []),
    ]);

    const [entryStatus] = await tx
      .select({ id: leadStatuses.id })
      .from(leadStatuses)
      .where(eq(leadStatuses.isDefaultEntry, true))
      .limit(1);
    if (!entryStatus) throw new Error('No default-entry lead status is configured.');

    // Soft duplicate detection: flag, never merge. Auto-merging on a phone
    // match is how one customer's history ends up attached to another.
    const [recentOpen] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.contactId, contact!.id),
          isNull(leads.deletedAt),
          gt(leads.createdAt, new Date(Date.now() - 30 * 24 * 3600 * 1000)),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(1);

    const [lead] = await tx
      .insert(leads)
      .values({
        publicId: generatePublicId(),
        contactId: contact!.id,
        statusId: entryStatus.id,
        submissionId: submission.id,
        service: input.service ?? null,
        city: input.city ?? null,
        comment: input.comment ?? null,
        budgetBand: input.budget ?? null,
        locale: input.locale,
        utmSource: attribution.utmSource ?? null,
        utmMedium: attribution.utmMedium ?? null,
        utmCampaign: attribution.utmCampaign ?? null,
        utmContent: attribution.utmContent ?? null,
        utmTerm: attribution.utmTerm ?? null,
        referrer: attribution.referrer ?? null,
        landingUrlFirst: attribution.landingFirst ?? null,
        landingUrlLast: attribution.landingLast ?? null,
        pageContext: input.pageContext ?? null,
        blockContext: input.blockContext ?? null,
        projectSlug: input.projectSlug ?? null,
        possibleDuplicateOfId: recentOpen?.id ?? null,
      })
      .returning();

    await tx
      .update(formSubmissions)
      .set({ leadId: lead!.id, contactId: contact!.id })
      .where(eq(formSubmissions.id, submission.id));

    if (input.fileIds && input.fileIds.length > 0) {
      await tx
        .update(projectFiles)
        .set({ status: 'attached', leadId: lead!.id })
        .where(
          and(
            eq(projectFiles.status, 'orphan'),
            sql`${projectFiles.id} = any(${sql.raw(`ARRAY['${input.fileIds.join("','")}']::uuid[]`)})`,
          ),
        );
    }

    await tx.insert(leadActivities).values({
      leadId: lead!.id,
      contactId: contact!.id,
      kind: 'form_submitted',
      actorType: 'system',
      payload: { formKey: input.formKey, service: input.service ?? null },
    });

    // Queued, not sent. Committing this row is the durability boundary — the
    // worker drains it afterwards, so a Meta outage delays the alert without
    // ever costing us the lead.
    const staffRecipients = (env.WHATSAPP_INTERNAL_RECIPIENTS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (staffRecipients.length > 0 && env.WHATSAPP_LEAD_ALERT_TEMPLATE_NAME) {
      await tx.insert(whatsappOutbox).values(
        staffRecipients.map((recipient) => ({
          leadId: lead!.id,
          toPhoneE164: recipient,
          purpose: 'internal_new_lead' as const,
          kind: 'template' as const,
          templateName: env.WHATSAPP_LEAD_ALERT_TEMPLATE_NAME!,
          templateLanguage: env.WHATSAPP_LEAD_ALERT_TEMPLATE_LANGUAGE,
          templateVariables: {
            '1': input.name,
            '2': input.service ?? '—',
            '3': phoneE164,
            '4': lead!.publicId,
          },
          // Staff numbers get no opt-in exemption from Meta, so an alert
          // outside the 24h window needs an approved UTILITY template.
          requiresWindow: false,
          dedupeKey: `internal_new_lead:${lead!.id}:${recipient}`,
        })),
      );
    }

    return { replayed: false as const, publicId: lead!.publicId };
  });

  const handoffText = buildHandoffText(input.locale as Locale, input.service, result.publicId);

  return {
    status: 'success',
    publicId: result.publicId ?? 'LG-000000',
    whatsappUrl: provider.buildHandoffLink({ text: handoffText }),
  };
}

function buildHandoffText(locale: Locale, service?: string, publicId?: string | null): string {
  const greetings: Record<Locale, string> = {
    ru: 'Здравствуйте! Я оставил(а) заявку на сайте',
    es: '¡Hola! He enviado una solicitud desde la web',
    en: 'Hello! I submitted an enquiry on your website',
  };
  const parts = [greetings[locale]];
  if (publicId && publicId !== 'LG-000000') parts.push(`(${publicId})`);
  if (service) parts.push(`— ${service}`);
  return `${parts.join(' ')}.`;
}

function safeJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
