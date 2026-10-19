ALTER TABLE "session_change_emails" ADD COLUMN "kind" varchar(40);--> statement-breakpoint
ALTER TABLE "session_change_emails" ADD COLUMN "enrollment_id" integer;--> statement-breakpoint
ALTER TABLE "session_change_emails" ADD COLUMN "payment_id" integer;--> statement-breakpoint
ALTER TABLE "session_change_emails" ADD COLUMN "delivery_status" varchar(20);--> statement-breakpoint
ALTER TABLE "session_change_emails" ADD COLUMN "delivery_updated_at" timestamp;--> statement-breakpoint
CREATE INDEX "session_change_email_enrollment" ON "session_change_emails" USING btree ("tenant_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "session_change_email_payment" ON "session_change_emails" USING btree ("tenant_id","payment_id");--> statement-breakpoint
CREATE INDEX "session_change_email_provider_msg" ON "session_change_emails" USING btree ("provider_message_id");