ALTER TABLE "enrollments" ADD COLUMN "reference" varchar(20);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" varchar(20);--> statement-breakpoint
CREATE INDEX "enrollment_tenant_reference" ON "enrollments" USING btree ("tenant_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reference_unique" ON "payments" USING btree ("reference");