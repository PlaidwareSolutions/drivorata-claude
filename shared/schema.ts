import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const roleEnum = pgEnum("user_role", [
  "platform_admin",
  "platform_support",
  "tenant_admin",
  "office_manager",
  "instructor",
  "student",
  "parent",
]);

export const platformRoleEnum = pgEnum("platform_role", [
  "admin",
  "support",
]);

export const platformMembers = pgTable(
  "platform_members",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: platformRoleEnum("role").notNull().default("support"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("platform_member_user_unique").on(table.userId),
  ]
);

export const insertPlatformMemberSchema = createInsertSchema(platformMembers).omit({
  id: true,
  createdAt: true,
});
export type InsertPlatformMember = z.infer<typeof insertPlatformMemberSchema>;
export type PlatformMember = typeof platformMembers.$inferSelect;

export const platformPlans = pgTable("platform_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  annualPriceCents: integer("annual_price_cents"),
  features: text("features").array().notNull().default(sql`'{}'::text[]`),
  maxLocations: integer("max_locations"),
  maxStudents: integer("max_students"),
  maxInstructors: integer("max_instructors"),
  active: boolean("active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlatformPlanSchema = createInsertSchema(platformPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformPlan = z.infer<typeof insertPlatformPlanSchema>;
export type PlatformPlan = typeof platformPlans.$inferSelect;

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  customDomain: varchar("custom_domain").unique(),
  domainVerified: boolean("domain_verified").default(false),
  domainVerificationToken: varchar("domain_verification_token"),
  lastDomainCheck: timestamp("last_domain_check"),
  logoUrl: varchar("logo_url"),
  phone: varchar("phone"),
  email: varchar("email"),
  timezone: varchar("timezone").default("America/Chicago"),
  cancellationWindowHours: integer("cancellation_window_hours").default(24),
  staleCreditReminderEnabled: boolean("stale_credit_reminder_enabled").default(false),
  staleCreditReminderDays: integer("stale_credit_reminder_days").default(30),
  showPendingInterest: boolean("show_pending_interest").default(false),
  cartReminderEnabled: boolean("cart_reminder_enabled").default(false),
  cartReminderHoursStage1: integer("cart_reminder_hours_stage1").default(1),
  cartReminderHoursStage2: integer("cart_reminder_hours_stage2").default(24),
  adminEnrollmentNotificationsEnabled: boolean("admin_enrollment_notifications_enabled").default(true),
  active: boolean("active").default(true),
  websiteEnabled: boolean("website_enabled").default(true),
  previewMode: boolean("preview_mode").default(false),
  previewEnabledAt: timestamp("preview_enabled_at"),
  planId: integer("plan_id"),
  subscriptionStatus: varchar("subscription_status").default("trialing"),
  billingEmail: varchar("billing_email"),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  stripeCustomerId: varchar("stripe_customer_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

export const tenantInvoices = pgTable("tenant_invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  planId: integer("plan_id"),
  amountCents: integer("amount_cents").notNull(),
  status: varchar("status").notNull().default("pending"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  stripeInvoiceId: varchar("stripe_invoice_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantInvoiceSchema = createInsertSchema(tenantInvoices).omit({ id: true, createdAt: true });
export type InsertTenantInvoice = z.infer<typeof insertTenantInvoiceSchema>;
export type TenantInvoice = typeof tenantInvoices.$inferSelect;

export const tenantThemes = pgTable("tenant_themes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  primaryColor: varchar("primary_color").default("#2563eb"),
  secondaryColor: varchar("secondary_color").default("#64748b"),
  accentColor: varchar("accent_color").default("#f59e0b"),
  backgroundColor: varchar("background_color").default("#ffffff"),
  textColor: varchar("text_color").default("#1e293b"),
  fontFamily: varchar("font_family").default("Inter"),
  headingFont: varchar("heading_font").default("Inter"),
  borderRadius: varchar("border_radius").default("8px"),
  customCss: text("custom_css"),
});

export const insertTenantThemeSchema = createInsertSchema(tenantThemes).omit({
  id: true,
});
export type InsertTenantTheme = z.infer<typeof insertTenantThemeSchema>;
export type TenantTheme = typeof tenantThemes.$inferSelect;

export const memberStatusEnum = pgEnum("member_status", [
  "INVITED",
  "ACTIVE",
  "DISABLED",
]);

export const instructorTypeEnum = pgEnum("instructor_type", [
  "CLASSROOM",
  "DRIVE",
  "BOTH",
]);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .references(() => users.id, { onDelete: "set null" }),
    emailInvited: varchar("email_invited"),
    role: roleEnum("role").notNull().default("student"),
    status: memberStatusEnum("status").notNull().default("ACTIVE"),
    locationScope: jsonb("location_scope").$type<number[] | "ALL">().default(sql`'"ALL"'::jsonb`),
    firstName: varchar("first_name"),
    lastName: varchar("last_name"),
    phone: varchar("phone"),
    dateOfBirth: varchar("date_of_birth"),
    emergencyContactName: varchar("emergency_contact_name"),
    emergencyContactPhone: varchar("emergency_contact_phone"),
    instructorType: instructorTypeEnum("instructor_type"),
    instructorTypeByLocation: jsonb("instructor_type_by_location").$type<Record<string, "CLASSROOM" | "DRIVE" | "BOTH">>(),
    licenseNumber: varchar("license_number"),
    licenseExpiry: varchar("license_expiry"),
    permitNumber: varchar("permit_number"),
    permitExpiry: varchar("permit_expiry"),
    profileCompleted: boolean("profile_completed").default(false),
    invitedByUserId: varchar("invited_by_user_id"),
    invitedAt: timestamp("invited_at"),
    joinedAt: timestamp("joined_at"),
    disabledAt: timestamp("disabled_at"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("tenant_member_role_unique").on(table.tenantId, table.userId, table.role),
  ]
);

export const insertTenantMemberSchema = createInsertSchema(tenantMembers).omit({
  id: true,
  createdAt: true,
});
export type InsertTenantMember = z.infer<typeof insertTenantMemberSchema>;
export type TenantMember = typeof tenantMembers.$inferSelect;

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id").notNull(),
  action: varchar("action").notNull(),
  targetType: varchar("target_type").notNull(),
  targetId: integer("target_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;

export const serviceAreaTypeEnum = pgEnum("service_area_type", [
  "RADIUS",
  "ZIP_LIST",
  "POLYGON",
]);

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  address: varchar("address").notNull(),
  addressLine2: varchar("address_line2"),
  city: varchar("city").notNull(),
  state: varchar("state").notNull().default("TX"),
  zip: varchar("zip").notNull(),
  countryCode: varchar("country_code").notNull().default("US"),
  timezone: varchar("timezone").notNull().default("America/Chicago"),
  phone: varchar("phone"),
  email: varchar("email"),
  latitude: varchar("latitude"),
  longitude: varchar("longitude"),
  serviceAreaType: serviceAreaTypeEnum("service_area_type"),
  serviceAreaValue: text("service_area_value"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
});
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;


export const packageLocationScopeEnum = pgEnum("package_location_scope", [
  "ALL_LOCATIONS",
  "SPECIFIC_LOCATIONS",
]);

export const packageKindEnum = pgEnum("package_kind", [
  "COHORT_BASED",
  "SIMPLE",
]);

export const packageAudienceEnum = pgEnum("package_audience", [
  "TEENS",
  "ADULTS",
  "BOTH",
]);

// PRIMARY = headline/featured package surfaced at the top of the storefront
// list. AUXILIARY = supporting/add-on style package sorted to the bottom.
// Pure marketing/display knob — independent of pricing, audience, kind, etc.
export const packageTierEnum = pgEnum("package_tier", [
  "PRIMARY",
  "AUXILIARY",
]);

export const languageEnum = pgEnum("language", ["ENGLISH", "SPANISH"]);

export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  classroomHoursRequired: integer("classroom_hours_required").default(0),
  driveHoursRequired: integer("drive_hours_required").default(0),
  requiresPermit: boolean("requires_permit").default(false),
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  creditClassroom: integer("credit_classroom").default(0),
  creditDrive: integer("credit_drive").default(0),
  features: text("features").array(),
  active: boolean("active").default(true),
  isAddOn: boolean("is_add_on").default(false),
  // SIMPLE = no cohort/offering pick required (one-off services like Road
  // Test, School Car, etc.). COHORT_BASED = legacy behavior, requires picking
  // a schedule offering at add-to-cart time. Defaults to COHORT_BASED so
  // existing rows keep their semantics until the backfill runs.
  kind: packageKindEnum("kind").default("COHORT_BASED").notNull(),
  // Independent of kind: whether the package can be purchased on its own
  // (appears in the storefront packages list and accepts single-package
  // checkout) and/or offered as an upsell inside the cart upsells section.
  // Both true is allowed — e.g. a Road Test sold standalone AND offered as
  // an upsell to Teen Drivers Ed.
  sellableStandalone: boolean("sellable_standalone").default(true).notNull(),
  availableAsUpsell: boolean("available_as_upsell").default(false).notNull(),
  // Intended audience for marketing/admin tagging. TEENS / ADULTS / BOTH.
  // Independent of `ageMin`/`ageMax` (those remain the source of truth for
  // hard age gating). Defaults to BOTH so legacy rows are unaffected.
  audience: packageAudienceEnum("audience").default("BOTH").notNull(),
  // Marketing tier used to sort/group packages on the storefront. PRIMARY
  // packages render at the top of the list, AUXILIARY at the bottom. Default
  // PRIMARY so existing rows behave unchanged.
  tier: packageTierEnum("tier").default("PRIMARY").notNull(),
  // Primary language of instruction for marketing/admin display. Defaults to
  // ENGLISH for back-compat. Independent of any locale-aware UI.
  language: languageEnum("language").default("ENGLISH").notNull(),
  // Optional hero/listing image for the package (URL in object storage).
  imageUrl: varchar("image_url"),
  locationScopeMode: packageLocationScopeEnum("location_scope_mode").default("ALL_LOCATIONS").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// When `availableAsUpsell` is true and at least one row exists here for the
// upsell, the upsell is only surfaced in the cart upsells list when the cart
// already contains one of the listed parent packages. With zero dependency
// rows the upsell is shown for any cart (legacy add-on behavior).
export const packageUpsellDependencies = pgTable(
  "package_upsell_dependencies",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    upsellPackageId: integer("upsell_package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    parentPackageId: integer("parent_package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("package_upsell_dep_pair_unique").on(table.upsellPackageId, table.parentPackageId),
    index("package_upsell_dep_tenant").on(table.tenantId),
    index("package_upsell_dep_parent").on(table.parentPackageId),
  ],
);

export const insertPackageUpsellDependencySchema = createInsertSchema(packageUpsellDependencies).omit({
  id: true,
  createdAt: true,
});
export type InsertPackageUpsellDependency = z.infer<typeof insertPackageUpsellDependencySchema>;
export type PackageUpsellDependency = typeof packageUpsellDependencies.$inferSelect;

// Public/admin API representation of a package — adds derived fields that
// don't live on the table itself: the upsell dependency parent ids and a
// `requiresCohortSelection` convenience flag mirroring `kind === COHORT_BASED`.
export type PackageWithDependencies = typeof packages.$inferSelect & {
  upsellParentPackageIds: number[];
  requiresCohortSelection: boolean;
};

// Channel hint surfaced on public package responses. Derived purely from the
// `sellableStandalone` / `availableAsUpsell` flags on the package row — those
// booleans remain the source of truth; `channels` is just a convenience
// projection so headless integrators can render the right UI without
// reasoning about the two flags. Mapping:
//   sellableStandalone=true  → adds "catalog"
//   availableAsUpsell=true   → adds "upsell"
// Both off returns []; both on returns ["catalog", "upsell"].
export type PackageChannel = "catalog" | "upsell";

export function derivePackageChannels(pkg: {
  sellableStandalone?: boolean | null;
  availableAsUpsell?: boolean | null;
}): PackageChannel[] {
  const channels: PackageChannel[] = [];
  if (pkg.sellableStandalone) channels.push("catalog");
  if (pkg.availableAsUpsell) channels.push("upsell");
  return channels;
}

export const insertPackageSchema = createInsertSchema(packages).omit({
  id: true,
  createdAt: true,
});
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packages.$inferSelect;

export const packageLocations = pgTable(
  "package_locations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    priceOverrideCents: integer("price_override_cents"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("package_locations_pkg_loc_unique").on(table.packageId, table.locationId),
    index("package_locations_tenant").on(table.tenantId),
  ]
);

export const insertPackageLocationSchema = createInsertSchema(packageLocations).omit({
  id: true,
  createdAt: true,
});
export type InsertPackageLocation = z.infer<typeof insertPackageLocationSchema>;
export type PackageLocation = typeof packageLocations.$inferSelect;

export const componentTypeEnum = pgEnum("package_component_type", [
  "ONLINE_PERMIT",
  "IN_CLASS",
  "BTW_OBSERVATION",
  "BTW_PRACTICE",
  "ROAD_TEST",
  "STUDY_GUIDE",
]);

export const packageComponents = pgTable(
  "package_components",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    type: componentTypeEnum("type").notNull(),
    label: varchar("label"),
    hours: integer("hours").default(0),
    quantity: integer("quantity").default(1),
    sortOrder: integer("sort_order").default(0),
    settings: jsonb("settings").default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("package_component_pkg").on(table.packageId),
  ]
);

export const insertPackageComponentSchema = createInsertSchema(packageComponents).omit({
  id: true,
  createdAt: true,
});
export type InsertPackageComponent = z.infer<typeof insertPackageComponentSchema>;
export type PackageComponent = typeof packageComponents.$inferSelect;

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "pending_payment",
  "active",
  "expired",
  "refunded",
]);

