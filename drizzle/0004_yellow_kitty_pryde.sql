DROP INDEX "documents_kind_idx";--> statement-breakpoint
DROP INDEX "leads_board_idx";--> statement-breakpoint
DROP INDEX "leads_created_idx";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "documents_live_idx" ON "documents" USING btree ("kind","sort_order") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "documents_archived_idx" ON "documents" USING btree ("archived_at" DESC NULLS LAST) WHERE archived_at is not null;--> statement-breakpoint
CREATE INDEX "leads_archived_idx" ON "leads" USING btree ("archived_at" DESC NULLS LAST) WHERE archived_at is not null and deleted_at is null;--> statement-breakpoint
CREATE INDEX "leads_board_idx" ON "leads" USING btree ("status_id","assigned_to_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE deleted_at is null and archived_at is null;--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at" DESC NULLS LAST) WHERE deleted_at is null and archived_at is null;