ALTER TYPE "public"."payment_provider" ADD VALUE 'AUTHORIZE_NET';--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD COLUMN "authnet_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD COLUMN "authnet_api_login_id" varchar;--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD COLUMN "authnet_transaction_key" varchar;--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD COLUMN "authnet_signature_key" varchar;--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD COLUMN "authnet_mode" varchar DEFAULT 'sandbox';--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD COLUMN "card_provider" varchar DEFAULT 'STRIPE';