export const enrollments = pgTable(
  "enrollments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    packageId: integer("package_id")
      .references(() => packages.id, { onDelete: "cascade" }),
    onlineCourseId: integer("online_course_id")
      .references(() => onlineCourses.id, { onDelete: "set null" }),
    locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
    firstName: varchar("first_name").notNull(),
    lastName: varchar("last_name").notNull(),
    email: varchar("email").notNull(),
    phone: varchar("phone"),
    dateOfBirth: varchar("date_of_birth"),
    parentName: varchar("parent_name"),
    parentEmail: varchar("parent_email"),
    parentPhone: varchar("parent_phone"),
    status: enrollmentStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    classroomHoursCompleted: integer("classroom_hours_completed").default(0),
    drivingHoursCompleted: integer("driving_hours_completed").default(0),
    cartId: varchar("cart_id"),
    offeringId: integer("offering_id"),
    isWaitlisted: boolean("is_waitlisted").default(false),
    stripePaymentId: varchar("stripe_payment_id"),
    amountPaid: integer("amount_paid"),
    priceSnapshotCents: integer("price_snapshot_cents"),
    currencySnapshot: varchar("currency_snapshot").default("USD"),
    packageSnapshotJson: jsonb("package_snapshot_json"),
    activatedAt: timestamp("activated_at"),
    confirmationEmailSentAt: timestamp("confirmation_email_sent_at"),
    paymentReceivedEmailSentAt: timestamp("payment_received_email_sent_at"),
    adminNotificationEmailSentAt: timestamp("admin_notification_email_sent_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("enrollment_tenant_status").on(table.tenantId, table.status),
    index("enrollment_tenant_email").on(table.tenantId, table.email),
  ]
);

