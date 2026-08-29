ALTER TABLE "tenants" ADD COLUMN "portal_hostname_id" varchar;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "portal_hostname_status" varchar;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "portal_hostname_checked_at" timestamp;