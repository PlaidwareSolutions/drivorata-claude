CREATE TYPE "public"."affiliate_application_status" AS ENUM('pending', 'approved', 'rejected', 'converted');--> statement-breakpoint
CREATE TYPE "public"."affiliate_status" AS ENUM('active', 'suspended', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."availability_type" AS ENUM('CLASSROOM', 'DRIVE', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('BOOKED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('open', 'checkout_pending', 'converted', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."commission_model" AS ENUM('recurring', 'hybrid', 'reseller');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'approved', 'paid', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."package_component_type" AS ENUM('ONLINE_PERMIT', 'IN_CLASS', 'BTW_OBSERVATION', 'BTW_PRACTICE', 'ROAD_TEST', 'STUDY_GUIDE');--> statement-breakpoint
CREATE TYPE "public"."credit_reason" AS ENUM('PACKAGE_GRANT', 'SESSION_CONSUME', 'ADJUSTMENT', 'REFUND_REVERSAL', 'BOOKING_CANCEL');--> statement-breakpoint
CREATE TYPE "public"."credit_type" AS ENUM('CLASSROOM', 'DRIVE');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'pending_payment', 'active', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."faq_category" AS ENUM('packages', 'resources', 'road-test', 'contact');--> statement-breakpoint
CREATE TYPE "public"."instructor_type" AS ENUM('CLASSROOM', 'DRIVE', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('ENGLISH', 'SPANISH');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('INVITED', 'ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."offering_status" AS ENUM('DRAFT', 'PUBLISHED', 'FULL', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."package_audience" AS ENUM('TEENS', 'ADULTS', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."package_kind" AS ENUM('COHORT_BASED', 'SIMPLE');--> statement-breakpoint
CREATE TYPE "public"."package_location_scope" AS ENUM('ALL_LOCATIONS', 'SPECIFIC_LOCATIONS');--> statement-breakpoint
CREATE TYPE "public"."package_tier" AS ENUM('PRIMARY', 'AUXILIARY');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('STRIPE', 'PAYPAL', 'CASH');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('CREATED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('admin', 'support');--> statement-breakpoint
CREATE TYPE "public"."promotion_icon" AS ENUM('tag', 'zap', 'gift', 'star', 'percent');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'active', 'churned');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('platform_admin', 'platform_support', 'tenant_admin', 'office_manager', 'instructor', 'student', 'parent');--> statement-breakpoint
CREATE TYPE "public"."service_area_type" AS ENUM('RADIUS', 'ZIP_LIST', 'POLYGON');--> statement-breakpoint
CREATE TYPE "public"."session_activity_action" AS ENUM('created', 'cancelled', 'rescheduled', 'email_sent', 'email_failed', 'email_skipped', 'booking_moved', 'btw_scheduled');--> statement-breakpoint
CREATE TYPE "public"."session_email_status" AS ENUM('queued', 'sent', 'skipped_no_provider', 'skipped_unsubscribed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('CLASSROOM', 'DRIVE', 'BTW_OBSERVATION', 'BTW_PRACTICE', 'ROAD_TEST');--> statement-breakpoint
CREATE TYPE "public"."testimonial_source" AS ENUM('in_person', 'google', 'facebook', 'yelp', 'public_form', 'other');--> statement-breakpoint
CREATE TYPE "public"."testimonial_status" AS ENUM('pending', 'approved', 'rejected', 'featured');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'acknowledged', 'planned', 'wip', 'ready', 'resolved', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('bug', 'feature_request', 'design', 'content', 'other');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('ACTIVE', 'MAINTENANCE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "affiliate_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar,
	"company" varchar,
	"website" varchar,
	"preferred_model" varchar,
	"experience" text,
	"status" "affiliate_application_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"affiliate_id" integer NOT NULL,
	"referral_id" integer NOT NULL,
	"type" varchar NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"period" varchar,
	"description" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"affiliate_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" varchar NOT NULL,
	"reference" varchar,
	"paid_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "affiliate_referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"affiliate_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"referred_at" timestamp DEFAULT now(),
	"activated_at" timestamp,
	"churned_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"code" varchar NOT NULL,
	"status" "affiliate_status" DEFAULT 'active' NOT NULL,
	"commission_model" "commission_model" NOT NULL,
	"recurring_rate" integer,
	"hybrid_upfront_cents" integer,
	"hybrid_recurring_rate" integer,
	"reseller_wholesale_cents" integer,
	"tier" varchar DEFAULT 'base' NOT NULL,
	"paypal_email" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "affiliates_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "affiliates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"actor_user_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"target_type" varchar NOT NULL,
	"target_id" integer,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"enrollment_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" varchar,
	"status" "booking_status" DEFAULT 'BOOKED' NOT NULL,
	"credit_type" "credit_type",
	"component_type" "package_component_type",
	"credit_amount" integer,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" varchar NOT NULL,
	"package_id" integer NOT NULL,
	"offering_id" integer,
	"price_cents" integer NOT NULL,
	"added_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cart_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"kind" varchar NOT NULL,
	"cart_id" varchar,
	"payment_id" integer,
	"stage" integer DEFAULT 1 NOT NULL,
	"recipient_email" varchar NOT NULL,
	"email_status" varchar DEFAULT 'queued' NOT NULL,
	"error_msg" text,
	"triggered_by" varchar DEFAULT 'cron' NOT NULL,
	"actor_user_id" varchar,
	"tracking_token" varchar,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"first_opened_at" timestamp,
	"first_clicked_at" timestamp,
	"recovered_at" timestamp,
	"sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"status" "cart_status" DEFAULT 'open' NOT NULL,
	"location_id" integer,
	"customer_snapshot_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contact_message_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"author_user_id" varchar,
	"author_email" varchar,
	"to_email" varchar NOT NULL,
	"subject" varchar NOT NULL,
	"body" text NOT NULL,
	"email_status" varchar,
	"email_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar,
	"message" text NOT NULL,
	"read" boolean DEFAULT false,
	"archived_at" timestamp,
	"confirmation_email_sent_at" timestamp,
	"reply_token" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "contact_submissions_reply_token_unique" UNIQUE("reply_token")
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"enrollment_id" integer NOT NULL,
	"type" "credit_type" NOT NULL,
	"delta" integer NOT NULL,
	"reason" "credit_reason" NOT NULL,
	"ref_id" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_unsubscribes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"email" varchar NOT NULL,
	"source" varchar DEFAULT 'cart_reminder' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" varchar,
	"package_id" integer,
	"online_course_id" integer,
	"location_id" integer,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar,
	"date_of_birth" varchar,
	"parent_name" varchar,
	"parent_email" varchar,
	"parent_phone" varchar,
	"status" "enrollment_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"classroom_hours_completed" integer DEFAULT 0,
	"driving_hours_completed" integer DEFAULT 0,
	"cart_id" varchar,
	"offering_id" integer,
	"is_waitlisted" boolean DEFAULT false,
	"stripe_payment_id" varchar,
	"amount_paid" integer,
	"price_snapshot_cents" integer,
	"currency_snapshot" varchar DEFAULT 'USD',
	"package_snapshot_json" jsonb,
	"activated_at" timestamp,
	"confirmation_email_sent_at" timestamp,
	"payment_received_email_sent_at" timestamp,
	"admin_notification_email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"category" "faq_category" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "instructor_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"instructor_id" varchar NOT NULL,
	"location_id" integer,
	"day_of_week" integer NOT NULL,
	"start_time" varchar NOT NULL,
	"end_time" varchar NOT NULL,
	"type" "availability_type" DEFAULT 'BOTH' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"author_id" varchar NOT NULL,
	"content" text NOT NULL,
	"type" varchar DEFAULT 'note' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar,
	"school_name" varchar NOT NULL,
	"city" varchar,
	"locations_range" varchar,
	"primary_need" varchar,
	"source" varchar DEFAULT 'lead-magnet',
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"converted_tenant_id" integer,
	"referral_code" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"address" varchar NOT NULL,
	"address_line2" varchar,
	"city" varchar NOT NULL,
	"state" varchar DEFAULT 'TX' NOT NULL,
	"zip" varchar NOT NULL,
	"country_code" varchar DEFAULT 'US' NOT NULL,
	"timezone" varchar DEFAULT 'America/Chicago' NOT NULL,
	"phone" varchar,
	"email" varchar,
	"latitude" varchar,
	"longitude" varchar,
	"service_area_type" "service_area_type",
	"service_area_value" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_program_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"enabled_models" text[] DEFAULT ARRAY['recurring']::text[] NOT NULL,
	"recurring_default_rate" integer DEFAULT 25 NOT NULL,
	"hybrid_default_upfront_cents" integer DEFAULT 30000 NOT NULL,
	"hybrid_default_recurring_rate" integer DEFAULT 15 NOT NULL,
	"reseller_default_wholesale_cents" integer DEFAULT 18000 NOT NULL,
	"tier_silver_threshold" integer DEFAULT 10 NOT NULL,
	"tier_gold_threshold" integer DEFAULT 25 NOT NULL,
	"tier_silver_bonus_rate" integer DEFAULT 30 NOT NULL,
	"tier_gold_bonus_rate" integer DEFAULT 35 NOT NULL,
	"min_retention_months" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"filename" varchar NOT NULL,
	"object_path" varchar NOT NULL,
	"content_type" varchar,
	"size" integer,
	"alt" varchar,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"title" varchar NOT NULL,
	"message" text NOT NULL,
	"link" varchar,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offering_waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"offering_id" integer NOT NULL,
	"enrollment_id" integer,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "online_course_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"online_course_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "online_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"provider_name" varchar,
	"provider_url" varchar,
	"image_url" varchar,
	"language" "language" DEFAULT 'ENGLISH' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"location_scope_mode" "package_location_scope" DEFAULT 'ALL_LOCATIONS' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "package_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"type" "package_component_type" NOT NULL,
	"label" varchar,
	"hours" integer DEFAULT 0,
	"quantity" integer DEFAULT 1,
	"sort_order" integer DEFAULT 0,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "package_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"price_override_cents" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "package_upsell_dependencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"upsell_package_id" integer NOT NULL,
	"parent_package_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"classroom_hours_required" integer DEFAULT 0,
	"drive_hours_required" integer DEFAULT 0,
	"requires_permit" boolean DEFAULT false,
	"age_min" integer,
	"age_max" integer,
	"credit_classroom" integer DEFAULT 0,
	"credit_drive" integer DEFAULT 0,
	"features" text[],
	"active" boolean DEFAULT true,
	"is_add_on" boolean DEFAULT false,
	"kind" "package_kind" DEFAULT 'COHORT_BASED' NOT NULL,
	"sellable_standalone" boolean DEFAULT true NOT NULL,
	"available_as_upsell" boolean DEFAULT false NOT NULL,
	"audience" "package_audience" DEFAULT 'BOTH' NOT NULL,
	"tier" "package_tier" DEFAULT 'PRIMARY' NOT NULL,
	"language" "language" DEFAULT 'ENGLISH' NOT NULL,
	"image_url" varchar,
	"location_scope_mode" "package_location_scope" DEFAULT 'ALL_LOCATIONS' NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"enrollment_id" integer,
	"cart_id" varchar,
	"provider" "payment_provider" NOT NULL,
	"status" "payment_status" DEFAULT 'CREATED' NOT NULL,
	"amount_cents" integer NOT NULL,
	"service_fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar DEFAULT 'USD' NOT NULL,
	"provider_order_id" varchar,
	"provider_payment_id" varchar,
	"idempotency_key" varchar,
	"metadata_json" jsonb,
	"raw_provider_json" jsonb,
	"student_signature" text,
	"receiver_signature" text,
	"receiver_name" varchar,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "platform_role" DEFAULT 'support' NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"annual_price_cents" integer,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_locations" integer,
	"max_students" integer,
	"max_instructors" integer,
	"active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "platform_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"location_id" integer,
	"headline" varchar NOT NULL,
	"description" text NOT NULL,
	"badge_text" varchar NOT NULL,
	"icon" "promotion_icon" DEFAULT 'tag' NOT NULL,
	"cta_label" varchar DEFAULT 'Claim Offer' NOT NULL,
	"package_id" integer,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saved_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"section" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_offerings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"location_id" integer,
	"instructor_id" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"capacity" integer DEFAULT 20 NOT NULL,
	"enrolled_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" "offering_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "schedule_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"location_id" integer,
	"instructor_id" varchar,
	"vehicle_id" integer,
	"type" "session_type" NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"status" "session_status" DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text,
	"recurrence_group_id" varchar,
	"offering_id" integer,
	"component_type" "package_component_type",
	"enrollment_id" integer,
	"rescheduled_from_session_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"action" "session_activity_action" NOT NULL,
	"actor_user_id" varchar,
	"message" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session_change_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"session_id" integer,
	"booking_id" integer,
	"recipient_email" varchar NOT NULL,
	"recipient_user_id" varchar,
	"subject" varchar NOT NULL,
	"body" text NOT NULL,
	"status" "session_email_status" DEFAULT 'queued' NOT NULL,
	"error_msg" text,
	"provider_message_id" varchar,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stale_credit_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"enrollment_id" integer NOT NULL,
	"recipient_user_id" varchar,
	"recipient_email" varchar NOT NULL,
	"classroom_credits" integer DEFAULT 0 NOT NULL,
	"drive_credits" integer DEFAULT 0 NOT NULL,
	"channel" varchar DEFAULT 'email' NOT NULL,
	"email_status" varchar DEFAULT 'queued' NOT NULL,
	"in_app_status" varchar DEFAULT 'created' NOT NULL,
	"error_msg" text,
	"triggered_by" varchar DEFAULT 'cron' NOT NULL,
	"actor_user_id" varchar,
	"sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"submitted_by_user_id" varchar NOT NULL,
	"type" "ticket_type" NOT NULL,
	"subject" varchar NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" varchar,
	"enabled" boolean DEFAULT false NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"cta_label" varchar,
	"cta_href" varchar,
	"phone" varchar,
	"bg_color" varchar DEFAULT '#0f172a' NOT NULL,
	"text_color" varchar DEFAULT '#ffffff' NOT NULL,
	"dismissable" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"key_hash" varchar NOT NULL,
	"key_prefix" varchar NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"template_key" varchar NOT NULL,
	"subject_override" text,
	"body_override" text,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_id" integer,
	"amount_cents" integer NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"stripe_invoice_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" varchar,
	"email_invited" varchar,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"location_scope" jsonb DEFAULT '"ALL"'::jsonb,
	"first_name" varchar,
	"last_name" varchar,
	"phone" varchar,
	"date_of_birth" varchar,
	"emergency_contact_name" varchar,
	"emergency_contact_phone" varchar,
	"instructor_type" "instructor_type",
	"instructor_type_by_location" jsonb,
	"license_number" varchar,
	"license_expiry" varchar,
	"permit_number" varchar,
	"permit_expiry" varchar,
	"profile_completed" boolean DEFAULT false,
	"invited_by_user_id" varchar,
	"invited_at" timestamp,
	"joined_at" timestamp,
	"disabled_at" timestamp,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenant_payment_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"stripe_enabled" boolean DEFAULT false,
	"stripe_secret_key" varchar,
	"stripe_publishable_key" varchar,
	"stripe_webhook_secret" varchar,
	"paypal_enabled" boolean DEFAULT false,
	"paypal_client_id" varchar,
	"paypal_client_secret" varchar,
	"paypal_mode" varchar DEFAULT 'sandbox',
	"cash_enabled" boolean DEFAULT false,
	"cash_require_signature" boolean DEFAULT false,
	"auto_expire_enabled" boolean DEFAULT true,
	"expire_after_hours" integer DEFAULT 2,
	"service_fee_bps" integer DEFAULT 0 NOT NULL,
	"service_fee_flat_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenant_payment_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"primary_color" varchar DEFAULT '#2563eb',
	"secondary_color" varchar DEFAULT '#64748b',
	"accent_color" varchar DEFAULT '#f59e0b',
	"background_color" varchar DEFAULT '#ffffff',
	"text_color" varchar DEFAULT '#1e293b',
	"font_family" varchar DEFAULT 'Inter',
	"heading_font" varchar DEFAULT 'Inter',
	"border_radius" varchar DEFAULT '8px',
	"custom_css" text
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"custom_domain" varchar,
	"domain_verified" boolean DEFAULT false,
	"domain_verification_token" varchar,
	"last_domain_check" timestamp,
	"logo_url" varchar,
	"phone" varchar,
	"email" varchar,
	"timezone" varchar DEFAULT 'America/Chicago',
	"cancellation_window_hours" integer DEFAULT 24,
	"stale_credit_reminder_enabled" boolean DEFAULT false,
	"stale_credit_reminder_days" integer DEFAULT 30,
	"show_pending_interest" boolean DEFAULT false,
	"cart_reminder_enabled" boolean DEFAULT false,
	"cart_reminder_hours_stage1" integer DEFAULT 1,
	"cart_reminder_hours_stage2" integer DEFAULT 24,
	"admin_enrollment_notifications_enabled" boolean DEFAULT true,
	"active" boolean DEFAULT true,
	"website_enabled" boolean DEFAULT true,
	"preview_mode" boolean DEFAULT false,
	"preview_enabled_at" timestamp,
	"plan_id" integer,
	"subscription_status" varchar DEFAULT 'trialing',
	"billing_email" varchar,
	"trial_ends_at" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"stripe_customer_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_custom_domain_unique" UNIQUE("custom_domain")
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"location_id" integer,
	"name" varchar NOT NULL,
	"email" varchar,
	"rating" integer DEFAULT 5 NOT NULL,
	"quote" text NOT NULL,
	"photo_url" varchar,
	"video_url" varchar,
	"source" "testimonial_source" DEFAULT 'in_person' NOT NULL,
	"status" "testimonial_status" DEFAULT 'pending' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"submitted_from_ip" varchar,
	"approved_by_user_id" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password_hash" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"location_id" integer,
	"name" varchar NOT NULL,
	"make" varchar,
	"model" varchar,
	"year" integer,
	"plate" varchar,
	"color" varchar,
	"status" "vehicle_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_referral_id_affiliate_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."affiliate_referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_schedule_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."schedule_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_offering_id_schedule_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."schedule_offerings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_message_replies" ADD CONSTRAINT "contact_message_replies_submission_id_contact_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."contact_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_message_replies" ADD CONSTRAINT "contact_message_replies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_message_replies" ADD CONSTRAINT "contact_message_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_online_course_id_online_courses_id_fk" FOREIGN KEY ("online_course_id") REFERENCES "public"."online_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_availability" ADD CONSTRAINT "instructor_availability_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_availability" ADD CONSTRAINT "instructor_availability_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_availability" ADD CONSTRAINT "instructor_availability_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_waitlist" ADD CONSTRAINT "offering_waitlist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_waitlist" ADD CONSTRAINT "offering_waitlist_offering_id_schedule_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."schedule_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_course_locations" ADD CONSTRAINT "online_course_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_course_locations" ADD CONSTRAINT "online_course_locations_online_course_id_online_courses_id_fk" FOREIGN KEY ("online_course_id") REFERENCES "public"."online_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_course_locations" ADD CONSTRAINT "online_course_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_courses" ADD CONSTRAINT "online_courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_components" ADD CONSTRAINT "package_components_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_locations" ADD CONSTRAINT "package_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_locations" ADD CONSTRAINT "package_locations_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_locations" ADD CONSTRAINT "package_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_upsell_dependencies" ADD CONSTRAINT "package_upsell_dependencies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_upsell_dependencies" ADD CONSTRAINT "package_upsell_dependencies_upsell_package_id_packages_id_fk" FOREIGN KEY ("upsell_package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_upsell_dependencies" ADD CONSTRAINT "package_upsell_dependencies_parent_package_id_packages_id_fk" FOREIGN KEY ("parent_package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_members" ADD CONSTRAINT "platform_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_blocks" ADD CONSTRAINT "saved_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_offerings" ADD CONSTRAINT "schedule_offerings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_offerings" ADD CONSTRAINT "schedule_offerings_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_offerings" ADD CONSTRAINT "schedule_offerings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_offerings" ADD CONSTRAINT "schedule_offerings_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_announcements" ADD CONSTRAINT "tenant_announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_api_keys" ADD CONSTRAINT "tenant_api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_email_templates" ADD CONSTRAINT "tenant_email_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_payment_settings" ADD CONSTRAINT "tenant_payment_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_themes" ADD CONSTRAINT "tenant_themes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_session" ON "bookings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "booking_enrollment" ON "bookings" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "cart_item_cart" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_reminder_tenant_kind" ON "cart_reminders" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "cart_reminder_cart" ON "cart_reminders" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_reminder_payment" ON "cart_reminders" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_reminder_tracking_token" ON "cart_reminders" USING btree ("tracking_token");--> statement-breakpoint
CREATE INDEX "cart_tenant" ON "carts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_contact_message_replies_submission" ON "contact_message_replies" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "credit_tenant_enrollment_type" ON "credit_ledger" USING btree ("tenant_id","enrollment_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "email_unsub_tenant_email" ON "email_unsubscribes" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "enrollment_tenant_status" ON "enrollments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "enrollment_tenant_email" ON "enrollments" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "waitlist_offering" ON "offering_waitlist" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "waitlist_enrollment" ON "offering_waitlist" USING btree ("enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "online_course_locations_course_loc_unique" ON "online_course_locations" USING btree ("online_course_id","location_id");--> statement-breakpoint
CREATE INDEX "online_course_locations_tenant" ON "online_course_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "package_component_pkg" ON "package_components" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "package_locations_pkg_loc_unique" ON "package_locations" USING btree ("package_id","location_id");--> statement-breakpoint
CREATE INDEX "package_locations_tenant" ON "package_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "package_upsell_dep_pair_unique" ON "package_upsell_dependencies" USING btree ("upsell_package_id","parent_package_id");--> statement-breakpoint
CREATE INDEX "package_upsell_dep_tenant" ON "package_upsell_dependencies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "package_upsell_dep_parent" ON "package_upsell_dependencies" USING btree ("parent_package_id");--> statement-breakpoint
CREATE INDEX "payment_tenant_enrollment" ON "payments" USING btree ("tenant_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "payment_provider_order" ON "payments" USING btree ("provider","provider_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_member_user_unique" ON "platform_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "offering_tenant_date" ON "schedule_offerings" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "offering_package" ON "schedule_offerings" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "session_tenant_date" ON "schedule_sessions" USING btree ("tenant_id","start_at");--> statement-breakpoint
CREATE INDEX "session_instructor_date" ON "schedule_sessions" USING btree ("instructor_id","start_at");--> statement-breakpoint
CREATE INDEX "session_offering" ON "schedule_sessions" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "ticket_tenant_status" ON "support_tickets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "tenant_announcement_tenant_idx" ON "tenant_announcements" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_email_template_key" ON "tenant_email_templates" USING btree ("tenant_id","template_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_member_role_unique" ON "tenant_members" USING btree ("tenant_id","user_id","role");