export const insertEnrollmentSchema = createInsertSchema(enrollments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  activatedAt: true,
});
export type InsertEnrollment = z.infer<typeof insertEnrollmentSchema>;
export type Enrollment = typeof enrollments.$inferSelect;

export const paymentProviderEnum = pgEnum("payment_provider", [
  "STRIPE",
  "PAYPAL",
  "CASH",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "CREATED",
  "PENDING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED",
]);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enrollmentId: integer("enrollment_id")
      .references(() => enrollments.id, { onDelete: "cascade" }),
    cartId: varchar("cart_id"),
    provider: paymentProviderEnum("provider").notNull(),
    status: paymentStatusEnum("status").notNull().default("CREATED"),
    amountCents: integer("amount_cents").notNull(),
    // Of `amountCents`, how many cents are the tenant-configured service fee
    // surcharge (only non-zero for STRIPE / PAYPAL when the tenant has set
    // `serviceFeeBps > 0`). Stored alongside the gross so refunds, receipts,
    // and admin views can split the buyer's bill back into subtotal + fee.
    serviceFeeCents: integer("service_fee_cents").notNull().default(0),
    currency: varchar("currency").notNull().default("USD"),
    providerOrderId: varchar("provider_order_id"),
    providerPaymentId: varchar("provider_payment_id"),
    idempotencyKey: varchar("idempotency_key"),
    metadataJson: jsonb("metadata_json"),
    rawProviderJson: jsonb("raw_provider_json"),
    studentSignature: text("student_signature"),
    receiverSignature: text("receiver_signature"),
    receiverName: varchar("receiver_name"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("payment_tenant_enrollment").on(table.tenantId, table.enrollmentId),
    index("payment_provider_order").on(table.provider, table.providerOrderId),
  ]
);

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  rawProviderJson: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const creditTypeEnum = pgEnum("credit_type", [
  "CLASSROOM",
  "DRIVE",
]);

export const creditReasonEnum = pgEnum("credit_reason", [
  "PACKAGE_GRANT",
  "SESSION_CONSUME",
  "ADJUSTMENT",
  "REFUND_REVERSAL",
  "BOOKING_CANCEL",
]);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enrollmentId: integer("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    type: creditTypeEnum("type").notNull(),
    delta: integer("delta").notNull(),
    reason: creditReasonEnum("reason").notNull(),
    refId: varchar("ref_id"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("credit_tenant_enrollment_type").on(table.tenantId, table.enrollmentId, table.type),
  ]
);

export const insertCreditLedgerSchema = createInsertSchema(creditLedger).omit({
  id: true,
  createdAt: true,
});
export type InsertCreditLedger = z.infer<typeof insertCreditLedgerSchema>;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;

