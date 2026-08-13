CREATE TYPE "public"."user_role" AS ENUM('owner', 'manager', 'content_editor');--> statement-breakpoint
CREATE TYPE "public"."doc_kind" AS ENUM('page', 'project');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('ru', 'es', 'en');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."activity_kind" AS ENUM('form_submitted', 'status_changed', 'assigned', 'note', 'task_created', 'task_completed', 'file_added', 'wa_out', 'wa_in', 'wa_status', 'email_out', 'call', 'exported');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('system', 'user', 'customer');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('personal_data', 'whatsapp_contact', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."contact_source" AS ENUM('web_form', 'whatsapp_inbound', 'manual', 'import', 'phone_call');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."outbox_kind" AS ENUM('text', 'template');--> statement-breakpoint
CREATE TYPE "public"."outbox_purpose" AS ENUM('internal_new_lead', 'customer_ack', 'manual_reply', 'manual_template');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'claimed', 'sent', 'failed_retryable', 'blocked_window', 'needs_review', 'dead', 'skipped');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'content_editor' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'content_editor' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_locales" (
	"document_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"kind" "doc_kind" NOT NULL,
	"slug" text NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_revision_id" uuid,
	"published_at" timestamp with time zone,
	"noindex" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_locales_document_id_locale_pk" PRIMARY KEY("document_id","locale")
);
--> statement-breakpoint
CREATE TABLE "document_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "doc_kind" NOT NULL,
	"template" text NOT NULL,
	"seed_key" text,
	"base_slug" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"draft_revision_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "navigation_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu" text NOT NULL,
	"parent_id" uuid,
	"label" jsonb NOT NULL,
	"document_id" uuid,
	"external_url" text,
	"anchor" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"status_code" integer DEFAULT 301 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"checksum_sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"original_filename" text,
	"lqip" text,
	"focal_x" double precision DEFAULT 0.5 NOT NULL,
	"focal_y" double precision DEFAULT 0.5 NOT NULL,
	"crop_aspect" text,
	"alt" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"caption" jsonb,
	"credit" text,
	"version" integer DEFAULT 1 NOT NULL,
	"recipe_version" integer DEFAULT 1 NOT NULL,
	"is_placeholder" boolean DEFAULT false NOT NULL,
	"uploaded_by" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_derivatives" (
	"asset_id" uuid NOT NULL,
	"width" integer NOT NULL,
	"format" text NOT NULL,
	"storage_key" text NOT NULL,
	"bytes" integer NOT NULL,
	"recipe_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_derivatives_asset_id_width_format_pk" PRIMARY KEY("asset_id","width","format")
);
--> statement-breakpoint
CREATE TABLE "media_usage" (
	"asset_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	CONSTRAINT "media_usage_revision_id_block_id_field_path_pk" PRIMARY KEY("revision_id","block_id","field_path")
);
--> statement-breakpoint
CREATE TABLE "portfolio_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(48) NOT NULL,
	"label" jsonb NOT NULL,
	"filter_slug" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_project_categories" (
	"document_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "portfolio_project_categories_document_id_category_id_pk" PRIMARY KEY("document_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "portfolio_projects" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"cover_asset_id" uuid,
	"primary_category_id" uuid,
	"city" text,
	"completed_at" timestamp with time zone,
	"area_sqm" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(48) NOT NULL,
	"direction" varchar(24) NOT NULL,
	"label" jsonb NOT NULL,
	"note" jsonb,
	"media_asset_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contact_id" uuid,
	"submission_id" uuid,
	"purpose" "consent_purpose" NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"policy_text_hash" varchar(64) NOT NULL,
	"locale" "locale" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" varchar(20) NOT NULL,
	"phone_country" varchar(2),
	"full_name" text,
	"email" text,
	"city" text,
	"preferred_locale" "locale" DEFAULT 'ru' NOT NULL,
	"source" "contact_source" DEFAULT 'web_form' NOT NULL,
	"wa_opt_in" boolean DEFAULT false NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"notes" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"form_key" varchar(48) NOT NULL,
	"locale" "locale" NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid,
	"kind" "activity_kind" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" text,
	"body" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_assignments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_user_id" text,
	"to_user_id" text,
	"assigned_by_user_id" text,
	"reason" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(48) NOT NULL,
	"sort_order" integer NOT NULL,
	"label" jsonb NOT NULL,
	"color" varchar(16) DEFAULT '#8a8a8a' NOT NULL,
	"is_default_entry" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_statuses_slug_uq" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lead_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid,
	"assignee_id" text,
	"created_by_id" text,
	"title" text NOT NULL,
	"details" text,
	"kind" varchar(32) DEFAULT 'followup' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"public_id" varchar(16) NOT NULL,
	"contact_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"assigned_to_id" text,
	"submission_id" uuid,
	"service" varchar(48),
	"city" text,
	"comment" text,
	"budget_band" varchar(24),
	"estimated_value_eur" bigint,
	"locale" "locale" NOT NULL,
	"utm_source" varchar(200),
	"utm_medium" varchar(200),
	"utm_campaign" varchar(200),
	"utm_content" varchar(200),
	"utm_term" varchar(200),
	"referrer" text,
	"landing_url_first" text,
	"landing_url_last" text,
	"page_context" text,
	"block_context" varchar(64),
	"project_slug" varchar(96),
	"possible_duplicate_of_id" uuid,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_public_id_uq" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid,
	"lead_id" uuid,
	"storage_key" text NOT NULL,
	"original_filename" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" text,
	"status" varchar(16) DEFAULT 'orphan' NOT NULL,
	"uploaded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(24) NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid NOT NULL,
	"manager_id" text,
	"title" text NOT NULL,
	"stage" varchar(32) DEFAULT 'measuring' NOT NULL,
	"contract_value_eur" bigint,
	"started_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"notes" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_uq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "notification_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"outbox_id" uuid,
	"channel" varchar(16) NOT NULL,
	"target" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"request_summary" jsonb,
	"http_status" integer,
	"provider_code" integer,
	"provider_message_id" varchar(128),
	"error_payload" jsonb,
	"latency_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contact_id" uuid,
	"lead_id" uuid,
	"outbox_id" uuid,
	"direction" "message_direction" NOT NULL,
	"wamid" varchar(128),
	"message_type" varchar(24) DEFAULT 'text' NOT NULL,
	"body" text,
	"media_key" text,
	"template_name" varchar(128),
	"status" varchar(16),
	"error_code" integer,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid,
	"contact_id" uuid,
	"to_phone_e164" varchar(20) NOT NULL,
	"purpose" "outbox_purpose" NOT NULL,
	"kind" "outbox_kind" NOT NULL,
	"body_text" text,
	"template_name" varchar(128),
	"template_language" varchar(8),
	"template_variables" jsonb,
	"requires_window" boolean DEFAULT true NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by" varchar(64),
	"claimed_until" timestamp with time zone,
	"provider_message_id" varchar(128),
	"delivery_status" varchar(16),
	"last_error_code" integer,
	"last_error_message" text,
	"dedupe_key" varchar(128),
	"sent_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_key" varchar(160) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"wamid" varchar(128),
	"phone_number_id" varchar(64),
	"from_phone_e164" varchar(20),
	"raw" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_address" text,
	"user_agent" text,
	"result" text DEFAULT 'ok' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb DEFAULT 'null'::jsonb NOT NULL,
	"group" text DEFAULT 'general' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_locales" ADD CONSTRAINT "document_locales_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_locales" ADD CONSTRAINT "document_locales_published_revision_id_document_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."document_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_usage" ADD CONSTRAINT "media_usage_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_usage" ADD CONSTRAINT "media_usage_revision_id_document_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."document_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_usage" ADD CONSTRAINT "media_usage_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_project_categories" ADD CONSTRAINT "portfolio_project_categories_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_project_categories" ADD CONSTRAINT "portfolio_project_categories_category_id_portfolio_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."portfolio_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_projects" ADD CONSTRAINT "portfolio_projects_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_projects" ADD CONSTRAINT "portfolio_projects_cover_asset_id_media_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_projects" ADD CONSTRAINT "portfolio_projects_primary_category_id_portfolio_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "public"."portfolio_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_submission_id_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_status_id_lead_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."lead_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_user_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_possible_duplicate_fk" FOREIGN KEY ("possible_duplicate_of_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_outbox_id_whatsapp_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."whatsapp_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_outbox_id_whatsapp_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."whatsapp_outbox"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox" ADD CONSTRAINT "whatsapp_outbox_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_outbox" ADD CONSTRAINT "whatsapp_outbox_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_uq" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_uq" ON "invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uq" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uq" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "document_locale_slug_uq" ON "document_locales" USING btree ("kind","locale","slug");--> statement-breakpoint
CREATE INDEX "document_locale_published_idx" ON "document_locales" USING btree ("kind","locale","status") WHERE published_revision_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "revision_number_uq" ON "document_revisions" USING btree ("document_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "one_draft_per_document_uq" ON "document_revisions" USING btree ("document_id") WHERE is_draft;--> statement-breakpoint
CREATE INDEX "revision_document_idx" ON "document_revisions" USING btree ("document_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_seed_key_uq" ON "documents" USING btree ("seed_key") WHERE seed_key is not null;--> statement-breakpoint
CREATE INDEX "documents_kind_idx" ON "documents" USING btree ("kind","sort_order");--> statement-breakpoint
CREATE INDEX "navigation_menu_idx" ON "navigation_items" USING btree ("menu","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "redirect_from_uq" ON "redirects" USING btree ("from_path");--> statement-breakpoint
CREATE UNIQUE INDEX "media_checksum_uq" ON "media_assets" USING btree ("checksum_sha256") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "media_placeholder_idx" ON "media_assets" USING btree ("is_placeholder") WHERE is_placeholder;--> statement-breakpoint
CREATE INDEX "media_created_idx" ON "media_assets" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "media_derivative_stale_idx" ON "media_derivatives" USING btree ("recipe_version");--> statement-breakpoint
CREATE INDEX "media_usage_asset_idx" ON "media_usage" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "media_usage_document_idx" ON "media_usage" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_categories_slug_uq" ON "portfolio_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "portfolio_categories_order_idx" ON "portfolio_categories" USING btree ("sort_order") WHERE is_active;--> statement-breakpoint
CREATE INDEX "portfolio_project_categories_category_idx" ON "portfolio_project_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "portfolio_projects_featured_idx" ON "portfolio_projects" USING btree ("is_featured","sort_order") WHERE is_featured;--> statement-breakpoint
CREATE INDEX "portfolio_projects_category_idx" ON "portfolio_projects" USING btree ("primary_category_id","sort_order");--> statement-breakpoint
CREATE INDEX "portfolio_projects_sort_idx" ON "portfolio_projects" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_slug_uq" ON "service_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "service_categories_direction_idx" ON "service_categories" USING btree ("direction","sort_order") WHERE is_active;--> statement-breakpoint
CREATE INDEX "consent_contact_idx" ON "consent_records" USING btree ("contact_id","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_phone_uq" ON "contacts" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "contacts_phone_suffix_idx" ON "contacts" USING btree (right("phone_e164", 9));--> statement-breakpoint
CREATE INDEX "contacts_last_inbound_idx" ON "contacts" USING btree ("last_inbound_at" DESC NULLS LAST) WHERE last_inbound_at is not null;--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email") WHERE email is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "form_submissions_idempotency_uq" ON "form_submissions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "form_submissions_created_idx" ON "form_submissions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lead_activities_contact_wa_idx" ON "lead_activities" USING btree ("contact_id","occurred_at" DESC NULLS LAST) WHERE kind in ('wa_in','wa_out','wa_status');--> statement-breakpoint
CREATE INDEX "lead_assignments_lead_idx" ON "lead_assignments" USING btree ("lead_id","assigned_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "lead_statuses_default_entry_uq" ON "lead_statuses" USING btree ("is_default_entry") WHERE is_default_entry;--> statement-breakpoint
CREATE INDEX "lead_statuses_order_idx" ON "lead_statuses" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "lead_tasks_open_idx" ON "lead_tasks" USING btree ("assignee_id","due_at") WHERE completed_at is null;--> statement-breakpoint
CREATE INDEX "lead_tasks_lead_idx" ON "lead_tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_board_idx" ON "leads" USING btree ("status_id","assigned_to_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at" DESC NULLS LAST) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "leads_assignee_activity_idx" ON "leads" USING btree ("assigned_to_id","last_activity_at" DESC NULLS LAST) WHERE deleted_at is null and archived_at is null;--> statement-breakpoint
CREATE INDEX "leads_contact_idx" ON "leads" USING btree ("contact_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_utm_rollup_idx" ON "leads" USING btree ("utm_source","created_at" DESC NULLS LAST) WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_files_storage_key_uq" ON "project_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "project_files_orphan_idx" ON "project_files" USING btree ("status","created_at") WHERE status = 'orphan';--> statement-breakpoint
CREATE INDEX "project_files_lead_idx" ON "project_files" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "projects_contact_idx" ON "projects" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "projects_stage_idx" ON "projects" USING btree ("stage","due_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "notification_attempts_outbox_idx" ON "notification_attempts" USING btree ("outbox_id","attempt_no");--> statement-breakpoint
CREATE INDEX "notification_attempts_started_idx" ON "notification_attempts" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wa_messages_wamid_uq" ON "whatsapp_messages" USING btree ("wamid") WHERE wamid is not null;--> statement-breakpoint
CREATE INDEX "wa_messages_contact_idx" ON "whatsapp_messages" USING btree ("contact_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wa_messages_lead_idx" ON "whatsapp_messages" USING btree ("lead_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wa_outbox_claim_idx" ON "whatsapp_outbox" USING btree ("next_attempt_at") WHERE status in ('pending','failed_retryable');--> statement-breakpoint
CREATE INDEX "wa_outbox_lease_idx" ON "whatsapp_outbox" USING btree ("claimed_until") WHERE status = 'claimed';--> statement-breakpoint
CREATE UNIQUE INDEX "wa_outbox_dedupe_uq" ON "whatsapp_outbox" USING btree ("dedupe_key") WHERE dedupe_key is not null;--> statement-breakpoint
CREATE INDEX "wa_outbox_wamid_idx" ON "whatsapp_outbox" USING btree ("provider_message_id") WHERE provider_message_id is not null;--> statement-breakpoint
CREATE INDEX "wa_outbox_lead_idx" ON "whatsapp_outbox" USING btree ("lead_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wa_webhook_event_key_uq" ON "whatsapp_webhook_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "wa_webhook_unprocessed_idx" ON "whatsapp_webhook_events" USING btree ("received_at") WHERE processed_at is null;--> statement-breakpoint
CREATE INDEX "wa_webhook_from_idx" ON "whatsapp_webhook_events" USING btree ("from_phone_e164");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "site_settings_key_uq" ON "site_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "site_settings_review_idx" ON "site_settings" USING btree ("needs_review") WHERE needs_review;