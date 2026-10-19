ALTER TABLE "tenants" ADD COLUMN "enrollment_notification_emails" text[];--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "abandoned_checkout_notifications_enabled" boolean DEFAULT true;