export const tenantPaymentSettings = pgTable("tenant_payment_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  stripeEnabled: boolean("stripe_enabled").default(false),
  stripeSecretKey: varchar("stripe_secret_key"),
  stripePublishableKey: varchar("stripe_publishable_key"),
  stripeWebhookSecret: varchar("stripe_webhook_secret"),
  paypalEnabled: boolean("paypal_enabled").default(false),
  paypalClientId: varchar("paypal_client_id"),
  paypalClientSecret: varchar("paypal_client_secret"),
  paypalMode: varchar("paypal_mode").default("sandbox"),
  cashEnabled: boolean("cash_enabled").default(false),
  cashRequireSignature: boolean("cash_require_signature").default(false),
  autoExpireEnabled: boolean("auto_expire_enabled").default(true),
  expireAfterHours: integer("expire_after_hours").default(2),
  // Tenant-configurable processing surcharge applied to STRIPE / PAYPAL
  // checkouts (labelled "service fee" to the buyer). Stored as basis points
  // so we never carry float math: 300 = 3.00%. Default 0 = no fee. Capped to
  // 1000 (10%) at the API layer. CASH/EXTERNAL payments never apply this.
  serviceFeeBps: integer("service_fee_bps").notNull().default(0),
  // Optional flat per-transaction admin fee (cents) added on top of the
  // percentage surcharge for STRIPE / PAYPAL checkouts. Can be combined with
  // or used in place of `serviceFeeBps`. Default 0 = no flat fee. Capped to
  // MAX_SERVICE_FEE_FLAT_CENTS (10000 = $100) at the API layer.
  serviceFeeFlatCents: integer("service_fee_flat_cents").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantPaymentSettingsSchema = createInsertSchema(tenantPaymentSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTenantPaymentSettings = z.infer<typeof insertTenantPaymentSettingsSchema>;
export type TenantPaymentSettings = typeof tenantPaymentSettings.$inferSelect;

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  filename: varchar("filename").notNull(),
  objectPath: varchar("object_path").notNull(),
  contentType: varchar("content_type"),
  size: integer("size"),
  alt: varchar("alt"),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMediaSchema = createInsertSchema(media).omit({
  id: true,
  createdAt: true,
});
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof media.$inferSelect;

export const contactSubmissions = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  archivedAt: timestamp("archived_at"),
  confirmationEmailSentAt: timestamp("confirmation_email_sent_at"),
  replyToken: varchar("reply_token").unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContactSubmissionSchema = createInsertSchema(contactSubmissions).omit({
  id: true,
  createdAt: true,
  read: true,
  archivedAt: true,
  confirmationEmailSentAt: true,
  replyToken: true,
});
export type InsertContactSubmission = z.infer<typeof insertContactSubmissionSchema>;
export type ContactSubmission = typeof contactSubmissions.$inferSelect;

export const contactMessageReplies = pgTable("contact_message_replies", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => contactSubmissions.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id").references(() => users.id, { onDelete: "set null" }),
  authorEmail: varchar("author_email"),
  toEmail: varchar("to_email").notNull(),
  subject: varchar("subject").notNull(),
  body: text("body").notNull(),
  emailStatus: varchar("email_status"),
  emailId: integer("email_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("IDX_contact_message_replies_submission").on(table.submissionId),
]);

export const insertContactMessageReplySchema = createInsertSchema(contactMessageReplies).omit({
  id: true,
  createdAt: true,
  emailStatus: true,
  emailId: true,
});
export type InsertContactMessageReply = z.infer<typeof insertContactMessageReplySchema>;
export type ContactMessageReply = typeof contactMessageReplies.$inferSelect;

// ===== Phase 2: Scheduling Engine =====

export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "ACTIVE",
  "MAINTENANCE",
  "INACTIVE",
]);

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .references(() => locations.id, { onDelete: "set null" }),
  name: varchar("name").notNull(),
  make: varchar("make"),
  model: varchar("model"),
  year: integer("year"),
  plate: varchar("plate"),
  color: varchar("color"),
  status: vehicleStatusEnum("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
});
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

export const availabilityTypeEnum = pgEnum("availability_type", [
  "CLASSROOM",
  "DRIVE",
  "BOTH",
]);

export const instructorAvailability = pgTable("instructor_availability", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  instructorId: varchar("instructor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .references(() => locations.id, { onDelete: "set null" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time").notNull(),
  endTime: varchar("end_time").notNull(),
  type: availabilityTypeEnum("type").notNull().default("BOTH"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInstructorAvailabilitySchema = createInsertSchema(instructorAvailability).omit({
  id: true,
  createdAt: true,
});
export type InsertInstructorAvailability = z.infer<typeof insertInstructorAvailabilitySchema>;
export type InstructorAvailability = typeof instructorAvailability.$inferSelect;

export const sessionTypeEnum = pgEnum("session_type", [
  "CLASSROOM",
  "DRIVE",
  "BTW_OBSERVATION",
  "BTW_PRACTICE",
  "ROAD_TEST",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

export const scheduleSessions = pgTable(
  "schedule_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .references(() => locations.id, { onDelete: "set null" }),
    instructorId: varchar("instructor_id")
      .references(() => users.id, { onDelete: "set null" }),
    vehicleId: integer("vehicle_id")
      .references(() => vehicles.id, { onDelete: "set null" }),
    type: sessionTypeEnum("type").notNull(),
    startAt: timestamp("start_at").notNull(),
    endAt: timestamp("end_at").notNull(),
    capacity: integer("capacity").notNull().default(1),
    bookedCount: integer("booked_count").notNull().default(0),
    status: sessionStatusEnum("status").notNull().default("SCHEDULED"),
    notes: text("notes"),
    recurrenceGroupId: varchar("recurrence_group_id"),
    offeringId: integer("offering_id"),
    componentType: componentTypeEnum("component_type"),
    enrollmentId: integer("enrollment_id"),
    rescheduledFromSessionId: integer("rescheduled_from_session_id"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("session_tenant_date").on(table.tenantId, table.startAt),
    index("session_instructor_date").on(table.instructorId, table.startAt),
    index("session_offering").on(table.offeringId),
  ]
);

export const insertScheduleSessionSchema = createInsertSchema(scheduleSessions).omit({
  id: true,
  bookedCount: true,
  createdAt: true,
});
export type InsertScheduleSession = z.infer<typeof insertScheduleSessionSchema>;
export type ScheduleSession = typeof scheduleSessions.$inferSelect;

export const offeringStatusEnum = pgEnum("offering_status", [
  "DRAFT",
  "PUBLISHED",
  "FULL",
  "CANCELLED",
  "COMPLETED",
]);

export const scheduleOfferings = pgTable(
  "schedule_offerings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "restrict" }),
    locationId: integer("location_id")
      .references(() => locations.id, { onDelete: "set null" }),
    instructorId: varchar("instructor_id")
      .references(() => users.id, { onDelete: "set null" }),
    name: varchar("name").notNull(),
    description: text("description"),
    capacity: integer("capacity").notNull().default(20),
    enrolledCount: integer("enrolled_count").notNull().default(0),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: offeringStatusEnum("status").notNull().default("DRAFT"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("offering_tenant_date").on(table.tenantId, table.startsAt),
    index("offering_package").on(table.packageId),
  ]
);

export const insertScheduleOfferingSchema = createInsertSchema(scheduleOfferings).omit({
  id: true,
  enrolledCount: true,
  createdAt: true,
});
export type InsertScheduleOffering = z.infer<typeof insertScheduleOfferingSchema>;
export type ScheduleOffering = typeof scheduleOfferings.$inferSelect;

export const offeringWaitlist = pgTable(
  "offering_waitlist",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    offeringId: integer("offering_id")
      .notNull()
      .references(() => scheduleOfferings.id, { onDelete: "cascade" }),
    // Direct link back to the enrollment that produced this waitlist row,
    // so promotion can resolve the row deterministically without
    // relying on email matching.
    enrollmentId: integer("enrollment_id"),
    firstName: varchar("first_name").notNull(),
    lastName: varchar("last_name").notNull(),
    email: varchar("email").notNull(),
    phone: varchar("phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("waitlist_offering").on(table.offeringId),
    index("waitlist_enrollment").on(table.enrollmentId),
  ]
);

export const insertOfferingWaitlistSchema = createInsertSchema(offeringWaitlist).omit({
  id: true,
  createdAt: true,
});
export type InsertOfferingWaitlist = z.infer<typeof insertOfferingWaitlistSchema>;
export type OfferingWaitlist = typeof offeringWaitlist.$inferSelect;

export const bookingStatusEnum = pgEnum("booking_status", [
  "BOOKED",
  "CANCELLED",
  "ATTENDED",
  "NO_SHOW",
]);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enrollmentId: integer("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => scheduleSessions.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .references(() => users.id, { onDelete: "set null" }),
    status: bookingStatusEnum("status").notNull().default("BOOKED"),
    creditType: creditTypeEnum("credit_type"),
    componentType: componentTypeEnum("component_type"),
    creditAmount: integer("credit_amount"),
    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("booking_session").on(table.sessionId),
    index("booking_enrollment").on(table.enrollmentId),
  ]
);

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  cancelledAt: true,
  createdAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// ===== Checkout Cart =====

export const cartStatusEnum = pgEnum("cart_status", [
  "open",
  "checkout_pending",
  "converted",
  "abandoned",
]);

export const carts = pgTable(
  "carts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: cartStatusEnum("status").notNull().default("open"),
    locationId: integer("location_id"),
    customerSnapshotJson: jsonb("customer_snapshot_json"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("cart_tenant").on(table.tenantId)]
);
export const insertCartSchema = createInsertSchema(carts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCart = z.infer<typeof insertCartSchema>;
export type Cart = typeof carts.$inferSelect;

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: varchar("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    offeringId: integer("offering_id")
      .references(() => scheduleOfferings.id, { onDelete: "set null" }),
    priceCents: integer("price_cents").notNull(),
    addedAt: timestamp("added_at").defaultNow(),
  },
  (table) => [index("cart_item_cart").on(table.cartId)]
);
export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  addedAt: true,
});
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
]);

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  schoolName: varchar("school_name").notNull(),
  city: varchar("city"),
  locationsRange: varchar("locations_range"),
  primaryNeed: varchar("primary_need"),
  source: varchar("source").default("lead-magnet"),
  status: leadStatusEnum("status").notNull().default("new"),
  convertedTenantId: integer("converted_tenant_id"),
  referralCode: varchar("referral_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  status: true,
  convertedTenantId: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export const leadNotes = pgTable("lead_notes", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  authorId: varchar("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  type: varchar("type").notNull().default("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLeadNoteSchema = createInsertSchema(leadNotes).omit({
  id: true,
  createdAt: true,
});
export type InsertLeadNote = z.infer<typeof insertLeadNoteSchema>;
export type LeadNote = typeof leadNotes.$inferSelect;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const savedBlocks = pgTable("saved_blocks", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  section: jsonb("section").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedBlockSchema = createInsertSchema(savedBlocks).omit({
  id: true,
  createdAt: true,
});
export type InsertSavedBlock = z.infer<typeof insertSavedBlockSchema>;
export type SavedBlock = typeof savedBlocks.$inferSelect;

export const tenantApiKeys = pgTable("tenant_api_keys", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  keyHash: varchar("key_hash").notNull(),
  keyPrefix: varchar("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantApiKeySchema = createInsertSchema(tenantApiKeys).omit({
  id: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
});
export type InsertTenantApiKey = z.infer<typeof insertTenantApiKeySchema>;
export type TenantApiKey = typeof tenantApiKeys.$inferSelect;

export const ticketTypeEnum = pgEnum("ticket_type", ["bug", "feature_request", "design", "content", "other"]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "acknowledged",
  "planned",
  "wip",
  "ready",
  "resolved",
  "closed",
  "cancelled",
]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    submittedByUserId: varchar("submitted_by_user_id").notNull(),
    type: ticketTypeEnum("type").notNull(),
    subject: varchar("subject").notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: varchar("priority"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("ticket_tenant_status").on(table.tenantId, table.status),
  ]
);

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

export const ticketResponses = pgTable("ticket_responses", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id").notNull(),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTicketResponseSchema = createInsertSchema(ticketResponses).omit({
  id: true,
  createdAt: true,
});
export type InsertTicketResponse = z.infer<typeof insertTicketResponseSchema>;
export type TicketResponse = typeof ticketResponses.$inferSelect;

export const sectionTypeEnum = z.enum([
  "hero",
  "packages",
  "testimonials",
  "faq",
  "locations",
  "contact",
  "cta",
  "text",
  "features",
  "gallery",
  "stats",
  "team",
  "video",
  "pricing",
  "countdown",
  "logos",
  "divider",
  "map",
  "social",
  "before_after",
  "process",
  "newsletter",
  "tabs",
  "accordion",
  "comparison",
  "floating_cta",
  "hotspots",
  "parallax_cards",
  "activity_feed",
  "awards",
  "progress_bar",
  "google_reviews",
  "quiz",
  "scheduler",
  "schedule_offerings",
  "spacer",
  "columns",
]);
export type SectionType = z.infer<typeof sectionTypeEnum>;

export const pageSectionSchema = z.object({
  id: z.string(),
  type: sectionTypeEnum,
  title: z.string().optional(),
  subtitle: z.string().optional(),
  content: z.any().optional(),
  visible: z.boolean().default(true),
  order: z.number(),
  variant: z.string().optional(),
  groupId: z.string().optional(),
  style: z.object({
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    padding: z.enum(["small", "medium", "large"]).optional(),
    customPaddingTop: z.number().optional(),
    customPaddingBottom: z.number().optional(),
    customPaddingLeft: z.number().optional(),
    customPaddingRight: z.number().optional(),
    customMarginTop: z.number().optional(),
    customMarginBottom: z.number().optional(),
    useCustomSpacing: z.boolean().optional(),
    backgroundImage: z.string().optional(),
    overlayOpacity: z.number().optional(),
    gradientDirection: z.enum(["to-bottom", "to-right", "to-bottom-right", "radial"]).optional(),
    gradientFrom: z.string().optional(),
    gradientTo: z.string().optional(),
    gradientMid: z.string().optional(),
    borderRadius: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
    shadow: z.enum(["none", "sm", "md", "lg", "xl"]).optional(),
    animation: z.enum(["none", "fade-in", "slide-up", "slide-left", "slide-right", "zoom-in"]).optional(),
    animationDuration: z.number().optional(),
    animationDelay: z.number().optional(),
    fullWidth: z.boolean().optional(),
    sectionGap: z.enum(["none", "tight", "normal", "spacious"]).optional(),
    dividerShape: z.enum(["none", "wave", "angle", "curve", "zigzag"]).optional(),
    dividerColor: z.string().optional(),
    parallax: z.boolean().optional(),
    minHeight: z.enum(["auto", "half", "full", "custom"]).optional(),
    customMinHeight: z.number().optional(),
    verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
    sticky: z.boolean().optional(),
    stickyPosition: z.enum(["top", "bottom"]).optional(),
    stickyOffset: z.number().optional(),
    stickyBlur: z.boolean().optional(),
    overlapOffset: z.number().optional(),
    zIndex: z.number().optional(),
    columnLayout: z.enum(["equal-2", "equal-3", "equal-4", "60-40", "40-60", "33-67", "67-33", "25-50-25"]).optional(),
    hideOnDesktop: z.boolean().optional(),
    hideOnTablet: z.boolean().optional(),
    hideOnMobile: z.boolean().optional(),
  }).optional(),
});
export type PageSection = z.infer<typeof pageSectionSchema>;

export const affiliateStatusEnum = pgEnum("affiliate_status", [
  "active",
  "suspended",
  "inactive",
]);

export const referralStatusEnum = pgEnum("referral_status", [
  "pending",
  "active",
  "churned",
]);

export const commissionStatusEnum = pgEnum("commission_status", [
  "pending",
  "approved",
  "paid",
  "reversed",
]);

export const commissionModelEnum = pgEnum("commission_model", [
  "recurring",
  "hybrid",
  "reseller",
]);

export const marketingProgramSettings = pgTable("marketing_program_settings", {
  id: serial("id").primaryKey(),
  enabledModels: text("enabled_models").array().notNull().default(sql`ARRAY['recurring']::text[]`),
  recurringDefaultRate: integer("recurring_default_rate").notNull().default(25),
  hybridDefaultUpfrontCents: integer("hybrid_default_upfront_cents").notNull().default(30000),
  hybridDefaultRecurringRate: integer("hybrid_default_recurring_rate").notNull().default(15),
  resellerDefaultWholesaleCents: integer("reseller_default_wholesale_cents").notNull().default(18000),
  tierSilverThreshold: integer("tier_silver_threshold").notNull().default(10),
  tierGoldThreshold: integer("tier_gold_threshold").notNull().default(25),
  tierSilverBonusRate: integer("tier_silver_bonus_rate").notNull().default(30),
  tierGoldBonusRate: integer("tier_gold_bonus_rate").notNull().default(35),
  minRetentionMonths: integer("min_retention_months").notNull().default(2),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMarketingProgramSettingsSchema = createInsertSchema(marketingProgramSettings).omit({ id: true });
export type InsertMarketingProgramSettings = z.infer<typeof insertMarketingProgramSettingsSchema>;
export type MarketingProgramSettings = typeof marketingProgramSettings.$inferSelect;

export const affiliates = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  code: varchar("code").notNull().unique(),
  status: affiliateStatusEnum("status").notNull().default("active"),
  commissionModel: commissionModelEnum("commission_model").notNull(),
  recurringRate: integer("recurring_rate"),
  hybridUpfrontCents: integer("hybrid_upfront_cents"),
  hybridRecurringRate: integer("hybrid_recurring_rate"),
  resellerWholesaleCents: integer("reseller_wholesale_cents"),
  tier: varchar("tier").notNull().default("base"),
  paypalEmail: varchar("paypal_email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAffiliateSchema = createInsertSchema(affiliates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;
export type Affiliate = typeof affiliates.$inferSelect;

export const affiliateReferrals = pgTable("affiliate_referrals", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id")
    .notNull()
    .references(() => affiliates.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  status: referralStatusEnum("status").notNull().default("pending"),
  referredAt: timestamp("referred_at").defaultNow(),
  activatedAt: timestamp("activated_at"),
  churnedAt: timestamp("churned_at"),
});

export const insertAffiliateReferralSchema = createInsertSchema(affiliateReferrals).omit({ id: true });
export type InsertAffiliateReferral = z.infer<typeof insertAffiliateReferralSchema>;
export type AffiliateReferral = typeof affiliateReferrals.$inferSelect;

export const affiliateCommissions = pgTable("affiliate_commissions", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id")
    .notNull()
    .references(() => affiliates.id, { onDelete: "cascade" }),
  referralId: integer("referral_id")
    .notNull()
    .references(() => affiliateReferrals.id, { onDelete: "cascade" }),
  type: varchar("type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: commissionStatusEnum("status").notNull().default("pending"),
  period: varchar("period"),
  description: varchar("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAffiliateCommissionSchema = createInsertSchema(affiliateCommissions).omit({ id: true, createdAt: true });
export type InsertAffiliateCommission = z.infer<typeof insertAffiliateCommissionSchema>;
export type AffiliateCommission = typeof affiliateCommissions.$inferSelect;

export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id")
    .notNull()
    .references(() => affiliates.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  method: varchar("method").notNull(),
  reference: varchar("reference"),
  paidAt: timestamp("paid_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAffiliatePayoutSchema = createInsertSchema(affiliatePayouts).omit({ id: true, createdAt: true });
export type InsertAffiliatePayout = z.infer<typeof insertAffiliatePayoutSchema>;
export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;

export const affiliateApplicationStatusEnum = pgEnum("affiliate_application_status", [
  "pending",
  "approved",
  "rejected",
  "converted",
]);

export const affiliateApplications = pgTable("affiliate_applications", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  company: varchar("company"),
  website: varchar("website"),
  preferredModel: varchar("preferred_model"),
  experience: text("experience"),
  status: affiliateApplicationStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAffiliateApplicationSchema = createInsertSchema(affiliateApplications).omit({ id: true, status: true, notes: true, createdAt: true });
export type InsertAffiliateApplication = z.infer<typeof insertAffiliateApplicationSchema>;
export type AffiliateApplication = typeof affiliateApplications.$inferSelect;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  link: varchar("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const staleCreditReminders = pgTable("stale_credit_reminders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  enrollmentId: integer("enrollment_id").notNull(),
  recipientUserId: varchar("recipient_user_id"),
  recipientEmail: varchar("recipient_email").notNull(),
  classroomCredits: integer("classroom_credits").notNull().default(0),
  driveCredits: integer("drive_credits").notNull().default(0),
  channel: varchar("channel").notNull().default("email"),
  emailStatus: varchar("email_status").notNull().default("queued"),
  inAppStatus: varchar("in_app_status").notNull().default("created"),
  errorMsg: text("error_msg"),
  triggeredBy: varchar("triggered_by").notNull().default("cron"),
  actorUserId: varchar("actor_user_id"),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStaleCreditReminderSchema = createInsertSchema(staleCreditReminders).omit({ id: true, createdAt: true, sentAt: true });
export type InsertStaleCreditReminder = z.infer<typeof insertStaleCreditReminderSchema>;
export type StaleCreditReminder = typeof staleCreditReminders.$inferSelect;

export const cartReminders = pgTable("cart_reminders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  kind: varchar("kind").notNull(), // "abandoned_cart" | "pending_cash"
  cartId: varchar("cart_id"),
  paymentId: integer("payment_id"),
  stage: integer("stage").notNull().default(1),
  recipientEmail: varchar("recipient_email").notNull(),
  emailStatus: varchar("email_status").notNull().default("queued"),
  errorMsg: text("error_msg"),
  triggeredBy: varchar("triggered_by").notNull().default("cron"),
  actorUserId: varchar("actor_user_id"),
  trackingToken: varchar("tracking_token"),
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  firstOpenedAt: timestamp("first_opened_at"),
  firstClickedAt: timestamp("first_clicked_at"),
  recoveredAt: timestamp("recovered_at"),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cart_reminder_tenant_kind").on(table.tenantId, table.kind),
  index("cart_reminder_cart").on(table.cartId),
  index("cart_reminder_payment").on(table.paymentId),
  uniqueIndex("cart_reminder_tracking_token").on(table.trackingToken),
]);

export const insertCartReminderSchema = createInsertSchema(cartReminders).omit({
  id: true,
  createdAt: true,
  sentAt: true,
  openCount: true,
  clickCount: true,
  firstOpenedAt: true,
  firstClickedAt: true,
  recoveredAt: true,
});
export type InsertCartReminder = z.infer<typeof insertCartReminderSchema>;
export type CartReminder = typeof cartReminders.$inferSelect;

export const emailUnsubscribes = pgTable("email_unsubscribes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  email: varchar("email").notNull(),
  source: varchar("source").notNull().default("cart_reminder"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("email_unsub_tenant_email").on(table.tenantId, table.email),
]);

export const insertEmailUnsubscribeSchema = createInsertSchema(emailUnsubscribes).omit({ id: true, createdAt: true });
export type InsertEmailUnsubscribe = z.infer<typeof insertEmailUnsubscribeSchema>;
export type EmailUnsubscribe = typeof emailUnsubscribes.$inferSelect;

export const sessionEmailStatusEnum = pgEnum("session_email_status", [
  "queued",
  "sent",
  "skipped_no_provider",
  "skipped_unsubscribed",
  "failed",
]);

export const sessionChangeEmails = pgTable("session_change_emails", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  sessionId: integer("session_id"),
  bookingId: integer("booking_id"),
  recipientEmail: varchar("recipient_email").notNull(),
  recipientUserId: varchar("recipient_user_id"),
  subject: varchar("subject").notNull(),
  body: text("body").notNull(),
  status: sessionEmailStatusEnum("status").notNull().default("queued"),
  errorMsg: text("error_msg"),
  providerMessageId: varchar("provider_message_id"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionChangeEmailSchema = createInsertSchema(sessionChangeEmails).omit({ id: true, createdAt: true, sentAt: true });
export type InsertSessionChangeEmail = z.infer<typeof insertSessionChangeEmailSchema>;
export type SessionChangeEmail = typeof sessionChangeEmails.$inferSelect;

export const sessionActivityActionEnum = pgEnum("session_activity_action", [
  "created",
  "cancelled",
  "rescheduled",
  "email_sent",
  "email_failed",
  "email_skipped",
  "booking_moved",
  "btw_scheduled",
]);

export const sessionActivityLog = pgTable("session_activity_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  sessionId: integer("session_id").notNull(),
  action: sessionActivityActionEnum("action").notNull(),
  actorUserId: varchar("actor_user_id"),
  message: text("message").notNull(),
  payload: jsonb("payload").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSessionActivityLogSchema = createInsertSchema(sessionActivityLog).omit({ id: true, createdAt: true });
export type InsertSessionActivityLog = z.infer<typeof insertSessionActivityLogSchema>;
export type SessionActivityLog = typeof sessionActivityLog.$inferSelect;

export const promotionIconEnum = pgEnum("promotion_icon", ["tag", "zap", "gift", "star", "percent"]);

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
  headline: varchar("headline").notNull(),
  description: text("description").notNull(),
  badgeText: varchar("badge_text").notNull(),
  icon: promotionIconEnum("icon").notNull().default("tag"),
  ctaLabel: varchar("cta_label").notNull().default("Claim Offer"),
  packageId: integer("package_id").references(() => packages.id, { onDelete: "set null" }),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPromotionSchema = createInsertSchema(promotions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type Promotion = typeof promotions.$inferSelect;

export const tenantAnnouncements = pgTable(
  "tenant_announcements",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    title: varchar("title"),
    enabled: boolean("enabled").notNull().default(false),
    message: text("message").notNull().default(""),
    ctaLabel: varchar("cta_label"),
    ctaHref: varchar("cta_href"),
    phone: varchar("phone"),
    bgColor: varchar("bg_color").notNull().default("#0f172a"),
    textColor: varchar("text_color").notNull().default("#ffffff"),
    dismissable: boolean("dismissable").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    validFrom: timestamp("valid_from"),
    validUntil: timestamp("valid_until"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("tenant_announcement_tenant_idx").on(table.tenantId)],
);

export const insertTenantAnnouncementSchema = createInsertSchema(tenantAnnouncements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTenantAnnouncement = z.infer<typeof insertTenantAnnouncementSchema>;
export type TenantAnnouncement = typeof tenantAnnouncements.$inferSelect;

export const onlineCourses = pgTable("online_courses", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  providerName: varchar("provider_name"),
  providerUrl: varchar("provider_url"),
  imageUrl: varchar("image_url"),
  // Primary language of instruction for marketing/admin display. Defaults to
  // ENGLISH for back-compat. Independent of any locale-aware UI.
  language: languageEnum("language").default("ENGLISH").notNull(),
  active: boolean("active").notNull().default(true),
  locationScopeMode: packageLocationScopeEnum("location_scope_mode").default("ALL_LOCATIONS").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnlineCourseSchema = createInsertSchema(onlineCourses).omit({ id: true, createdAt: true });
export type InsertOnlineCourse = z.infer<typeof insertOnlineCourseSchema>;
export type OnlineCourse = typeof onlineCourses.$inferSelect;

export const onlineCourseLocations = pgTable(
  "online_course_locations",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    onlineCourseId: integer("online_course_id")
      .notNull()
      .references(() => onlineCourses.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("online_course_locations_course_loc_unique").on(table.onlineCourseId, table.locationId),
    index("online_course_locations_tenant").on(table.tenantId),
  ]
);

export const insertOnlineCourseLocationSchema = createInsertSchema(onlineCourseLocations).omit({
  id: true,
  createdAt: true,
});
export type InsertOnlineCourseLocation = z.infer<typeof insertOnlineCourseLocationSchema>;
export type OnlineCourseLocation = typeof onlineCourseLocations.$inferSelect;

export const testimonialSourceEnum = pgEnum("testimonial_source", [
  "in_person",
  "google",
  "facebook",
  "yelp",
  "public_form",
  "other",
]);

export const testimonialStatusEnum = pgEnum("testimonial_status", [
  "pending",
  "approved",
  "rejected",
  "featured",
]);

export const testimonials = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => locations.id, { onDelete: "set null" }),
  name: varchar("name").notNull(),
  email: varchar("email"),
  rating: integer("rating").notNull().default(5),
  quote: text("quote").notNull(),
  photoUrl: varchar("photo_url"),
  videoUrl: varchar("video_url"),
  source: testimonialSourceEnum("source").notNull().default("in_person"),
  status: testimonialStatusEnum("status").notNull().default("pending"),
  sortOrder: integer("sort_order").notNull().default(0),
  submittedFromIp: varchar("submitted_from_ip"),
  approvedByUserId: varchar("approved_by_user_id"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTestimonialSchema = createInsertSchema(testimonials, {
  rating: z.coerce.number().int().min(1).max(5),
}).omit({ id: true, createdAt: true, approvedAt: true, approvedByUserId: true });
export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;
export type Testimonial = typeof testimonials.$inferSelect;
export type TestimonialStatus = (typeof testimonialStatusEnum.enumValues)[number];
export type TestimonialSource = (typeof testimonialSourceEnum.enumValues)[number];
export const tenantEmailTemplates = pgTable("tenant_email_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  templateKey: varchar("template_key").notNull(),
  subjectOverride: text("subject_override"),
  bodyOverride: text("body_override"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("tenant_email_template_key").on(table.tenantId, table.templateKey),
]);

export const insertTenantEmailTemplateSchema = createInsertSchema(tenantEmailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTenantEmailTemplate = z.infer<typeof insertTenantEmailTemplateSchema>;
export type TenantEmailTemplate = typeof tenantEmailTemplates.$inferSelect;

export type PublicTestimonial = Pick<
  Testimonial,
  "id" | "name" | "rating" | "quote" | "photoUrl" | "videoUrl" | "source" | "status" | "locationId" | "sortOrder" | "approvedAt"
>;

export const faqCategoryEnum = pgEnum("faq_category", [
  "packages",
  "resources",
  "road-test",
  "contact",
]);

export const faqs = pgTable("faqs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: faqCategoryEnum("category").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFaqSchema = createInsertSchema(faqs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type Faq = typeof faqs.$inferSelect;
