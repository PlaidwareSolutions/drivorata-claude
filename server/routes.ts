import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, getRolePriority } from "./storage";
import { setupAuth, isAuthenticated } from "./replit_integrations/auth";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import {
  insertTenantSchema,
  insertLocationSchema,
  insertPackageSchema,
  insertPackageComponentSchema,
  insertScheduleOfferingSchema,
  insertOfferingWaitlistSchema,
  insertTenantThemeSchema,
  insertEnrollmentSchema,
  insertVehicleSchema,
  insertInstructorAvailabilitySchema,
  insertScheduleSessionSchema,
  insertBookingSchema,
  insertPromotionSchema,
  insertTenantAnnouncementSchema,
  insertTestimonialSchema,
  type InsertTestimonial,
  insertFaqSchema,
  insertOnlineCourseSchema,
  tenants,
  enrollments,
  tenantMembers,
  locations,
  packages,
  vehicles,
  scheduleSessions,
  bookings,
  payments,
  platformMembers,
  tenantApiKeys,
  users,
  type InsertPayment,
  type InsertEnrollment,
  type Cart,
  type InsertScheduleSession,
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import { buildOccurrences, checkAvailabilityCoverage } from "@shared/recurrence";
import {
  computeServiceFeeCents,
  isServiceFeeProvider,
  MAX_SERVICE_FEE_BPS,
  MAX_SERVICE_FEE_FLAT_CENTS,
} from "@shared/service-fee";
import { derivePackageChannels } from "@shared/schema";
import {
  CartCheckoutError,
  CartCheckoutErrorCode,
  cartCheckoutErrorBody,
  type CartCheckoutErrorBody,
} from "@shared/api-errors";
import { db } from "./db";
import { eq, and, gte, count, desc, sql, inArray, isNull } from "drizzle-orm";
import { purgePreviewData } from "./demo-data";
import { affiliates as affiliatesTable, sessionActivityLog } from "@shared/schema";
import { createStripeCheckoutSession, verifyStripeWebhook, testStripeConnection } from "./payments/stripe-adapter";
import { createPayPalOrder, capturePayPalOrder, testPayPalConnection } from "./payments/paypal-adapter";
import { handleResendWebhook } from "./resend-webhook";
import { handleInboundEmailWebhook } from "./inbound-email-webhook";
import { activateEnrollment, activateCart, confirmEnrollmentManually } from "./payments/activation-service";
import { sendEnrollmentReceived, sendEnrollmentReceivedForCart, fireAndForget, TEMPLATE_DEFS, type EnrollmentEmailKey } from "./enrollment-emails";
import { sendAdminEnrollmentNotification } from "./admin-enrollment-notifications";
import { sendAdminContactNotification, sendContactConfirmationToSender, sendContactReplyEmail } from "./contact-message-notifications";
import { getEffectiveSender } from "./email-service";
import { insertTenantEmailTemplateSchema } from "@shared/schema";
import { registerPlatformRoutes } from "./platform-routes";
import {
  generateEnrollmentPurchasePDF,
  type PdfEnrollment,
  type PdfPayment,
  type PdfPackageSnapshot,
  type PdfCartCustomerSnapshot,
} from "./enrollment-pdf";
import {
  runStaleCreditRemindersForTenant,
  runStaleCreditRemindersAllTenants,
  sendStaleCreditReminderForEnrollment,
  DEFAULT_INTERVAL_DAYS,
} from "./stale-credit-reminders";
import {
  runCartRemindersForTenant,
  runCartRemindersAllTenants,
  sendCartReminderManual,
  verifyUnsubscribeToken,
  buildResumeUrl,
  DEFAULT_STAGE1_HOURS as CART_REMINDER_DEFAULT_STAGE1,
  DEFAULT_STAGE2_HOURS as CART_REMINDER_DEFAULT_STAGE2,
} from "./cart-reminders";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi";

declare global {
  namespace Express {
    interface Request {
      tenantId?: number;
      userRole?: string;
      user?: { claims: { sub: string; email?: string } };
      apiKeyTenantId?: number;
    }
  }
}

// Normalize a request-body `locationPriceOverrides` map into a Map<locationId, cents|null>.
// Accepts: `{ "12": 9900, "13": null }` or `{ "12": "99.00" }` (dollars string converted by caller).
// Non-finite/negative values are dropped — the caller treats missing entries as "no override".
function parseLocationPriceOverrides(input: unknown): Map<number, number | null> {
  const out = new Map<number, number | null>();
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const lid = Number(k);
    if (!Number.isFinite(lid) || lid <= 0) continue;
    if (v === null || v === undefined || v === "") {
      out.set(lid, null);
      continue;
    }
    const cents = Number(v);
    if (!Number.isFinite(cents) || cents < 0) continue;
    out.set(lid, Math.round(cents));
  }
  return out;
}

// Send a standardized cart/checkout 400 with a stable `code` and the existing
// human-readable `message`. Headless integrators branch on `code`.
function sendCartCheckoutError(
  res: Response,
  code: CartCheckoutErrorCode,
  message?: string,
  details?: Record<string, unknown>,
): Response {
  return res.status(400).json(cartCheckoutErrorBody(code, message, details));
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

async function resolveTenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantIdHeader = req.headers["x-tenant-id"];
  if (tenantIdHeader) {
    const val = Array.isArray(tenantIdHeader) ? tenantIdHeader[0] : tenantIdHeader;
    req.tenantId = parseInt(val, 10);
  }
  next();
}

async function loadUserRole(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (user?.claims?.sub && req.tenantId) {
    const member = await storage.getTenantMember(req.tenantId, user.claims.sub);
    if (member) {
      req.userRole = member.role;
    }
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);
  registerPlatformRoutes(app);

  async function requireAffiliate(req: any, res: Response, next: NextFunction) {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const affiliate = await storage.getAffiliateByUserId(userId);
    if (!affiliate || affiliate.status !== "active") {
      return res.status(403).json({ message: "Active affiliate account required" });
    }
    req.affiliate = affiliate;
    next();
  }

  app.get("/api/affiliate/dashboard", isAuthenticated, requireAffiliate, async (req: any, res) => {
    try {
      const affiliate = req.affiliate;
      const stats = await storage.getAffiliateStats(affiliate.id);
      const settings = await storage.getMarketingProgramSettings();

      let effectiveRate = settings.recurringDefaultRate;
      let effectiveUpfront = settings.hybridDefaultUpfrontCents;
      let effectiveHybridRate = settings.hybridDefaultRecurringRate;
      let effectiveWholesale = settings.resellerDefaultWholesaleCents;

      if (affiliate.recurringRate !== null) effectiveRate = affiliate.recurringRate;
      if (affiliate.hybridUpfrontCents !== null) effectiveUpfront = affiliate.hybridUpfrontCents;
      if (affiliate.hybridRecurringRate !== null) effectiveHybridRate = affiliate.hybridRecurringRate;
      if (affiliate.resellerWholesaleCents !== null) effectiveWholesale = affiliate.resellerWholesaleCents;

      if (affiliate.tier === "silver") effectiveRate = affiliate.recurringRate ?? settings.tierSilverBonusRate;
      if (affiliate.tier === "gold") effectiveRate = affiliate.recurringRate ?? settings.tierGoldBonusRate;

      res.json({
        code: affiliate.code,
        referralLink: `https://drivorata.com/?ref=${affiliate.code}`,
        commissionModel: affiliate.commissionModel,
        tier: affiliate.tier,
        activeSchools: stats.activeSchools,
        totalSchools: stats.totalReferrals,
        totalEarnedCents: stats.totalEarnedCents,
        pendingPayoutCents: stats.pendingCents,
        approvedPayoutCents: stats.approvedCents,
        recurringRate: effectiveRate,
        hybridUpfrontCents: effectiveUpfront,
        hybridRecurringRate: effectiveHybridRate,
        resellerWholesaleCents: effectiveWholesale,
        tierSilverThreshold: settings.tierSilverThreshold,
        tierGoldThreshold: settings.tierGoldThreshold,
      });
    } catch (error) {
      console.error("Error fetching affiliate dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  app.get("/api/affiliate/referrals", isAuthenticated, requireAffiliate, async (req: any, res) => {
    try {
      const referrals = await storage.getReferralsByAffiliate(req.affiliate.id);
      res.json(referrals);
    } catch (error) {
      console.error("Error fetching affiliate referrals:", error);
      res.status(500).json({ message: "Failed to fetch referrals" });
    }
  });

  app.get("/api/affiliate/commissions", isAuthenticated, requireAffiliate, async (req: any, res) => {
    try {
      const commissions = await storage.getCommissionsByAffiliate(req.affiliate.id, {
        status: req.query.status as string | undefined,
        period: req.query.period as string | undefined,
      });

      const enriched = await Promise.all(commissions.map(async (comm) => {
        let invoiceId: number | null = null;
        let invoiceAmountCents: number | null = null;
        let tenantName: string | null = null;

        const invoiceMatch = comm.description?.match(/Invoice #(\d+)/);
        if (invoiceMatch) {
          invoiceId = parseInt(invoiceMatch[1], 10);
          const invoice = await storage.getInvoice(invoiceId);
          if (invoice) {
            invoiceAmountCents = invoice.amountCents;
            const tenant = await storage.getTenant(invoice.tenantId);
            tenantName = tenant?.name || null;
          }
        }

        if (!tenantName && comm.referralId) {
          try {
            const referrals = await storage.getReferralsByAffiliate(req.affiliate.id);
            const ref = referrals.find(r => r.id === comm.referralId);
            if (ref) tenantName = ref.tenantName;
          } catch {}
        }

        return {
          ...comm,
          invoiceId,
          invoiceAmountCents,
          tenantName,
        };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching affiliate commissions:", error);
      res.status(500).json({ message: "Failed to fetch commissions" });
    }
  });

  app.get("/api/affiliate/payouts", isAuthenticated, requireAffiliate, async (req: any, res) => {
    try {
      const payouts = await storage.getPayoutsByAffiliate(req.affiliate.id);
      res.json(payouts);
    } catch (error) {
      console.error("Error fetching affiliate payouts:", error);
      res.status(500).json({ message: "Failed to fetch payouts" });
    }
  });

  // Serve the long-form headless-api integrator guide so the in-app
  // Reference Guide and external integrators can link directly to it.
  // MUST be registered before the /api/docs swagger-ui mount below, which
  // is an app.use() that catches all /api/docs/* subpaths.
  app.get("/api/headless-guide.md", async (_req, res) => {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const docPath = path.resolve(process.cwd(), "docs", "headless-api.md");
      const md = await fs.readFile(docPath, "utf-8");
      res.type("text/markdown; charset=utf-8").send(md);
    } catch (err) {
      res.status(404).type("text/plain").send("Headless API guide not found");
    }
  });

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Drivorata API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
  }));

  app.get("/api/docs.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.use("/api", resolveTenantMiddleware, loadUserRole);

  app.get("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const memberships = await storage.getUserTenants(userId);
      const grouped = new Map<number, typeof memberships[0] & { roles: string[] }>();
      for (const m of memberships) {
        const existing = grouped.get(m.tenant.id);
        if (existing) {
          existing.roles.push(m.role);
          if (getRolePriority(m.role) < getRolePriority(existing.role)) {
            existing.role = m.role;
            Object.assign(existing, m, { tenant: existing.tenant, roles: existing.roles });
          }
        } else {
          grouped.set(m.tenant.id, { ...m, roles: [m.role] });
        }
      }
      res.json(Array.from(grouped.values()));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  app.post("/api/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const data = insertTenantSchema.parse(req.body);
      if (data.slug) {
        const existing = await storage.getTenantBySlug(data.slug);
        if (existing) {
          return res.status(409).json({ message: "This URL slug is already taken. Please choose a different one." });
        }
      }
      const tenant = await storage.createTenant(data);
      await storage.createTenantMember({
        tenantId: tenant.id,
        userId: req.user.claims.sub,
        emailInvited: req.user.claims.email || null,
        role: "tenant_admin",
        status: "ACTIVE",
        locationScope: "ALL",
        profileCompleted: true,
        joinedAt: new Date(),
        active: true,
      });
      res.status(201).json(tenant);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  app.get("/api/tenants/check-slug", isAuthenticated, async (req: any, res) => {
    try {
      const slug = (req.query.slug as string || "").toLowerCase().trim();
      const excludeId = req.query.excludeId ? parseInt(req.query.excludeId as string) : null;
      if (!slug) return res.status(400).json({ message: "slug is required" });
      const existing = await storage.getTenantBySlug(slug);
      const available = !existing || (excludeId !== null && existing.id === excludeId);
      res.json({ slug, available });
    } catch {
      res.status(500).json({ message: "Failed to check slug" });
    }
  });

  app.get("/api/tenants/:id", isAuthenticated, async (req, res) => {
    try {
      const tenant = await storage.getTenant(parseInt(req.params.id as string));
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json(tenant);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  app.get("/api/tenants/:tenantId/dashboard-stats", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;

      const member = await storage.getTenantMember(tenantId, userId);
      const [pmResult] = await db.select().from(platformMembers).where(and(eq(platformMembers.userId, userId), eq(platformMembers.active, true)));
      if (!member && !pmResult) {
        return res.status(403).json({ message: "Access denied" });
      }

      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      const weekEnd = new Date(todayStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : null;
      const locFilter = locationId ? eq(enrollments.locationId, locationId) : undefined;
      const sessLocFilter = locationId ? eq(scheduleSessions.locationId, locationId) : undefined;
      const vehLocFilter = locationId ? eq(vehicles.locationId, locationId) : undefined;

      const enrollWhere = locFilter
        ? and(eq(enrollments.tenantId, tenantId), locFilter)
        : eq(enrollments.tenantId, tenantId);

      const sessWhere = sessLocFilter
        ? and(eq(scheduleSessions.tenantId, tenantId), sessLocFilter)
        : eq(scheduleSessions.tenantId, tenantId);

      const [enrollmentCount] = await db.select({ count: count() }).from(enrollments).where(enrollWhere);
      const [memberCount] = await db.select({ count: count() }).from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
      const [locationCount] = await db.select({ count: count() }).from(locations).where(eq(locations.tenantId, tenantId));
      const [packageCount] = await db.select({ count: count() }).from(packages).where(eq(packages.tenantId, tenantId));
      const [vehicleCount] = await db.select({ count: count() }).from(vehicles).where(
        vehLocFilter ? and(eq(vehicles.tenantId, tenantId), vehLocFilter) : eq(vehicles.tenantId, tenantId)
      );
      const [sessionCount] = await db.select({ count: count() }).from(scheduleSessions).where(sessWhere);

      const bookingCountQuery = sessLocFilter
        ? db.select({ count: count() })
            .from(bookings)
            .innerJoin(scheduleSessions, eq(bookings.sessionId, scheduleSessions.id))
            .where(and(eq(bookings.tenantId, tenantId), sessLocFilter))
        : db.select({ count: count() })
            .from(bookings)
            .where(eq(bookings.tenantId, tenantId));
      const [bookingCount] = await bookingCountQuery;

      const enrollmentsByStatus = await db
        .select({ status: enrollments.status, count: count() })
        .from(enrollments)
        .where(enrollWhere)
        .groupBy(enrollments.status);

      const [recentEnrollments] = await db
        .select({ count: count() })
        .from(enrollments)
        .where(and(enrollWhere!, gte(enrollments.createdAt, thirtyDaysAgo)));

      const revenueResult = await db
        .select({ total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)` })
        .from(payments)
        .innerJoin(enrollments, eq(payments.enrollmentId, enrollments.id))
        .where(and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "COMPLETED" as any),
          ...(locFilter ? [locFilter] : [])
        ));
      const totalRevenue = parseInt(revenueResult[0]?.total || "0", 10);

      const [todaySessions] = await db
        .select({ count: count() })
        .from(scheduleSessions)
        .where(and(
          sessWhere!,
          gte(scheduleSessions.startAt, todayStart),
          sql`${scheduleSessions.startAt} < ${todayEnd}`
        ));

      const [weekSessions] = await db
        .select({ count: count() })
        .from(scheduleSessions)
        .where(and(
          sessWhere!,
          gte(scheduleSessions.startAt, todayStart),
          sql`${scheduleSessions.startAt} < ${weekEnd}`
        ));

      const upcomingSessions = await db
        .select({
          id: scheduleSessions.id,
          type: scheduleSessions.type,
          startAt: scheduleSessions.startAt,
          endAt: scheduleSessions.endAt,
          capacity: scheduleSessions.capacity,
          bookedCount: scheduleSessions.bookedCount,
          status: scheduleSessions.status,
          locationId: scheduleSessions.locationId,
          instructorId: scheduleSessions.instructorId,
        })
        .from(scheduleSessions)
        .where(and(
          sessWhere!,
          gte(scheduleSessions.startAt, todayStart),
          sql`${scheduleSessions.status} != 'CANCELLED'`
        ))
        .orderBy(scheduleSessions.startAt)
        .limit(10);

      const recentEnrollmentsList = await db
        .select({
          id: enrollments.id,
          firstName: enrollments.firstName,
          lastName: enrollments.lastName,
          email: enrollments.email,
          status: enrollments.status,
          createdAt: enrollments.createdAt,
          packageId: enrollments.packageId,
        })
        .from(enrollments)
        .where(enrollWhere)
        .orderBy(desc(enrollments.createdAt))
        .limit(10);

      const enrollmentsByMonth = await db
        .select({
          month: sql<string>`to_char(${enrollments.createdAt}, 'YYYY-MM')`,
          count: count(),
        })
        .from(enrollments)
        .where(and(enrollWhere!, gte(enrollments.createdAt, sql`NOW() - INTERVAL '6 months'`)))
        .groupBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`);

      const instrSessWhere = sessLocFilter
        ? and(eq(scheduleSessions.tenantId, tenantId), eq(scheduleSessions.instructorId, userId), sessLocFilter)
        : and(eq(scheduleSessions.tenantId, tenantId), eq(scheduleSessions.instructorId, userId));

      const [myUpcomingSessionsCount] = await db
        .select({ count: count() })
        .from(scheduleSessions)
        .where(and(
          instrSessWhere!,
          gte(scheduleSessions.startAt, todayStart),
          sql`${scheduleSessions.status} != 'CANCELLED'`
        ));

      const [myTodaySessions] = await db
        .select({ count: count() })
        .from(scheduleSessions)
        .where(and(
          instrSessWhere!,
          gte(scheduleSessions.startAt, todayStart),
          sql`${scheduleSessions.startAt} < ${todayEnd}`
        ));

      const myUpcomingSessions = await db
        .select({
          id: scheduleSessions.id,
          type: scheduleSessions.type,
          startAt: scheduleSessions.startAt,
          endAt: scheduleSessions.endAt,
          capacity: scheduleSessions.capacity,
          bookedCount: scheduleSessions.bookedCount,
          status: scheduleSessions.status,
          locationId: scheduleSessions.locationId,
        })
        .from(scheduleSessions)
        .where(and(
          instrSessWhere!,
          gte(scheduleSessions.startAt, todayStart),
          sql`${scheduleSessions.status} != 'CANCELLED'`
        ))
        .orderBy(scheduleSessions.startAt)
        .limit(10);

      const myBookings = await db
        .select({
          id: bookings.id,
          status: bookings.status,
          sessionId: bookings.sessionId,
          createdAt: bookings.createdAt,
        })
        .from(bookings)
        .innerJoin(scheduleSessions, eq(bookings.sessionId, scheduleSessions.id))
        .where(and(
          eq(bookings.tenantId, tenantId),
          eq(bookings.userId, userId),
          eq(bookings.status, "BOOKED"),
          gte(scheduleSessions.startAt, todayStart),
          ...(sessLocFilter ? [sessLocFilter] : [])
        ))
        .orderBy(scheduleSessions.startAt)
        .limit(10);

      const myEnrollments = await db
        .select({
          id: enrollments.id,
          status: enrollments.status,
          packageId: enrollments.packageId,
          classroomHoursCompleted: enrollments.classroomHoursCompleted,
          drivingHoursCompleted: enrollments.drivingHoursCompleted,
        })
        .from(enrollments)
        .where(and(
          eq(enrollments.tenantId, tenantId),
          eq(enrollments.userId, userId),
          ...(locFilter ? [locFilter] : [])
        ));

      return res.json({
        totalEnrollments: enrollmentCount.count,
        totalMembers: memberCount.count,
        totalLocations: locationCount.count,
        totalPackages: packageCount.count,
        totalVehicles: vehicleCount.count,
        totalSessions: sessionCount.count,
        totalBookings: bookingCount.count,
        enrollmentsByStatus,
        recentEnrollmentsCount: recentEnrollments.count,
        totalRevenue,
        todaySessions: todaySessions.count,
        weekSessions: weekSessions.count,
        upcomingSessions,
        recentEnrollmentsList,
        enrollmentsByMonth,
        instructor: {
          myUpcomingSessionsCount: myUpcomingSessionsCount.count,
          myTodaySessions: myTodaySessions.count,
          myUpcomingSessions,
        },
        student: {
          myBookings,
          myEnrollments,
        },
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      return res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/tenants/:id/slug-change-check", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(id, userId);
      const [pmResult] = await db.select().from(platformMembers).where(and(eq(platformMembers.userId, userId), eq(platformMembers.active, true)));
      const isTenantAdmin = member && ["tenant_admin", "platform_admin"].includes(member.role);
      const isPlatformAdmin = pmResult && pmResult.role === "admin";
      if (!isTenantAdmin && !isPlatformAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const activePayments = await db.select({ id: payments.id, status: payments.status })
        .from(payments)
        .where(and(eq(payments.tenantId, id), inArray(payments.status, ["CREATED", "PENDING"])));
      const apiKeys = await db.select({ id: tenantApiKeys.id })
        .from(tenantApiKeys)
        .where(and(eq(tenantApiKeys.tenantId, id), isNull(tenantApiKeys.revokedAt)));
      res.json({
        activePaymentCount: activePayments.length,
        activeApiKeyCount: apiKeys.length,
        warnings: [
          ...(activePayments.length > 0 ? [`${activePayments.length} active payment session(s) may have checkout URLs with the current slug. Changing the slug could break payment redirects.`] : []),
          ...(apiKeys.length > 0 ? [`${apiKeys.length} active API key(s) exist. External integrations using the current slug in their URLs will need to be updated.`] : []),
        ],
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check slug change safety" });
    }
  });

  app.patch("/api/tenants/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(id, userId);
      const [pmResult] = await db.select().from(platformMembers).where(and(eq(platformMembers.userId, userId), eq(platformMembers.active, true)));
      const isTenantAdmin = member && ["tenant_admin", "platform_admin"].includes(member.role);
      const isPlatformAdmin = pmResult && pmResult.role === "admin";
      if (!isTenantAdmin && !isPlatformAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (req.body.slug) {
        const slug = req.body.slug.toLowerCase().trim();
        if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2) {
          return res.status(400).json({ message: "Invalid slug format. Use only lowercase letters, numbers, and hyphens." });
        }
        req.body.slug = slug;
        const existing = await storage.getTenantBySlug(slug);
        if (existing && existing.id !== id) {
          return res.status(409).json({ message: "This URL slug is already taken. Please choose a different one." });
        }
        const currentTenant = await storage.getTenant(id);
        if (currentTenant && currentTenant.slug !== slug) {
          const activePayments = await db.select({ id: payments.id })
            .from(payments)
            .where(and(eq(payments.tenantId, id), inArray(payments.status, ["CREATED", "PENDING"])));
          const apiKeys = await db.select({ id: tenantApiKeys.id })
            .from(tenantApiKeys)
            .where(and(eq(tenantApiKeys.tenantId, id), isNull(tenantApiKeys.revokedAt)));
          const warnings = [];
          if (activePayments.length > 0) warnings.push(`${activePayments.length} active payment(s)`);
          if (apiKeys.length > 0) warnings.push(`${apiKeys.length} active API key(s)`);
          if (warnings.length > 0 && !req.body.confirmSlugChange) {
            return res.status(422).json({
              message: "Slug change requires confirmation due to active integrations",
              warnings,
              requiresConfirmation: true,
            });
          }
        }
      }
      const { confirmSlugChange: _confirm, ...updateData } = req.body;
      const tenant = await storage.updateTenant(id, updateData);
      res.json(tenant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tenant" });
    }
  });

  app.post("/api/tenants/:id/go-live", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(id, req.user.claims.sub);
      if (!member || member.role !== "tenant_admin") {
        return res.status(403).json({ message: "Only school admins can go live" });
      }
      const tenant = await storage.getTenant(id);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!tenant.previewMode) {
        return res.status(400).json({ message: "This school is not in preview mode" });
      }
      await purgePreviewData(id);
      return res.json({ success: true, message: "You're now live! Start by adding your packages and locations." });
    } catch (error) {
      console.error("Go live error:", error);
      return res.status(500).json({ message: "Failed to go live" });
    }
  });

  app.post("/api/tenants/:id/domain/verify", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(id, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const tenant = await storage.updateTenant(id, {
        domainVerificationToken: token,
      });
      res.json({
        token,
        instructions: `Add a TXT record with value "driveSchool-verify=${token}" to your domain's DNS settings.`,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to initiate domain verification" });
    }
  });

  app.post("/api/tenants/:id/domain/check", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(id, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const tenant = await storage.getTenant(id);
      if (!tenant?.customDomain || !tenant?.domainVerificationToken) {
        return res.status(400).json({ message: "No domain or verification token configured", status: "no_domain" });
      }
      const expectedRecord = `driveSchool-verify=${tenant.domainVerificationToken}`;
      const domain = tenant.customDomain.replace(/^www\./, "");
      const now = new Date();
      try {
        const { promises: dnsPromises } = await import("dns");
        const records = await dnsPromises.resolveTxt(domain);
        const flatRecords = records.map((r: string[]) => r.join(""));
        const found = flatRecords.some((r: string) => r === expectedRecord);
        if (found && !tenant.domainVerified) {
          await storage.updateTenant(id, {
            domainVerified: true,
            lastDomainCheck: now,
          });
        } else {
          await storage.updateTenant(id, {
            lastDomainCheck: now,
          });
        }
        res.json({
          status: found ? "verified" : "not_found",
          domain: tenant.customDomain,
          txtRecordFound: found,
          verified: found,
          lastChecked: now.toISOString(),
          message: found
            ? "DNS TXT record found and domain verified successfully."
            : "DNS TXT record not found yet. DNS propagation can take up to 48 hours.",
        });
      } catch (dnsError: any) {
        await storage.updateTenant(id, { lastDomainCheck: now });
        if (dnsError.code === "ENODATA" || dnsError.code === "ENOTFOUND") {
          res.json({
            status: "not_found",
            domain: tenant.customDomain,
            txtRecordFound: false,
            verified: false,
            lastChecked: now.toISOString(),
            message: "No TXT records found for this domain. Please add the record and wait for DNS propagation.",
          });
        } else {
          res.json({
            status: "error",
            domain: tenant.customDomain,
            txtRecordFound: false,
            verified: false,
            lastChecked: now.toISOString(),
            message: "Could not look up DNS records. Please check the domain name and try again.",
          });
        }
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to check DNS status" });
    }
  });

  app.get("/api/tenants/:tenantId/theme", isAuthenticated, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const theme = await storage.getTenantTheme(tenantId);
      res.json(theme || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch theme" });
    }
  });

  app.put("/api/tenants/:tenantId/theme", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const theme = await storage.upsertTenantTheme({ ...req.body, tenantId });
      res.json(theme);
    } catch (error) {
      res.status(500).json({ message: "Failed to update theme" });
    }
  });

  const memberProfileSchema = z.object({
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
    emergencyContactName: z.string().optional().nullable(),
    emergencyContactPhone: z.string().optional().nullable(),
    instructorType: z.enum(["CLASSROOM", "DRIVE", "BOTH"]).optional().nullable(),
    instructorTypeByLocation: z.record(z.string(), z.enum(["CLASSROOM", "DRIVE", "BOTH"])).optional().nullable(),
    licenseNumber: z.string().optional().nullable(),
    licenseExpiry: z.string().optional().nullable(),
    permitNumber: z.string().optional().nullable(),
    permitExpiry: z.string().optional().nullable(),
  });

  const inviteMemberSchema = z.object({
    email: z.string().email(),
    role: z.enum(["tenant_admin", "office_manager", "instructor", "student", "parent"]),
    locationScope: z.union([z.literal("ALL"), z.array(z.number())]).optional().default("ALL"),
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    instructorType: z.enum(["CLASSROOM", "DRIVE", "BOTH"]).optional().nullable(),
    instructorTypeByLocation: z.record(z.string(), z.enum(["CLASSROOM", "DRIVE", "BOTH"])).optional().nullable(),
  });

  const updateMemberSchema = z.object({
    role: z.enum(["tenant_admin", "office_manager", "instructor", "student", "parent"]).optional(),
    locationScope: z.union([z.literal("ALL"), z.array(z.number())]).optional(),
  }).merge(memberProfileSchema);

  app.get("/api/tenants/:tenantId/members", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const members = await storage.getTenantMembers(tenantId);
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  app.post("/api/tenants/:tenantId/members/invite", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = inviteMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { email, role, locationScope, firstName, lastName, phone, instructorType, instructorTypeByLocation } = parsed.data;
      const existingWithRole = await storage.getTenantMemberByEmailAndRole(tenantId, email, role);
      if (existingWithRole) {
        return res.status(409).json({ message: `A member with this email already has the ${role} role in this school` });
      }
      let existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        const existingRoles = await storage.getTenantMemberRoles(tenantId, existingUser.id);
        const hasRole = existingRoles.some(m => m.role === role);
        if (hasRole) {
          return res.status(409).json({ message: `This user already has the ${role} role in this school` });
        }
      }
      if (!existingUser) {
        const fullName = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
        existingUser = await storage.createUserByEmail(email, fullName, phone);
        const defaultHash = await bcrypt.hash("password123", 10);
        await db.update(users).set({ passwordHash: defaultHash }).where(eq(users.id, existingUser.id));
      }
      const memberData: any = {
        tenantId,
        userId: existingUser.id,
        emailInvited: email,
        role: role as any,
        status: "ACTIVE",
        locationScope: locationScope || "ALL",
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
        profileCompleted: false,
        invitedByUserId: actorId,
        invitedAt: new Date(),
        joinedAt: new Date(),
        active: true,
      };
      if (role === "instructor") {
        if (instructorType) memberData.instructorType = instructorType;
        if (instructorTypeByLocation) memberData.instructorTypeByLocation = instructorTypeByLocation;
      }
      const created = await storage.createTenantMember(memberData);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "member_invited",
        targetType: "member",
        targetId: created.id,
        details: {
          email, role, locationScope: locationScope || "ALL",
          ...(role === "instructor" && instructorType ? { instructorType } : {}),
          ...(role === "instructor" && instructorTypeByLocation ? { instructorTypeByLocation } : {}),
        },
      });
      const memberWithUser = { ...created, user: existingUser || null };
      res.status(201).json(memberWithUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to invite member" });
    }
  });

  app.patch("/api/tenants/:tenantId/members/bulk-update-person", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const schema = z.object({
        memberIds: z.array(z.number()).min(1),
        firstName: z.string().nullable().optional(),
        lastName: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        roleScopes: z.array(z.object({
          memberId: z.number(),
          locationScope: z.union([z.literal("ALL"), z.array(z.number())]),
          instructorType: z.enum(["CLASSROOM", "DRIVE", "BOTH"]).nullable().optional(),
          instructorTypeByLocation: z.record(z.string(), z.enum(["CLASSROOM", "DRIVE", "BOTH"])).nullable().optional(),
        })).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { memberIds, firstName, lastName, phone, roleScopes } = parsed.data;
      const sharedUpdates: any = {};
      if (firstName !== undefined) sharedUpdates.firstName = firstName;
      if (lastName !== undefined) sharedUpdates.lastName = lastName;
      if (phone !== undefined) sharedUpdates.phone = phone;
      for (const mid of memberIds) {
        const target = await storage.getTenantMemberById(mid, tenantId);
        if (!target) continue;
        const perRole = roleScopes?.find(rs => rs.memberId === mid);
        const updates = { ...sharedUpdates };
        if (perRole) {
          updates.locationScope = perRole.locationScope;
          if (target.role === "instructor") {
            if (perRole.instructorType !== undefined) {
              updates.instructorType = perRole.instructorType;
            }
            if (perRole.instructorTypeByLocation !== undefined) {
              updates.instructorTypeByLocation = perRole.instructorTypeByLocation;
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          await storage.updateTenantMember(mid, tenantId, updates);
        }
      }
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "member_bulk_updated",
        targetType: "member",
        targetId: memberIds[0],
        details: { memberIds, changes: { firstName, lastName, phone } },
      });
      res.json({ message: "Updated successfully" });
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: errMsg || "Failed to update member" });
    }
  });

  app.patch("/api/tenants/:tenantId/members/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const memberId = parseInt(req.params.id);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getTenantMemberById(memberId, tenantId);
      if (!target) {
        return res.status(404).json({ message: "Member not found" });
      }
      const parsed = updateMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { role, locationScope, firstName, lastName, phone, dateOfBirth, emergencyContactName, emergencyContactPhone, instructorType, instructorTypeByLocation, licenseNumber, licenseExpiry, permitNumber, permitExpiry } = parsed.data;
      if (role && role !== target.role) {
        if (target.role === "tenant_admin") {
          const adminCount = await storage.countTenantAdmins(tenantId);
          if (adminCount <= 1) {
            return res.status(400).json({ message: "Cannot change role of the last admin" });
          }
        }
        if (target.userId) {
          const existingRoles = await storage.getTenantMemberRoles(tenantId, target.userId);
          if (existingRoles.some(m => m.role === role && m.id !== memberId)) {
            return res.status(409).json({ message: `This user already has the ${role} role` });
          }
        }
      }
      const effectiveRole = role || target.role;
      const updateData: any = {};
      if (role) updateData.role = role;
      if (locationScope !== undefined) updateData.locationScope = locationScope;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (phone !== undefined) updateData.phone = phone;
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
      if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
      if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
      if (instructorType !== undefined) updateData.instructorType = effectiveRole === "instructor" ? instructorType : null;
      if (instructorTypeByLocation !== undefined) updateData.instructorTypeByLocation = effectiveRole === "instructor" ? instructorTypeByLocation : null;
      if (licenseNumber !== undefined) updateData.licenseNumber = effectiveRole === "instructor" ? licenseNumber : null;
      if (licenseExpiry !== undefined) updateData.licenseExpiry = effectiveRole === "instructor" ? licenseExpiry : null;
      if (permitNumber !== undefined) updateData.permitNumber = effectiveRole === "student" ? permitNumber : null;
      if (permitExpiry !== undefined) updateData.permitExpiry = effectiveRole === "student" ? permitExpiry : null;
      const updated = await storage.updateTenantMember(memberId, tenantId, updateData);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "member_updated",
        targetType: "member",
        targetId: memberId,
        details: {
          changes: { role: { from: target.role, to: role || target.role }, locationScope: locationScope },
        },
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update member" });
    }
  });

  app.patch("/api/tenants/:tenantId/members/:id/disable", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const memberId = parseInt(req.params.id);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getTenantMemberById(memberId, tenantId);
      if (!target) {
        return res.status(404).json({ message: "Member not found" });
      }
      if (target.role === "tenant_admin") {
        const adminCount = await storage.countTenantAdmins(tenantId);
        if (adminCount <= 1) {
          return res.status(400).json({ message: "Cannot disable the last admin" });
        }
      }
      if (target.userId === actorId) {
        return res.status(400).json({ message: "Cannot disable yourself. Ask another admin to do this." });
      }
      const updated = await storage.updateTenantMember(memberId, tenantId, {
        status: "DISABLED",
        active: false,
        disabledAt: new Date(),
      });
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "member_disabled",
        targetType: "member",
        targetId: memberId,
        details: { role: target.role, email: target.emailInvited },
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to disable member" });
    }
  });

  app.patch("/api/tenants/:tenantId/members/:id/enable", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const memberId = parseInt(req.params.id);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getTenantMemberById(memberId, tenantId);
      if (!target) {
        return res.status(404).json({ message: "Member not found" });
      }
      const updated = await storage.updateTenantMember(memberId, tenantId, {
        status: "ACTIVE",
        active: true,
        disabledAt: null,
      });
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "member_enabled",
        targetType: "member",
        targetId: memberId,
        details: { role: target.role, email: target.emailInvited },
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to enable member" });
    }
  });

  app.delete("/api/tenants/:tenantId/members/:id/invite", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const memberId = parseInt(req.params.id);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getTenantMemberById(memberId, tenantId);
      if (!target || target.status !== "INVITED") {
        return res.status(400).json({ message: "Can only cancel pending invites" });
      }
      await storage.deleteTenantMember(memberId, tenantId);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "invite_cancelled",
        targetType: "member",
        targetId: memberId,
        details: { email: target.emailInvited, role: target.role },
      });
      res.json({ message: "Invite cancelled" });
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel invite" });
    }
  });

  app.patch("/api/tenants/:tenantId/members/:id/resend-invite", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const memberId = parseInt(req.params.id);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getTenantMemberById(memberId, tenantId);
      if (!target || target.status !== "INVITED") {
        return res.status(400).json({ message: "Can only resend pending invites" });
      }
      const updated = await storage.updateTenantMember(memberId, tenantId, {
        invitedAt: new Date(),
        invitedByUserId: actorId,
      });
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "invite_resent",
        targetType: "member",
        targetId: memberId,
        details: { email: target.emailInvited, role: target.role },
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  // ===== Profile Completion =====
  const profileCompletionSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phone: z.string().optional().nullable(),
    dateOfBirth: z.string().optional().nullable(),
    emergencyContactName: z.string().optional().nullable(),
    emergencyContactPhone: z.string().optional().nullable(),
    instructorType: z.enum(["CLASSROOM", "DRIVE", "BOTH"]).optional().nullable(),
    instructorTypeByLocation: z.record(z.string(), z.enum(["CLASSROOM", "DRIVE", "BOTH"])).optional().nullable(),
    licenseNumber: z.string().optional().nullable(),
    licenseExpiry: z.string().optional().nullable(),
    permitNumber: z.string().optional().nullable(),
    permitExpiry: z.string().optional().nullable(),
  });

  app.get("/api/tenants/:tenantId/my-profile", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const allRoles = await storage.getTenantMemberRoles(tenantId, userId);
      if (allRoles.length === 0) return res.status(404).json({ message: "Not a member" });
      const needsCompletion = allRoles.some(m => !m.profileCompleted);
      const roles = allRoles.map(m => m.role);
      const primary = allRoles[0];
      res.json({
        memberships: allRoles,
        roles,
        needsCompletion,
        firstName: primary.firstName,
        lastName: primary.lastName,
        phone: primary.phone,
        dateOfBirth: primary.dateOfBirth,
        emergencyContactName: primary.emergencyContactName,
        emergencyContactPhone: primary.emergencyContactPhone,
        instructorType: allRoles.find(m => m.role === "instructor")?.instructorType || null,
        instructorTypeByLocation: allRoles.find(m => m.role === "instructor")?.instructorTypeByLocation || null,
        licenseNumber: allRoles.find(m => m.role === "instructor")?.licenseNumber || null,
        licenseExpiry: allRoles.find(m => m.role === "instructor")?.licenseExpiry || null,
        permitNumber: allRoles.find(m => m.role === "student")?.permitNumber || null,
        permitExpiry: allRoles.find(m => m.role === "student")?.permitExpiry || null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch("/api/tenants/:tenantId/my-profile", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const allRoles = await storage.getTenantMemberRoles(tenantId, userId);
      if (allRoles.length === 0) return res.status(404).json({ message: "Not a member" });

      const parsed = profileCompletionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { firstName, lastName, phone, dateOfBirth, emergencyContactName, emergencyContactPhone, instructorType, instructorTypeByLocation, licenseNumber, licenseExpiry, permitNumber, permitExpiry } = parsed.data;

      for (const membership of allRoles) {
        const updateData: any = {
          firstName,
          lastName,
          phone: phone || null,
          dateOfBirth: dateOfBirth || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
          profileCompleted: true,
        };
        if (membership.role === "instructor") {
          updateData.instructorType = instructorType || null;
          updateData.instructorTypeByLocation = instructorTypeByLocation || null;
          updateData.licenseNumber = licenseNumber || null;
          updateData.licenseExpiry = licenseExpiry || null;
        }
        if (membership.role === "student") {
          updateData.permitNumber = permitNumber || null;
          updateData.permitExpiry = permitExpiry || null;
        }
        await storage.updateTenantMember(membership.id, tenantId, updateData);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ===== Add Role to Existing Member =====
  app.post("/api/tenants/:tenantId/members/:id/add-role", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const memberId = parseInt(req.params.id);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getTenantMemberById(memberId, tenantId);
      if (!target) {
        return res.status(404).json({ message: "Member not found" });
      }
      const addRoleSchema = z.object({
        role: z.enum(["tenant_admin", "office_manager", "instructor", "student", "parent"]),
        locationScope: z.union([z.literal("ALL"), z.array(z.number())]).optional().default("ALL"),
        instructorType: z.enum(["CLASSROOM", "DRIVE", "BOTH"]).optional().nullable(),
        instructorTypeByLocation: z.record(z.string(), z.enum(["CLASSROOM", "DRIVE", "BOTH"])).optional().nullable(),
      });
      const parsed = addRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { role, locationScope, instructorType, instructorTypeByLocation } = parsed.data;

      const userId = target.userId;
      const email = target.emailInvited;
      if (userId) {
        const existingRoles = await storage.getTenantMemberRoles(tenantId, userId);
        if (existingRoles.some(m => m.role === role)) {
          return res.status(409).json({ message: `This member already has the ${role} role` });
        }
      } else if (email) {
        const existingWithRole = await storage.getTenantMemberByEmailAndRole(tenantId, email, role);
        if (existingWithRole) {
          return res.status(409).json({ message: `This member already has the ${role} role` });
        }
      }

      const memberData: any = {
        tenantId,
        userId: target.userId || null,
        emailInvited: email || null,
        role: role as any,
        status: target.status,
        locationScope: locationScope || "ALL",
        firstName: target.firstName,
        lastName: target.lastName,
        phone: target.phone,
        profileCompleted: target.profileCompleted,
        invitedByUserId: actorId,
        invitedAt: new Date(),
        joinedAt: target.joinedAt,
        active: target.active,
      };
      if (role === "instructor") {
        if (instructorType) memberData.instructorType = instructorType;
        if (instructorTypeByLocation) memberData.instructorTypeByLocation = instructorTypeByLocation;
      }

      const created = await storage.createTenantMember(memberData);

      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "role_added",
        targetType: "member",
        targetId: created.id,
        details: { role, existingMemberId: memberId },
      });

      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to add role" });
    }
  });

  app.delete("/api/tenants/:tenantId/members/:id/role", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const memberId = parseInt(req.params.id);
      const actorId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, actorId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const target = await storage.getTenantMemberById(memberId, tenantId);
      if (!target) {
        return res.status(404).json({ message: "Member not found" });
      }
      if (target.role === "tenant_admin") {
        const adminCount = await storage.countTenantAdmins(tenantId);
        if (adminCount <= 1) {
          return res.status(400).json({ message: "Cannot remove the last admin role" });
        }
      }
      let allRoles: any[] = [];
      if (target.userId) {
        allRoles = await storage.getTenantMemberRoles(tenantId, target.userId);
      } else if (target.emailInvited) {
        allRoles = await storage.getTenantMembersByEmailInvited(tenantId, target.emailInvited);
      }
      if (allRoles.length <= 1) {
        return res.status(400).json({ message: "Cannot remove the only role. Use disable instead." });
      }
      if (target.userId === actorId) {
        const actorRoles = allRoles.filter(m => m.id !== memberId);
        const hasAdmin = actorRoles.some(m => m.role === "tenant_admin" || m.role === "platform_admin");
        if (!hasAdmin) {
          return res.status(400).json({ message: "Cannot remove this role — you would lose admin access" });
        }
      }
      await storage.deleteTenantMember(memberId, tenantId);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: actorId,
        action: "role_removed",
        targetType: "member",
        targetId: memberId,
        details: { role: target.role, userId: target.userId },
      });
      res.json({ message: "Role removed" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove role" });
    }
  });

  app.get("/api/tenants/:tenantId/locations", isAuthenticated, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const locs = await storage.getLocations(tenantId);
      res.json(locs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/tenants/:tenantId/locations", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertLocationSchema.parse({ ...req.body, tenantId });
      const loc = await storage.createLocation(data);
      res.status(201).json(loc);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create location" });
    }
  });

  app.patch("/api/tenants/:tenantId/locations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const loc = await storage.updateLocation(parseInt(req.params.id), tenantId, req.body);
      res.json(loc);
    } catch (error) {
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.delete("/api/tenants/:tenantId/locations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteLocation(parseInt(req.params.id), tenantId);
      res.json({ message: "Location deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  // ===== Phase 2: Vehicles =====

  app.get("/api/tenants/:tenantId/vehicles", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const list = await storage.getVehicles(tenantId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch vehicles" });
    }
  });

  app.post("/api/tenants/:tenantId/vehicles", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertVehicleSchema.parse({ ...req.body, tenantId });
      const vehicle = await storage.createVehicle(data);
      res.status(201).json(vehicle);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create vehicle" });
    }
  });

  app.patch("/api/tenants/:tenantId/vehicles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const vehicle = await storage.updateVehicle(parseInt(req.params.id), tenantId, req.body);
      res.json(vehicle);
    } catch (error) {
      res.status(500).json({ message: "Failed to update vehicle" });
    }
  });

  app.delete("/api/tenants/:tenantId/vehicles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteVehicle(parseInt(req.params.id), tenantId);
      res.json({ message: "Vehicle deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete vehicle" });
    }
  });

  // ===== Phase 2: Instructor Availability =====

  app.get("/api/tenants/:tenantId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const instructorId = req.query.instructorId as string | undefined;
      const blocks = await storage.getInstructorAvailability(tenantId, instructorId);
      res.json(blocks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.post("/api/tenants/:tenantId/availability", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertInstructorAvailabilitySchema.parse({ ...req.body, tenantId });
      const block = await storage.createInstructorAvailability(data);
      res.status(201).json(block);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      res.status(500).json({ message: "Failed to create availability block" });
    }
  });

  app.patch("/api/tenants/:tenantId/availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const block = await storage.updateInstructorAvailability(parseInt(req.params.id), tenantId, req.body);
      res.json(block);
    } catch (error) {
      res.status(500).json({ message: "Failed to update availability block" });
    }
  });

  app.delete("/api/tenants/:tenantId/availability/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteInstructorAvailability(parseInt(req.params.id), tenantId);
      res.json({ message: "Availability block deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete availability block" });
    }
  });

  // ===== Phase 2: Schedule Sessions =====

  app.get("/api/tenants/:tenantId/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const filters: any = {};
      if (req.query.type) filters.type = req.query.type;
      if (req.query.instructorId) filters.instructorId = req.query.instructorId;
      if (req.query.locationId) filters.locationId = parseInt(req.query.locationId);
      if (req.query.from) filters.from = new Date(req.query.from);
      if (req.query.to) filters.to = new Date(req.query.to);
      if (req.query.status) filters.status = req.query.status;
      const list = await storage.getScheduleSessions(tenantId, filters);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.post("/api/tenants/:tenantId/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { recurrenceWeeks, ...sessionData } = req.body;
      if (sessionData.startAt) sessionData.startAt = new Date(sessionData.startAt);
      if (sessionData.endAt) sessionData.endAt = new Date(sessionData.endAt);
      const baseData = insertScheduleSessionSchema.parse({ ...sessionData, tenantId });

      if (baseData.instructorId) {
        const conflict = await storage.checkSessionConflict(
          baseData.instructorId,
          baseData.vehicleId || null,
          new Date(baseData.startAt),
          new Date(baseData.endAt)
        );
        if (conflict) {
          return res.status(409).json({ message: "Schedule conflict: instructor or vehicle already booked at this time" });
        }
      }

      if (baseData.type === "DRIVE" && !baseData.vehicleId) {
        return res.status(400).json({ message: "Drive sessions require a vehicle" });
      }

      if (recurrenceWeeks && recurrenceWeeks > 1) {
        const groupId = crypto.randomUUID();
        const sessionList: any[] = [];
        for (let w = 0; w < recurrenceWeeks; w++) {
          const start = new Date(baseData.startAt);
          start.setDate(start.getDate() + w * 7);
          const end = new Date(baseData.endAt);
          end.setDate(end.getDate() + w * 7);
          sessionList.push({ ...baseData, startAt: start, endAt: end, recurrenceGroupId: groupId });
        }
        const created = await storage.createScheduleSessions(sessionList);
        return res.status(201).json(created);
      }

      const session = await storage.createScheduleSession(baseData);
      res.status(201).json(session);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Failed to create session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.patch("/api/tenants/:tenantId/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const sessionId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const existing = await storage.getScheduleSession(sessionId, tenantId);
      if (!existing) return res.status(404).json({ message: "Session not found" });
      if (existing.status === "CANCELLED") return res.status(400).json({ message: "Cannot edit a cancelled session" });
      if (existing.status === "COMPLETED") return res.status(400).json({ message: "Cannot edit a completed session" });

      const hasBookings = existing.bookedCount > 0;
      const updateData: any = {};

      if (hasBookings) {
        if (req.body.notes !== undefined) updateData.notes = req.body.notes;
        if (req.body.capacity !== undefined) {
          const newCap = parseInt(req.body.capacity);
          if (newCap < existing.bookedCount) {
            return res.status(400).json({ message: `Cannot reduce capacity below current bookings (${existing.bookedCount})` });
          }
          updateData.capacity = newCap;
        }
        const restrictedFields = ["type", "instructorId", "locationId", "vehicleId", "startAt", "endAt"];
        const attempted = restrictedFields.filter(f => req.body[f] !== undefined && req.body[f] !== (existing as any)[f]);
        if (attempted.length > 0) {
          return res.status(400).json({
            message: `Cannot change ${attempted.join(", ")} while session has bookings. Cancel bookings first or only modify notes and capacity.`,
            hasBookings: true,
            bookedCount: existing.bookedCount,
          });
        }
      } else {
        if (req.body.type !== undefined) updateData.type = req.body.type;
        if (req.body.instructorId !== undefined) updateData.instructorId = req.body.instructorId;
        if (req.body.locationId !== undefined) updateData.locationId = parseInt(req.body.locationId);
        if (req.body.vehicleId !== undefined) updateData.vehicleId = req.body.vehicleId ? parseInt(req.body.vehicleId) : null;
        if (req.body.startAt !== undefined) updateData.startAt = new Date(req.body.startAt);
        if (req.body.endAt !== undefined) updateData.endAt = new Date(req.body.endAt);
        if (req.body.capacity !== undefined) updateData.capacity = parseInt(req.body.capacity);
        if (req.body.notes !== undefined) updateData.notes = req.body.notes;

        const instructorId = updateData.instructorId || existing.instructorId;
        const vehicleId = updateData.vehicleId !== undefined ? updateData.vehicleId : existing.vehicleId;
        const startAt = updateData.startAt || existing.startAt;
        const endAt = updateData.endAt || existing.endAt;
        if (instructorId) {
          const conflict = await storage.checkSessionConflict(instructorId, vehicleId, new Date(startAt), new Date(endAt), sessionId);
          if (conflict) {
            return res.status(409).json({ message: "Schedule conflict: instructor or vehicle already booked at this time" });
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.json(existing);
      }

      const session = await storage.updateScheduleSession(sessionId, tenantId, updateData);
      res.json(session);
    } catch (error: any) {
      console.error("Failed to update session:", error);
      res.status(500).json({ message: "Failed to update session" });
    }
  });

  app.post("/api/tenants/:tenantId/sessions/bulk-assign-instructor", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const bodySchema = z.object({
        sessionIds: z.array(z.number().int().positive()).min(1, "Select at least one session").max(500),
        instructorId: z.string().nullable(),
      });
      const data = bodySchema.parse(req.body);

      const result = await storage.bulkAssignInstructorToSessions(tenantId, data.sessionIds, data.instructorId);

      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "sessions.bulk_assign_instructor",
        targetType: "schedule_session",
        targetId: null,
        details: {
          instructorId: data.instructorId,
          requestedCount: data.sessionIds.length,
          updatedCount: result.updated.length,
          skippedCount: result.skipped.length,
          updatedSessionIds: result.updated.map((s) => s.id),
          skipped: result.skipped,
        },
      });

      res.json({
        updated: result.updated.length,
        skipped: result.skipped,
        updatedSessions: result.updated,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Failed to bulk-assign instructor:", error);
      res.status(500).json({ message: "Failed to bulk-assign instructor" });
    }
  });

  app.post("/api/tenants/:tenantId/sessions/:id/cancel", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const sessionId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const existing = await storage.getScheduleSession(sessionId, tenantId);
      if (!existing) return res.status(404).json({ message: "Session not found" });
      if (existing.status === "CANCELLED") return res.status(400).json({ message: "Session is already cancelled" });

      const sessionBookings = await storage.getSessionBookings(sessionId);
      const activeBookings = sessionBookings.filter(b => b.status === "BOOKED");
      let creditsRestored = 0;

      if (activeBookings.length > 0) {
        for (const booking of activeBookings) {
          await storage.updateBooking(booking.id, tenantId, {
            status: "CANCELLED" as any,
            cancelledAt: new Date(),
            cancellationReason: "Session cancelled by admin",
          });

          if (booking.creditType && booking.creditAmount && booking.creditAmount > 0) {
            await storage.createCreditLedgerEntry({
              tenantId,
              enrollmentId: booking.enrollmentId,
              type: booking.creditType as any,
              delta: booking.creditAmount,
              reason: "BOOKING_CANCEL",
              refId: `session-cancel-${sessionId}-booking-${booking.id}`,
              note: "Credits restored due to session cancellation",
            });
            creditsRestored += booking.creditAmount;
          }
        }

        const { sql: sqlTag } = await import("drizzle-orm");
        const { db } = await import("./db");
        const { scheduleSessions: ssTable } = await import("@shared/schema");
        await db.update(ssTable)
          .set({ bookedCount: sqlTag`0` })
          .where(sqlTag`${ssTable.id} = ${sessionId}`);
      }

      const session = await storage.cancelScheduleSession(sessionId, tenantId);
      res.json({
        ...session,
        bookingsCancelled: activeBookings.length,
        creditsRestored,
      });
    } catch (error) {
      console.error("Failed to cancel session:", error);
      res.status(500).json({ message: "Failed to cancel session" });
    }
  });

  // ===== Task #9: BTW/Road-Test office scheduling + cancel-and-reschedule =====

  app.get("/api/tenants/:tenantId/enrollments/:id/components", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await storage.getOutstandingComponents(enrollmentId, tenantId);
      res.json(result);
    } catch (err) {
      console.error("Failed to load components:", err);
      res.status(500).json({ message: "Failed to load components" });
    }
  });

  app.post("/api/tenants/:tenantId/enrollments/:id/btw-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { componentType, instructorId, locationId, vehicleId, startAt, endAt, notes, sendConfirmationEmail } = req.body || {};
      if (!componentType || !["BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"].includes(componentType)) {
        return res.status(400).json({ message: "componentType must be BTW_OBSERVATION, BTW_PRACTICE, or ROAD_TEST" });
      }
      if (!instructorId || !startAt || !endAt) {
        return res.status(400).json({ message: "instructorId, startAt, endAt are required" });
      }
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ message: "Invalid startAt/endAt" });
      }
      if (endDate <= startDate) {
        return res.status(400).json({ message: "endAt must be after startAt" });
      }
      const result = await storage.createBtwSessionAtomic({
        tenantId,
        enrollmentId,
        componentType,
        instructorId,
        locationId: locationId ? Number(locationId) : null,
        vehicleId: vehicleId ? Number(vehicleId) : null,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        notes: notes || null,
        actorUserId: req.user.claims.sub,
      });
      if (!result.ok) return res.status(result.gate ? 409 : 400).json(result);
      const enr = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (enr?.userId) {
        await notifyUser(
          enr.userId,
          `${componentType.replace("_", " ")} scheduled`,
          `Your ${componentType.replace("_", " ").toLowerCase()} session is scheduled for ${new Date(startAt).toLocaleString()}.`,
          `/student/sessions`,
        );
      }
      if (sendConfirmationEmail && enr?.email) {
        try {
          const { sendEmail } = await import("./email-service");
          const componentLabel = componentType.replace("_", " ").toLowerCase();
          const subject = `${componentType.replace("_", " ")} confirmation`;
          const body = `Hi ${enr.firstName},\n\nYour ${componentLabel} session is scheduled for ${new Date(startAt).toLocaleString()}.\n\nWe'll see you then.`;
          await sendEmail({
            tenantId,
            to: enr.email,
            recipientUserId: enr.userId || null,
            subject,
            body,
            actorUserId: req.user.claims.sub,
          });
        } catch (err) {
          console.warn("Private lesson confirmation email failed (non-fatal):", err);
        }
      }
      res.json(result);
    } catch (err) {
      console.error("Failed to create BTW session:", err);
      res.status(500).json({ message: "Failed to create BTW session" });
    }
  });

  app.get("/api/tenants/:tenantId/instructors/:id/slots", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const instructorId = req.params.id;
      const from = req.query.from ? new Date(String(req.query.from)) : new Date();
      const to = req.query.to ? new Date(String(req.query.to)) : new Date(from.getTime() + 14 * 86400000);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin", "instructor"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
      const availability = await storage.getInstructorAvailability(tenantId, instructorId);
      const sessions = await storage.getScheduleSessions(tenantId, { instructorId, from, to });
      type BusyBlock = { source: "instructor" | "vehicle"; startAt: Date | string; endAt: Date | string };
      const busy: BusyBlock[] = sessions
        .filter((s) => s.status !== "CANCELLED")
        .map((s) => ({ source: "instructor", startAt: s.startAt, endAt: s.endAt }));
      if (vehicleId) {
        const vehicleSessions = await storage.getScheduleSessions(tenantId, { from, to });
        for (const s of vehicleSessions) {
          if (s.vehicleId === vehicleId && s.status !== "CANCELLED" && s.instructorId !== instructorId) {
            busy.push({ source: "vehicle", startAt: s.startAt, endAt: s.endAt });
          }
        }
      }
      const windows: Array<{ startAt: string; endAt: string }> = [];
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(to);
      while (cursor <= end) {
        const dow = cursor.getDay();
        const dayBlocks = availability.filter((a: any) => a.dayOfWeek === dow);
        for (const blk of dayBlocks) {
          const [sh, sm] = String(blk.startTime).split(":").map(Number);
          const [eh, em] = String(blk.endTime).split(":").map(Number);
          const winStart = new Date(cursor);
          winStart.setHours(sh, sm || 0, 0, 0);
          const winEnd = new Date(cursor);
          winEnd.setHours(eh, em || 0, 0, 0);
          if (winEnd <= winStart) continue;
          windows.push({ startAt: winStart.toISOString(), endAt: winEnd.toISOString() });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      res.json({ windows, busy });
    } catch (err) {
      console.error("Failed to load slots:", err);
      res.status(500).json({ message: "Failed to load slots" });
    }
  });

  app.post("/api/tenants/:tenantId/sessions/:id/cancel-and-reschedule", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const sessionId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { newStartAt, newEndAt, newInstructorId, newLocationId, newVehicleId, emailSubject, emailBody } = req.body || {};
      if (!newStartAt || !newEndAt) return res.status(400).json({ message: "newStartAt and newEndAt are required" });
      if (new Date(newEndAt) <= new Date(newStartAt)) {
        return res.status(400).json({ message: "newEndAt must be after newStartAt" });
      }

      const result = await storage.cancelAndRescheduleSession({
        tenantId,
        sessionId,
        newStartAt: new Date(newStartAt),
        newEndAt: new Date(newEndAt),
        newInstructorId: newInstructorId || null,
        newLocationId: newLocationId !== undefined ? (newLocationId ? Number(newLocationId) : null) : undefined,
        newVehicleId: newVehicleId !== undefined ? (newVehicleId ? Number(newVehicleId) : null) : undefined,
        actorUserId: req.user.claims.sub,
      });
      if (!result.ok) return res.status(400).json(result);

      const { sendEmail } = await import("./email-service");
      const subjectDefault = `Your session has been rescheduled`;
      const bodyDefault = `Your driving school session has been rescheduled to ${new Date(newStartAt).toLocaleString()}. Please update your calendar.`;
      const subject = emailSubject || subjectDefault;
      const body = emailBody || bodyDefault;
      const emailResults: any[] = [];
      const recipients = new Set<string>();
      const notifiedUsers = new Set<string>();
      for (const b of result.movedBookings || []) {
        const enr = b.enrollmentId ? await storage.getEnrollmentById(b.enrollmentId, tenantId) : null;
        if (!enr) continue;
        const targets = [enr.email, enr.parentEmail].filter((e): e is string => !!e);
        for (const to of targets) {
          if (recipients.has(to)) continue;
          recipients.add(to);
          const r = await sendEmail({
            tenantId, to,
            recipientUserId: enr.userId || null,
            subject, body,
            sessionId: sessionId,
            bookingId: b.id,
            actorUserId: req.user.claims.sub,
          });
          if (result.newSession?.id) {
            const action: "email_sent" | "email_failed" | "email_skipped" =
              r.status === "sent" ? "email_sent" : r.status === "skipped_no_provider" ? "email_skipped" : "email_failed";
            await db.insert(sessionActivityLog).values({
              tenantId,
              sessionId: result.newSession.id,
              action,
              actorUserId: req.user.claims.sub,
              message: `Reschedule notification ${r.status} → ${to}`,
              payload: { recipient: to, providerStatus: r.status, originalSessionId: sessionId },
            });
          }
          emailResults.push({ to, status: r.status });
        }
        if (enr.userId && !notifiedUsers.has(enr.userId)) {
          notifiedUsers.add(enr.userId);
          await notifyUser(
            enr.userId,
            "Your session was rescheduled",
            `New time: ${new Date(newStartAt).toLocaleString()}`,
            `/student/sessions`,
          );
        }
      }
      res.json({ ...result, emails: emailResults });
    } catch (err) {
      console.error("Failed to cancel-and-reschedule session:", err);
      res.status(500).json({ message: "Failed to cancel and reschedule session" });
    }
  });

  app.get("/api/tenants/:tenantId/sessions/:id/activity", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const sessionId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { getSessionActivity, getSessionEmails } = await import("./email-service");
      const [activity, emails] = await Promise.all([
        getSessionActivity(tenantId, sessionId),
        getSessionEmails(tenantId, sessionId),
      ]);
      res.json({ activity, emails });
    } catch (err) {
      console.error("Failed to load session activity:", err);
      res.status(500).json({ message: "Failed to load session activity" });
    }
  });

  app.get("/api/tenants/:tenantId/sessions/:id/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const bookingsList = await storage.getSessionBookings(parseInt(req.params.id));
      res.json(bookingsList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session bookings" });
    }
  });

  // ===== Phase 2: Bookings =====

  app.get("/api/tenants/:tenantId/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const filters: any = {};
      if (req.query.sessionId) filters.sessionId = parseInt(req.query.sessionId);
      if (req.query.enrollmentId) filters.enrollmentId = parseInt(req.query.enrollmentId);
      if (req.query.userId) filters.userId = req.query.userId;
      if (req.query.status) filters.status = req.query.status;
      const list = await storage.getBookings(tenantId, filters);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/tenants/:tenantId/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const { sessionId, enrollmentId } = req.body;

      const session = await storage.getScheduleSession(sessionId, tenantId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.status !== "SCHEDULED") return res.status(400).json({ message: "Session is not available for booking" });
      if (session.bookedCount >= session.capacity) return res.status(400).json({ message: "Session is full" });

      const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
      const bookableStatuses = ["confirmed", "active", "in_progress"];
      if (!bookableStatuses.includes(enrollment.status)) {
        return res.status(400).json({ message: "Enrollment must be confirmed before booking sessions" });
      }

      const creditType = session.type === "CLASSROOM" ? "CLASSROOM" : "DRIVE";
      const balance = await storage.getCreditBalance(enrollmentId, creditType);
      if (balance <= 0) return res.status(400).json({ message: `Insufficient ${creditType.toLowerCase()} credits` });

      const btwTypes = ["BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"];
      const isBtwSession = btwTypes.includes(session.type) || (!!session.componentType && btwTypes.includes(session.componentType));
      if (isBtwSession) {
        const outstanding = await storage.getOutstandingComponents(enrollmentId, tenantId);
        if (outstanding.inClassGate) {
          return res.status(409).json({
            message: "In-class component must be completed at this school before BTW or Road Test sessions can be booked.",
            gate: true,
            componentType: "IN_CLASS",
            outstanding,
          });
        }
      }

      const existingBookings = await storage.getBookings(tenantId, { sessionId, enrollmentId });
      const activeBooking = existingBookings.find(b => b.status === "BOOKED");
      if (activeBooking) return res.status(409).json({ message: "Already booked for this session" });

      const booking = await storage.createBooking({
        tenantId,
        enrollmentId,
        sessionId,
        userId,
        status: "BOOKED",
        creditType: creditType as any,
        creditAmount: 1,
      });

      await storage.createCreditLedgerEntry({
        tenantId,
        enrollmentId,
        type: creditType as any,
        delta: -1,
        reason: "SESSION_CONSUME",
        refId: `booking-${booking.id}`,
      });

      if (enrollment.status === "confirmed" || enrollment.status === "active") {
        await storage.updateEnrollment(enrollmentId, tenantId, {
          status: "in_progress",
        } as any);
      }

      const newBalance = await storage.getCreditBalance(enrollmentId, creditType);
      const otherType = creditType === "CLASSROOM" ? "DRIVE" : "CLASSROOM";
      const otherBalance = await storage.getCreditBalance(enrollmentId, otherType);
      if (newBalance <= 0 && otherBalance <= 0) {
        await storage.updateEnrollment(enrollmentId, tenantId, {
          status: "completed",
        } as any);
      }

      res.status(201).json(booking);
    } catch (error) {
      console.error("Failed to create booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.post("/api/tenants/:tenantId/bookings/:id/cancel", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const bookingId = parseInt(req.params.id);

      const booking = await storage.getBooking(bookingId, tenantId);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.status !== "BOOKED") return res.status(400).json({ message: "Booking cannot be cancelled" });

      const session = await storage.getScheduleSession(booking.sessionId, tenantId);
      const tenant = await storage.getTenant(tenantId);
      const windowHours = tenant?.cancellationWindowHours ?? 24;
      let creditRestored = false;

      if (session && session.startAt) {
        const cutoff = new Date(session.startAt.getTime() - windowHours * 60 * 60 * 1000);
        if (new Date() <= cutoff) {
          creditRestored = true;
        }
      } else {
        creditRestored = true;
      }

      await storage.updateBooking(bookingId, tenantId, {
        status: "CANCELLED" as any,
        cancelledAt: new Date(),
        cancellationReason: req.body.reason || null,
      });

      const { sql: sqlTag } = await import("drizzle-orm");
      const { db } = await import("./db");
      const { scheduleSessions: ssTable } = await import("@shared/schema");
      await db.update(ssTable)
        .set({ bookedCount: sqlTag`GREATEST(${ssTable.bookedCount} - 1, 0)` })
        .where(sqlTag`${ssTable.id} = ${booking.sessionId}`);

      if (creditRestored && booking.creditType && booking.creditAmount) {
        await storage.createCreditLedgerEntry({
          tenantId,
          enrollmentId: booking.enrollmentId,
          type: booking.creditType as any,
          delta: booking.creditAmount,
          reason: "BOOKING_CANCEL",
          refId: `booking-cancel-${bookingId}`,
        });
      }

      res.json({ cancelled: true, creditRestored });
    } catch (error) {
      console.error("Failed to cancel booking:", error);
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  app.patch("/api/tenants/:tenantId/bookings/:id/attendance", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { status } = req.body;
      if (!["ATTENDED", "NO_SHOW"].includes(status)) {
        return res.status(400).json({ message: "Status must be ATTENDED or NO_SHOW" });
      }
      const booking = await storage.updateBooking(parseInt(req.params.id), tenantId, { status: status as any });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ message: "Failed to update attendance" });
    }
  });

  // ===== Student Detail (admin view) =====

  app.get("/api/tenants/:tenantId/students/:userId/detail", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const adminMember = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!adminMember || !["tenant_admin", "office_manager", "instructor"].includes(adminMember.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const targetUserId = req.params.userId;

      const allEnrollments = await storage.getEnrollments(tenantId, {});
      const studentEnrollments = allEnrollments.filter(e => e.userId === targetUserId);

      const studentBookings = await storage.getBookings(tenantId, { userId: targetUserId });

      const sessions = await storage.getScheduleSessions(tenantId, {});
      const sessionMap = new Map(sessions.map(s => [s.id, s]));

      const enrichedBookings = studentBookings.map(b => ({
        ...b,
        session: sessionMap.get(b.sessionId) || null,
      }));

      const creditEntries: Record<number, any[]> = {};
      for (const enrollment of studentEnrollments) {
        creditEntries[enrollment.id] = await storage.getCreditsByEnrollment(enrollment.id);
      }

      const payments: any[] = [];
      for (const enrollment of studentEnrollments) {
        const ep = await storage.getPaymentsByEnrollment(enrollment.id);
        payments.push(...ep.map(p => ({ ...p, enrollmentId: enrollment.id })));
      }

      const packages = await storage.getPackages(tenantId);
      const locations = await storage.getLocations(tenantId);
      const offerings = await storage.getScheduleOfferings(tenantId);
      const offeringMap = new Map(offerings.map(o => [o.id, o]));

      const bookingsWithCohort = enrichedBookings.map(b => {
        const offeringId = b.session?.offeringId ?? null;
        const offering = offeringId ? offeringMap.get(offeringId) ?? null : null;
        return {
          ...b,
          offeringId,
          packageId: offering?.packageId ?? null,
        };
      });

      res.json({
        enrollments: studentEnrollments,
        bookings: bookingsWithCohort,
        creditLedger: creditEntries,
        payments,
        packages,
        locations,
      });
    } catch (error) {
      console.error("Failed to fetch student detail:", error);
      res.status(500).json({ message: "Failed to fetch student detail" });
    }
  });

  // ===== Session Detail (admin view) =====

  app.get("/api/tenants/:tenantId/sessions/:sessionId/detail", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });

      const sessionId = parseInt(req.params.sessionId);
      const session = await storage.getScheduleSession(sessionId, tenantId);
      if (!session) return res.status(404).json({ message: "Session not found" });

      const bookingsList = await storage.getSessionBookings(sessionId);

      const members = await storage.getTenantMembers(tenantId);
      const instructor = members.find(m => m.userId === session.instructorId && m.role === "instructor")
        || members.find(m => m.userId === session.instructorId);

      const locations = await storage.getLocations(tenantId);
      const location = locations.find(l => l.id === session.locationId);

      const vehicles = await storage.getVehicles(tenantId);
      const vehicle = session.vehicleId ? vehicles.find(v => v.id === session.vehicleId) : null;

      const packages = await storage.getPackages(tenantId);
      const packageMap = new Map(packages.map(p => [p.id, p]));

      const enrichedBookings = bookingsList.map(b => ({
        ...b,
        enrollment: b.enrollment ? {
          ...b.enrollment,
          package: packageMap.get(b.enrollment.packageId) || null,
        } : undefined,
      }));

      res.json({
        session,
        instructor: instructor ? {
          id: instructor.userId,
          firstName: instructor.firstName,
          lastName: instructor.lastName,
          phone: instructor.phone,
          email: instructor.emailInvited,
          role: instructor.role,
        } : null,
        location: location || null,
        vehicle: vehicle || null,
        bookings: enrichedBookings,
      });
    } catch (error) {
      console.error("Failed to fetch session detail:", error);
      res.status(500).json({ message: "Failed to fetch session detail" });
    }
  });

  // ===== Phase 2: Instructor's Own Sessions =====

  app.get("/api/tenants/:tenantId/instructor/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });

      const filters: any = { instructorId: userId };
      if (req.query.from) filters.from = new Date(req.query.from);
      if (req.query.to) filters.to = new Date(req.query.to);
      if (req.query.status) filters.status = req.query.status;
      const list = await storage.getScheduleSessions(tenantId, filters);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch instructor sessions" });
    }
  });

  // ===== Phase 2: Student Available Sessions =====

  app.get("/api/tenants/:tenantId/student/available-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });

      const filters: any = { status: "SCHEDULED" };
      if (req.query.type) filters.type = req.query.type;
      if (req.query.locationId) filters.locationId = parseInt(req.query.locationId);
      filters.from = new Date();

      const allSessions = await storage.getScheduleSessions(tenantId, filters);
      const available = allSessions.filter(s => s.bookedCount < s.capacity);
      res.json(available);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch available sessions" });
    }
  });

  app.get("/api/tenants/:tenantId/student/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const list = await storage.getBookings(tenantId, { userId });
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch student bookings" });
    }
  });

  app.get("/api/tenants/:tenantId/student/credits", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const enrollmentId = parseInt(req.query.enrollmentId as string);
      if (!enrollmentId) return res.status(400).json({ message: "enrollmentId required" });

      const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });

      const classroom = await storage.getCreditBalance(enrollmentId, "CLASSROOM");
      const drive = await storage.getCreditBalance(enrollmentId, "DRIVE");
      res.json({ classroom, drive });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch credits" });
    }
  });

  // ===== Phase 2: Student Enrollments =====

  app.get("/api/tenants/:tenantId/student/enrollments", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });

      const allEnrollments = await storage.getEnrollments(tenantId, {});
      const studentEnrollments = allEnrollments.filter(e => e.userId === userId && e.status === "active");

      const enriched = await Promise.all(studentEnrollments.map(async (e) => {
        const classroom = await storage.getCreditBalance(e.id, "CLASSROOM");
        const drive = await storage.getCreditBalance(e.id, "DRIVE");
        return { ...e, credits: { classroom, drive } };
      }));

      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch student enrollments" });
    }
  });

  // ===== Phase 2: Get Instructors (for dropdowns) =====

  app.get("/api/tenants/:tenantId/instructors", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const members = await storage.getTenantMembers(tenantId);
      const instructors = members.filter(m => m.role === "instructor" && m.status === "ACTIVE");
      res.json(instructors.map(m => {
        const memberName = `${m.firstName || ""} ${m.lastName || ""}`.trim();
        const userName = m.user ? `${m.user.firstName || ""} ${m.user.lastName || ""}`.trim() : "";
        const name = memberName || userName || m.user?.email || m.emailInvited || "Unknown";
        return {
          id: m.userId,
          name,
          email: m.user?.email || m.emailInvited,
          instructorType: m.instructorType || "BOTH",
          instructorTypeByLocation: m.instructorTypeByLocation || null,
          locationScope: m.locationScope || "ALL",
        };
      }));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch instructors" });
    }
  });

  app.get("/api/tenants/:tenantId/packages", isAuthenticated, async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const pkgs = await storage.getPackages(tenantId);
      const depsMap = await storage.getUpsellDependenciesMap(tenantId);
      res.json(pkgs.map((p) => ({
        ...p,
        requiresCohortSelection: p.kind === "COHORT_BASED",
        upsellParentPackageIds: depsMap[p.id] ?? [],
        channels: derivePackageChannels(p),
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch packages" });
    }
  });

  app.get("/api/tenants/:tenantId/package-locations", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const map = await storage.getPackageLocationsMap(tenantId);
      const overrides = await storage.getPackageLocationOverridesMap(tenantId);
      // Back-compat: this endpoint historically returned `Record<packageId, locationId[]>`
      // — we keep that shape but also expose price overrides under `_priceOverrides`
      // so the admin UI can render per-location pricing without a second round-trip.
      res.json({ ...map, _priceOverrides: overrides });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch package locations" });
    }
  });

  // Single-package read used by the Add/Resume Package wizard to hydrate
  // the form when an admin reopens an existing package. Without this the
  // wizard's fetch falls through to the SPA HTML, .json() throws, and the
  // form silently shows blank defaults.
  app.get("/api/tenants/:tenantId/packages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const pkg = await storage.getPackage(pkgId);
      if (!pkg || pkg.tenantId !== tenantId) {
        return res.status(404).json({ message: "Package not found" });
      }
      const upsellParentPackageIds = await storage.listUpsellDependencies(pkgId);
      res.json({
        ...pkg,
        requiresCohortSelection: pkg.kind === "COHORT_BASED",
        upsellParentPackageIds,
        channels: derivePackageChannels(pkg),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch package" });
    }
  });

  app.get("/api/tenants/:tenantId/packages/:id/locations", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const pkg = await storage.getPackage(pkgId);
      if (!pkg || pkg.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      const ids = await storage.getPackageLocationIds(pkgId);
      const priceOverrides = await storage.getPackageLocationOverrides(pkgId);
      res.json({ locationIds: ids, priceOverrides });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch package locations" });
    }
  });

  app.post("/api/tenants/:tenantId/packages", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { locationIds, locationPriceOverrides, cohorts, upsellParentPackageIds, ...rest } = req.body ?? {};
      const parentIds = Array.isArray(upsellParentPackageIds)
        ? upsellParentPackageIds.map((v: unknown) => Number(v)).filter((n) => Number.isFinite(n))
        : [];
      // Normalize blank `imageUrl` to null so nullable semantics are clean.
      if (typeof rest.imageUrl === "string" && rest.imageUrl.trim() === "") {
        rest.imageUrl = null;
      }
      const data = insertPackageSchema.parse({ ...rest, tenantId });
      // Server-side derivation of legacy `isAddOn` strictly mirrors the
      // new explicit `availableAsUpsell` flag. The two channel flags
      // (`sellableStandalone`, `availableAsUpsell`) stay independent;
      // `isAddOn` is kept only for back-compat and is no longer used as
      // the source of truth for upsell visibility.
      data.isAddOn = data.availableAsUpsell ?? false;
      // Pre-validate location IDs so we can return a clean 400 before opening
      // a transaction; the transactional create below is the source of truth.
      let validatedLocationIds: number[] = [];
      if (data.locationScopeMode === "SPECIFIC_LOCATIONS" && Array.isArray(locationIds)) {
        const ids = locationIds
          .map((v: unknown) => Number(v))
          .filter((n) => Number.isFinite(n));
        validatedLocationIds = await storage.validateTenantLocations(tenantId, ids);
      }
      const overridesByLoc = parseLocationPriceOverrides(locationPriceOverrides);
      const links =
        data.locationScopeMode === "SPECIFIC_LOCATIONS"
          ? validatedLocationIds.map((lid) => ({
              locationId: lid,
              priceOverrideCents: overridesByLoc.get(lid) ?? null,
            }))
          : [];
      if (Array.isArray(cohorts) && cohorts.length > 0) {
        const sessionInputSchema = z.object({
          startAt: z.string(),
          endAt: z.string(),
          capacity: z.number().int().min(1).optional(),
        });
        const cohortSchema = z.object({
          offering: z.object({
            name: z.string().min(1),
            description: z.string().nullable().optional(),
            locationId: z.number().int().nullable().optional(),
            instructorId: z.string().nullable().optional(),
            capacity: z.number().int().min(1).default(20),
            startsAt: z.string(),
            endsAt: z.string(),
            status: z.enum(["DRAFT", "PUBLISHED", "FULL", "CANCELLED", "COMPLETED"]).default("DRAFT"),
            notes: z.string().nullable().optional(),
          }),
          recurrence: z.object({
            daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
            startTime: z.string().regex(/^\d{2}:\d{2}$/),
            endTime: z.string().regex(/^\d{2}:\d{2}$/),
            startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
          }).optional(),
          sessions: z.array(sessionInputSchema).optional(),
        });
        const parsed = cohorts.map((c: unknown) => cohortSchema.parse(c));
        const result = await storage.createPackageWithCohorts(
          data,
          links,
          parsed.map((c) => {
            let sessionRows: { startAt: Date; endAt: Date }[] = [];
            if (Array.isArray(c.sessions) && c.sessions.length > 0) {
              sessionRows = c.sessions.map((s) => ({ startAt: new Date(s.startAt), endAt: new Date(s.endAt) }));
            } else if (c.recurrence) {
              const skip = new Set(c.recurrence.skipDates ?? []);
              const occs = buildOccurrences({
                daysOfWeek: c.recurrence.daysOfWeek,
                startTime: c.recurrence.startTime,
                endTime: c.recurrence.endTime,
                startDate: c.recurrence.startDate,
                endDate: c.recurrence.endDate,
              });
              sessionRows = occs.filter((o) => {
                const y = o.startAt.getFullYear();
                const m = String(o.startAt.getMonth() + 1).padStart(2, "0");
                const d = String(o.startAt.getDate()).padStart(2, "0");
                return !skip.has(`${y}-${m}-${d}`);
              });
            }
            const groupId = sessionRows.length > 0 ? crypto.randomUUID() : null;
            const sessions = sessionRows.map((s) => ({
              type: "CLASSROOM" as const,
              instructorId: c.offering.instructorId ?? null,
              locationId: c.offering.locationId ?? null,
              vehicleId: null,
              startAt: s.startAt,
              endAt: s.endAt,
              capacity: c.offering.capacity ?? 20,
              status: "SCHEDULED" as const,
              notes: null,
              recurrenceGroupId: groupId,
            }));
            return {
              offering: {
                ...c.offering,
                description: c.offering.description ?? null,
                locationId: c.offering.locationId ?? null,
                instructorId: c.offering.instructorId ?? null,
                notes: c.offering.notes ?? null,
                startsAt: new Date(c.offering.startsAt),
                endsAt: new Date(c.offering.endsAt),
              },
              sessions,
            };
          }),
        );
        if (parentIds.length > 0) {
          await storage.setUpsellDependencies(result.package.id, tenantId, parentIds);
        }
        return res.status(201).json({
          ...result.package,
          upsellParentPackageIds: parentIds,
        });
      }
      const pkg = await storage.createPackageWithLocations(data, links);
      if (parentIds.length > 0) {
        await storage.setUpsellDependencies(pkg.id, tenantId, parentIds);
      }
      res.status(201).json({ ...pkg, upsellParentPackageIds: parentIds });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      if (typeof error?.message === "string" && (
        error.message.startsWith("Invalid location IDs") ||
        error.message.startsWith("Invalid parent package IDs")
      )) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create package" });
    }
  });

  app.patch("/api/tenants/:tenantId/packages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getPackage(pkgId);
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Not found" });
      }
      const { locationIds, locationPriceOverrides, upsellParentPackageIds, ...rest } = req.body ?? {};
      if (typeof rest.imageUrl === "string" && rest.imageUrl.trim() === "") {
        rest.imageUrl = null;
      }
      const parentIds = upsellParentPackageIds === undefined
        ? null
        : (Array.isArray(upsellParentPackageIds)
            ? upsellParentPackageIds.map((v: unknown) => Number(v)).filter((n) => Number.isFinite(n))
            : []);
      const data = insertPackageSchema.partial().parse(rest);
      // Re-derive legacy `isAddOn` whenever either of the new channel flags
      // is part of this update. Mirrors the POST handler's precedence rule.
      if (data.availableAsUpsell !== undefined) {
        data.isAddOn = data.availableAsUpsell;
      }
      const effectiveMode = data.locationScopeMode ?? existing.locationScopeMode;
      // Pre-validate location IDs so we can return a clean 400 before opening
      // a transaction; the transactional update below is the source of truth.
      let validatedLocationIds: number[] = [];
      if (effectiveMode === "SPECIFIC_LOCATIONS" && Array.isArray(locationIds)) {
        const ids = locationIds
          .map((v: unknown) => Number(v))
          .filter((n) => Number.isFinite(n));
        validatedLocationIds = await storage.validateTenantLocations(tenantId, ids);
      }
      const overridesByLoc = parseLocationPriceOverrides(locationPriceOverrides);
      let links: Array<{ locationId: number; priceOverrideCents: number | null }> | null = null;
      if (effectiveMode === "ALL_LOCATIONS") {
        links = [];
      } else if (Array.isArray(locationIds)) {
        links = validatedLocationIds.map((lid) => ({
          locationId: lid,
          priceOverrideCents: overridesByLoc.get(lid) ?? null,
        }));
      }
      const pkg = await storage.updatePackageWithLocations(pkgId, tenantId, data, links);
      if (parentIds !== null) {
        await storage.setUpsellDependencies(pkgId, tenantId, parentIds);
      }
      const finalParents = parentIds ?? await storage.listUpsellDependencies(pkgId);
      res.json({ ...pkg, upsellParentPackageIds: finalParents });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      if (typeof error?.message === "string" && (
        error.message.startsWith("Invalid location IDs") ||
        error.message.startsWith("Invalid parent package IDs")
      )) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update package" });
    }
  });

  app.delete("/api/tenants/:tenantId/packages/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deletePackage(parseInt(req.params.id), tenantId);
      res.json({ message: "Package deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete package" });
    }
  });

  // ===== PACKAGE COMPONENTS =====

  app.get("/api/tenants/:tenantId/package-components", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const all = await storage.getPackageComponentsByTenant(tenantId);
      const byPackage: Record<string, typeof all> = {};
      for (const c of all) {
        const k = String(c.packageId);
        (byPackage[k] ||= []).push(c);
      }
      res.json(byPackage);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch components" });
    }
  });

  app.get("/api/tenants/:tenantId/packages/:pkgId/components", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.pkgId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const pkg = await storage.getPackage(pkgId);
      if (!pkg || pkg.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      const comps = await storage.getPackageComponents(pkgId);
      res.json(comps);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch components" });
    }
  });

  app.post("/api/tenants/:tenantId/packages/:pkgId/components", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.pkgId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const pkg = await storage.getPackage(pkgId);
      if (!pkg || pkg.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      const data = insertPackageComponentSchema.parse({ ...req.body, tenantId, packageId: pkgId });
      const comp = await storage.createPackageComponent(data);
      res.status(201).json(comp);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create component" });
    }
  });

  app.patch("/api/tenants/:tenantId/packages/:pkgId/components/:cid", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertPackageComponentSchema.partial().parse(req.body);
      const comp = await storage.updatePackageComponent(parseInt(req.params.cid), tenantId, data);
      res.json(comp);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update component" });
    }
  });

  app.delete("/api/tenants/:tenantId/packages/:pkgId/components/:cid", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deletePackageComponent(parseInt(req.params.cid), tenantId);
      res.json({ message: "Component deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete component" });
    }
  });

  // ===== PACKAGE COMMAND CENTER =====

  const ADMIN_ROLES = ["tenant_admin", "office_manager", "platform_admin"];
  async function requireAdminMember(req: any, tenantId: number, res: any) {
    const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
    if (!member || !ADMIN_ROLES.includes(member.role)) {
      res.status(403).json({ message: "Forbidden" });
      return null;
    }
    return member;
  }

  app.get("/api/tenants/:tenantId/packages/:pkgId/offerings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.pkgId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const list = await storage.listOfferingsForPackage(tenantId, pkgId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offerings for package" });
    }
  });

  app.get("/api/tenants/:tenantId/packages/:pkgId/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.pkgId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const sessions = await storage.getSessionsForPackage(tenantId, pkgId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions for package" });
    }
  });

  app.get("/api/tenants/:tenantId/packages/:pkgId/enrollments", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.pkgId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const list = await storage.getEnrollmentsForPackage(tenantId, pkgId);
      const enriched = await Promise.all(list.map(async (e) => {
        const classroom = await storage.getCreditBalance(e.id, "CLASSROOM");
        const drive = await storage.getCreditBalance(e.id, "DRIVE");
        return { ...e, creditBalance: { classroom, drive } };
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch enrollments for package" });
    }
  });

  app.get("/api/tenants/:tenantId/packages/:pkgId/financials", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.pkgId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      if (from && isNaN(from.getTime())) return res.status(400).json({ message: "Invalid from date" });
      if (to && isNaN(to.getTime())) return res.status(400).json({ message: "Invalid to date" });
      const data = await storage.getPackageFinancials(tenantId, pkgId, { from, to });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch package financials" });
    }
  });

  app.get("/api/tenants/:tenantId/packages/:pkgId/revenue-series", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const pkgId = parseInt(req.params.pkgId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      if (from && isNaN(from.getTime())) return res.status(400).json({ message: "Invalid from date" });
      if (to && isNaN(to.getTime())) return res.status(400).json({ message: "Invalid to date" });
      const data = await storage.getPackageRevenueSeries(tenantId, pkgId, { from, to });
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch revenue series" });
    }
  });

  app.get("/api/tenants/:tenantId/sessions/:sessionId/fulfillable-packages", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const sessionId = parseInt(req.params.sessionId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const pkgs = await storage.getFulfillablePackagesForSession(tenantId, sessionId);
      res.json(pkgs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch fulfillable packages" });
    }
  });

  app.get("/api/tenants/:tenantId/enrollments/:id/credit-balance", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const enr = await storage.getEnrollmentById(id, tenantId);
      if (!enr) return res.status(404).json({ message: "Not found" });
      const classroom = await storage.getCreditBalance(id, "CLASSROOM");
      const drive = await storage.getCreditBalance(id, "DRIVE");
      res.json({ classroom, drive });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch credit balance" });
    }
  });

  app.get("/api/tenants/:tenantId/setup-health", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const health = await storage.getSetupHealth(tenantId);
      res.json(health);
    } catch (error) {
      console.error("Failed to fetch setup health:", error);
      res.status(500).json({ message: "Failed to fetch setup health" });
    }
  });

  // ===== STALE CREDIT REMINDERS =====

  app.get("/api/tenants/:tenantId/stale-credit-reminders/settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json({
        enabled: !!tenant.staleCreditReminderEnabled,
        intervalDays: tenant.staleCreditReminderDays ?? DEFAULT_INTERVAL_DAYS,
      });
    } catch (error) {
      console.error("Failed to fetch stale credit reminder settings:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch("/api/tenants/:tenantId/stale-credit-reminders/settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const schema = z.object({
        enabled: z.boolean().optional(),
        intervalDays: z.number().int().min(1).max(365).optional(),
      });
      const data = schema.parse(req.body);
      const update: Partial<{ staleCreditReminderEnabled: boolean; staleCreditReminderDays: number }> = {};
      if (data.enabled !== undefined) update.staleCreditReminderEnabled = data.enabled;
      if (data.intervalDays !== undefined) update.staleCreditReminderDays = data.intervalDays;
      const tenant = await storage.updateTenant(tenantId, update);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "stale_credit_reminder_settings_updated",
        targetType: "tenant",
        targetId: tenantId,
        details: data,
      });
      res.json({
        enabled: !!tenant.staleCreditReminderEnabled,
        intervalDays: tenant.staleCreditReminderDays ?? DEFAULT_INTERVAL_DAYS,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Failed to update stale credit reminder settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.get("/api/tenants/:tenantId/stale-credit-reminders/history", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const enrollmentId = req.query.enrollmentId ? parseInt(req.query.enrollmentId as string) : undefined;
      const history = await storage.getStaleCreditReminderHistory(tenantId, enrollmentId, 200);
      res.json(history);
    } catch (error) {
      console.error("Failed to fetch stale credit reminder history:", error);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  app.post("/api/tenants/:tenantId/stale-credit-reminders/run", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      if (!tenant.staleCreditReminderEnabled) {
        return res.status(409).json({
          message: "Stale-credit reminders are disabled for this school. Enable them in the reminder settings before running a batch.",
          reason: "reminders_disabled",
        });
      }
      const result = await runStaleCreditRemindersForTenant(tenant, {
        triggeredBy: "manual",
        actorUserId: req.user.claims.sub,
      });
      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "stale_credit_reminder_batch_run",
        targetType: "tenant",
        targetId: tenantId,
        details: { processed: result.processed, emailSent: result.emailSent, inAppSent: result.inAppSent, failed: result.failed },
      });
      res.json({
        processed: result.processed,
        emailSent: result.emailSent,
        inAppSent: result.inAppSent,
        failed: result.failed,
        results: result.results,
      });
    } catch (error) {
      console.error("Failed to run stale credit reminders:", error);
      res.status(500).json({ message: "Failed to run reminders" });
    }
  });

  app.post("/api/tenants/:tenantId/enrollments/:id/stale-credit-reminder", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const force = req.body?.force === true;
      const result = await sendStaleCreditReminderForEnrollment({
        tenantId,
        enrollmentId,
        actorUserId: req.user.claims.sub,
        force,
      });
      if (!result.ok) {
        if (result.reason === "cooldown_active") {
          return res.status(409).json({ message: "Cooldown active", reason: result.reason, lastReminderAt: result.lastReminderAt });
        }
        return res.status(400).json({ message: result.reason });
      }
      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "stale_credit_reminder_sent",
        targetType: "enrollment",
        targetId: enrollmentId,
        details: { emailStatus: result.result.emailStatus, inApp: result.result.inAppCreated },
      });
      res.json(result.result);
    } catch (error) {
      console.error("Failed to send stale credit reminder:", error);
      res.status(500).json({ message: "Failed to send reminder" });
    }
  });

  // ===== SCHEDULE OFFERINGS (in-class cohorts) =====

  app.get("/api/tenants/:tenantId/schedule-offerings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const offerings = await storage.getScheduleOfferings(tenantId);
      const ids = offerings.map((o) => o.id);
      const counts: Record<number, number> = {};
      if (ids.length > 0) {
        const rows = await db
          .select({ offeringId: scheduleSessions.offeringId, c: count() })
          .from(scheduleSessions)
          .where(and(
            eq(scheduleSessions.tenantId, tenantId),
            inArray(scheduleSessions.offeringId, ids),
            sql`${scheduleSessions.status} != 'CANCELLED'`,
          ))
          .groupBy(scheduleSessions.offeringId);
        for (const r of rows) {
          if (r.offeringId !== null) counts[r.offeringId] = Number(r.c);
        }
      }
      const pendingInterest = await storage.getPendingInterestByOffering(tenantId);
      res.json(offerings.map((o) => ({
        ...o,
        sessionCount: counts[o.id] || 0,
        pendingInterestCount: pendingInterest[o.id] || 0,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offerings" });
    }
  });

  // ===== Task #16: Generate Sessions wizard =====

  // Schedule offerings represent classroom cohorts. Drive sessions stay
  // individually scheduled, so the wizard locks the type to CLASSROOM.
  const recurrenceSpecSchema = z.object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one weekday"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    instructorId: z.string().nullable().optional(),
    locationId: z.number().int().nullable().optional(),
    capacity: z.number().int().min(1).default(20),
    notes: z.string().optional().nullable(),
  });

  app.post("/api/tenants/:tenantId/schedule-offerings/:oid/preview-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const offeringId = parseInt(req.params.oid);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const offering = await storage.getScheduleOffering(offeringId, tenantId);
      if (!offering) return res.status(404).json({ message: "Offering not found" });

      const spec = recurrenceSpecSchema.parse(req.body);
      const occurrences = buildOccurrences(spec);
      if (occurrences.length === 0) {
        return res.json({ occurrences: [], summary: { total: 0, conflicts: 0, availabilityWarnings: 0 } });
      }
      if (occurrences.length > 200) {
        return res.status(400).json({ message: "Pattern would generate more than 200 sessions. Narrow the date range." });
      }

      const blocks = spec.instructorId
        ? await storage.getInstructorAvailability(tenantId, spec.instructorId)
        : [];
      const results = await Promise.all(
        occurrences.map(async (occ) => {
          const conflict = spec.instructorId
            ? await storage.checkSessionConflict(
                spec.instructorId,
                null,
                occ.startAt,
                occ.endAt,
                undefined,
                tenantId,
              )
            : false;
          const cov = spec.instructorId
            ? checkAvailabilityCoverage(blocks, occ, "CLASSROOM", spec.locationId ?? null)
            : { hasAny: false, covered: true };
          return {
            startAt: occ.startAt.toISOString(),
            endAt: occ.endAt.toISOString(),
            conflict,
            availabilityWarning: cov.hasAny && !cov.covered,
          };
        }),
      );
      const summary = {
        total: results.length,
        conflicts: results.filter((r) => r.conflict).length,
        availabilityWarnings: results.filter((r) => r.availabilityWarning).length,
      };
      res.json({ occurrences: results, summary });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Failed to preview offering sessions:", error);
      res.status(500).json({ message: "Failed to preview sessions" });
    }
  });

  app.post("/api/tenants/:tenantId/schedule-offerings/:oid/generate-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const offeringId = parseInt(req.params.oid);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const offering = await storage.getScheduleOffering(offeringId, tenantId);
      if (!offering) return res.status(404).json({ message: "Offering not found" });

      const commitSchema = z.object({
        instructorId: z.string().nullable().optional(),
        locationId: z.number().int().nullable().optional(),
        capacity: z.number().int().min(1),
        notes: z.string().optional().nullable(),
        occurrences: z.array(z.object({
          startAt: z.string(),
          endAt: z.string(),
        })).min(1, "At least one occurrence is required"),
      });
      const data = commitSchema.parse(req.body);
      if (data.occurrences.length > 200) {
        return res.status(400).json({ message: "Cannot create more than 200 sessions in one batch" });
      }

      // Re-check conflicts on commit; reject the batch if any conflict remains
      // (UI is expected to filter conflicting ones out before submit).
      const conflictRows: { startAt: string; endAt: string }[] = [];
      if (data.instructorId) {
        for (const occ of data.occurrences) {
          const startAt = new Date(occ.startAt);
          const endAt = new Date(occ.endAt);
          const conflict = await storage.checkSessionConflict(
            data.instructorId,
            null,
            startAt,
            endAt,
            undefined,
            tenantId,
          );
          if (conflict) conflictRows.push({ startAt: occ.startAt, endAt: occ.endAt });
        }
      }
      if (conflictRows.length > 0) {
        return res.status(409).json({
          message: `${conflictRows.length} of the selected occurrences conflict with existing sessions. Please refresh the preview and try again.`,
          conflicts: conflictRows,
        });
      }

      const groupId = crypto.randomUUID();
      const sessionRows: InsertScheduleSession[] = data.occurrences.map((occ) => ({
        tenantId,
        type: "CLASSROOM",
        instructorId: data.instructorId ?? null,
        locationId: data.locationId ?? null,
        vehicleId: null,
        startAt: new Date(occ.startAt),
        endAt: new Date(occ.endAt),
        capacity: data.capacity,
        status: "SCHEDULED",
        notes: data.notes ?? null,
        recurrenceGroupId: groupId,
        offeringId,
      }));
      const created = await storage.createScheduleSessions(sessionRows);

      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "offering.generate_sessions",
        targetType: "schedule_offering",
        targetId: offeringId,
        details: {
          count: created.length,
          recurrenceGroupId: groupId,
          instructorId: data.instructorId ?? null,
          locationId: data.locationId ?? null,
          type: "CLASSROOM",
        },
      });
      res.status(201).json({ created: created.length, recurrenceGroupId: groupId, sessions: created });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Failed to generate offering sessions:", error);
      res.status(500).json({ message: "Failed to generate sessions" });
    }
  });

  app.get("/api/tenants/:tenantId/schedule-offerings/:oid", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const offering = await storage.getScheduleOffering(parseInt(req.params.oid), tenantId);
      if (!offering) return res.status(404).json({ message: "Not found" });
      res.json(offering);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offering" });
    }
  });

  app.get("/api/tenants/:tenantId/schedule-offerings/:oid/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const oid = parseInt(req.params.oid);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const offering = await storage.getScheduleOffering(oid, tenantId);
      if (!offering) return res.status(404).json({ message: "Not found" });
      const sessions = await storage.getOfferingSessions(oid, tenantId);
      res.json(sessions);
    } catch (error) {
      console.error("Failed to fetch offering sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/tenants/:tenantId/schedule-offerings/:oid/enrollments", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const oid = parseInt(req.params.oid);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin", "instructor"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const offering = await storage.getScheduleOffering(oid, tenantId);
      if (!offering) return res.status(404).json({ message: "Not found" });
      const rows = await storage.getEnrollmentsForOffering(tenantId, oid);
      res.json(rows);
    } catch (error) {
      console.error("Failed to fetch offering enrollments:", error);
      res.status(500).json({ message: "Failed to fetch roster" });
    }
  });

  app.get("/api/tenants/:tenantId/schedule-offerings/:oid/audit", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const oid = parseInt(req.params.oid);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const offering = await storage.getScheduleOffering(oid, tenantId);
      if (!offering) return res.status(404).json({ message: "Not found" });
      const events = await storage.getAuditEventsForTarget(tenantId, "schedule_offering", oid, 100);
      res.json(events);
    } catch (error) {
      console.error("Failed to fetch offering audit:", error);
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

  app.post("/api/tenants/:tenantId/schedule-offerings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { packageIds: _ignored, ...rest } = req.body || {};
      const startsAt = rest.startsAt ? new Date(rest.startsAt) : undefined;
      const endsAt = rest.endsAt ? new Date(rest.endsAt) : undefined;
      const data = insertScheduleOfferingSchema.parse({ ...rest, startsAt, endsAt, tenantId });
      const created = await storage.createScheduleOffering(data);
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create offering" });
    }
  });

  app.patch("/api/tenants/:tenantId/schedule-offerings/:oid", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const oid = parseInt(req.params.oid);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { packageIds: _ignored, ...rest } = req.body || {};
      if (rest.startsAt) rest.startsAt = new Date(rest.startsAt);
      if (rest.endsAt) rest.endsAt = new Date(rest.endsAt);
      const data = insertScheduleOfferingSchema.partial().parse(rest);

      // Detect package re-parent and enforce audience gate + audit log.
      let isPackageChange = false;
      let fromPackageId: number | null = null;
      if (data.packageId != null) {
        const current = await storage.getScheduleOffering(oid, tenantId);
        if (!current) return res.status(404).json({ message: "Offering not found" });
        if (current.packageId !== data.packageId) {
          isPackageChange = true;
          fromPackageId = current.packageId;
          const targetPkg = await storage.getPackage(data.packageId);
          if (!targetPkg || targetPkg.tenantId !== tenantId) {
            return res.status(400).json({ message: "Target package not found in this tenant" });
          }
          const ageMin = targetPkg.ageMin ?? null;
          const ageMax = targetPkg.ageMax ?? null;
          if (ageMin !== null || ageMax !== null) {
            const impact = await storage.getOfferingMoveImpact(oid, tenantId);
            const today = new Date();
            const conflictingEnrollmentIds: number[] = [];
            for (const e of impact.enrollees) {
              if (!e.dateOfBirth) continue;
              const dob = new Date(e.dateOfBirth);
              if (Number.isNaN(dob.getTime())) continue;
              let age = today.getFullYear() - dob.getFullYear();
              const m = today.getMonth() - dob.getMonth();
              if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
              if ((ageMin !== null && age < ageMin) || (ageMax !== null && age > ageMax)) {
                conflictingEnrollmentIds.push(e.id);
              }
            }
            if (conflictingEnrollmentIds.length > 0) {
              return res.status(409).json({
                code: "OFFERING_PACKAGE_AUDIENCE_MISMATCH",
                message: `Target package's age gate (${ageMin ?? "—"}–${ageMax ?? "—"}) excludes ${conflictingEnrollmentIds.length} existing enrollee${conflictingEnrollmentIds.length === 1 ? "" : "s"}. Resolve those bookings first.`,
                conflictingEnrollmentIds,
              });
            }
          }
        }
      }

      const updated = await storage.updateScheduleOffering(oid, tenantId, data);

      if (isPackageChange && fromPackageId !== null && data.packageId != null) {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "OFFERING_PACKAGE_CHANGED",
          targetType: "schedule_offering",
          targetId: oid,
          details: {
            offeringId: oid,
            fromPackageId,
            toPackageId: data.packageId,
          },
        });
      }

      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      if (typeof error?.message === "string" && /not found in tenant/i.test(error.message)) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Failed to update offering:", error);
      res.status(500).json({ message: "Failed to update offering" });
    }
  });

  app.get("/api/tenants/:tenantId/schedule-offerings/:oid/move-impact", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const oid = parseInt(req.params.oid);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const offering = await storage.getScheduleOffering(oid, tenantId);
      if (!offering) return res.status(404).json({ message: "Not found" });
      const impact = await storage.getOfferingMoveImpact(oid, tenantId);
      const today = new Date();
      const ages: number[] = [];
      for (const e of impact.enrollees) {
        if (!e.dateOfBirth) continue;
        const dob = new Date(e.dateOfBirth);
        if (Number.isNaN(dob.getTime())) continue;
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        ages.push(age);
      }
      res.json({
        offeringId: oid,
        currentPackageId: offering.packageId,
        bookedSessionCount: impact.bookedSessionCount,
        confirmedEnrollmentCount: impact.confirmedEnrollmentCount,
        enrolleeAges: ages,
      });
    } catch (error) {
      console.error("Failed to fetch offering move-impact:", error);
      res.status(500).json({ message: "Failed to fetch move impact" });
    }
  });

  app.delete("/api/tenants/:tenantId/schedule-offerings/:oid", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await storage.deleteScheduleOffering(parseInt(req.params.oid), tenantId);
      if (!result.ok) {
        return res.status(409).json({
          message: "This cohort has sessions with bookings. Cancel the bookings before deleting the cohort.",
          sessionIdsWithBookings: result.sessionIdsWithBookings,
        });
      }
      res.json({ message: "Offering deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete offering" });
    }
  });

  app.get("/api/tenants/:tenantId/schedule-offerings/:oid/waitlist", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const list = await storage.getOfferingWaitlist(parseInt(req.params.oid), tenantId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch waitlist" });
    }
  });

  app.post("/api/tenants/:tenantId/schedule-offerings/:oid/waitlist", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertOfferingWaitlistSchema.parse({
        ...req.body,
        tenantId,
        offeringId: parseInt(req.params.oid),
      });
      const entry = await storage.addOfferingWaitlist(data);
      res.status(201).json(entry);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add to waitlist" });
    }
  });

  app.delete("/api/tenants/:tenantId/schedule-offerings/:oid/waitlist/:wid", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.removeOfferingWaitlist(parseInt(req.params.wid), tenantId);
      res.json({ message: "Removed from waitlist" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove from waitlist" });
    }
  });

  app.get("/api/public/tenant/:slug/schedule-offerings", requireApiKey, async (req, res) => {
    try {
      const slug = req.params.slug;
      const tenant = await storage.getTenantBySlug(slug);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const offerings = await storage.getScheduleOfferings(tenant.id);
      const visible = offerings.filter(o => o.status === "PUBLISHED" || o.status === "FULL");
      if (tenant.showPendingInterest) {
        const pending = await storage.getPendingInterestByOffering(tenant.id);
        // Cap the displayed value so the indicator stays a soft hint and never
        // leaks an exact, manipulative count.
        const CAP = 9;
        res.json(visible.map(o => ({
          ...o,
          pendingInterestCount: Math.min(pending[o.id] || 0, CAP),
        })));
        return;
      }
      res.json(visible);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch offerings" });
    }
  });

  // ===== ONLINE COURSES ADMIN ROUTES =====

  app.get("/api/tenants/:tenantId/online-courses", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const courses = await storage.getOnlineCourses(tenantId);
      res.json(courses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch online courses" });
    }
  });

  app.get("/api/tenants/:tenantId/online-courses/:id/locations", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const courseId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "instructor", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const course = await storage.getOnlineCourse(courseId);
      if (!course || course.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      const ids = await storage.getOnlineCourseLocationIds(courseId);
      res.json({ locationIds: ids });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch online course locations" });
    }
  });

  app.post("/api/tenants/:tenantId/online-courses", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { locationIds, ...rest } = req.body ?? {};
      if (typeof rest.imageUrl === "string" && rest.imageUrl.trim() === "") {
        rest.imageUrl = null;
      }
      const data = insertOnlineCourseSchema.parse({ ...rest, tenantId });
      // Pre-validate location IDs so we can return a clean 400 before opening
      // a transaction; the transactional create below is the source of truth.
      let validatedLocationIds: number[] = [];
      if (data.locationScopeMode === "SPECIFIC_LOCATIONS" && Array.isArray(locationIds)) {
        const ids = locationIds
          .map((v: unknown) => Number(v))
          .filter((n) => Number.isFinite(n));
        validatedLocationIds = await storage.validateTenantLocations(tenantId, ids);
      }
      // SPECIFIC_LOCATIONS without at least one allow-listed location would
      // create a course nobody can ever see/buy. Reject up-front instead.
      if (data.locationScopeMode === "SPECIFIC_LOCATIONS" && validatedLocationIds.length === 0) {
        return res.status(400).json({
          message: "Pick at least one location for a SPECIFIC_LOCATIONS online course.",
        });
      }
      const linkIds =
        data.locationScopeMode === "SPECIFIC_LOCATIONS" ? validatedLocationIds : [];
      const course = await storage.createOnlineCourseWithLocations(data, linkIds);
      res.status(201).json(course);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      if (typeof error?.message === "string" && error.message.startsWith("Invalid location IDs")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create online course" });
    }
  });

  app.patch("/api/tenants/:tenantId/online-courses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getOnlineCourse(parseInt(req.params.id));
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Online course not found" });
      }
      const { locationIds, tenantId: _ignoredTenantId, ...rest } = req.body ?? {};
      if (typeof rest.imageUrl === "string" && rest.imageUrl.trim() === "") {
        rest.imageUrl = null;
      }
      const data = insertOnlineCourseSchema.partial().parse(rest);
      const effectiveMode = data.locationScopeMode ?? existing.locationScopeMode;
      let validatedLocationIds: number[] = [];
      if (effectiveMode === "SPECIFIC_LOCATIONS" && Array.isArray(locationIds)) {
        const ids = locationIds
          .map((v: unknown) => Number(v))
          .filter((n) => Number.isFinite(n));
        validatedLocationIds = await storage.validateTenantLocations(tenantId, ids);
      }
      let linkIds: number[] | null = null;
      if (effectiveMode === "ALL_LOCATIONS") {
        linkIds = [];
      } else if (Array.isArray(locationIds)) {
        linkIds = validatedLocationIds;
      }
      // If we are switching to SPECIFIC_LOCATIONS and the request explicitly
      // sets the link list, refuse an empty list — the course would otherwise
      // become unreachable. (When linkIds is null we leave the existing
      // links untouched, which is fine because an existing valid set must
      // already be non-empty by the same rule on create.)
      if (effectiveMode === "SPECIFIC_LOCATIONS" && linkIds !== null && linkIds.length === 0) {
        return res.status(400).json({
          message: "Pick at least one location for a SPECIFIC_LOCATIONS online course.",
        });
      }
      const course = await storage.updateOnlineCourseWithLocations(parseInt(req.params.id), tenantId, data, linkIds);
      res.json(course);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      if (typeof error?.message === "string" && error.message.startsWith("Invalid location IDs")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update online course" });
    }
  });

  app.delete("/api/tenants/:tenantId/online-courses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getOnlineCourse(parseInt(req.params.id));
      if (!existing || existing.tenantId !== tenantId) {
        return res.status(404).json({ message: "Online course not found" });
      }
      await storage.deleteOnlineCourse(parseInt(req.params.id), tenantId);
      res.json({ message: "Online course deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete online course" });
    }
  });

  const publicEnrollmentSchema = z.object({
    packageId: z.number(),
    locationId: z.number().nullable().optional(),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().optional(),
    dateOfBirth: z.string().optional(),
    notes: z.string().optional(),
    parentName: z.string().optional(),
    parentEmail: z.string().optional(),
    parentPhone: z.string().optional(),
  });

  const updateEnrollmentSchema = z.object({
    status: z.enum(["pending", "pending_payment", "confirmed", "active", "in_progress", "completed", "cancelled", "expired", "refunded"]).optional(),
    notes: z.string().optional(),
    locationId: z.number().nullable().optional(),
    classroomHoursCompleted: z.number().optional(),
    drivingHoursCompleted: z.number().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    parentName: z.string().nullable().optional(),
    parentEmail: z.union([z.string().email(), z.literal("")]).nullable().optional(),
    parentPhone: z.string().nullable().optional(),
  });

  app.get("/api/tenants/:tenantId/enrollments", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const filters: { status?: string; search?: string } = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.search) filters.search = req.query.search;
      const enrollmentList = await storage.getEnrollments(tenantId, filters);
      res.json(enrollmentList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch enrollments" });
    }
  });

  app.get("/api/tenants/:tenantId/enrollments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const enrollment = await storage.getEnrollmentById(id, tenantId);
      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }
      res.json(enrollment);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch enrollment" });
    }
  });

  app.patch("/api/tenants/:tenantId/enrollments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = updateEnrollmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const enrollment = await storage.getEnrollmentById(id, tenantId);
      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }
      const updated = await storage.updateEnrollment(id, tenantId, parsed.data);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update enrollment" });
    }
  });

  // Admin-initiated manual enrollment from the dashboard Quick Actions wizard.
  // Creates an enrollment on behalf of a walk-in/phone-in student, optionally
  // recording a CASH payment and confirming the enrollment so credits are granted.
  const adminEnrollSchema = z.object({
    packageId: z.number().int().positive(),
    locationId: z.number().int().positive().nullable().optional(),
    offeringId: z.number().int().positive().nullable().optional(),
    // When `existingUserId` is provided, the enrollment is bound to that
    // existing tenant member (must be active in this tenant). Snapshot fields
    // are still recorded for the enrollment row so historical contact info is
    // preserved if the user later changes their profile.
    existingUserId: z.string().nullable().optional(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    parentName: z.string().nullable().optional(),
    parentEmail: z.union([z.string().email(), z.literal("")]).nullable().optional(),
    parentPhone: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    paymentMethod: z.enum(["PENDING", "CASH_PAID", "EXTERNAL"]).default("PENDING"),
  });

  app.post("/api/tenants/:tenantId/admin-enroll", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = adminEnrollSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const data = parsed.data;
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const pkg = await storage.getPackage(data.packageId);
      if (!pkg || pkg.tenantId !== tenantId) return res.status(404).json({ message: "Package not found" });
      if (!pkg.active) return res.status(400).json({ message: "Package is not active" });

      // Honor location scoping
      if (data.locationId) {
        const allowed = await storage.assertPackageAllowedAtLocation(data.packageId, data.locationId);
        if (!allowed.ok) return res.status(400).json({ message: allowed.message });
      }

      // Apply per-location price override (if any) so the recorded payment and
      // any downstream snapshots reflect the effective price the buyer was quoted.
      const effectivePrice = await storage.getEffectivePackagePrice(
        data.packageId,
        data.locationId ?? null,
      );

      // If the admin picked an existing student, verify they are an active
      // member of THIS tenant before binding. This keeps the wizard from ever
      // attaching an enrollment to a user that doesn't belong to this school.
      let boundUserId: string | null = null;
      if (data.existingUserId) {
        const existingMember = await storage.getTenantMember(tenantId, data.existingUserId);
        if (!existingMember || existingMember.status !== "ACTIVE") {
          return res.status(400).json({
            message: "Selected student is not an active member of this tenant",
          });
        }
        boundUserId = data.existingUserId;
      }

      const isPaid = data.paymentMethod !== "PENDING";
      const enrollmentInput: InsertEnrollment = {
        tenantId,
        packageId: data.packageId,
        locationId: data.locationId ?? null,
        userId: boundUserId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        dateOfBirth: data.dateOfBirth ?? null,
        parentName: data.parentName ?? null,
        parentEmail: data.parentEmail ? data.parentEmail : null,
        parentPhone: data.parentPhone ?? null,
        notes: data.notes ?? null,
        status: isPaid ? "pending_payment" : "pending",
        offeringId: data.offeringId ?? null,
      };
      const enrollment = await storage.createEnrollment(enrollmentInput);

      let createdPayment: Payment | null = null;
      let confirmed = false;

      if (isPaid) {
        const paymentNote = data.paymentMethod === "EXTERNAL"
          ? "External (recorded by admin)"
          : "Cash (recorded by admin)";
        const paymentInput: InsertPayment = {
          tenantId,
          enrollmentId: enrollment.id,
          provider: "CASH",
          status: "COMPLETED",
          amountCents: effectivePrice,
          currency: "USD",
          idempotencyKey: crypto.randomUUID(),
          metadataJson: {
            source: "admin-enroll",
            paymentMethod: data.paymentMethod,
            note: paymentNote,
            recordedByUserId: req.user.claims.sub,
          },
          receiverName: `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() || null,
        };
        createdPayment = await storage.createPayment(paymentInput);

        const result = await confirmEnrollmentManually(enrollment.id, tenantId, req.user.claims.sub);
        if (!result.ok) {
          return res.status(500).json({
            message: "Enrollment created but confirmation failed",
            enrollmentId: enrollment.id,
            paymentId: createdPayment.id,
            error: result.error,
          });
        }
        confirmed = true;
      }
      const paymentId = createdPayment?.id ?? null;

      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "ENROLLMENT_CREATED_MANUAL",
          targetType: "ENROLLMENT",
          targetId: enrollment.id,
          details: {
            packageId: data.packageId,
            locationId: data.locationId ?? null,
            offeringId: data.offeringId ?? null,
            paymentMethod: data.paymentMethod,
            confirmed,
          },
        });
      } catch {}

      // Best-effort notifications
      fireAndForget(
        () => sendEnrollmentReceived(enrollment, tenant, createdPayment),
        `enrollment_received admin-enroll #${enrollment.id}`,
      );
      fireAndForget(
        () => sendAdminEnrollmentNotification(enrollment.id, tenantId),
        `admin_enrollment_notification admin-enroll #${enrollment.id}`,
      );

      res.json({
        enrollmentId: enrollment.id,
        paymentId,
        status: confirmed ? "confirmed" : "pending",
      });
    } catch (error) {
      console.error("Failed to create manual enrollment:", error);
      res.status(500).json({ message: "Failed to create manual enrollment" });
    }
  });

  app.post("/api/tenants/:tenantId/enrollments/:id/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await confirmEnrollmentManually(enrollmentId, tenantId, req.user.claims.sub);
      if (!result.ok) {
        return res.status(400).json({ message: result.error });
      }
      if (result.alreadyActive) {
        return res.json({ message: "Enrollment is already confirmed", enrollmentId });
      }
      res.json({ message: "Enrollment confirmed successfully", enrollmentId });
    } catch (error) {
      console.error("Failed to confirm enrollment:", error);
      res.status(500).json({ message: "Failed to confirm enrollment" });
    }
  });

  app.post("/api/tenants/:tenantId/admin-bookings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { sessionId, enrollmentId } = req.body;
      if (!sessionId || !enrollmentId) {
        return res.status(400).json({ message: "sessionId and enrollmentId are required" });
      }

      const session = await storage.getScheduleSession(sessionId, tenantId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.status !== "SCHEDULED") return res.status(400).json({ message: "Session is not available for booking" });
      if (session.bookedCount >= session.capacity) return res.status(400).json({ message: "Session is full" });

      const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
      const bookableStatuses = ["confirmed", "active", "in_progress"];
      if (!bookableStatuses.includes(enrollment.status)) {
        return res.status(400).json({ message: "Enrollment must be confirmed before booking sessions" });
      }

      const creditType = session.type === "CLASSROOM" ? "CLASSROOM" : "DRIVE";
      const balance = await storage.getCreditBalance(enrollmentId, creditType);
      if (balance <= 0) return res.status(400).json({ message: `Insufficient ${creditType.toLowerCase()} credits` });

      const btwTypes = ["BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"];
      const isBtwSession = btwTypes.includes(session.type) || (!!session.componentType && btwTypes.includes(session.componentType));
      if (isBtwSession) {
        const outstanding = await storage.getOutstandingComponents(enrollmentId, tenantId);
        if (outstanding.inClassGate) {
          return res.status(409).json({
            message: "In-class component must be completed at this school before BTW or Road Test sessions can be booked.",
            gate: true,
            componentType: "IN_CLASS",
            outstanding,
          });
        }
      }

      const existingBookings = await storage.getBookings(tenantId, { sessionId, enrollmentId });
      const activeBooking = existingBookings.find(b => b.status === "BOOKED");
      if (activeBooking) return res.status(409).json({ message: "Student is already booked for this session" });

      const booking = await storage.createBooking({
        tenantId,
        enrollmentId,
        sessionId,
        userId: enrollment.userId,
        status: "BOOKED",
        creditType: creditType as any,
        creditAmount: 1,
      });

      await storage.createCreditLedgerEntry({
        tenantId,
        enrollmentId,
        type: creditType as any,
        delta: -1,
        reason: "SESSION_CONSUME",
        refId: `admin-booking-${booking.id}`,
      });

      if (enrollment.status === "confirmed" || enrollment.status === "active") {
        await storage.updateEnrollment(enrollmentId, tenantId, { status: "in_progress" } as any);
      }

      const newBalance = await storage.getCreditBalance(enrollmentId, creditType);
      const otherType = creditType === "CLASSROOM" ? "DRIVE" : "CLASSROOM";
      const otherBalance = await storage.getCreditBalance(enrollmentId, otherType);
      if (newBalance <= 0 && otherBalance <= 0) {
        await storage.updateEnrollment(enrollmentId, tenantId, { status: "completed" } as any);
      }

      res.status(201).json(booking);
    } catch (error) {
      console.error("Failed to create admin booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  async function requireApiKey(req: any, res: any, next: any) {
    try {
      const authHeader = req.headers.authorization;
      const apiKeyHeader = req.headers["x-api-key"];
      let apiKey: string | undefined;

      if (authHeader && authHeader.startsWith("Bearer drv_live_")) {
        apiKey = authHeader.slice(7);
      } else if (apiKeyHeader && typeof apiKeyHeader === "string" && apiKeyHeader.startsWith("drv_live_")) {
        apiKey = apiKeyHeader;
      }

      const originHeader = req.headers.origin as string | undefined;
      const isSameOrigin = !originHeader;

      if (!apiKey) {
        if (isSameOrigin) {
          return next();
        }
        return res.status(401).json({
          message: "API key required. Provide a valid key via Authorization: Bearer drv_live_... or x-api-key header.",
        });
      }

      const prefix = apiKey.substring(0, 16);
      const keyRecord = await storage.getApiKeyByPrefix(prefix);

      if (!keyRecord) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (keyRecord.revokedAt) {
        return res.status(401).json({ message: "This API key has been revoked" });
      }

      const valid = await bcrypt.compare(apiKey, keyRecord.keyHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      if (req.params.slug) {
        const tenant = await storage.getTenantBySlug(req.params.slug);
        if (!tenant || tenant.id !== keyRecord.tenantId) {
          return res.status(403).json({ message: "API key does not belong to this school" });
        }
      }

      req.apiKeyTenantId = keyRecord.tenantId;
      storage.updateApiKeyLastUsed(keyRecord.id).catch(() => {});
      next();
    } catch (error) {
      console.error("API key validation error:", error);
      res.status(500).json({ message: "Authentication error" });
    }
  }

  const publicContactSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().optional(),
    message: z.string().min(1, "Message is required"),
    // Anti-spam fields (all optional so existing integrators keep working)
    website: z.string().optional(), // honeypot — bots often auto-fill any field
    elapsedMs: z.coerce.number().int().nonnegative().optional(),
  });

  // Per-IP sliding-window rate limit for the public contact form.
  // IMPORTANT: relies on Express `trust proxy` (set in setupAuth) so that
  // `req.ip` reflects the real client address from the first trusted hop.
  // We deliberately do NOT read `x-forwarded-for` ourselves — that header is
  // user-controllable and would let attackers rotate spoofed values to bypass
  // the limit.
  const contactSubmitBuckets = new Map<string, number[]>();
  const CONTACT_RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const CONTACT_RATE_MAX = 5;
  const CONTACT_MIN_ELAPSED_MS = 3000; // form must be on screen for >= 3s
  function rateLimitContactSubmit(ip: string): boolean {
    const now = Date.now();
    // Periodic cleanup: drop any bucket whose newest entry is outside the
    // window so the Map can't grow unbounded under spray attacks.
    if (contactSubmitBuckets.size > 1000) {
      for (const [key, times] of contactSubmitBuckets) {
        const newest = times[times.length - 1] ?? 0;
        if (now - newest >= CONTACT_RATE_WINDOW_MS) {
          contactSubmitBuckets.delete(key);
        }
      }
    }
    const arr = (contactSubmitBuckets.get(ip) || []).filter(
      (t) => now - t < CONTACT_RATE_WINDOW_MS,
    );
    if (arr.length >= CONTACT_RATE_MAX) {
      contactSubmitBuckets.set(ip, arr);
      return false;
    }
    arr.push(now);
    contactSubmitBuckets.set(ip, arr);
    return true;
  }

  app.post("/api/public/tenant/:slug/contact", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }
      // Use req.ip (driven by Express trust-proxy config) so rate limiting
      // can't be bypassed via a spoofed x-forwarded-for header.
      const ip = req.ip || "unknown";

      // Honeypot: if a value was supplied for the hidden field, pretend the
      // submission succeeded but drop it on the floor so bots don't retry.
      const honeypot = typeof req.body?.website === "string" ? req.body.website.trim() : "";
      if (honeypot.length > 0) {
        return res.status(204).send();
      }

      // Minimum time-on-form: when the storefront sends elapsedMs, reject
      // anything submitted faster than a human plausibly could.
      const elapsedRaw = req.body?.elapsedMs;
      if (elapsedRaw !== undefined && elapsedRaw !== null && elapsedRaw !== "") {
        const elapsed = Number(elapsedRaw);
        if (Number.isFinite(elapsed) && elapsed < CONTACT_MIN_ELAPSED_MS) {
          return res.status(204).send();
        }
      }

      if (!rateLimitContactSubmit(ip)) {
        return res.status(429).json({ message: "Too many submissions. Please try again later." });
      }

      const parsed = publicContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { website: _hp, elapsedMs: _el, ...contactData } = parsed.data;
      const submission = await storage.createContactSubmission({
        tenantId: tenant.id,
        ...contactData,
      });

      // Best-effort: in-app notifications, admin alert email, and sender
      // confirmation email. None of these block the response or the DB save.
      (async () => {
        try {
          const members = await storage.getTenantMembers(tenant.id);
          const recipients = Array.from(new Set(
            members
              .filter((m) => m.userId && m.status === "ACTIVE" && (m.role === "tenant_admin" || m.role === "office_manager"))
              .map((m) => m.userId as string),
          ));
          if (recipients.length > 0) {
            const preview = submission.message.slice(0, 80) + (submission.message.length > 80 ? "…" : "");
            await storage.createNotifications(recipients.map((userId) => ({
              userId,
              type: "contact_message",
              title: "New contact message",
              message: `${submission.name}: ${preview}`,
              link: `/admin/messages/${submission.id}`,
              read: false,
            })));
          }
        } catch (err) {
          console.error("[contact] in-app notification failed:", err);
        }
      })();

      fireAndForget(
        () => sendAdminContactNotification(submission, tenant),
        `contact_admin_notification #${submission.id}`,
      );
      fireAndForget(
        () => sendContactConfirmationToSender(submission.id, tenant),
        `contact_sender_confirmation #${submission.id}`,
      );

      res.status(201).json(submission);
    } catch (error) {
      console.error("Error submitting contact form:", error);
      res.status(500).json({ message: "Failed to submit contact form" });
    }
  });

  // ─── Admin Contact Messages Inbox (tenant-scoped) ──────────────────
  // Authz: every handler validates that the authenticated user is an active
  // tenant_admin / office_manager of THIS :tenantId (or platform_admin),
  // not just whatever tenant happens to be in the x-tenant-id header.
  async function requireContactInboxAccess(req: any, res: Response): Promise<number | null> {
    const tenantId = parseInt(req.params.tenantId, 10);
    if (!Number.isFinite(tenantId)) {
      res.status(400).json({ message: "Invalid tenant id" });
      return null;
    }
    const userId = req.user?.claims?.sub;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    const member = await storage.getTenantMember(tenantId, userId);
    const allowed = member && member.status === "ACTIVE" &&
      ["tenant_admin", "office_manager", "platform_admin"].includes(member.role);
    if (!allowed) {
      res.status(403).json({ message: "Forbidden" });
      return null;
    }
    return tenantId;
  }

  const contactListQuerySchema = z.object({
    status: z.enum(["all", "unread", "read", "archived"]).optional().default("all"),
    q: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  });

  const contactPatchSchema = z.object({
    read: z.boolean().optional(),
    archived: z.boolean().optional(),
  });

  const contactReplyBodySchema = z.object({
    subject: z.string().trim().min(1, "Subject is required").max(500),
    body: z.string().trim().min(1, "Reply body is required").max(20000),
  });

  app.get("/api/tenants/:tenantId/contact-submissions/unread-count",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const tenantId = await requireContactInboxAccess(req, res);
        if (tenantId === null) return;
        const count = await storage.getUnreadContactSubmissionCount(tenantId);
        res.json({ count });
      } catch (error) {
        console.error("Error fetching unread contact count:", error);
        res.status(500).json({ message: "Failed to fetch count" });
      }
    });

  app.get("/api/tenants/:tenantId/contact-submissions",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const tenantId = await requireContactInboxAccess(req, res);
        if (tenantId === null) return;
        const parsed = contactListQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid query", errors: parsed.error.errors });
        }
        const { status, q, page, pageSize } = parsed.data;
        const items = await storage.getContactSubmissions(tenantId, {
          status,
          search: q,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        });
        const replyMap = await storage.getLatestContactReplyMap(
          tenantId,
          items.map((i) => i.id),
        );
        const itemsWithReplies = items.map((i) => {
          const r = replyMap.get(i.id);
          return {
            ...i,
            lastReplyAt: r?.lastReplyAt ?? null,
            replyCount: r?.replyCount ?? 0,
          };
        });
        res.json({ items: itemsWithReplies, page, pageSize });
      } catch (error) {
        console.error("Error fetching contact submissions:", error);
        res.status(500).json({ message: "Failed to fetch messages" });
      }
    });

  app.get("/api/tenants/:tenantId/contact-submissions/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const tenantId = await requireContactInboxAccess(req, res);
        if (tenantId === null) return;
        const id = parseInt(req.params.id, 10);
        const item = await storage.getContactSubmission(id, tenantId);
        if (!item) return res.status(404).json({ message: "Message not found" });
        const replies = await storage.getContactMessageReplies(id, tenantId);
        const lastReplyAt = replies.length > 0
          ? replies[replies.length - 1].createdAt
          : null;
        const effectiveSender = getEffectiveSender(tenantId);
        res.json({ ...item, replies, replyCount: replies.length, lastReplyAt, effectiveSender });
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch message" });
      }
    });

  app.patch("/api/tenants/:tenantId/contact-submissions/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const tenantId = await requireContactInboxAccess(req, res);
        if (tenantId === null) return;
        const id = parseInt(req.params.id, 10);
        const parsed = contactPatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }

        let updated;
        if (typeof parsed.data.read === "boolean") {
          updated = await storage.updateContactSubmissionRead(id, tenantId, parsed.data.read);
        }
        if (typeof parsed.data.archived === "boolean") {
          updated = parsed.data.archived
            ? await storage.archiveContactSubmission(id, tenantId)
            : await storage.unarchiveContactSubmission(id, tenantId);
        }
        if (!updated) return res.status(404).json({ message: "Message not found" });
        res.json(updated);
      } catch (error) {
        res.status(500).json({ message: "Failed to update message" });
      }
    });

  app.delete("/api/tenants/:tenantId/contact-submissions/:id",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const tenantId = await requireContactInboxAccess(req, res);
        if (tenantId === null) return;
        const id = parseInt(req.params.id, 10);
        await storage.deleteContactSubmission(id, tenantId);
        res.status(204).end();
      } catch (error) {
        res.status(500).json({ message: "Failed to delete message" });
      }
    });

  app.get("/api/tenants/:tenantId/contact-submissions/:id/replies",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const tenantId = await requireContactInboxAccess(req, res);
        if (tenantId === null) return;
        const id = parseInt(req.params.id, 10);
        const submission = await storage.getContactSubmission(id, tenantId);
        if (!submission) return res.status(404).json({ message: "Message not found" });
        const replies = await storage.getContactMessageReplies(id, tenantId);
        res.json({ items: replies });
      } catch (error) {
        console.error("Error fetching replies:", error);
        res.status(500).json({ message: "Failed to fetch replies" });
      }
    });

  app.post("/api/tenants/:tenantId/contact-submissions/:id/replies",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const tenantId = await requireContactInboxAccess(req, res);
        if (tenantId === null) return;
        const id = parseInt(req.params.id, 10);
        const parsed = contactReplyBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
        }
        const submission = await storage.getContactSubmission(id, tenantId);
        if (!submission) return res.status(404).json({ message: "Message not found" });
        const tenant = await storage.getTenant(tenantId);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const userId = req.user.claims.sub;
        const author = await storage.getUser(userId);
        const authorEmail = author?.email ?? req.user?.claims?.email ?? null;

        const reply = await storage.createContactMessageReply({
          submissionId: id,
          tenantId,
          authorUserId: userId,
          authorEmail,
          toEmail: submission.email,
          subject: parsed.data.subject,
          body: parsed.data.body,
        });

        let emailStatus = "failed";
        let emailId: number | null = null;
        try {
          const result = await sendContactReplyEmail({
            submission,
            tenant,
            subject: parsed.data.subject,
            body: parsed.data.body,
            fromEmail: authorEmail,
            actorUserId: userId,
          });
          emailStatus = result.status;
          emailId = result.emailId;
        } catch (err) {
          console.error(`[ContactReply] send failed for #${id}:`, err);
          emailStatus = "failed";
        }
        await storage.updateContactMessageReplyEmailStatus(reply.id, emailStatus, emailId);

        // Mark message as read once a reply has been sent.
        if (!submission.read) {
          await storage.updateContactSubmissionRead(id, tenantId, true);
        }

        res.status(201).json({ ...reply, emailStatus, emailId });
      } catch (error) {
        console.error("Error sending reply:", error);
        res.status(500).json({ message: "Failed to send reply" });
      }
    });

  app.post("/api/public/tenant/:slug/enroll", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }
      const parsed = publicEnrollmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const pkg = await storage.getPackage(parsed.data.packageId);
      if (!pkg || pkg.tenantId !== tenant.id) {
        return res.status(400).json({ message: "Invalid package" });
      }
      if (parsed.data.locationId) {
        const loc = await storage.getLocation(parsed.data.locationId);
        if (!loc || loc.tenantId !== tenant.id) {
          return res.status(400).json({ message: "Invalid location" });
        }
      }
      const scopeCheck = await storage.assertPackageAllowedAtLocation(pkg.id, parsed.data.locationId ?? null);
      if (!scopeCheck.ok) {
        return res.status(400).json({ message: scopeCheck.message });
      }
      if (parsed.data.dateOfBirth) {
        const dob = new Date(parsed.data.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        if (age < 18) {
          if (!parsed.data.parentName || !parsed.data.parentEmail) {
            return res.status(400).json({ message: "Parent/guardian name and email are required for students under 18" });
          }
        }
      }
      const enrollment = await storage.createEnrollment({
        tenantId: tenant.id,
        ...parsed.data,
        status: "pending",
        amountPaid: 0,
      });
      fireAndForget(
        () => sendEnrollmentReceived(enrollment, tenant, null),
        `enrollment_received public/enroll #${enrollment.id}`,
      );
      fireAndForget(
        () => sendAdminEnrollmentNotification(enrollment.id, tenant.id),
        `admin_enrollment_notification public/enroll #${enrollment.id}`,
      );
      res.status(201).json(enrollment);
    } catch (error) {
      res.status(500).json({ message: "Failed to create enrollment" });
    }
  });

  app.get("/api/public/me", requireApiKey, async (req, res) => {
    try {
      const tenantId = req.apiKeyTenantId;
      if (!tenantId) {
        return res.status(401).json({ message: "API key required" });
      }
      const tenant = await storage.getTenant(tenantId);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }
      res.json({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        logoUrl: tenant.logoUrl ?? null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load school data" });
    }
  });

  app.get("/api/public/tenant/:slug", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }
      if (tenant.websiteEnabled === false) {
        return res.status(403).json({ message: "Website is not enabled for this school" });
      }
      const theme = await storage.getTenantTheme(tenant.id);
      const rawLocationId = req.query.locationId;
      let locationFilter: number | undefined = undefined;
      if (rawLocationId !== undefined && rawLocationId !== "") {
        const s = String(rawLocationId);
        if (!/^\d+$/.test(s)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        locationFilter = parseInt(s, 10);
        if (!Number.isFinite(locationFilter)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
      }
      const pkgs = await storage.getPackages(tenant.id, { locationId: locationFilter });
      const locs = await storage.getLocations(tenant.id);
      const activePkgs = pkgs.filter((p) => p.active);
      const specificScopedIds = activePkgs
        .filter((p) => p.locationScopeMode === "SPECIFIC_LOCATIONS")
        .map((p) => p.id);
      const packageLocationMap: Record<number, number[]> = {};
      if (specificScopedIds.length > 0) {
        await Promise.all(
          specificScopedIds.map(async (pid) => {
            packageLocationMap[pid] = await storage.getPackageLocationIds(pid);
          }),
        );
      }
      // Per-location price overrides for add-ons (and any other package that
      // opts in). Surfaced so the storefront can render the right price when
      // a buyer picks a specific location.
      const packageLocationPrices = await storage.getPackageLocationOverridesMap(tenant.id);
      const announcement = await storage.getTenantAnnouncement(tenant.id);
      const now = new Date();
      const announcementActive = announcement
        && announcement.enabled
        && (!announcement.validFrom || new Date(announcement.validFrom) <= now)
        && (!announcement.validUntil || new Date(announcement.validUntil) >= now)
        && (announcement.message?.trim().length ?? 0) > 0;
      res.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: tenant.logoUrl,
          phone: tenant.phone,
          email: tenant.email,
          customDomain: tenant.domainVerified ? tenant.customDomain : null,
        },
        theme,
        packages: activePkgs,
        packageLocations: packageLocationMap,
        packageLocationPrices,
        locations: locs.filter((l) => l.active),
        announcement: announcementActive ? announcement : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to load school data" });
    }
  });

  app.get("/api/public/resolve", async (req, res) => {
    try {
      const hostname = req.query.hostname as string;
      if (!hostname) {
        return res.status(400).json({ message: "hostname required" });
      }
      const tenant = await storage.resolveTenant(hostname);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }
      res.json({ slug: tenant.slug, tenantId: tenant.id, name: tenant.name });
    } catch (error) {
      res.status(500).json({ message: "Failed to resolve tenant" });
    }
  });

  app.get("/api/public/tenant/:slug/packages", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant) return res.status(404).json({ message: "School not found" });
      const rawLoc = req.query.locationId;
      let locationFilter: number | undefined = undefined;
      if (rawLoc !== undefined && rawLoc !== "") {
        const s = String(rawLoc);
        if (!/^\d+$/.test(s)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        const parsed = parseInt(s, 10);
        if (!Number.isFinite(parsed)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        locationFilter = parsed;
      }
      const pkgs = await storage.getPackages(
        tenant.id,
        locationFilter !== undefined ? { locationId: locationFilter } : undefined,
      );
      const depsMap = await storage.getUpsellDependenciesMap(tenant.id);
      const overridesMap = await storage.getPackageLocationOverridesMap(tenant.id);
      // Public storefront packages list = sellable on its own. The new
      // explicit `sellableStandalone` flag is the source of truth (the
      // backfill maps legacy `isAddOn=true` rows to
      // `sellableStandalone=false` so they continue to stay out).
      res.json(
        pkgs
          .filter((p) => p.active)
          .filter((p) => p.sellableStandalone !== false)
          // PRIMARY packages first, AUXILIARY at the bottom — preserves the
          // existing sortOrder within each tier so admins keep their manual
          // ordering. Server-side sort means storefronts don't have to.
          .sort((a, b) => {
            const ta = (a.tier ?? "PRIMARY") === "AUXILIARY" ? 1 : 0;
            const tb = (b.tier ?? "PRIMARY") === "AUXILIARY" ? 1 : 0;
            if (ta !== tb) return ta - tb;
            return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          })
          .map((p) => {
            const overrides = overridesMap[p.id] ?? {};
            const locationPrices = Object.entries(overrides).map(([locationId, priceCents]) => ({
              locationId: Number(locationId),
              priceCents,
            }));
            return {
              ...p,
              requiresCohortSelection: p.kind === "COHORT_BASED",
              upsellParentPackageIds: depsMap[p.id] ?? [],
              channels: derivePackageChannels(p),
              locationPrices,
            };
          }),
      );
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch packages" });
    }
  });

  app.get("/api/public/tenant/:slug/packages/:pkgId", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const pkgId = parseInt(req.params.pkgId, 10);
      if (!Number.isFinite(pkgId)) return res.status(400).json({ message: "Invalid package id" });
      const pkg = await storage.getPackage(pkgId);
      if (!pkg || pkg.tenantId !== tenant.id || !pkg.active || pkg.sellableStandalone === false) {
        return res.status(404).json({ message: "Package not found" });
      }
      const rawLoc = req.query.locationId;
      let locationFilter: number | null = null;
      if (rawLoc !== undefined && rawLoc !== "") {
        const s = String(rawLoc);
        if (!/^\d+$/.test(s)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        locationFilter = parseInt(s, 10);
      }
      // Honor location scoping for the package itself when a location is given.
      if (locationFilter != null) {
        const allowed = await storage.isPackageAllowedAtLocation(pkg.id, locationFilter);
        if (!allowed) return res.status(404).json({ message: "Package not available at this location" });
      }
      const depsMap = await storage.getUpsellDependenciesMap(tenant.id);
      const pkgOverrides = await storage.getPackageLocationOverrides(pkg.id);
      const pkgLocationPrices = Object.entries(pkgOverrides)
        .filter(([, cents]) => cents != null)
        .map(([locationId, priceCents]) => ({
          locationId: Number(locationId),
          priceCents: priceCents as number,
        }));
      const upsellOverridesMap = await storage.getPackageLocationOverridesMap(tenant.id);
      let upsells = await storage.listUpsellsForPackages(tenant.id, [pkg.id], locationFilter);
      // When the buyer hasn't picked a specific location but the package
      // itself is restricted to specific locations, restrict upsells to
      // those reachable from at least one of the package's locations.
      // (When a query `locationId` is set, listAddOnPackages already did
      // this filtering for us.)
      if (locationFilter == null && pkg.locationScopeMode === "SPECIFIC_LOCATIONS" && upsells.length > 0) {
        const pkgLocationIds = new Set(await storage.getPackageLocationIds(pkg.id));
        const upsellLocMap = await storage.getPackageLocationsMap(tenant.id);
        upsells = upsells.filter((u) => {
          if (u.locationScopeMode === "ALL_LOCATIONS") return true;
          const ulocs = upsellLocMap[u.id] ?? [];
          return ulocs.some((lid) => pkgLocationIds.has(lid));
        });
      }
      const relatedUpsells = upsells.map((p) => {
        const ovs = upsellOverridesMap[p.id] ?? {};
        const locationPrices = Object.entries(ovs).map(([locationId, priceCents]) => ({
          locationId: Number(locationId),
          priceCents,
        }));
        return {
          ...p,
          requiresCohortSelection: p.kind === "COHORT_BASED",
          upsellParentPackageIds: depsMap[p.id] ?? [],
          locationPrices,
        };
      });
      res.json({
        ...pkg,
        requiresCohortSelection: pkg.kind === "COHORT_BASED",
        upsellParentPackageIds: depsMap[pkg.id] ?? [],
        locationPrices: pkgLocationPrices,
        relatedUpsells,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch package" });
    }
  });

  app.get("/api/public/tenant/:slug/online-courses", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant) return res.status(404).json({ message: "School not found" });
      const rawLoc = req.query.locationId;
      let locationFilter: number | undefined = undefined;
      if (rawLoc !== undefined && rawLoc !== "") {
        const s = String(rawLoc);
        if (!/^\d+$/.test(s)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        const parsed = parseInt(s, 10);
        if (!Number.isFinite(parsed)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        locationFilter = parsed;
      }
      const courses = await storage.getOnlineCourses(
        tenant.id,
        locationFilter !== undefined ? { locationId: locationFilter } : undefined,
      );
      res.json(courses.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch online courses" });
    }
  });

  app.get("/api/tenants/:tenantId/media", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
      const userId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, userId);
      if (!actor) return res.status(403).json({ message: "Forbidden" });
      const items = await storage.getMedia(tenantId);
      res.json(items);
    } catch (error) {
      console.error("Failed to fetch media:", error);
      res.status(500).json({ message: "Failed to fetch media" });
    }
  });

  app.post("/api/tenants/:tenantId/media", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
      const userId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, userId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const item = await storage.createMedia({
        tenantId,
        filename: req.body.filename,
        objectPath: req.body.objectPath,
        contentType: req.body.contentType,
        size: req.body.size,
        alt: req.body.alt || null,
        uploadedBy: userId,
      });
      res.status(201).json(item);
    } catch (error) {
      console.error("Failed to save media:", error);
      res.status(500).json({ message: "Failed to save media" });
    }
  });

  app.delete("/api/tenants/:tenantId/media/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const id = parseInt(req.params.id as string);
      if (isNaN(tenantId) || isNaN(id)) return res.status(400).json({ message: "Invalid IDs" });
      const userId = req.user.claims.sub;
      const actor = await storage.getTenantMember(tenantId, userId);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteMedia(id, tenantId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete media:", error);
      res.status(500).json({ message: "Failed to delete media" });
    }
  });

  // ===== PAYMENT SETTINGS ROUTES =====

  app.get("/api/tenants/:tenantId/payment-settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const settings = await storage.getTenantPaymentSettings(tenantId);
      if (!settings) {
        return res.json({
          tenantId,
          stripeEnabled: false,
          stripeSecretKey: "",
          stripePublishableKey: "",
          stripeWebhookSecret: "",
          paypalEnabled: false,
          paypalClientId: "",
          paypalClientSecret: "",
          paypalMode: "sandbox",
          cashEnabled: false,
          cashRequireSignature: false,
          autoExpireEnabled: true,
          expireAfterHours: 2,
          serviceFeeBps: 0,
          serviceFeeFlatCents: 0,
        });
      }
      res.json({
        ...settings,
        stripeSecretKey: settings.stripeSecretKey ? maskKey(settings.stripeSecretKey) : "",
        stripeWebhookSecret: settings.stripeWebhookSecret ? maskKey(settings.stripeWebhookSecret) : "",
        paypalClientSecret: settings.paypalClientSecret ? maskKey(settings.paypalClientSecret) : "",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payment settings" });
    }
  });

  const paymentSettingsSchema = z.object({
    stripeEnabled: z.boolean().optional(),
    stripeSecretKey: z.string().optional(),
    stripePublishableKey: z.string().optional(),
    stripeWebhookSecret: z.string().optional(),
    paypalEnabled: z.boolean().optional(),
    paypalClientId: z.string().optional(),
    paypalClientSecret: z.string().optional(),
    paypalMode: z.enum(["sandbox", "production"]).optional(),
    cashEnabled: z.boolean().optional(),
    cashRequireSignature: z.boolean().optional(),
    autoExpireEnabled: z.boolean().optional(),
    expireAfterHours: z.number().min(1).max(168).optional(),
    // Service fee surcharge in basis points (300 = 3.00%). 0 disables.
    // Capped to MAX_SERVICE_FEE_BPS (10%) so a typo can't 10x a buyer's bill.
    serviceFeeBps: z.number().int().min(0).max(MAX_SERVICE_FEE_BPS).optional(),
    // Flat per-transaction admin fee (cents). Capped to $100 (10000 cents) so
    // a typo can't quietly add a huge charge. 0 disables. May be combined with
    // serviceFeeBps — either, both, or neither is valid.
    serviceFeeFlatCents: z.number().int().min(0).max(MAX_SERVICE_FEE_FLAT_CENTS).optional(),
  });

  app.put("/api/tenants/:tenantId/payment-settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = paymentSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const existing = await storage.getTenantPaymentSettings(tenantId);
      const data: any = { tenantId, ...parsed.data };

      if (typeof data.stripeSecretKey === "string" && data.stripeSecretKey.includes("****")) {
        if (existing?.stripeSecretKey) {
          data.stripeSecretKey = existing.stripeSecretKey;
        } else {
          delete data.stripeSecretKey;
        }
      }
      if (typeof data.stripeWebhookSecret === "string" && data.stripeWebhookSecret.includes("****")) {
        if (existing?.stripeWebhookSecret) {
          data.stripeWebhookSecret = existing.stripeWebhookSecret;
        } else {
          delete data.stripeWebhookSecret;
        }
      }
      if (typeof data.paypalClientSecret === "string" && data.paypalClientSecret.includes("****")) {
        if (existing?.paypalClientSecret) {
          data.paypalClientSecret = existing.paypalClientSecret;
        } else {
          delete data.paypalClientSecret;
        }
      }

      const settings = await storage.upsertTenantPaymentSettings(data);
      res.json({
        ...settings,
        stripeSecretKey: settings.stripeSecretKey ? maskKey(settings.stripeSecretKey) : "",
        stripeWebhookSecret: settings.stripeWebhookSecret ? maskKey(settings.stripeWebhookSecret) : "",
        paypalClientSecret: settings.paypalClientSecret ? maskKey(settings.paypalClientSecret) : "",
      });
    } catch (error) {
      console.error("Failed to update payment settings:", error);
      res.status(500).json({ message: "Failed to update payment settings" });
    }
  });

  const testStripeBodySchema = z.object({
    stripeSecretKey: z.string().optional(),
  });

  app.post("/api/tenants/:tenantId/payment-settings/test-stripe", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const body = testStripeBodySchema.safeParse(req.body ?? {});
      const submitted = body.success ? (body.data.stripeSecretKey ?? "").trim() : "";
      const isUsableSubmitted = submitted.length > 0 && !submitted.includes("****");

      let secretKey: string | undefined;
      let source: "form" | "saved" = "saved";

      if (isUsableSubmitted) {
        secretKey = submitted;
        source = "form";
      } else {
        const settings = await storage.getTenantPaymentSettings(tenantId);
        if (settings?.stripeSecretKey) {
          secretKey = settings.stripeSecretKey;
        }
      }

      if (!secretKey) {
        return res.status(400).json({
          ok: false,
          error: "Stripe secret key not configured. Paste your key into the form and click Test Connection again.",
          source,
        });
      }

      const result = await testStripeConnection(secretKey);
      res.json({ ...result, source });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Test failed" });
    }
  });

  const testPaypalBodySchema = z.object({
    paypalClientId: z.string().optional(),
    paypalClientSecret: z.string().optional(),
    paypalMode: z.enum(["sandbox", "production"]).optional(),
  });

  app.post("/api/tenants/:tenantId/payment-settings/test-paypal", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const body = testPaypalBodySchema.safeParse(req.body ?? {});
      const submittedId = body.success ? (body.data.paypalClientId ?? "").trim() : "";
      const submittedSecret = body.success ? (body.data.paypalClientSecret ?? "").trim() : "";
      const submittedMode = body.success ? body.data.paypalMode : undefined;

      const settings = await storage.getTenantPaymentSettings(tenantId);

      const isUsableSubmittedId = submittedId.length > 0 && !submittedId.includes("****");
      const isUsableSubmittedSecret = submittedSecret.length > 0 && !submittedSecret.includes("****");

      const clientId = isUsableSubmittedId ? submittedId : settings?.paypalClientId || "";
      const clientSecret = isUsableSubmittedSecret ? submittedSecret : settings?.paypalClientSecret || "";
      const mode = submittedMode || settings?.paypalMode || "sandbox";
      const source: "form" | "saved" =
        isUsableSubmittedId || isUsableSubmittedSecret ? "form" : "saved";

      if (!clientId || !clientSecret) {
        return res.status(400).json({
          ok: false,
          error: "PayPal credentials not configured. Enter both Client ID and Client Secret and click Test Connection again.",
          source,
        });
      }

      const result = await testPayPalConnection(clientId, clientSecret, mode);
      res.json({ ...result, source });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Test failed" });
    }
  });

  // ===== PUBLIC CHECKOUT ROUTES =====

  const checkoutStartSchema = z.object({
    provider: z.enum(["STRIPE", "PAYPAL", "CASH"]),
    packageId: z.number(),
    locationId: z.number().nullable().optional(),
    student: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      dateOfBirth: z.string().optional(),
      parentName: z.string().optional(),
      parentEmail: z.string().optional(),
      parentPhone: z.string().optional(),
    }),
    parent: z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }).optional(),
    studentSignature: z.string().optional(),
    receiverSignature: z.string().optional(),
    receiverName: z.string().optional(),
    externalSuccessUrl: z.string().url().optional(),
    externalCancelUrl: z.string().url().optional(),
  });

  app.post("/api/public/tenant/:slug/checkout/start", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }

      const parsed = checkoutStartSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(cartCheckoutErrorBody(
          CartCheckoutErrorCode.INVALID_DATA,
          "Invalid data",
          { errors: parsed.error.errors },
        ));
      }

      const { provider, packageId, locationId, student, parent, externalSuccessUrl, externalCancelUrl } = parsed.data;

      const pkg = await storage.getPackage(packageId);
      if (!pkg || pkg.tenantId !== tenant.id || !pkg.active) {
        return sendCartCheckoutError(res, CartCheckoutErrorCode.INVALID_PACKAGE, "Invalid package");
      }

      // Block legacy single-package checkout for packages that require an
      // IN_CLASS offering pick. Those must use the cart flow so the buyer
      // can select a specific class schedule before payment.
      const isCohortBased = pkg.kind === "COHORT_BASED";
      const requiresInClass = (pkg.classroomHoursRequired ?? 0) > 0;
      if (isCohortBased && requiresInClass && !pkg.isAddOn) {
        return sendCartCheckoutError(
          res,
          CartCheckoutErrorCode.COHORT_SELECTION_REQUIRED,
          "This package requires picking a class schedule. Please use the cart checkout flow (/cart-checkout/start) so a specific offering can be selected.",
        );
      }
      // Upsell-only packages cannot be checked out on their own.
      if (pkg.sellableStandalone === false) {
        return sendCartCheckoutError(
          res,
          CartCheckoutErrorCode.PACKAGE_NOT_STANDALONE,
          "This package is only available as an upsell. Add it to a cart that already contains its parent package.",
        );
      }

      if (locationId) {
        const loc = await storage.getLocation(locationId);
        if (!loc || loc.tenantId !== tenant.id) {
          return sendCartCheckoutError(res, CartCheckoutErrorCode.INVALID_LOCATION, "Invalid location");
        }
      }
      // SPECIFIC_LOCATIONS packages REQUIRE a non-null, allowed locationId.
      const scopeCheck = await storage.assertPackageAllowedAtLocation(pkg.id, locationId ?? null);
      if (!scopeCheck.ok) {
        return sendCartCheckoutError(res, scopeCheck.code, scopeCheck.message);
      }

      // Apply per-location price override (if any) so the buyer is charged the
      // location-specific price advertised on the storefront.
      const subtotalCents = await storage.getEffectivePackagePrice(
        pkg.id,
        locationId ?? null,
      );

      const settings = await storage.getTenantPaymentSettings(tenant.id);
      if (!settings) {
        return sendCartCheckoutError(
          res,
          CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED,
          "Payment not configured for this school",
        );
      }

      if (provider === "STRIPE" && (!settings.stripeEnabled || !settings.stripeSecretKey)) {
        return sendCartCheckoutError(
          res,
          CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED,
          "Stripe is not enabled for this school",
          { provider: "STRIPE" },
        );
      }
      if (provider === "PAYPAL" && (!settings.paypalEnabled || !settings.paypalClientId || !settings.paypalClientSecret)) {
        return sendCartCheckoutError(
          res,
          CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED,
          "PayPal is not enabled for this school",
          { provider: "PAYPAL" },
        );
      }
      if (provider === "CASH" && !settings.cashEnabled) {
        return sendCartCheckoutError(
          res,
          CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED,
          "Cash payments are not enabled for this school",
          { provider: "CASH" },
        );
      }

      // Service fee surcharge — only added on STRIPE / PAYPAL when the tenant
      // has configured a non-zero rate. CASH never carries the fee. The
      // subtotal stays on the enrollment (`priceSnapshotCents`) so reporting
      // by package price is unaffected; the gross paid amount lives on the
      // payment row as `amountCents` and is split via `serviceFeeCents`.
      const serviceFeeCents = computeServiceFeeCents(
        subtotalCents,
        settings.serviceFeeBps ?? 0,
        provider,
        settings.serviceFeeFlatCents ?? 0,
      );
      const grossAmountCents = subtotalCents + serviceFeeCents;

      const enrollment = await storage.createEnrollment({
        tenantId: tenant.id,
        packageId,
        locationId: locationId || null,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone || null,
        dateOfBirth: student.dateOfBirth || null,
        parentName: parent?.name || student.parentName || null,
        parentEmail: parent?.email || student.parentEmail || null,
        parentPhone: parent?.phone || student.parentPhone || null,
        status: "pending_payment",
        priceSnapshotCents: subtotalCents,
        currencySnapshot: "USD",
        packageSnapshotJson: {
          name: pkg.name,
          price: subtotalCents,
          classroomHoursRequired: pkg.classroomHoursRequired,
          driveHoursRequired: pkg.driveHoursRequired,
        },
        amountPaid: 0,
      });

      const paymentData: any = {
        tenantId: tenant.id,
        enrollmentId: enrollment.id,
        provider,
        status: "CREATED",
        amountCents: grossAmountCents,
        serviceFeeCents,
        currency: "USD",
        idempotencyKey: crypto.randomUUID(),
        metadataJson: {
          tenantId: String(tenant.id),
          enrollmentId: String(enrollment.id),
          packageName: pkg.name,
          subtotalCents: String(subtotalCents),
          serviceFeeCents: String(serviceFeeCents),
          serviceFeeBps: String(settings.serviceFeeBps ?? 0),
          serviceFeeFlatCents: String(settings.serviceFeeFlatCents ?? 0),
          ...(externalSuccessUrl ? { externalSuccessUrl } : {}),
          ...(externalCancelUrl ? { externalCancelUrl } : {}),
        },
      };

      if (provider === "CASH") {
        if (parsed.data.studentSignature) paymentData.studentSignature = parsed.data.studentSignature;
        if (parsed.data.receiverSignature) paymentData.receiverSignature = parsed.data.receiverSignature;
        if (parsed.data.receiverName) paymentData.receiverName = parsed.data.receiverName;
      }

      const payment = await storage.createPayment(paymentData);

      fireAndForget(
        () => sendEnrollmentReceived(enrollment, tenant, payment),
        `enrollment_received checkout/start #${enrollment.id}`,
      );
      fireAndForget(
        () => sendAdminEnrollmentNotification(enrollment.id, tenant.id),
        `admin_enrollment_notification checkout/start #${enrollment.id}`,
      );

      if (provider === "CASH") {
        await storage.updatePayment(payment.id, { status: "PENDING" });
        return res.json({ cashPayment: true, enrollmentId: enrollment.id, paymentId: payment.id });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const successUrl = externalSuccessUrl
        ? `${externalSuccessUrl}${externalSuccessUrl.includes("?") ? "&" : "?"}enrollment=${enrollment.id}`
        : `${baseUrl}/site/${tenant.slug}/checkout/success?enrollment=${enrollment.id}`;
      const cancelUrl = externalCancelUrl || `${baseUrl}/site/${tenant.slug}/enroll?cancelled=true`;

      let redirectUrl: string;

      if (provider === "STRIPE") {
        const result = await createStripeCheckoutSession({
          secretKey: settings.stripeSecretKey!,
          amountCents: grossAmountCents,
          currency: "USD",
          description: `${pkg.name} - ${tenant.name}`,
          successUrl,
          cancelUrl,
          metadata: {
            tenantId: String(tenant.id),
            enrollmentId: String(enrollment.id),
            paymentId: String(payment.id),
          },
        });

        await storage.updatePayment(payment.id, {
          providerOrderId: result.sessionId,
          status: "PENDING",
        } as any);

        redirectUrl = result.redirectUrl;
      } else {
        const result = await createPayPalOrder({
          clientId: settings.paypalClientId!,
          clientSecret: settings.paypalClientSecret!,
          mode: settings.paypalMode || "sandbox",
          amountCents: grossAmountCents,
          currency: "USD",
          description: `${pkg.name} - ${tenant.name}`,
          returnUrl: `${baseUrl}/api/payments/paypal/return?enrollmentId=${enrollment.id}`,
          cancelUrl,
          metadata: {
            tenantId: String(tenant.id),
            enrollmentId: String(enrollment.id),
            paymentId: String(payment.id),
          },
        });

        await storage.updatePayment(payment.id, {
          providerOrderId: result.orderId,
          status: "PENDING",
        } as any);

        redirectUrl = result.approvalUrl;
      }

      res.json({
        redirectUrl,
        enrollmentId: enrollment.id,
        paymentId: payment.id,
        subtotalCents,
        serviceFeeCents,
        serviceFeeBps: settings.serviceFeeBps ?? 0,
        serviceFeeFlatCents: settings.serviceFeeFlatCents ?? 0,
        totalCents: grossAmountCents,
      });
    } catch (error) {
      console.error("Checkout start error:", error);
      res.status(500).json({ message: "Failed to start checkout" });
    }
  });

  // ===== PUBLIC CART ROUTES =====

  app.post("/api/public/tenant/:slug/cart", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const cart = await storage.createCart(tenant.id);
      res.json(cart);
    } catch (e) {
      console.error("Create cart error:", e);
      res.status(500).json({ message: "Failed to create cart" });
    }
  });

  // Loads a cart and asserts it belongs to the API key's tenant (when an API
  // key was used). Same-origin requests have no apiKeyTenantId so we accept,
  // but the underlying cart still lives in its own opaque UUID namespace.
  async function loadCartForApiKey(req: Request): Promise<{ ok: true; cart: Cart } | { ok: false; status: number; message: string }> {
    const cart = await storage.getCart(String(req.params.cartId));
    if (!cart) return { ok: false, status: 404, message: "Cart not found" };
    if (req.apiKeyTenantId && cart.tenantId !== req.apiKeyTenantId) {
      return { ok: false, status: 403, message: "Cart does not belong to this school" };
    }
    return { ok: true, cart };
  }

  app.get("/api/public/cart/:cartId", requireApiKey, async (req, res) => {
    try {
      const r = await loadCartForApiKey(req);
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      const items = await storage.listCartItems(r.cart.id);
      const depsMap = await storage.getUpsellDependenciesMap(r.cart.tenantId);
      const enriched = items.map((i) => ({
        ...i,
        package: {
          ...i.package,
          requiresCohortSelection: i.package.kind === "COHORT_BASED",
          upsellParentPackageIds: depsMap[i.package.id] ?? [],
          channels: derivePackageChannels(i.package),
        },
      }));
      const subtotalCents = enriched.reduce((s, i) => s + (i.priceCents || 0), 0);
      res.json({ ...r.cart, items: enriched, subtotalCents, totalCents: subtotalCents });
    } catch (e) {
      res.status(500).json({ message: "Failed to load cart" });
    }
  });

  // Returns the enrollments created from this cart after activation. Used
  // by the success page to render a multi-item summary with waitlist status.
  app.get("/api/public/cart/:cartId/enrollments", requireApiKey, async (req, res) => {
    try {
      const r = await loadCartForApiKey(req);
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      const enrs = await storage.getEnrollmentsByCart(r.cart.id);
      // Strip sensitive fields; only return what the success page needs.
      const safe = enrs.map((e: any) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        status: e.status,
        isWaitlisted: e.isWaitlisted,
        offeringId: e.offeringId,
        priceSnapshotCents: e.priceSnapshotCents,
        packageSnapshotJson: e.packageSnapshotJson,
      }));
      res.json(safe);
    } catch (e) {
      res.status(500).json({ message: "Failed to load cart enrollments" });
    }
  });

  // Receipt summary endpoint — used by the unified thank-you page to render
  // a printable receipt for both single-enrollment and multi-item cart flows.
  // Returns: cart/enrollment header, line items, totals, payment method and
  // transaction reference, customer (student + parent) snapshot, school info.
  // Same-origin requests skip the API key check (handled by requireApiKey).
  app.get("/api/public/cart/:cartId/receipt", requireApiKey, async (req, res) => {
    try {
      const r = await loadCartForApiKey(req);
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      const cart = r.cart as any;
      const enrs = await storage.getEnrollmentsByCart(cart.id);
      const tenant = await storage.getTenant(cart.tenantId);

      // Find the most relevant payment record for this cart. Prefer SUCCEEDED.
      const cartPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.cartId, cart.id))
        .orderBy(desc(payments.createdAt));
      const paid = cartPayments.find((p: any) => p.status === "SUCCEEDED") || cartPayments[0];

      const customerSnapshot: any = (cart.customerSnapshotJson as any) || {};

      const items = enrs.map((e: any) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        status: e.status,
        isWaitlisted: e.isWaitlisted,
        offeringId: e.offeringId,
        priceCents: e.priceSnapshotCents || 0,
        package: e.packageSnapshotJson || null,
      }));
      const subtotalCents = items.reduce((s: number, it: any) => s + (it.priceCents || 0), 0);

      res.json({
        kind: "cart",
        reference: cart.id,
        createdAt: paid?.completedAt || paid?.createdAt || cart.updatedAt || cart.createdAt,
        items,
        totals: {
          subtotalCents,
          serviceFeeCents: paid?.serviceFeeCents ?? 0,
          totalCents: paid?.amountCents ?? subtotalCents,
          currency: paid?.currency || "USD",
        },
        payment: paid
          ? {
              provider: paid.provider,
              status: paid.status,
              amountCents: paid.amountCents,
              currency: paid.currency,
              reference: paid.providerPaymentId || paid.providerOrderId || null,
            }
          : null,
        customer: {
          student: {
            firstName: customerSnapshot.firstName || items[0]?.firstName || "",
            lastName: customerSnapshot.lastName || items[0]?.lastName || "",
            email: customerSnapshot.email || "",
            phone: customerSnapshot.phone || "",
            dateOfBirth: customerSnapshot.dateOfBirth || "",
          },
          parent: customerSnapshot.parentName || customerSnapshot.parentEmail || customerSnapshot.parentPhone
            ? {
                name: customerSnapshot.parentName || "",
                email: customerSnapshot.parentEmail || "",
                phone: customerSnapshot.parentPhone || "",
              }
            : null,
        },
        school: tenant
          ? { id: tenant.id, name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl }
          : null,
      });
    } catch (e) {
      res.status(500).json({ message: "Failed to load receipt" });
    }
  });

  app.get("/api/public/enrollments/:id/receipt", requireApiKey, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const enrollment = await findEnrollmentDirectly(id);
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });

      const tenant = await storage.getTenant(enrollment.tenantId);
      const paymentsList = await storage.getPaymentsByEnrollment(id);
      const paid = paymentsList.find((p: any) => p.status === "SUCCEEDED") || paymentsList[0];

      const item = {
        id: enrollment.id,
        firstName: enrollment.firstName,
        lastName: enrollment.lastName,
        status: enrollment.status,
        isWaitlisted: false,
        offeringId: (enrollment as any).offeringId ?? null,
        priceCents: enrollment.priceSnapshotCents || 0,
        package: enrollment.packageSnapshotJson || null,
      };

      res.json({
        kind: "enrollment",
        reference: String(enrollment.id),
        createdAt: paid?.completedAt || paid?.createdAt || enrollment.activatedAt || (enrollment as any).createdAt,
        items: [item],
        totals: {
          subtotalCents: item.priceCents,
          serviceFeeCents: paid?.serviceFeeCents ?? 0,
          totalCents: paid?.amountCents ?? item.priceCents,
          currency: paid?.currency || "USD",
        },
        payment: paid
          ? {
              provider: paid.provider,
              status: paid.status,
              amountCents: paid.amountCents,
              currency: paid.currency,
              reference: paid.providerPaymentId || paid.providerOrderId || null,
            }
          : null,
        customer: {
          student: {
            firstName: enrollment.firstName,
            lastName: enrollment.lastName,
            email: (enrollment as any).email || "",
            phone: (enrollment as any).phone || "",
            dateOfBirth: (enrollment as any).dateOfBirth || "",
          },
          parent: (enrollment as any).parentName || (enrollment as any).parentEmail || (enrollment as any).parentPhone
            ? {
                name: (enrollment as any).parentName || "",
                email: (enrollment as any).parentEmail || "",
                phone: (enrollment as any).parentPhone || "",
              }
            : null,
        },
        school: tenant
          ? { id: tenant.id, name: tenant.name, slug: tenant.slug, logoUrl: tenant.logoUrl }
          : null,
      });
    } catch (e) {
      res.status(500).json({ message: "Failed to load receipt" });
    }
  });

  app.post("/api/public/cart/:cartId/items", requireApiKey, async (req, res) => {
    try {
      const r = await loadCartForApiKey(req);
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      if (r.cart.status !== "open") {
        return sendCartCheckoutError(res, CartCheckoutErrorCode.CART_NOT_EDITABLE, "Cart is no longer editable");
      }

      const schema = z.object({
        packageId: z.number(),
        offeringId: z.number().nullable().optional(),
        locationId: z.number().int().positive().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(cartCheckoutErrorBody(
          CartCheckoutErrorCode.INVALID_DATA,
          "Invalid data",
          { errors: parsed.error.errors },
        ));
      }

      const cartLocationId = (r.cart as any).locationId ?? null;
      const requestedLocationId = parsed.data.locationId ?? null;

      // If the body provides a locationId, validate tenant ownership and that
      // it doesn't conflict with a location already pinned on the cart.
      if (requestedLocationId != null) {
        const loc = await storage.getLocation(requestedLocationId);
        if (!loc || loc.tenantId !== r.cart.tenantId) {
          return sendCartCheckoutError(res, CartCheckoutErrorCode.INVALID_LOCATION, "Invalid location");
        }
        if (cartLocationId != null && cartLocationId !== requestedLocationId) {
          return sendCartCheckoutError(
            res,
            CartCheckoutErrorCode.CART_LOCATION_MISMATCH,
            "This cart is already associated with a different location.",
          );
        }
      }

      // Always run the strict location-scope guard. ALL_LOCATIONS packages
      // pass with a null location; SPECIFIC_LOCATIONS packages require a
      // matching allow-listed location, so a buyer cannot bypass the
      // restriction by simply omitting locationId on the add-item request.
      const effectiveLocationId = requestedLocationId ?? cartLocationId;
      const scopeCheck = await storage.assertPackageAllowedAtLocation(
        parsed.data.packageId,
        effectiveLocationId,
      );
      if (!scopeCheck.ok) {
        return sendCartCheckoutError(res, scopeCheck.code, scopeCheck.message);
      }

      const item = await storage.addCartItem(r.cart.id, parsed.data.packageId, parsed.data.offeringId ?? null);

      // Pin the location on the cart so subsequent adds and upsells use the
      // same effective location for filtering/enforcement.
      if (cartLocationId == null && requestedLocationId != null) {
        await storage.setCartLocation(r.cart.id, requestedLocationId);
      }

      res.json(item);
    } catch (e: any) {
      if (e instanceof CartCheckoutError) {
        return sendCartCheckoutError(res, e.code, e.message, e.details);
      }
      res.status(400).json(cartCheckoutErrorBody(
        CartCheckoutErrorCode.INVALID_DATA,
        e?.message || "Failed to add item",
      ));
    }
  });

  app.delete("/api/public/cart/:cartId/items/:itemId", requireApiKey, async (req, res) => {
    try {
      const r = await loadCartForApiKey(req);
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      if (r.cart.status !== "open") return res.status(400).json({ message: "Cart is no longer editable" });
      await storage.removeCartItem(r.cart.id, parseInt(req.params.itemId));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to remove item" });
    }
  });

  app.delete("/api/public/cart/:cartId/items", requireApiKey, async (req, res) => {
    try {
      const r = await loadCartForApiKey(req);
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      if (r.cart.status !== "open") return res.status(400).json({ message: "Cart is no longer editable" });
      await storage.clearCart(r.cart.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  app.get("/api/public/tenant/:slug/packages/:pkgId/offerings", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const offerings = await storage.listOfferingsForPackage(tenant.id, parseInt(req.params.pkgId), { onlyPublished: true });
      if (tenant.showPendingInterest) {
        const pending = await storage.getPendingInterestByOffering(tenant.id);
        // Cap the displayed value so the indicator stays a soft hint and never
        // leaks an exact, manipulative count.
        const CAP = 9;
        res.json(offerings.map(o => ({
          ...o,
          pendingInterestCount: Math.min(pending[o.id] || 0, CAP),
        })));
        return;
      }
      res.json(offerings);
    } catch (e) {
      res.status(500).json({ message: "Failed to list offerings" });
    }
  });

  app.get("/api/public/tenant/:slug/add-ons", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const rawLoc = req.query.locationId;
      let locationFilter: number | undefined = undefined;
      if (rawLoc !== undefined && rawLoc !== "") {
        const s = String(rawLoc);
        if (!/^\d+$/.test(s)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        const parsed = parseInt(s, 10);
        if (!Number.isFinite(parsed)) {
          return res.status(400).json({ message: "Invalid locationId" });
        }
        locationFilter = parsed;
      }
      const rawParent = req.query.parentPackageId;
      let parentFilter: number | undefined = undefined;
      if (rawParent !== undefined && rawParent !== "") {
        const s = String(rawParent);
        if (!/^\d+$/.test(s)) {
          return res.status(400).json({ message: "Invalid parentPackageId" });
        }
        parentFilter = parseInt(s, 10);
      }
      const items = await storage.listAddOnPackages(tenant.id, {
        locationId: locationFilter ?? null,
        parentPackageId: parentFilter ?? null,
      });
      const depsMap = await storage.getUpsellDependenciesMap(tenant.id);
      res.json(items.map((p) => ({
        ...p,
        requiresCohortSelection: p.kind === "COHORT_BASED",
        upsellParentPackageIds: depsMap[p.id] ?? [],
        channels: derivePackageChannels(p),
      })));
    } catch (e) {
      res.status(500).json({ message: "Failed to list add-ons" });
    }
  });

  app.get("/api/public/cart/:cartId/upsells", requireApiKey, async (req, res) => {
    try {
      const r = await loadCartForApiKey(req);
      if (!r.ok) return res.status(r.status).json({ message: r.message });
      const upsells = await storage.listCartUpsells(r.cart.id);
      const depsMap = await storage.getUpsellDependenciesMap(r.cart.tenantId);
      res.json(upsells.map((p) => ({
        ...p,
        requiresCohortSelection: p.kind === "COHORT_BASED",
        upsellParentPackageIds: depsMap[p.id] ?? [],
        channels: derivePackageChannels(p),
      })));
    } catch (e) {
      res.status(500).json({ message: "Failed to load upsells" });
    }
  });

  const cartCheckoutSchema = z.object({
    cartId: z.string().min(1).optional(), // populated by /cart-checkout/start; absent on /headless (server builds the cart)
    provider: z.enum(["STRIPE", "PAYPAL", "CASH"]),
    student: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      dateOfBirth: z.string().optional(),
      parentName: z.string().optional(),
      parentEmail: z.string().optional(),
      parentPhone: z.string().optional(),
    }),
    locationId: z.number().nullable().optional(),
    studentSignature: z.string().optional(),
    receiverSignature: z.string().optional(),
    receiverName: z.string().optional(),
    externalSuccessUrl: z.string().url().optional(),
    externalCancelUrl: z.string().url().optional(),
  });

  // Shared execution path for cart checkout — used by both the cartId-based
  // route and the headless one-shot route.
  async function executeCartCheckoutStart(req: any, res: any, tenant: any, cart: any, data: z.infer<typeof cartCheckoutSchema>) {
    try {
      const { provider, student, externalSuccessUrl, externalCancelUrl } = data;
      if (cart.status !== "open") return sendCartCheckoutError(res, CartCheckoutErrorCode.CART_ALREADY_PROCESSED, "Cart already processed");

      const items = await storage.listCartItems(cart.id);
      if (items.length === 0) return sendCartCheckoutError(res, CartCheckoutErrorCode.CART_EMPTY, "Cart is empty");

      // Resolve effective location: prefer the explicit body value, otherwise
      // fall back to the location pinned on the cart at add-item time. If both
      // are present they must agree — a buyer cannot silently swap the cart's
      // location at checkout to bypass an add-on restriction.
      const cartPinnedLocationId = (cart as any).locationId ?? null;
      const requestedLocationId = data.locationId ?? null;
      if (
        requestedLocationId != null &&
        cartPinnedLocationId != null &&
        requestedLocationId !== cartPinnedLocationId
      ) {
        return sendCartCheckoutError(
          res,
          CartCheckoutErrorCode.CART_LOCATION_MISMATCH,
          "This cart is already associated with a different location.",
        );
      }
      const locationId = requestedLocationId ?? cartPinnedLocationId;
      if (locationId != null) {
        const loc = await storage.getLocation(locationId);
        if (!loc || loc.tenantId !== tenant.id) {
          return sendCartCheckoutError(res, CartCheckoutErrorCode.INVALID_LOCATION, "Invalid location");
        }
      }

      // Re-validate every cart item against the effective location. SPECIFIC_LOCATIONS
      // packages REQUIRE a non-null, allowed locationId — a buyer cannot bypass
      // the restriction by leaving the cart's location empty at checkout.
      for (const item of items) {
        const scopeCheck = await storage.assertPackageAllowedAtLocation(item.packageId, locationId ?? null);
        if (!scopeCheck.ok) {
          return sendCartCheckoutError(res, scopeCheck.code, scopeCheck.message);
        }
      }

      const settings = await storage.getTenantPaymentSettings(tenant.id);
      if (!settings) return sendCartCheckoutError(res, CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED, "Payment not configured");
      if (provider === "STRIPE" && (!settings.stripeEnabled || !settings.stripeSecretKey)) return sendCartCheckoutError(res, CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED, "Stripe not enabled", { provider: "STRIPE" });
      if (provider === "PAYPAL" && (!settings.paypalEnabled || !settings.paypalClientId || !settings.paypalClientSecret)) return sendCartCheckoutError(res, CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED, "PayPal not enabled", { provider: "PAYPAL" });
      if (provider === "CASH" && !settings.cashEnabled) return sendCartCheckoutError(res, CartCheckoutErrorCode.PAYMENT_PROVIDER_NOT_CONFIGURED, "Cash not enabled", { provider: "CASH" });

      const subtotalCents = items.reduce((s, i) => s + (i.priceCents || 0), 0);

      // Service fee surcharge — only added on STRIPE / PAYPAL when the tenant
      // has configured a non-zero rate. CASH never carries the fee. The
      // payment row stores the gross (`amountCents`) plus the fee component
      // (`serviceFeeCents`) so receipts and refunds can split it back out.
      const serviceFeeCents = computeServiceFeeCents(
        subtotalCents,
        settings.serviceFeeBps ?? 0,
        provider,
        settings.serviceFeeFlatCents ?? 0,
      );
      const totalCents = subtotalCents + serviceFeeCents;

      // Persist student/customer details on the cart so activation can create
      // enrollments at capture time atomically with offering bookings. We do
      // NOT create enrollments here — abandoned/failed checkouts must not
      // leave orphan pending_payment enrollments behind.
      await storage.setCartCustomer(cart.id, student, locationId || null);

      const paymentData: InsertPayment = {
        tenantId: tenant.id,
        enrollmentId: null,
        cartId: cart.id,
        provider,
        status: "CREATED",
        amountCents: totalCents,
        serviceFeeCents,
        currency: "USD",
        idempotencyKey: crypto.randomUUID(),
        metadataJson: {
          tenantId: String(tenant.id),
          cartId: cart.id,
          itemCount: String(items.length),
          subtotalCents: String(subtotalCents),
          serviceFeeCents: String(serviceFeeCents),
          serviceFeeBps: String(settings.serviceFeeBps ?? 0),
          serviceFeeFlatCents: String(settings.serviceFeeFlatCents ?? 0),
        },
      };
      if (provider === "CASH") {
        if (data.studentSignature) paymentData.studentSignature = data.studentSignature;
        if (data.receiverSignature) paymentData.receiverSignature = data.receiverSignature;
        if (data.receiverName) paymentData.receiverName = data.receiverName;
      }

      // Embed external redirect URLs on the payment metadata up-front so the
      // payment record is created in one shot and the cart is only frozen
      // after the provider session/order is successfully created.
      if (externalSuccessUrl || externalCancelUrl) {
        paymentData.metadataJson = {
          ...(paymentData.metadataJson as Record<string, string>),
          ...(externalSuccessUrl ? { externalSuccessUrl } : {}),
          ...(externalCancelUrl ? { externalCancelUrl } : {}),
        };
      }

      const payment = await storage.createPayment(paymentData);

      // CASH path: nothing external to fail, safe to freeze cart immediately.
      if (provider === "CASH") {
        await storage.updatePayment(payment.id, { status: "PENDING" });
        await storage.setCartStatus(cart.id, "checkout_pending");
        // Re-fetch the cart so customerSnapshotJson (written by setCartCustomer
        // above) is available to the email function — the in-memory `cart`
        // reference is stale and still has a null customerSnapshotJson.
        const cartForEmail = await storage.getCart(cart.id) ?? cart;
        // Send enrollment-received only after the cart is committed to the
        // checkout_pending state (no provider step to fail for cash).
        fireAndForget(
          () => sendEnrollmentReceivedForCart(tenant, cartForEmail, items, payment),
          `enrollment_received cart-checkout-cash cart=${cart.id}`,
        );
        return res.json({ cashPayment: true, cartId: cart.id, paymentId: payment.id });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const internalSuccess = `${baseUrl}/site/${tenant.slug}/checkout/success?cart=${cart.id}`;
      const internalCancel = `${baseUrl}/site/${tenant.slug}/cart`;
      const successUrl = externalSuccessUrl
        ? `${externalSuccessUrl}${externalSuccessUrl.includes("?") ? "&" : "?"}cart=${cart.id}`
        : internalSuccess;
      const cancelUrl = externalCancelUrl || internalCancel;

      // Try the provider session/order BEFORE freezing the cart, so a
      // provider error leaves the cart editable for retry instead of stuck
      // in checkout_pending.
      let redirectUrl: string;
      try {
        if (provider === "STRIPE") {
          const result = await createStripeCheckoutSession({
            secretKey: settings.stripeSecretKey!,
            amountCents: totalCents,
            currency: "USD",
            description: `${tenant.name} — ${items.length} item(s)`,
            successUrl, cancelUrl,
            metadata: { tenantId: String(tenant.id), cartId: cart.id, paymentId: String(payment.id) },
          });
          await storage.updatePayment(payment.id, { providerOrderId: result.sessionId, status: "PENDING" });
          redirectUrl = result.redirectUrl;
        } else {
          const result = await createPayPalOrder({
            clientId: settings.paypalClientId!,
            clientSecret: settings.paypalClientSecret!,
            mode: settings.paypalMode || "sandbox",
            amountCents: totalCents,
            currency: "USD",
            description: `${tenant.name} — Cart ${cart.id.slice(0, 8)}`,
            returnUrl: `${baseUrl}/api/payments/paypal/return?cartId=${cart.id}&paymentId=${payment.id}`,
            cancelUrl,
            metadata: { tenantId: String(tenant.id), cartId: cart.id, paymentId: String(payment.id) },
          });
          await storage.updatePayment(payment.id, { providerOrderId: result.orderId, status: "PENDING" });
          redirectUrl = result.approvalUrl;
        }
      } catch (providerErr) {
        // Mark the payment FAILED so it can't be reused; cart stays open
        // and the buyer can retry without manual unfreeze.
        await storage.updatePayment(payment.id, { status: "FAILED" }).catch(() => {});
        throw providerErr;
      }

      // Provider session created: now safe to freeze the cart.
      await storage.setCartStatus(cart.id, "checkout_pending");

      // No enrollment-received email is sent for Stripe/PayPal cart checkouts.
      // The payment has not been captured yet; the only student email is the
      // "Payment Received" receipt sent once activateCart() runs after capture.
      // The CASH path does send one at this stage (see above).

      res.json({
        redirectUrl,
        cartId: cart.id,
        paymentId: payment.id,
        subtotalCents,
        serviceFeeCents,
        serviceFeeBps: settings.serviceFeeBps ?? 0,
        serviceFeeFlatCents: settings.serviceFeeFlatCents ?? 0,
        totalCents,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start cart checkout";
      console.error("Cart checkout start error:", e);
      res.status(500).json({ message: msg });
    }
  }

  app.post("/api/public/tenant/:slug/cart-checkout/start", requireApiKey, async (req, res) => {
    const tenant = await storage.getTenantBySlug(req.params.slug);
    if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });

    const parsed = cartCheckoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(cartCheckoutErrorBody(
      CartCheckoutErrorCode.INVALID_DATA,
      "Invalid data",
      { errors: parsed.error.errors },
    ));

    const cartId = req.body.cartId as string;
    if (!cartId) return sendCartCheckoutError(res, CartCheckoutErrorCode.CART_ID_REQUIRED, "cartId required");
    const cart = await storage.getCart(cartId);
    if (!cart || cart.tenantId !== tenant.id) return res.status(404).json({ message: "Cart not found" });
    if (req.apiKeyTenantId && req.apiKeyTenantId !== cart.tenantId) {
      return res.status(403).json({ message: "Cart does not belong to this school" });
    }
    return executeCartCheckoutStart(req, res, tenant, cart, parsed.data);
  });

  // Headless one-shot cart checkout: build the cart server-side from a
  // payload of {packageId, offeringId?} lines and start a single payment in
  // a single API call. Designed for embedded/external sites.
  const headlessCartCheckoutSchema = cartCheckoutSchema.extend({
    items: z.array(z.object({
      packageId: z.number(),
      offeringId: z.number().nullable().optional(),
    })).min(1),
  });

  app.post("/api/public/tenant/:slug/cart-checkout/headless", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });

      const parsed = headlessCartCheckoutSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(cartCheckoutErrorBody(
        CartCheckoutErrorCode.INVALID_DATA,
        "Invalid data",
        { errors: parsed.error.errors },
      ));

      const cart = await storage.createCart(tenant.id);
      try {
        for (const it of parsed.data.items) {
          await storage.addCartItem(cart.id, it.packageId, it.offeringId ?? null);
        }
      } catch (e: any) {
        if (e instanceof CartCheckoutError) {
          return sendCartCheckoutError(res, e.code, e.message, e.details);
        }
        return res.status(400).json(cartCheckoutErrorBody(
          CartCheckoutErrorCode.INVALID_DATA,
          e?.message || "Failed to build cart",
        ));
      }

      const { items: _ignored, ...checkoutData } = parsed.data;
      return executeCartCheckoutStart(req, res, tenant, cart, checkoutData);
    } catch (e: any) {
      console.error("Headless cart checkout error:", e);
      res.status(500).json({ message: e?.message || "Failed to start headless cart checkout" });
    }
  });

  // Admin: promote a waitlist entry by the enrollment that owns it. This is
  // unambiguous (tied to a specific enrollment row) — preferred over the
  // by-email lookup which could be ambiguous if duplicates exist.
  app.post("/api/tenants/:tenantId/enrollments/:enrollmentId/promote-waitlist", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.enrollmentId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const enr = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (!enr) return res.status(404).json({ message: "Enrollment not found" });
      if (!enr.isWaitlisted || !enr.offeringId) return res.status(400).json({ message: "Enrollment is not waitlisted" });
      // Prefer the deterministic enrollmentId linkage; fall back to email
      // for legacy waitlist rows created before that column existed.
      const wl = await storage.getOfferingWaitlist(enr.offeringId, tenantId);
      const entry = wl.find((w: any) => w.enrollmentId === enr.id) || wl.find((w: any) => w.email === enr.email);
      if (!entry) return res.status(404).json({ message: "Waitlist entry not found" });
      const result = await storage.promoteWaitlistEntry(entry.id, tenantId);
      if (!result.ok) return res.status(400).json({ message: result.reason });
      res.json(result);
    } catch (e) {
      console.error("Promote waitlist by enrollment error:", e);
      res.status(500).json({ message: "Failed to promote" });
    }
  });

  // Admin: promote a waitlist entry into a confirmed booking
  app.post("/api/tenants/:tenantId/offering-waitlist/:id/promote", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await storage.promoteWaitlistEntry(parseInt(req.params.id), tenantId);
      if (!result.ok) return res.status(400).json({ message: result.reason });
      res.json(result);
    } catch (e) {
      console.error("Promote waitlist error:", e);
      res.status(500).json({ message: "Failed to promote" });
    }
  });

  // ===== ONLINE COURSE CHECKOUT =====

  const onlineCourseCheckoutSchema = z.object({
    provider: z.enum(["STRIPE", "PAYPAL", "CASH"]),
    onlineCourseId: z.number(),
    locationId: z.number().int().positive().optional(),
    student: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
    }),
    externalSuccessUrl: z.string().url().optional(),
    externalCancelUrl: z.string().url().optional(),
  });

  app.post("/api/public/tenant/:slug/online-course-checkout/start", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }

      const parsed = onlineCourseCheckoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const { provider, onlineCourseId, student, externalSuccessUrl, externalCancelUrl, locationId } = parsed.data;

      const course = await storage.getOnlineCourse(onlineCourseId);
      if (!course || course.tenantId !== tenant.id || !course.active) {
        return res.status(400).json({ message: "Invalid online course" });
      }

      // Validate that, if provided, the location belongs to this tenant.
      let resolvedLocationId: number | null = null;
      if (locationId != null) {
        const loc = await storage.getLocation(locationId);
        if (!loc || loc.tenantId !== tenant.id) {
          return res.status(400).json({ message: "Invalid location" });
        }
        resolvedLocationId = locationId;
      }

      // Enforce location-scope guard for SPECIFIC_LOCATIONS courses.
      const guard = await storage.assertOnlineCourseAllowedAtLocation(course.id, resolvedLocationId);
      if (!guard.ok) {
        return res.status(400).json({ message: guard.message });
      }

      const settings = await storage.getTenantPaymentSettings(tenant.id);
      if (!settings) {
        return res.status(400).json({ message: "Payment not configured for this school" });
      }

      if (provider === "STRIPE" && (!settings.stripeEnabled || !settings.stripeSecretKey)) {
        return res.status(400).json({ message: "Stripe is not enabled for this school" });
      }
      if (provider === "PAYPAL" && (!settings.paypalEnabled || !settings.paypalClientId || !settings.paypalClientSecret)) {
        return res.status(400).json({ message: "PayPal is not enabled for this school" });
      }
      if (provider === "CASH" && !settings.cashEnabled) {
        return res.status(400).json({ message: "Cash payments are not enabled for this school" });
      }

      // Service fee surcharge — STRIPE / PAYPAL only, when the tenant has set
      // a non-zero rate. CASH never carries the fee. Subtotal stays on the
      // enrollment; the gross paid amount lives on the payment row.
      const subtotalCents = course.price;
      const serviceFeeCents = computeServiceFeeCents(
        subtotalCents,
        settings.serviceFeeBps ?? 0,
        provider,
        settings.serviceFeeFlatCents ?? 0,
      );
      const grossAmountCents = subtotalCents + serviceFeeCents;

      const enrollment = await storage.createEnrollment({
        tenantId: tenant.id,
        packageId: null,
        onlineCourseId: course.id,
        locationId: resolvedLocationId,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone || null,
        status: "pending_payment",
        priceSnapshotCents: subtotalCents,
        currencySnapshot: "USD",
        packageSnapshotJson: {
          name: course.name,
          price: subtotalCents,
          onlineCourseId: course.id,
          providerName: course.providerName,
          providerUrl: course.providerUrl,
          isOnlineCourse: true,
        },
        amountPaid: 0,
        notes: `Online Course: ${course.name}${course.providerName ? ` (${course.providerName})` : ""}`,
      });

      const paymentData: any = {
        tenantId: tenant.id,
        enrollmentId: enrollment.id,
        provider,
        status: "CREATED",
        amountCents: grossAmountCents,
        serviceFeeCents,
        currency: "USD",
        idempotencyKey: crypto.randomUUID(),
        metadataJson: {
          tenantId: String(tenant.id),
          enrollmentId: String(enrollment.id),
          onlineCourseId: String(course.id),
          onlineCourseName: course.name,
          isOnlineCourse: "true",
          subtotalCents: String(subtotalCents),
          serviceFeeCents: String(serviceFeeCents),
          serviceFeeBps: String(settings.serviceFeeBps ?? 0),
          serviceFeeFlatCents: String(settings.serviceFeeFlatCents ?? 0),
          ...(externalSuccessUrl ? { externalSuccessUrl } : {}),
          ...(externalCancelUrl ? { externalCancelUrl } : {}),
        },
      };

      const payment = await storage.createPayment(paymentData);

      fireAndForget(
        () => sendEnrollmentReceived(enrollment, tenant, payment),
        `enrollment_received online-course #${enrollment.id}`,
      );
      fireAndForget(
        () => sendAdminEnrollmentNotification(enrollment.id, tenant.id),
        `admin_enrollment_notification online-course #${enrollment.id}`,
      );

      if (provider === "CASH") {
        await storage.updatePayment(payment.id, { status: "PENDING" } as any);
        return res.json({ cashPayment: true, enrollmentId: enrollment.id, paymentId: payment.id });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const successUrl = externalSuccessUrl
        ? `${externalSuccessUrl}${externalSuccessUrl.includes("?") ? "&" : "?"}enrollment=${enrollment.id}`
        : `${baseUrl}/site/${tenant.slug}/checkout/success?enrollment=${enrollment.id}`;
      const cancelUrl = externalCancelUrl || `${baseUrl}/site/${tenant.slug}/enroll?cancelled=true`;

      let redirectUrl: string;

      try {
        if (provider === "STRIPE") {
          const result = await createStripeCheckoutSession({
            secretKey: settings.stripeSecretKey!,
            amountCents: grossAmountCents,
            currency: "USD",
            description: `${course.name} - ${tenant.name}`,
            successUrl,
            cancelUrl,
            metadata: {
              tenantId: String(tenant.id),
              enrollmentId: String(enrollment.id),
              paymentId: String(payment.id),
              onlineCourseId: String(course.id),
            },
          });

          await storage.updatePayment(payment.id, {
            providerOrderId: result.sessionId,
            status: "PENDING",
          } as any);

          redirectUrl = result.redirectUrl;
        } else {
          const result = await createPayPalOrder({
            clientId: settings.paypalClientId!,
            clientSecret: settings.paypalClientSecret!,
            mode: settings.paypalMode || "sandbox",
            amountCents: grossAmountCents,
            currency: "USD",
            description: `${course.name} - ${tenant.name}`,
            returnUrl: `${baseUrl}/api/payments/paypal/return?enrollmentId=${enrollment.id}`,
            cancelUrl,
            metadata: {
              tenantId: String(tenant.id),
              enrollmentId: String(enrollment.id),
              paymentId: String(payment.id),
              onlineCourseId: String(course.id),
            },
          });

          await storage.updatePayment(payment.id, {
            providerOrderId: result.orderId,
            status: "PENDING",
          } as any);

          redirectUrl = result.approvalUrl;
        }
      } catch (providerError) {
        console.error(
          `Online course checkout: ${provider} provider call failed for enrollment #${enrollment.id}:`,
          providerError,
        );
        // Best-effort cleanup so the school's dashboard doesn't accumulate
        // orphan pending_payment enrollments and CREATED payment rows when
        // Stripe/PayPal are down. Both updates are wrapped so a secondary
        // DB hiccup can't mask the original provider failure.
        try {
          await storage.updatePayment(payment.id, { status: "FAILED" } as any);
        } catch (cleanupErr) {
          console.error(
            `Online course checkout: failed to mark payment #${payment.id} as FAILED after provider error:`,
            cleanupErr,
          );
        }
        try {
          await storage.updateEnrollment(enrollment.id, tenant.id, { status: "cancelled" } as any);
        } catch (cleanupErr) {
          console.error(
            `Online course checkout: failed to mark enrollment #${enrollment.id} as cancelled after provider error:`,
            cleanupErr,
          );
        }
        return res.status(502).json({
          message: "Payment provider is currently unavailable. Please try again in a moment.",
          provider,
        });
      }

      res.json({ redirectUrl, enrollmentId: enrollment.id, paymentId: payment.id });
    } catch (error) {
      console.error("Online course checkout start error:", error);
      res.status(500).json({ message: "Failed to start online course checkout" });
    }
  });

  // ===== STRIPE WEBHOOK =====

  app.post("/api/webhooks/stripe", async (req: any, res) => {
    try {
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        return res.status(400).json({ message: "Missing Stripe signature" });
      }

      const rawBody = req.rawBody || req.body;
      if (!rawBody) {
        return res.status(400).json({ message: "Missing request body" });
      }

      const bodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
      const parsed = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;

      if (parsed.type !== "checkout.session.completed") {
        return res.json({ received: true });
      }

      const session = parsed.data?.object;
      const paymentId = parseInt(session?.metadata?.paymentId);
      const enrollmentId = parseInt(session?.metadata?.enrollmentId);
      const cartId = session?.metadata?.cartId as string | undefined;

      if (!paymentId || (!enrollmentId && !cartId)) {
        console.error("Stripe webhook missing metadata");
        return res.status(400).json({ message: "Missing metadata" });
      }

      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      if (payment.status === "COMPLETED") {
        return res.json({ received: true, alreadyProcessed: true });
      }

      const tenantSettings = await storage.getTenantPaymentSettings(payment.tenantId);
      if (tenantSettings?.stripeWebhookSecret) {
        try {
          await verifyStripeWebhook(bodyStr, signature, tenantSettings.stripeWebhookSecret);
        } catch (err) {
          console.error("Stripe webhook signature verification failed:", err);
          return res.status(400).json({ message: "Invalid signature" });
        }
      }

      await storage.updatePayment(paymentId, {
        status: "COMPLETED",
        providerPaymentId: session?.payment_intent || null,
        rawProviderJson: session,
        completedAt: new Date(),
      } as any);

      if (payment.cartId) {
        const r = await activateCart(payment.id);
        if (!r.ok) console.error("Cart activation errors:", r.errors);
      } else {
        const result = await activateEnrollment(enrollmentId, paymentId);
        if (!result.ok) console.error("Enrollment activation failed:", result.error);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook error:", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // ===== PAYPAL CAPTURE =====

  app.get("/api/payments/paypal/return", async (req, res) => {
    try {
      const { enrollmentId, token, cartId, paymentId } = req.query as Record<string, string | undefined>;
      const eId = enrollmentId ? parseInt(enrollmentId) : 0;
      const pId = paymentId ? parseInt(paymentId) : 0;

      let payment: any = null;
      if (pId) {
        payment = await storage.getPayment(pId);
        if (payment && (payment.provider !== "PAYPAL" || payment.status !== "PENDING")) {
          payment = null;
        }
      }
      if (!payment && token) {
        const byOrder = await storage.getPaymentByProviderOrderId("PAYPAL", String(token));
        if (byOrder && byOrder.status === "PENDING") {
          payment = byOrder;
        }
      }
      if (!payment && eId) {
        const paymentsList = await storage.getPaymentsByEnrollment(eId);
        payment = paymentsList.find((p) => p.provider === "PAYPAL" && p.status === "PENDING") || null;
      }

      if (!payment) {
        if (cartId) {
          const cart = await storage.getCart(String(cartId));
          if (cart) {
            const tenant = await storage.getTenant(cart.tenantId);
            return res.redirect(`/site/${tenant?.slug}/checkout/success?cart=${cartId}`);
          }
        }
        if (eId) {
          const enrollment = await findEnrollmentDirectly(eId);
          if (enrollment) {
            const tenant = await storage.getTenant(enrollment.tenantId);
            return res.redirect(`/site/${tenant?.slug}/checkout/success?enrollment=${eId}`);
          }
        }
        return res.redirect("/");
      }

      const tenantSettings = await storage.getTenantPaymentSettings(payment.tenantId);
      if (!tenantSettings?.paypalClientId || !tenantSettings?.paypalClientSecret) {
        return res.status(400).json({ message: "PayPal not configured" });
      }

      const orderId = payment.providerOrderId || (token as string);
      const captureResult = await capturePayPalOrder(
        tenantSettings.paypalClientId,
        tenantSettings.paypalClientSecret,
        tenantSettings.paypalMode || "sandbox",
        orderId
      );

      if (!captureResult.ok) {
        console.error("PayPal capture failed:", captureResult.error);
        const tenant = await storage.getTenant(payment.tenantId);
        return res.redirect(`/site/${tenant?.slug}/enroll?error=payment_failed`);
      }

      if (captureResult.amountCents && captureResult.amountCents !== payment.amountCents) {
        console.error("PayPal amount mismatch:", captureResult.amountCents, "vs", payment.amountCents);
      }

      await storage.updatePayment(payment.id, {
        status: "COMPLETED",
        providerPaymentId: captureResult.captureId || null,
        rawProviderJson: captureResult.raw,
        completedAt: new Date(),
      } as any);

      if (payment.cartId) {
        const r = await activateCart(payment.id);
        if (!r.ok) console.error("Cart activation errors:", r.errors);
      } else {
        const result = await activateEnrollment(eId, payment.id);
        if (!result.ok) console.error("Enrollment activation failed:", result.error);
      }

      const meta = payment.metadataJson as any;
      const tenant = await storage.getTenant(payment.tenantId);
      if (payment.cartId) {
        if (meta?.externalSuccessUrl) {
          const extUrl = meta.externalSuccessUrl;
          res.redirect(`${extUrl}${extUrl.includes("?") ? "&" : "?"}cart=${payment.cartId}`);
        } else {
          res.redirect(`/site/${tenant?.slug}/checkout/success?cart=${payment.cartId}`);
        }
      } else if (meta?.externalSuccessUrl) {
        const extUrl = meta.externalSuccessUrl;
        res.redirect(`${extUrl}${extUrl.includes("?") ? "&" : "?"}enrollment=${eId}`);
      } else {
        res.redirect(`/site/${tenant?.slug}/checkout/success?enrollment=${eId}`);
      }
    } catch (error) {
      console.error("PayPal return error:", error);
      res.redirect("/");
    }
  });

  app.post("/api/payments/paypal/capture", async (req, res) => {
    try {
      const { orderId } = req.body;
      if (!orderId) {
        return res.status(400).json({ message: "orderId required" });
      }

      const payment = await storage.getPaymentByProviderOrderId("PAYPAL", orderId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      if (payment.status === "COMPLETED") {
        return res.json({ ok: true, enrollmentId: payment.enrollmentId, status: "ACTIVE", alreadyProcessed: true });
      }

      const tenantSettings = await storage.getTenantPaymentSettings(payment.tenantId);
      if (!tenantSettings?.paypalClientId || !tenantSettings?.paypalClientSecret) {
        return res.status(400).json({ message: "PayPal not configured" });
      }

      const captureResult = await capturePayPalOrder(
        tenantSettings.paypalClientId,
        tenantSettings.paypalClientSecret,
        tenantSettings.paypalMode || "sandbox",
        orderId
      );

      if (!captureResult.ok) {
        return res.status(400).json({ message: captureResult.error || "Capture failed" });
      }

      await storage.updatePayment(payment.id, {
        status: "COMPLETED",
        providerPaymentId: captureResult.captureId || null,
        rawProviderJson: captureResult.raw,
        completedAt: new Date(),
      } as any);

      if (payment.cartId) {
        const r = await activateCart(payment.id);
        return res.json({ ok: r.ok, cartId: payment.cartId, enrollmentIds: r.enrollmentIds, errors: r.errors });
      }
      const result = await activateEnrollment(payment.enrollmentId!, payment.id);
      res.json({ ok: true, enrollmentId: payment.enrollmentId, status: result.ok ? "ACTIVE" : "ERROR" });
    } catch (error) {
      console.error("PayPal capture error:", error);
      res.status(500).json({ message: "Capture failed" });
    }
  });

  // ===== ENROLLMENT STATUS (PUBLIC) =====

  app.get("/api/public/enrollments/:id/status", requireApiKey, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

      const enrollment = await findEnrollmentDirectly(id);
      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }

      const paymentsList = await storage.getPaymentsByEnrollment(id);
      const latestPayment = paymentsList[0];

      res.json({
        id: enrollment.id,
        status: enrollment.status,
        firstName: enrollment.firstName,
        lastName: enrollment.lastName,
        packageSnapshot: enrollment.packageSnapshotJson,
        priceSnapshotCents: enrollment.priceSnapshotCents,
        activatedAt: enrollment.activatedAt,
        payment: latestPayment ? {
          provider: latestPayment.provider,
          status: latestPayment.status,
          amountCents: latestPayment.amountCents,
          currency: latestPayment.currency,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch enrollment status" });
    }
  });

  // ===== ADMIN PAYMENTS ROUTES =====

  app.get("/api/tenants/:tenantId/payments", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const filters: any = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.provider) filters.provider = req.query.provider;
      const paymentsList = await storage.getPaymentsByTenant(tenantId, filters);
      res.json(paymentsList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get("/api/tenants/:tenantId/enrollments/:id/payments", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const paymentsList = await storage.getPaymentsByEnrollment(enrollmentId);
      res.json(paymentsList);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  // Returns the full purchase record for one enrollment: the enrollment row,
  // the package + location at purchase time, the originating cart's customer
  // snapshot (when applicable), the linked online course (when applicable),
  // and the list of payment attempts. Used by the admin "Purchase details"
  // panel to render every field the buyer submitted at checkout in one view.
  app.get("/api/tenants/:tenantId/enrollments/:id/details", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });

      const [pkg, location, paymentsList, onlineCourse, cart] = await Promise.all([
        enrollment.packageId ? storage.getPackage(enrollment.packageId) : Promise.resolve(undefined),
        enrollment.locationId ? storage.getLocation(enrollment.locationId) : Promise.resolve(undefined),
        storage.getPaymentsByEnrollment(enrollmentId),
        enrollment.onlineCourseId ? storage.getOnlineCourse(enrollment.onlineCourseId) : Promise.resolve(undefined),
        enrollment.cartId ? storage.getCart(enrollment.cartId) : Promise.resolve(undefined),
      ]);

      res.json({
        enrollment,
        package: pkg ?? null,
        location: location ?? null,
        onlineCourse: onlineCourse ?? null,
        cartCustomerSnapshot: cart?.customerSnapshotJson ?? null,
        cartId: enrollment.cartId ?? null,
        payments: paymentsList,
      });
    } catch (error) {
      console.error("Failed to fetch enrollment details:", error);
      res.status(500).json({ message: "Failed to fetch enrollment details" });
    }
  });

  // Fetches a tenant logo for embedding in a generated PDF.
  // SSRF hardening: tenant.logoUrl is admin-editable free text, so we only
  // honour https URLs whose hostname matches a small allowlist of known
  // public storage hosts. Anything else (private IPs, localhost, metadata
  // endpoints, custom hosts) is silently ignored — the PDF still renders
  // without a logo.
  async function fetchTenantLogoForPdf(rawUrl: string | null | undefined): Promise<Buffer | null> {
    if (!rawUrl) return null;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== "443") return null;
    const host = parsed.hostname.toLowerCase();
    const ALLOWED_LOGO_HOSTS = [
      "storage.googleapis.com",
      "replit.com",
      "objectstorage.replit.com",
    ];
    const allowed = ALLOWED_LOGO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    if (!allowed) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const resp = await fetch(parsed.toString(), {
        signal: ctrl.signal,
        redirect: "error",
      }).finally(() => clearTimeout(timer));
      if (!resp.ok) return null;
      const ct = resp.headers.get("content-type") || "";
      if (!/^image\//i.test(ct)) return null;
      const MAX_BYTES = 2 * 1024 * 1024;
      const lenHeader = resp.headers.get("content-length");
      if (lenHeader && Number(lenHeader) > MAX_BYTES) return null;
      const arr = await resp.arrayBuffer();
      if (arr.byteLength > MAX_BYTES) return null;
      return Buffer.from(arr);
    } catch {
      return null;
    }
  }

  app.get("/api/tenants/:tenantId/enrollments/:id/details.pdf", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });

      const [tenant, pkg, location, paymentsList, onlineCourse, cart] = await Promise.all([
        storage.getTenant(tenantId),
        enrollment.packageId ? storage.getPackage(enrollment.packageId) : Promise.resolve(undefined),
        enrollment.locationId ? storage.getLocation(enrollment.locationId) : Promise.resolve(undefined),
        storage.getPaymentsByEnrollment(enrollmentId),
        enrollment.onlineCourseId ? storage.getOnlineCourse(enrollment.onlineCourseId) : Promise.resolve(undefined),
        enrollment.cartId ? storage.getCart(enrollment.cartId) : Promise.resolve(undefined),
      ]);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const logoBuffer = await fetchTenantLogoForPdf(tenant.logoUrl);

      const pdfEnrollment: PdfEnrollment = {
        id: enrollment.id,
        firstName: enrollment.firstName ?? null,
        lastName: enrollment.lastName ?? null,
        email: enrollment.email ?? null,
        phone: enrollment.phone ?? null,
        dateOfBirth: enrollment.dateOfBirth ?? null,
        parentName: enrollment.parentName ?? null,
        parentEmail: enrollment.parentEmail ?? null,
        parentPhone: enrollment.parentPhone ?? null,
        notes: enrollment.notes ?? null,
        createdAt: enrollment.createdAt ?? null,
        updatedAt: enrollment.updatedAt ?? null,
        activatedAt: enrollment.activatedAt ?? null,
        confirmationEmailSentAt: enrollment.confirmationEmailSentAt ?? null,
        paymentReceivedEmailSentAt: enrollment.paymentReceivedEmailSentAt ?? null,
        priceSnapshotCents: enrollment.priceSnapshotCents ?? null,
        currencySnapshot: enrollment.currencySnapshot ?? null,
        packageSnapshotJson:
          (enrollment.packageSnapshotJson as PdfPackageSnapshot | null | undefined) ?? null,
      };

      const pdfPayments: PdfPayment[] = paymentsList.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amountCents: p.amountCents,
        currency: p.currency ?? null,
        providerPaymentId: p.providerPaymentId ?? null,
        createdAt: p.createdAt ?? new Date(0),
        completedAt: p.completedAt ?? null,
        receiverName: p.receiverName ?? null,
      }));

      const cartCustomerSnapshot =
        (cart?.customerSnapshotJson as PdfCartCustomerSnapshot | null | undefined) ?? null;

      const pdf = await generateEnrollmentPurchasePDF({
        tenant: { name: tenant.name, logoUrl: tenant.logoUrl },
        logoBuffer,
        enrollment: pdfEnrollment,
        package: pkg ? { name: pkg.name, creditClassroom: pkg.creditClassroom, creditDrive: pkg.creditDrive } : null,
        location: location ? { name: location.name } : null,
        onlineCourse: onlineCourse
          ? {
              name: onlineCourse.name,
              providerName: onlineCourse.providerName ?? null,
              providerUrl: onlineCourse.providerUrl ?? null,
            }
          : null,
        cartCustomerSnapshot,
        cartId: enrollment.cartId ?? null,
        payments: pdfPayments,
      });

      const safeName = `${enrollment.lastName || ""}-${enrollment.firstName || ""}`
        .replace(/[^a-zA-Z0-9-]+/g, "_")
        .replace(/^_+|_+$/g, "") || `enrollment-${enrollmentId}`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="purchase-${enrollmentId}-${safeName}.pdf"`,
      );
      res.send(pdf);
    } catch (error) {
      console.error("Failed to generate enrollment PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  app.get("/api/tenants/:tenantId/enrollments/:id/credits", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const credits = await storage.getCreditsByEnrollment(enrollmentId);
      res.json(credits);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch credits" });
    }
  });

  app.post("/api/tenants/:tenantId/enrollments/:id/refund", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const enrollmentId = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
      if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });

      await storage.updateEnrollment(enrollmentId, tenantId, { status: "refunded" } as any);

      const paymentsList = await storage.getPaymentsByEnrollment(enrollmentId);
      for (const p of paymentsList) {
        if (p.status === "COMPLETED") {
          await storage.updatePayment(p.id, { status: "REFUNDED" } as any);
        }
      }

      const credits = await storage.getCreditsByEnrollment(enrollmentId);
      const reversals: any[] = [];
      for (const c of credits) {
        if (c.reason === "PACKAGE_GRANT" && c.delta > 0) {
          reversals.push({
            tenantId,
            enrollmentId,
            type: c.type,
            delta: -c.delta,
            reason: "REFUND_REVERSAL" as const,
            refId: `refund-${enrollmentId}`,
          });
        }
      }
      if (reversals.length > 0) {
        await storage.createCreditLedgerEntries(reversals);
      }

      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "ENROLLMENT_REFUNDED",
        targetType: "ENROLLMENT",
        targetId: enrollmentId,
        details: { reason: req.body.reason || "Admin refund" },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Refund error:", error);
      res.status(500).json({ message: "Failed to process refund" });
    }
  });

  // ===== CASH PAYMENT CONFIRMATION (admin) =====
  // Marks a PENDING CASH payment as COMPLETED and runs the right activation
  // path (single enrollment OR full cart). Idempotent.
  app.post("/api/tenants/:tenantId/payments/:paymentId/confirm-cash", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const paymentId = parseInt(req.params.paymentId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const payment = await storage.getPayment(paymentId);
      if (!payment || payment.tenantId !== tenantId) {
        return res.status(404).json({ message: "Payment not found" });
      }
      if (payment.provider !== "CASH") {
        return res.status(400).json({ message: "Only cash payments can be confirmed this way" });
      }
      if (payment.status === "COMPLETED") {
        return res.json({ ok: true, alreadyCompleted: true });
      }
      if (payment.status !== "PENDING") {
        return res.status(400).json({ message: `Cannot confirm a ${payment.status} payment` });
      }

      await storage.updatePayment(paymentId, {
        status: "COMPLETED",
        completedAt: new Date(),
      } as any);

      let activation: any;
      if (payment.cartId) {
        activation = await activateCart(payment.id);
      } else if (payment.enrollmentId) {
        activation = await activateEnrollment(payment.enrollmentId, payment.id);
      }

      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "payment.confirm_cash",
        targetType: "PAYMENT",
        targetId: paymentId,
        details: { cartId: payment.cartId || null, enrollmentId: payment.enrollmentId || null },
      });

      res.json({ ok: true, activation });
    } catch (error) {
      console.error("Confirm cash payment error:", error);
      res.status(500).json({ message: "Failed to confirm cash payment" });
    }
  });

  // ===== CASH PAYMENT CANCELLATION (admin) =====
  // Marks a PENDING CASH payment as CANCELLED and cancels its enrollment(s).
  // Idempotent: re-calling on a non-PENDING payment returns 400.
  app.post("/api/tenants/:tenantId/payments/:paymentId/cancel-cash", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const paymentId = parseInt(req.params.paymentId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const payment = await storage.getPayment(paymentId);
      if (!payment || payment.tenantId !== tenantId) {
        return res.status(404).json({ message: "Payment not found" });
      }
      if (payment.provider !== "CASH") {
        return res.status(400).json({ message: "Only cash payments can be cancelled this way" });
      }
      if (payment.status !== "PENDING") {
        return res.status(400).json({ message: `Cannot cancel a ${payment.status} payment` });
      }
      const result = await storage.cancelCashPayment(paymentId, tenantId);
      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "payment.cancel_cash",
          targetType: "PAYMENT",
          targetId: paymentId,
          details: {
            cartId: payment.cartId || null,
            enrollmentId: payment.enrollmentId || null,
            cancelledEnrollmentIds: result.enrollmentIds,
            reason: req.body?.reason || null,
          },
        });
      } catch {}
      res.json({ ok: result.ok, cancelledEnrollmentIds: result.enrollmentIds });
    } catch (error) {
      console.error("Cancel cash payment error:", error);
      res.status(500).json({ message: "Failed to cancel cash payment" });
    }
  });

  // Resends the "Enrollment Received" confirmation email for a cart-based CASH
  // payment. Useful when the email was missed at checkout (e.g. the original
  // bug where customerSnapshotJson was stale). Idempotent — does not block if
  // the email was already sent; Resend deduplication handles any true dups.
  app.post("/api/tenants/:tenantId/payments/:paymentId/resend-enrollment-received-email", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const paymentId = parseInt(req.params.paymentId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const payment = await storage.getPayment(paymentId);
      if (!payment || payment.tenantId !== tenantId) {
        return res.status(404).json({ message: "Payment not found" });
      }
      if (payment.provider !== "CASH") {
        return res.status(400).json({ message: "Only CASH payments support resending the enrollment confirmation" });
      }
      if (!payment.cartId) {
        return res.status(400).json({ message: "This payment is not cart-based" });
      }
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const cart = await storage.getCart(payment.cartId);
      if (!cart) return res.status(404).json({ message: "Cart not found" });
      const items = await storage.listCartItems(payment.cartId);
      await sendEnrollmentReceivedForCart(tenant, cart, items, payment);
      res.json({ ok: true });
    } catch (error) {
      console.error("Resend enrollment received email error:", error);
      res.status(500).json({ message: "Failed to resend enrollment confirmation email" });
    }
  });

  // ===== PENDING CASH / ABANDONED CARTS (admin) =====

  app.get("/api/tenants/:tenantId/pending-cash-payments/count", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const count = await storage.countPendingCashPayments(tenantId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pending cash count" });
    }
  });

  app.get("/api/tenants/:tenantId/pending-cash-payments", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const list = await storage.listPendingCashPayments(tenantId);
      const stages = await storage.getCartReminderStagesByTenant(tenantId);
      const unsubs = await storage.getUnsubscribedEmailsForTenant(tenantId);
      res.json(list.map(p => {
        const slot = stages.byPaymentId.get(p.id);
        const email = ((p.enrollment?.email || (p.cartCustomer as any)?.email) || "").trim().toLowerCase();
        const suppressionReason = email ? (unsubs.get(email) ?? null) : null;
        return {
          ...p,
          lastReminderAt: slot?.lastSentAt ?? null,
          remindersSent: slot?.stagesSent.length ?? 0,
          unsubscribed: email ? unsubs.has(email) : false,
          suppressionReason,
          reminderOpens: slot?.totalOpens ?? 0,
          reminderClicks: slot?.totalClicks ?? 0,
          reminderHasOpened: !!slot?.hasOpened,
          reminderHasClicked: !!slot?.hasClicked,
          reminderRecoveredAt: slot?.recoveredAt ?? null,
        };
      }));
    } catch (error) {
      console.error("List pending cash payments error:", error);
      res.status(500).json({ message: "Failed to fetch pending cash payments" });
    }
  });

  app.get("/api/tenants/:tenantId/abandoned-carts", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const list = await storage.listAbandonedCarts(tenantId);
      const stages = await storage.getCartReminderStagesByTenant(tenantId);
      const unsubs = await storage.getUnsubscribedEmailsForTenant(tenantId);
      res.json(list.map(c => {
        const slot = stages.byCartId.get(c.id);
        const email = (((c.customerSnapshotJson as any)?.email) || "").trim().toLowerCase();
        const suppressionReason = email ? (unsubs.get(email) ?? null) : null;
        return {
          ...c,
          lastReminderAt: slot?.lastSentAt ?? null,
          remindersSent: slot?.stagesSent.length ?? 0,
          unsubscribed: email ? unsubs.has(email) : false,
          suppressionReason,
          reminderOpens: slot?.totalOpens ?? 0,
          reminderClicks: slot?.totalClicks ?? 0,
          reminderHasOpened: !!slot?.hasOpened,
          reminderHasClicked: !!slot?.hasClicked,
          reminderRecoveredAt: slot?.recoveredAt ?? null,
        };
      }));
    } catch (error) {
      console.error("List abandoned carts error:", error);
      res.status(500).json({ message: "Failed to fetch abandoned carts" });
    }
  });

  // Admin enrollment notification settings (per-tenant toggle).
  app.get("/api/tenants/:tenantId/admin-enrollment-notifications/settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json({ enabled: tenant.adminEnrollmentNotificationsEnabled !== false });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch("/api/tenants/:tenantId/admin-enrollment-notifications/settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      if (!(await requireAdminMember(req, tenantId, res))) return;
      const schema = z.object({ enabled: z.boolean() });
      const parsed = schema.parse(req.body || {});
      const updated = await storage.updateTenant(tenantId, {
        adminEnrollmentNotificationsEnabled: parsed.enabled,
      } as any);
      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "admin_enrollment_notifications.settings_updated",
          targetType: "TENANT",
          targetId: tenantId,
          details: parsed,
        });
      } catch {}
      res.json({ enabled: updated?.adminEnrollmentNotificationsEnabled !== false });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: error.errors });
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Cart reminder settings + manual run
  app.get("/api/tenants/:tenantId/cart-reminders/settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json({
        enabled: !!tenant.cartReminderEnabled,
        hoursStage1: tenant.cartReminderHoursStage1 ?? CART_REMINDER_DEFAULT_STAGE1,
        hoursStage2: tenant.cartReminderHoursStage2 ?? CART_REMINDER_DEFAULT_STAGE2,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.patch("/api/tenants/:tenantId/cart-reminders/settings", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const schema = z.object({
        enabled: z.boolean().optional(),
        hoursStage1: z.number().int().min(1).max(720).optional(),
        hoursStage2: z.number().int().min(1).max(720).optional(),
      });
      const parsed = schema.parse(req.body || {});
      const updates: any = {};
      if (parsed.enabled !== undefined) updates.cartReminderEnabled = parsed.enabled;
      if (parsed.hoursStage1 !== undefined) updates.cartReminderHoursStage1 = parsed.hoursStage1;
      if (parsed.hoursStage2 !== undefined) updates.cartReminderHoursStage2 = parsed.hoursStage2;
      const updated = await storage.updateTenant(tenantId, updates);
      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "cart_reminders.settings_updated",
          targetType: "TENANT",
          targetId: tenantId,
          details: parsed,
        });
      } catch {}
      res.json({
        enabled: !!updated?.cartReminderEnabled,
        hoursStage1: updated?.cartReminderHoursStage1 ?? CART_REMINDER_DEFAULT_STAGE1,
        hoursStage2: updated?.cartReminderHoursStage2 ?? CART_REMINDER_DEFAULT_STAGE2,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error("Update cart-reminder settings error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.post("/api/tenants/:tenantId/cart-reminders/run", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      const result = await runCartRemindersForTenant(tenant, {
        force: true,
        triggeredBy: "manual",
        actorUserId: req.user.claims.sub,
      });
      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "cart_reminders.run_manual",
          targetType: "TENANT",
          targetId: tenantId,
          details: result,
        });
      } catch {}
      res.json(result);
    } catch (error) {
      console.error("Run cart reminders error:", error);
      res.status(500).json({ message: "Failed to run cart reminders" });
    }
  });

  app.post("/api/tenants/:tenantId/cart-reminders/send-now", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const schema = z.object({
        kind: z.enum(["abandoned_cart", "pending_cash"]),
        cartId: z.string().optional().nullable(),
        paymentId: z.number().int().optional().nullable(),
      });
      const body = schema.parse(req.body || {});
      const result = await sendCartReminderManual({
        tenantId,
        kind: body.kind,
        cartId: body.cartId ?? null,
        paymentId: body.paymentId ?? null,
        actorUserId: req.user.claims.sub,
      });
      if (!result.ok) return res.status(400).json({ message: result.reason });
      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "cart_reminders.send_now",
          targetType: body.kind === "abandoned_cart" ? "CART" : "PAYMENT",
          targetId: body.paymentId ?? 0,
          details: { kind: body.kind, cartId: body.cartId ?? null, paymentId: body.paymentId ?? null, status: result.status },
        });
      } catch {}
      res.json({ ok: true, status: result.status });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: error.errors });
      console.error("Send cart reminder error:", error);
      res.status(500).json({ message: "Failed to send reminder" });
    }
  });

  // Public unsubscribe (no auth) — supports one-click via GET, and POST per RFC 8058.
  const handleUnsubscribe = async (req: any, res: any) => {
    const token = (req.query?.token || req.body?.token || "") as string;
    const result = verifyUnsubscribeToken(token);
    const wantsHtml = (req.headers.accept || "").includes("text/html") && req.method === "GET";
    if (!result) {
      if (wantsHtml) {
        return res.status(400).type("html").send(`<!doctype html><meta charset="utf-8"><title>Unsubscribe</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;padding:24px;color:#222">
<h1 style="font-size:20px">Invalid unsubscribe link</h1>
<p>This link is not valid or has been tampered with. If you keep receiving emails you don't want, reply to one and ask to be removed.</p>
</body>`);
      }
      return res.status(400).json({ ok: false, message: "Invalid token" });
    }
    try {
      await storage.addEmailUnsubscribe({
        tenantId: result.tenantId,
        email: result.email,
        source: "cart_reminder",
      });
      try {
        await storage.createAuditEvent({
          tenantId: result.tenantId,
          actorUserId: "system:unsubscribe",
          action: "email.unsubscribed",
          targetType: "EMAIL",
          targetId: 0,
          details: { email: result.email, source: "cart_reminder" },
        });
      } catch {}
      const tenant = await storage.getTenant(result.tenantId);
      const tenantName = tenant?.name || "this school";
      if (wantsHtml) {
        return res.status(200).type("html").send(`<!doctype html><meta charset="utf-8"><title>Unsubscribed</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;padding:24px;color:#222">
<h1 style="font-size:20px">You're unsubscribed</h1>
<p><strong>${result.email}</strong> will no longer receive cart reminder emails from ${tenantName}.</p>
<p style="color:#666;font-size:14px">If this was a mistake, contact ${tenantName} directly to resume.</p>
</body>`);
      }
      return res.json({ ok: true, email: result.email });
    } catch (err) {
      console.error("Unsubscribe error:", err);
      if (wantsHtml) {
        return res.status(500).type("html").send(`<!doctype html><meta charset="utf-8"><title>Unsubscribe</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;padding:24px;color:#222">
<h1 style="font-size:20px">Something went wrong</h1>
<p>We couldn't record your unsubscribe right now. Please try again in a moment.</p>
</body>`);
      }
      return res.status(500).json({ ok: false, message: "Failed to unsubscribe" });
    }
  };
  app.get("/api/unsubscribe", handleUnsubscribe);
  app.post("/api/unsubscribe", handleUnsubscribe);

  // Resend webhook — receives email.bounced, email.complained, email.delivered
  // events and auto-suppresses bad addresses so we stop emailing them.
  app.post("/api/webhooks/resend", handleResendWebhook);
  app.post("/api/webhooks/inbound-email", handleInboundEmailWebhook);

  // Tenant-level summary of reminder open/click/recovery rates.
  app.get("/api/tenants/:tenantId/cart-reminders/summary", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const summary = await storage.getCartReminderTrackingSummary(tenantId);
      res.json(summary);
    } catch (error) {
      console.error("Get cart-reminders summary error:", error);
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  // Public tracking pixel — increments open count. Returns a 1x1 transparent
  // GIF regardless of token validity so we never leak information about which
  // tokens exist. Cache headers prevent caches from suppressing repeat fetches.
  const TRANSPARENT_GIF = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );
  app.get("/track/cart-reminder/open/:token.gif", async (req, res) => {
    try {
      await storage.recordCartReminderOpen(req.params.token);
    } catch (err) {
      console.error("[CartReminders] open tracking failed:", err);
    }
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.status(200).send(TRANSPARENT_GIF);
  });

  // Public tracking redirect — increments click count and forwards to the
  // appropriate resume URL. Falls back to the tenant homepage when the cart
  // can no longer be resolved (cart deleted, tenant gone, etc.).
  app.get("/track/cart-reminder/click/:token", async (req, res) => {
    try {
      const reminder = await storage.recordCartReminderClick(req.params.token);
      if (!reminder) {
        return res.redirect(302, "/");
      }
      const tenant = await storage.getTenant(reminder.tenantId);
      if (!tenant) return res.redirect(302, "/");
      const target = buildResumeUrl(tenant, reminder.cartId);
      return res.redirect(302, target);
    } catch (err) {
      console.error("[CartReminders] click tracking failed:", err);
      return res.redirect(302, "/");
    }
  });

  app.get("/api/tenants/:tenantId/cart-reminders/history", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const cartId = (req.query.cartId as string | undefined) || undefined;
      const paymentId = req.query.paymentId ? parseInt(req.query.paymentId as string) : undefined;
      const rows = await storage.getCartReminderHistory(tenantId, { cartId, paymentId });
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  app.get("/api/tenants/:tenantId/enrollments/attention-count", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const counts = await storage.countAttentionEnrollments(tenantId);
      res.json(counts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch attention counts" });
    }
  });

  // ===== PAYMENT CLEANUP =====

  app.get("/api/tenants/:tenantId/payments/stale-count", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const settings = await storage.getTenantPaymentSettings(tenantId);
      const hours = settings?.expireAfterHours ?? 2;
      const count = await storage.countPendingPaymentEnrollments(tenantId, hours);
      res.json({ count, expireAfterHours: hours });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stale count" });
    }
  });

  app.post("/api/tenants/:tenantId/payments/cleanup", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const settings = await storage.getTenantPaymentSettings(tenantId);
      const hours = settings?.expireAfterHours ?? 2;
      const stale = await storage.getExpiredPendingEnrollmentsByTenant(tenantId, hours);
      let expired = 0;
      for (const enrollment of stale) {
        await storage.expireEnrollment(enrollment.id, tenantId);
        expired++;
      }
      const abandonedCarts = await storage.expireAbandonedCarts(tenantId, hours);
      for (const a of abandonedCarts) {
        try {
          await storage.createAuditEvent({
            tenantId,
            actorUserId: req.user.claims.sub,
            action: "cart.abandoned",
            targetType: "CART",
            targetId: 0,
            details: { cartId: a.cartId, source: "manual_cleanup" },
          });
        } catch {}
      }
      if (expired > 0 || abandonedCarts.length > 0) {
        console.log(`[Cleanup] Manual: Expired ${expired} pending enrollments, ${abandonedCarts.length} carts for tenant ${tenantId}`);
      }
      res.json({ expired, abandonedCarts: abandonedCarts.length });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ message: "Failed to run cleanup" });
    }
  });

  // Background cleanup job (runs every hour)
  setInterval(async () => {
    try {
      const allTenants = await storage.getAllTenants();
      for (const tenant of allTenants) {
        const settings = await storage.getTenantPaymentSettings(tenant.id);
        const autoExpireEnabled = settings?.autoExpireEnabled ?? true;
        if (!autoExpireEnabled) continue;
        const hours = settings?.expireAfterHours ?? 2;
        const stale = await storage.getExpiredPendingEnrollmentsByTenant(tenant.id, hours);
        for (const enrollment of stale) {
          await storage.expireEnrollment(enrollment.id, tenant.id);
        }
        const abandonedCarts = await storage.expireAbandonedCarts(tenant.id, hours);
        // Note: auto-cleanup runs without an actor; the audit table requires
        // actorUserId. We log to stdout instead of writing audit events here.
        // Manual cleanup (see route above) does emit cart.abandoned audit
        // events with the admin actor.
        if (abandonedCarts.length > 0) {
          console.log(`[Cleanup] Auto: cart.abandoned events:`, abandonedCarts.map(a => a.cartId));
        }
        if (stale.length > 0 || abandonedCarts.length > 0) {
          console.log(`[Cleanup] Auto: Expired ${stale.length} pending enrollments, ${abandonedCarts.length} carts for tenant ${tenant.id}`);
        }
      }
    } catch (error) {
      console.error("[Cleanup] Background job error:", error);
    }
  }, 60 * 60 * 1000);

  // Background stale-credit reminder job. Cadence is configurable via the
  // STALE_CREDIT_REMINDER_INTERVAL_MINUTES env var (default 60 minutes; set to
  // 0 or a negative number to disable the scheduler entirely). Tenant-level
  // dedupe ensures students aren't spammed even when run frequently.
  const staleCreditCadenceMinutes = Number.parseInt(
    process.env.STALE_CREDIT_REMINDER_INTERVAL_MINUTES ?? "60",
    10,
  );
  if (Number.isFinite(staleCreditCadenceMinutes) && staleCreditCadenceMinutes > 0) {
    const intervalMs = staleCreditCadenceMinutes * 60 * 1000;
    console.log(`[StaleCreditReminders] Scheduler enabled, interval=${staleCreditCadenceMinutes} minute(s)`);
    setInterval(async () => {
      try {
        const result = await runStaleCreditRemindersAllTenants();
        if (result.totalEmailSent > 0 || result.totalInAppSent > 0 || result.totalFailed > 0) {
          console.log(`[StaleCreditReminders] Background: tenants=${result.tenantsProcessed} email_sent=${result.totalEmailSent} in_app=${result.totalInAppSent} failed=${result.totalFailed}`);
        }
      } catch (error) {
        console.error("[StaleCreditReminders] Background job error:", error);
      }
    }, intervalMs);
  } else {
    console.log("[StaleCreditReminders] Scheduler disabled (STALE_CREDIT_REMINDER_INTERVAL_MINUTES <= 0)");
  }

  // Background cart-reminder job. Cadence configurable via
  // CART_REMINDER_INTERVAL_MINUTES (default 60; <=0 disables).
  const cartReminderCadenceMinutes = Number.parseInt(
    process.env.CART_REMINDER_INTERVAL_MINUTES ?? "60",
    10,
  );
  if (Number.isFinite(cartReminderCadenceMinutes) && cartReminderCadenceMinutes > 0) {
    const intervalMs = cartReminderCadenceMinutes * 60 * 1000;
    console.log(`[CartReminders] Scheduler enabled, interval=${cartReminderCadenceMinutes} minute(s)`);
    setInterval(async () => {
      try {
        const r = await runCartRemindersAllTenants();
        if (r.totalAbandoned > 0 || r.totalPendingCash > 0 || r.totalFailed > 0) {
          console.log(`[CartReminders] Background: tenants=${r.tenantsProcessed} abandoned=${r.totalAbandoned} pending_cash=${r.totalPendingCash} failed=${r.totalFailed}`);
        }
      } catch (error) {
        console.error("[CartReminders] Background job error:", error);
      }
    }, intervalMs);
  } else {
    console.log("[CartReminders] Scheduler disabled (CART_REMINDER_INTERVAL_MINUTES <= 0)");
  }

  // ===== PUBLIC PAYMENT CONFIG (for checkout form) =====

  app.get("/api/public/tenant/:slug/payment-methods", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant) return res.status(404).json({ message: "School not found" });
      const settings = await storage.getTenantPaymentSettings(tenant.id);
      const methods: string[] = [];
      if (settings?.stripeEnabled && settings?.stripeSecretKey) methods.push("STRIPE");
      if (settings?.paypalEnabled && settings?.paypalClientId && settings?.paypalClientSecret) methods.push("PAYPAL");
      if (settings?.cashEnabled) methods.push("CASH");
      res.json({
        methods,
        paypalClientId: settings?.paypalEnabled ? settings.paypalClientId : null,
        cashRequireSignature: settings?.cashEnabled ? (settings.cashRequireSignature ?? false) : false,
        // Surface the service-fee rate so the storefront can render a
        // "+ X% service fee on card payments" line in the cart summary
        // before the buyer is redirected.
        serviceFeeBps: settings?.serviceFeeBps ?? 0,
        serviceFeeFlatCents: settings?.serviceFeeFlatCents ?? 0,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.get("/api/tenants/:tenantId/saved-blocks", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const blocks = await storage.getSavedBlocks(tenantId);
      res.json(blocks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch saved blocks" });
    }
  });

  app.post("/api/tenants/:tenantId/saved-blocks", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const { name, section } = req.body;
      if (!name || !section) return res.status(400).json({ message: "Name and section data required" });
      const block = await storage.createSavedBlock({ tenantId, name, section });
      res.json(block);
    } catch (error) {
      res.status(500).json({ message: "Failed to save block" });
    }
  });

  app.delete("/api/tenants/:tenantId/saved-blocks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      await storage.deleteSavedBlock(id, tenantId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete saved block" });
    }
  });

  // ===== TENANT API KEY MANAGEMENT =====

  app.get("/api/tenants/:tenantId/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const [pmResult] = await db.select().from(platformMembers).where(and(eq(platformMembers.userId, userId), eq(platformMembers.active, true)));
      const isPlatformAdmin = pmResult && pmResult.role === "admin";
      if (!isPlatformAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const keys = await storage.getTenantApiKeys(tenantId);
      res.json(keys.map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  app.post("/api/tenants/:tenantId/api-keys", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const [pmResult] = await db.select().from(platformMembers).where(and(eq(platformMembers.userId, userId), eq(platformMembers.active, true)));
      const isPlatformAdmin = pmResult && pmResult.role === "admin";
      if (!isPlatformAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Key name is required" });
      }
      const rawKey = `drv_live_${crypto.randomBytes(24).toString("hex")}`;
      const keyHash = await bcrypt.hash(rawKey, 10);
      const keyPrefix = rawKey.substring(0, 16);
      const apiKey = await storage.createTenantApiKey({ tenantId, name: name.trim(), keyHash, keyPrefix });
      res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt,
        plainTextKey: rawKey,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.delete("/api/tenants/:tenantId/api-keys/:keyId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const keyId = parseInt(req.params.keyId);
      const userId = req.user.claims.sub;
      const [pmResult] = await db.select().from(platformMembers).where(and(eq(platformMembers.userId, userId), eq(platformMembers.active, true)));
      const isPlatformAdmin = pmResult && pmResult.role === "admin";
      if (!isPlatformAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.revokeTenantApiKey(keyId, tenantId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  // ===== PUBLIC HEADLESS API ENDPOINTS =====

  app.get("/api/public/tenant/:slug/locations", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const locs = await storage.getLocations(tenant.id);
      res.json(locs.filter(l => l.active).map(l => ({
        id: l.id,
        name: l.name,
        address: l.address,
        city: l.city,
        state: l.state,
        zip: l.zip,
        phone: l.phone,
        email: l.email,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.get("/api/public/tenant/:slug/sessions", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const filters: any = { status: "SCHEDULED" };
      if (req.query.type) filters.type = req.query.type;
      if (req.query.locationId) filters.locationId = parseInt(req.query.locationId as string);
      if (req.query.from) filters.from = new Date(req.query.from as string);
      else filters.from = new Date();
      if (req.query.to) filters.to = new Date(req.query.to as string);
      const sessions = await storage.getScheduleSessions(tenant.id, filters);
      const members = await storage.getTenantMembers(tenant.id);
      const memberMap = new Map(members.map(m => [m.userId, m]));
      res.json(sessions.map(s => {
        const instructor = memberMap.get(s.instructorId);
        return {
          id: s.id,
          type: s.type,
          startAt: s.startAt,
          endAt: s.endAt,
          locationId: s.locationId,
          capacity: s.capacity,
          bookedCount: s.bookedCount,
          availableSpots: (s.capacity || 0) - (s.bookedCount || 0),
          instructorName: instructor ? `${instructor.firstName || ""} ${instructor.lastName || ""}`.trim() || null : null,
        };
      }));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/public/tenant/:slug/instructors", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const members = await storage.getTenantMembers(tenant.id);
      const instructors = members.filter(m => m.role === "instructor" && m.active);
      res.json(instructors.map(i => ({
        id: i.userId,
        firstName: i.user?.firstName || null,
        lastName: i.user?.lastName || null,
        profileImageUrl: i.user?.profileImageUrl || null,
        instructorType: i.instructorType || null,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch instructors" });
    }
  });

  app.post("/api/tenants/:tenantId/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const { type, subject, description } = req.body;
      if (!type || !description) return res.status(400).json({ message: "Type and description are required" });
      if (!["bug", "feature_request", "design", "content", "other"].includes(type)) return res.status(400).json({ message: "Invalid ticket type" });
      const autoSubject = subject || description.substring(0, 60).trim() + (description.length > 60 ? "..." : "");
      const ticket = await storage.createSupportTicket({ tenantId, submittedByUserId: userId, type, subject: autoSubject, description });
      const user = await storage.getUser(userId);
      const tenant = await storage.getTenant(tenantId);
      await notifyPlatformTeam(
        "New Feedback",
        `${user?.firstName || user?.email || "A user"} from ${tenant?.name || "a school"} submitted: ${autoSubject}`,
        tenant ? `/platform/tenants/${tenant.id}` : undefined,
      );
      res.json(ticket);
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ message: "Failed to create ticket" });
    }
  });

  app.get("/api/tenants/:tenantId/tickets", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const isAdmin = ["tenant_admin", "office_manager"].includes(member.role);
      const tickets = isAdmin
        ? await storage.getSupportTicketsByTenant(tenantId)
        : await storage.getSupportTicketsByUser(tenantId, userId);
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  app.get("/api/tenants/:tenantId/tickets/:ticketId", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const ticketId = parseInt(req.params.ticketId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket || ticket.tenantId !== tenantId) return res.status(404).json({ message: "Ticket not found" });
      const isAdmin = ["tenant_admin", "office_manager"].includes(member.role);
      if (!isAdmin && ticket.submittedByUserId !== userId) return res.status(403).json({ message: "Forbidden" });
      const responses = await storage.getTicketResponses(ticketId, false);
      res.json({ ...ticket, responses });
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

  app.post("/api/tenants/:tenantId/tickets/:ticketId/responses", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const ticketId = parseInt(req.params.ticketId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket || ticket.tenantId !== tenantId) return res.status(404).json({ message: "Ticket not found" });
      const isAdmin = ["tenant_admin", "office_manager"].includes(member.role);
      if (!isAdmin && ticket.submittedByUserId !== userId) return res.status(403).json({ message: "Forbidden" });
      const { content } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });
      const response = await storage.createTicketResponse({ ticketId, authorUserId: userId, content, isInternal: false });
      await notifyPlatformTeam(
        "New Comment",
        `A feedback provider commented on ticket: ${ticket.subject}`,
        `/platform/tenants/${ticket.tenantId}`,
      );
      res.json(response);
    } catch (error) {
      console.error("Error creating ticket response:", error);
      res.status(500).json({ message: "Failed to create response" });
    }
  });

  app.patch("/api/tenants/:tenantId/tickets/:ticketId/status", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const ticketId = parseInt(req.params.ticketId);
      const userId = req.user.claims.sub;
      const member = await storage.getTenantMember(tenantId, userId);
      if (!member) return res.status(403).json({ message: "Forbidden" });
      const ticket = await storage.getSupportTicket(ticketId);
      if (!ticket || ticket.tenantId !== tenantId) return res.status(404).json({ message: "Ticket not found" });
      const isAdmin = ["tenant_admin", "office_manager"].includes(member.role);
      if (!isAdmin && ticket.submittedByUserId !== userId) return res.status(403).json({ message: "Forbidden" });
      const { status, comment } = req.body;
      const allowedStatuses = ["open", "resolved", "closed", "cancelled"];
      if (!status || !allowedStatuses.includes(status)) return res.status(400).json({ message: "Invalid status. Allowed: open, resolved, closed, cancelled" });
      if ((status === "open" || status === "resolved") && ticket.status !== "ready") {
        return res.status(400).json({ message: "Can only reopen or resolve when ticket is marked as ready" });
      }
      const terminalStatuses = ["closed", "cancelled", "resolved"];
      if ((status === "closed" || status === "cancelled") && terminalStatuses.includes(ticket.status)) {
        return res.status(400).json({ message: "Ticket is already in a final status" });
      }
      const updated = await storage.updateSupportTicket(ticketId, { status });
      if (comment && typeof comment === "string" && comment.trim()) {
        await storage.createTicketResponse({ ticketId, authorUserId: userId, content: comment.trim(), isInternal: false });
      }
      const statusLabels: Record<string, string> = { open: "Reopened", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" };
      await notifyPlatformTeam(
        `Ticket ${statusLabels[status] || status}`,
        `A feedback provider ${statusLabels[status]?.toLowerCase() || "updated"} ticket: ${ticket.subject}`,
        `/platform/tenants/${ticket.tenantId}`,
      );
      res.json(updated);
    } catch (error) {
      console.error("Error updating ticket status:", error);
      res.status(500).json({ message: "Failed to update ticket status" });
    }
  });

  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const [notifs, unreadCount] = await Promise.all([
        storage.getNotificationsForUser(userId, 50),
        storage.getUnreadNotificationCount(userId),
      ]);
      res.json({ notifications: notifs, unreadCount });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const id = parseInt(req.params.id);
      await storage.markNotificationRead(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/read-all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ message: "Failed to mark all notifications read" });
    }
  });

  // ─── Promotions Admin Routes ───────────────────────────────────────
  app.get("/api/tenants/:tenantId/promotions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const promos = await storage.getPromotions(tenantId);
      res.json(promos);
    } catch (error) {
      console.error("Error fetching promotions:", error);
      res.status(500).json({ message: "Failed to fetch promotions" });
    }
  });

  app.post("/api/tenants/:tenantId/promotions", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const body = { ...req.body, tenantId };
      if (body.validFrom) body.validFrom = new Date(body.validFrom);
      if (body.validUntil) body.validUntil = new Date(body.validUntil);
      const data = insertPromotionSchema.parse(body);
      if (data.locationId) {
        const loc = await storage.getLocation(data.locationId);
        if (!loc || loc.tenantId !== tenantId) return res.status(400).json({ message: "Location not found for this tenant" });
      }
      if (data.packageId) {
        const pkg = await storage.getPackage(data.packageId);
        if (!pkg || pkg.tenantId !== tenantId) return res.status(400).json({ message: "Package not found for this tenant" });
      }
      const promo = await storage.createPromotion(data);
      res.status(201).json(promo);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error creating promotion:", error);
      res.status(500).json({ message: "Failed to create promotion" });
    }
  });

  app.patch("/api/tenants/:tenantId/promotions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getPromotion(id);
      if (!existing || existing.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      const { tenantId: _t, id: _i, createdAt: _c, updatedAt: _u, ...safeBody } = req.body;
      if (safeBody.validFrom) safeBody.validFrom = new Date(safeBody.validFrom);
      if (safeBody.validUntil) safeBody.validUntil = new Date(safeBody.validUntil);
      const partialSchema = insertPromotionSchema.partial().omit({ tenantId: true });
      const parsed = partialSchema.safeParse(safeBody);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const validData = parsed.data;
      if (validData.locationId) {
        const loc = await storage.getLocation(validData.locationId);
        if (!loc || loc.tenantId !== tenantId) return res.status(400).json({ message: "Location not found for this tenant" });
      }
      if (validData.packageId) {
        const pkg = await storage.getPackage(validData.packageId);
        if (!pkg || pkg.tenantId !== tenantId) return res.status(400).json({ message: "Package not found for this tenant" });
      }
      const updated = await storage.updatePromotion(id, tenantId, validData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating promotion:", error);
      res.status(500).json({ message: "Failed to update promotion" });
    }
  });

  // ─── Announcement Banner Admin Routes ──────────────────────────────
  function normaliseAnnouncementBody(body: any, tenantId: number, mode: "create" | "patch") {
    const next: any = { ...body, tenantId };
    const coerce = (key: "validFrom" | "validUntil") => {
      if (!(key in next)) {
        if (mode === "create") next[key] = null;
        return;
      }
      const v = next[key];
      if (v === null || v === "" || v === undefined) next[key] = null;
      else next[key] = new Date(v);
    };
    coerce("validFrom");
    coerce("validUntil");
    return next;
  }

  function validateAnnouncementBusinessRules(data: { validFrom?: Date | null; validUntil?: Date | null; ctaHref?: string | null }): string | null {
    if (data.validFrom && data.validUntil && data.validFrom > data.validUntil) {
      return "'Show from' must be before 'Show until'";
    }
    if (data.ctaHref) {
      const href = data.ctaHref.trim();
      const ok = href.startsWith("/") || /^https?:\/\//i.test(href) || href.startsWith("tel:") || href.startsWith("mailto:");
      if (!ok) return "CTA link must start with /, http://, https://, tel:, or mailto:";
    }
    return null;
  }

  // Backward-compatible single-active endpoint (returns the currently live one)
  // ─── Email templates (enrollment + payment confirmation) ─────────────────
  app.get("/api/tenants/:tenantId/email-templates", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const overrides = await storage.listEmailTemplates(tenantId);
      const overrideMap = new Map(overrides.map(o => [o.templateKey, o]));
      const items = (Object.keys(TEMPLATE_DEFS) as EnrollmentEmailKey[]).map(key => {
        const def = TEMPLATE_DEFS[key];
        const override = overrideMap.get(key);
        return {
          key,
          label: def.label,
          description: def.description,
          defaultSubject: def.defaultSubject,
          defaultBody: def.defaultBody,
          placeholders: def.placeholders,
          subjectOverride: override?.subjectOverride ?? null,
          bodyOverride: override?.bodyOverride ?? null,
          updatedAt: override?.updatedAt ?? null,
        };
      });
      res.json({ items });
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ message: "Failed to fetch email templates" });
    }
  });

  app.put("/api/tenants/:tenantId/email-templates/:key", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const key = req.params.key as EnrollmentEmailKey;
      if (!(key in TEMPLATE_DEFS)) {
        return res.status(400).json({ message: "Unknown template key" });
      }
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const bodySchema = insertTenantEmailTemplateSchema.pick({
        subjectOverride: true,
        bodyOverride: true,
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const subj = (parsed.data.subjectOverride ?? "").toString().trim();
      const body = (parsed.data.bodyOverride ?? "").toString().trim();
      const saved = await storage.upsertEmailTemplate({
        tenantId,
        templateKey: key,
        subjectOverride: subj || null,
        bodyOverride: body || null,
      });
      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "email_template.updated",
          targetType: "tenant_email_template",
          targetId: saved.id,
          details: { templateKey: key, hasSubjectOverride: !!subj, hasBodyOverride: !!body },
        });
      } catch {}
      res.json(saved);
    } catch (error) {
      console.error("Error updating email template:", error);
      res.status(500).json({ message: "Failed to update email template" });
    }
  });

  app.get("/api/tenants/:tenantId/announcement", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const announcement = await storage.getTenantAnnouncement(tenantId);
      res.json(announcement ?? null);
    } catch (error) {
      console.error("Error fetching announcement:", error);
      res.status(500).json({ message: "Failed to fetch announcement" });
    }
  });

  app.get("/api/tenants/:tenantId/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const items = await storage.getTenantAnnouncements(tenantId);
      const live = await storage.getTenantAnnouncement(tenantId);
      res.json({ items, activeId: live?.id ?? null });
    } catch (error) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  app.post("/api/tenants/:tenantId/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const body = normaliseAnnouncementBody(req.body, tenantId, "create");
      const data = insertTenantAnnouncementSchema.parse(body);
      const err = validateAnnouncementBusinessRules(data);
      if (err) return res.status(400).json({ message: err });
      const created = await storage.createTenantAnnouncement(data);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "announcement.created",
        targetType: "tenant_announcement",
        targetId: created.id,
        details: { enabled: created.enabled, title: created.title },
      });
      res.status(201).json(created);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error creating announcement:", error);
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.patch("/api/tenants/:tenantId/announcements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getTenantAnnouncementById(id, tenantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const body = normaliseAnnouncementBody(req.body, tenantId, "patch");
      const partial = insertTenantAnnouncementSchema.partial().omit({ tenantId: true });
      const parsed = partial.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const merged = {
        validFrom: parsed.data.validFrom !== undefined ? parsed.data.validFrom : existing.validFrom,
        validUntil: parsed.data.validUntil !== undefined ? parsed.data.validUntil : existing.validUntil,
        ctaHref: parsed.data.ctaHref !== undefined ? parsed.data.ctaHref : existing.ctaHref,
      };
      const err = validateAnnouncementBusinessRules(merged as any);
      if (err) return res.status(400).json({ message: err });
      const updated = await storage.updateTenantAnnouncement(id, tenantId, parsed.data);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "announcement.updated",
        targetType: "tenant_announcement",
        targetId: id,
        details: { enabled: updated?.enabled, title: updated?.title },
      });
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error updating announcement:", error);
      res.status(500).json({ message: "Failed to update announcement" });
    }
  });

  app.delete("/api/tenants/:tenantId/announcements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getTenantAnnouncementById(id, tenantId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      await storage.deleteTenantAnnouncement(id, tenantId);
      await storage.createAuditEvent({
        tenantId,
        actorUserId: req.user.claims.sub,
        action: "announcement.deleted",
        targetType: "tenant_announcement",
        targetId: id,
        details: { title: existing.title },
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting announcement:", error);
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  app.delete("/api/tenants/:tenantId/promotions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getPromotion(id);
      if (!existing || existing.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      await storage.deletePromotion(id, tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting promotion:", error);
      res.status(500).json({ message: "Failed to delete promotion" });
    }
  });

  // ─── Testimonials Admin Routes ─────────────────────────────────────
  app.get("/api/tenants/:tenantId/testimonials", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const allowedStatuses = ["pending", "approved", "rejected", "featured"] as const;
      type Status = (typeof allowedStatuses)[number];
      let status: Status | undefined;
      if (typeof req.query.status === "string") {
        if (!(allowedStatuses as readonly string[]).includes(req.query.status)) {
          return res.status(400).json({ message: "Invalid status filter" });
        }
        status = req.query.status as Status;
      }
      const items = await storage.getTestimonials(tenantId, { status });
      res.json(items);
    } catch (error) {
      console.error("Error fetching testimonials:", error);
      res.status(500).json({ message: "Failed to fetch testimonials" });
    }
  });

  app.post("/api/tenants/:tenantId/testimonials", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const body = { ...req.body, tenantId };
      const data = insertTestimonialSchema.parse(body);
      if (data.locationId) {
        const loc = await storage.getLocation(data.locationId);
        if (!loc || loc.tenantId !== tenantId) return res.status(400).json({ message: "Invalid location" });
      }
      const created = await storage.createTestimonial(data);
      res.status(201).json(created);
    } catch (error: any) {
      if (error.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error("Error creating testimonial:", error);
      res.status(500).json({ message: "Failed to create testimonial" });
    }
  });

  app.patch("/api/tenants/:tenantId/testimonials/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getTestimonial(id);
      if (!existing || existing.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      const { tenantId: _t, id: _i, createdAt: _c, approvedAt: _a, approvedByUserId: _b, submittedFromIp: _s, ...safeBody } = req.body;
      const partial = insertTestimonialSchema.partial().omit({ tenantId: true });
      const parsed = partial.safeParse(safeBody);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      if (parsed.data.locationId) {
        const loc = await storage.getLocation(parsed.data.locationId);
        if (!loc || loc.tenantId !== tenantId) return res.status(400).json({ message: "Invalid location" });
      }
      const update: Partial<InsertTestimonial> & { approvedByUserId?: string | null; approvedAt?: Date | null } = { ...parsed.data };
      const becameApproved =
        !!parsed.data.status &&
        ["approved", "featured"].includes(parsed.data.status) &&
        !["approved", "featured"].includes(existing.status);
      if (becameApproved) {
        update.approvedAt = new Date();
        update.approvedByUserId = req.user.claims.sub;
      }
      const updated = await storage.updateTestimonial(id, tenantId, update);
      res.json(updated);
    } catch (error) {
      console.error("Error updating testimonial:", error);
      res.status(500).json({ message: "Failed to update testimonial" });
    }
  });

  app.delete("/api/tenants/:tenantId/testimonials/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getTestimonial(id);
      if (!existing || existing.tenantId !== tenantId) return res.status(404).json({ message: "Not found" });
      await storage.deleteTestimonial(id, tenantId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting testimonial:", error);
      res.status(500).json({ message: "Failed to delete testimonial" });
    }
  });

  // ─── FAQ Admin Routes ───────────────────────────────────────────────
  app.get("/api/tenants/:tenantId/faqs", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const items = await storage.getFaqs(tenantId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch FAQs" });
    }
  });

  app.post("/api/tenants/:tenantId/faqs", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const data = insertFaqSchema.parse({ ...req.body, tenantId });
      const created = await storage.createFaq(data);
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: "Validation error", errors: error.errors });
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  app.patch("/api/tenants/:tenantId/faqs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const partial = insertFaqSchema.partial().omit({ tenantId: true });
      const parsed = partial.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const updated = await storage.updateFaq(id, tenantId, parsed.data);
      if (!updated) return res.status(404).json({ message: "FAQ not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update FAQ" });
    }
  });

  app.delete("/api/tenants/:tenantId/faqs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const id = parseInt(req.params.id);
      const member = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!member || !["tenant_admin", "office_manager", "platform_admin"].includes(member.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteFaq(id, tenantId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete FAQ" });
    }
  });

  // ─── Public FAQs API (API key protected) ────────────────────────────
  app.get("/api/public/tenant/:slug/faqs", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const all = await storage.getFaqs(tenant.id);
      const active = all
        .filter((f) => f.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      res.json(active.map(({ id, question, answer, category, sortOrder, isActive }) => ({
        id, question, answer, category, sortOrder, isActive,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch FAQs" });
    }
  });

  // ─── Public Testimonials API (API key protected) ───────────────────
  const testimonialSubmitBuckets = new Map<string, number[]>();
  function rateLimitTestimonialSubmit(ip: string): boolean {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const max = 5;
    const arr = (testimonialSubmitBuckets.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      testimonialSubmitBuckets.set(ip, arr);
      return false;
    }
    arr.push(now);
    testimonialSubmitBuckets.set(ip, arr);
    return true;
  }

  app.get("/api/public/tenant/:slug/testimonials", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const opts: { locationId?: number; featured?: boolean } = {};
      if (req.query.featured === "true") opts.featured = true;
      if (req.query.location) {
        const locId = parseInt(req.query.location as string);
        if (isNaN(locId)) return res.status(400).json({ message: "Invalid location parameter" });
        opts.locationId = locId;
      }
      const items = await storage.listPublicTestimonials(tenant.id, opts);
      res.json({ testimonials: items });
    } catch (error) {
      console.error("Error fetching public testimonials:", error);
      res.status(500).json({ message: "Failed to fetch testimonials" });
    }
  });

  const publicTestimonialSubmitSchema = z.object({
    name: z.string().min(1, "Name is required").max(120),
    email: z.string().email().optional().nullable(),
    rating: z.coerce.number().int().min(1).max(5),
    quote: z.string().min(5).max(2000),
    photoUrl: z.string().url().optional().nullable(),
    locationId: z.coerce.number().int().optional().nullable(),
  });

  app.post("/api/public/tenant/:slug/testimonials", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
      if (!rateLimitTestimonialSubmit(ip)) {
        return res.status(429).json({ message: "Too many submissions. Please try again later." });
      }
      const parsed = publicTestimonialSubmitSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      if (parsed.data.locationId) {
        const loc = await storage.getLocation(parsed.data.locationId);
        if (!loc || loc.tenantId !== tenant.id) return res.status(400).json({ message: "Invalid location" });
      }
      const newTestimonial: InsertTestimonial = {
        tenantId: tenant.id,
        name: parsed.data.name,
        email: parsed.data.email || null,
        rating: parsed.data.rating,
        quote: parsed.data.quote,
        photoUrl: parsed.data.photoUrl || null,
        videoUrl: null,
        locationId: parsed.data.locationId || null,
        source: "public_form",
        status: "pending",
        sortOrder: 0,
        submittedFromIp: ip,
      };
      const created = await storage.createTestimonial(newTestimonial);

      // Notify tenant admins + office managers
      try {
        const members = await storage.getTenantMembers(tenant.id);
        const recipients = Array.from(
          new Set(
            members
              .filter((m) => m.userId && ["tenant_admin", "office_manager"].includes(m.role))
              .map((m) => m.userId as string),
          ),
        );
        if (recipients.length > 0) {
          await storage.createNotifications(
            recipients.map((userId) => ({
              userId,
              type: "testimonial_submitted",
              title: "New testimonial submitted",
              message: `${parsed.data.name} (${parsed.data.rating}★): ${parsed.data.quote.slice(0, 80)}${parsed.data.quote.length > 80 ? "…" : ""}`,
              link: "/admin/testimonials",
              read: false,
            })),
          );
        }
      } catch (notifyErr) {
        console.error("Error sending testimonial notifications:", notifyErr);
      }

      res.status(201).json({
        id: created.id,
        status: created.status,
        message: "Thank you! Your testimonial has been submitted for review.",
      });
    } catch (error) {
      console.error("Error submitting public testimonial:", error);
      res.status(500).json({ message: "Failed to submit testimonial" });
    }
  });

  // ─── Public Promotions API (API key protected) ─────────────────────
  app.get("/api/public/tenant/:slug/promotions", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) {
        return res.status(404).json({ message: "School not found" });
      }
      const allPromos = await storage.getPromotions(tenant.id);
      let filtered = allPromos;
      if (req.query.active === "true") {
        const now = new Date();
        filtered = filtered.filter((p) => {
          if (!p.active) return false;
          if (p.validFrom && new Date(p.validFrom) > now) return false;
          if (p.validUntil && new Date(p.validUntil) < now) return false;
          return true;
        });
      }
      if (req.query.locationId) {
        const locId = parseInt(req.query.locationId as string);
        if (isNaN(locId)) return res.status(400).json({ message: "Invalid locationId parameter" });
        filtered = filtered.filter((p) => p.locationId === null || p.locationId === locId);
      }
      res.json({ promotions: filtered });
    } catch (error) {
      console.error("Error fetching public promotions:", error);
      res.status(500).json({ message: "Failed to fetch promotions" });
    }
  });

  app.get("/api/public/tenant/:slug/announcement", requireApiKey, async (req, res) => {
    try {
      const tenant = await storage.getTenantBySlug(req.params.slug);
      if (!tenant || !tenant.active) return res.status(404).json({ message: "School not found" });
      const announcement = await storage.getTenantAnnouncement(tenant.id);
      if (!announcement || !announcement.enabled || !announcement.message?.trim()) {
        return res.json({ announcement: null });
      }
      const now = new Date();
      if (announcement.validFrom && new Date(announcement.validFrom) > now) {
        return res.json({ announcement: null });
      }
      if (announcement.validUntil && new Date(announcement.validUntil) < now) {
        return res.json({ announcement: null });
      }
      res.json({ announcement });
    } catch (error) {
      console.error("Error fetching public announcement:", error);
      res.status(500).json({ message: "Failed to fetch announcement" });
    }
  });

  // Broadcast message wizard (Quick Actions on the admin dashboard).
  // Resolves an audience server-side and fans out email + in-app notifications.
  const broadcastAudienceEnum = z.enum([
    "ALL_MEMBERS",
    "ALL_ACTIVE_STUDENTS",
    "ROLE_STUDENT",
    "ROLE_PARENT",
    "ROLE_INSTRUCTOR",
    "ROLE_OFFICE_MANAGER",
    "ROLE_TENANT_ADMIN",
    "ROSTER_OF_OFFERING",
    "STALE_CREDIT_STUDENTS",
    "CUSTOM_EMAIL_LIST",
  ]);
  const broadcastPreviewSchema = z.object({
    audience: broadcastAudienceEnum,
    locationIds: z.array(z.number().int().positive()).optional(),
    offeringId: z.number().int().positive().optional(),
    customEmails: z.array(z.string().email()).max(500).optional(),
    staleDays: z.number().int().min(1).max(365).optional(),
  });
  const broadcastSendSchema = broadcastPreviewSchema.extend({
    channels: z.object({
      email: z.boolean(),
      inApp: z.boolean(),
    }).refine((c) => c.email || c.inApp, "At least one channel required"),
    subject: z.string().min(1).max(150),
    body: z.string().min(1).max(5000),
  });

  type BroadcastRecipient = {
    userId: string | null;
    email: string | null;
    name: string;
  };

  async function resolveBroadcastRecipients(
    tenantId: number,
    audience: z.infer<typeof broadcastAudienceEnum>,
    locationIds: number[] | undefined,
    extras?: { offeringId?: number; customEmails?: string[]; staleDays?: number },
  ): Promise<BroadcastRecipient[]> {
    const { db } = await import("./db");
    const { tenantMembers, users, enrollments } = await import("@shared/schema");
    const { and, eq, inArray, sql } = await import("drizzle-orm");

    const out = new Map<string, BroadcastRecipient>();

    // Helper: append a recipient under a stable key (userId || email)
    const add = (r: BroadcastRecipient) => {
      const key = r.userId || (r.email ? `email:${r.email.toLowerCase()}` : null);
      if (!key) return;
      if (!out.has(key)) out.set(key, r);
    };

    if (audience === "CUSTOM_EMAIL_LIST") {
      const emails = (extras?.customEmails ?? []).map((e) => e.trim()).filter(Boolean);
      for (const email of emails) {
        // Resolve to a user only when that user is an active member of THIS
        // tenant. Otherwise treat as an email-only recipient so we never deliver
        // an in-app notification to a user from a different tenant.
        const rows = await db
          .select({ user: users })
          .from(users)
          .innerJoin(tenantMembers, eq(tenantMembers.userId, users.id))
          .where(
            and(
              eq(users.email, email),
              eq(tenantMembers.tenantId, tenantId),
              eq(tenantMembers.status, "ACTIVE" as any),
            ),
          )
          .limit(1);
        const user = rows[0]?.user;
        add({
          userId: user?.id ?? null,
          email,
          name: user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || email : email,
        });
      }
      return Array.from(out.values());
    }

    if (audience === "ROSTER_OF_OFFERING") {
      if (!extras?.offeringId) return [];
      const enr = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.tenantId, tenantId),
            eq(enrollments.offeringId, extras.offeringId),
          ),
        );
      for (const e of enr) {
        add({
          userId: e.userId ?? null,
          email: e.email ?? null,
          name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.email,
        });
        if (e.parentEmail) {
          add({ userId: null, email: e.parentEmail, name: e.parentName || `Parent of ${e.firstName}` });
        }
      }
      return Array.from(out.values());
    }

    if (audience === "STALE_CREDIT_STUDENTS") {
      const staleDays = extras?.staleDays ?? 30;
      const cutoff = new Date(Date.now() - staleDays * 86400000);
      const enr = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.tenantId, tenantId),
            inArray(enrollments.status, ["confirmed", "active", "in_progress"] as any),
          ),
        );
      for (const e of enr) {
        if (locationIds && locationIds.length > 0) {
          if (!e.locationId || !locationIds.includes(e.locationId)) continue;
        }
        const drive = await storage.getCreditBalance(e.id, "DRIVE");
        if (drive <= 0) continue;
        // Check last booking activity within staleDays — fall back to enrollment.updatedAt
        const lastTouched = (e as any).updatedAt ? new Date((e as any).updatedAt) : null;
        if (lastTouched && lastTouched > cutoff) continue;
        add({
          userId: e.userId ?? null,
          email: e.email ?? null,
          name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.email,
        });
      }
      return Array.from(out.values());
    }

    if (audience === "ALL_ACTIVE_STUDENTS") {
      // Source: enrollments with confirmed/active/in_progress status
      const enr = await db
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.tenantId, tenantId),
            inArray(enrollments.status, ["confirmed", "active", "in_progress"] as any),
          ),
        );
      for (const e of enr) {
        if (locationIds && locationIds.length > 0) {
          if (!e.locationId || !locationIds.includes(e.locationId)) continue;
        }
        add({
          userId: e.userId ?? null,
          email: e.email ?? null,
          name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.email,
        });
      }
      return Array.from(out.values());
    }

    // Member-based audiences
    const roleMap: Record<string, string> = {
      ROLE_STUDENT: "student",
      ROLE_PARENT: "parent",
      ROLE_INSTRUCTOR: "instructor",
      ROLE_OFFICE_MANAGER: "office_manager",
      ROLE_TENANT_ADMIN: "tenant_admin",
    };
    const conditions: any[] = [
      eq(tenantMembers.tenantId, tenantId),
      eq(tenantMembers.status, "ACTIVE" as any),
    ];
    if (audience !== "ALL_MEMBERS") {
      const role = roleMap[audience];
      if (role) conditions.push(eq(tenantMembers.role, role as any));
    }
    const rows = await db
      .select({
        member: tenantMembers,
        user: users,
      })
      .from(tenantMembers)
      .leftJoin(users, eq(tenantMembers.userId, users.id))
      .where(and(...conditions));

    for (const row of rows) {
      const m = row.member;
      if (locationIds && locationIds.length > 0) {
        const scope = m.locationScope;
        if (scope !== "ALL") {
          const arr = Array.isArray(scope) ? scope : [];
          if (!arr.some((id) => locationIds.includes(id))) continue;
        }
      }
      const fn = row.user?.firstName || m.firstName || "";
      const ln = row.user?.lastName || m.lastName || "";
      const name = `${fn} ${ln}`.trim() || row.user?.email || m.emailInvited || "Member";
      add({
        userId: m.userId ?? null,
        email: row.user?.email || m.emailInvited || null,
        name,
      });
    }
    return Array.from(out.values());
  }

  app.post("/api/tenants/:tenantId/broadcasts/preview", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = broadcastPreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const recipients = await resolveBroadcastRecipients(
        tenantId,
        parsed.data.audience,
        parsed.data.locationIds,
        {
          offeringId: parsed.data.offeringId,
          customEmails: parsed.data.customEmails,
          staleDays: parsed.data.staleDays,
        },
      );
      res.json({
        recipientCount: recipients.length,
        emailCount: recipients.filter((r) => !!r.email).length,
        inAppCount: recipients.filter((r) => !!r.userId).length,
        sampleNames: recipients.slice(0, 5).map((r) => r.name),
      });
    } catch (err) {
      console.error("Failed to preview broadcast:", err);
      res.status(500).json({ message: "Failed to preview broadcast" });
    }
  });

  app.post("/api/tenants/:tenantId/broadcasts", isAuthenticated, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId);
      const actor = await storage.getTenantMember(tenantId, req.user.claims.sub);
      if (!actor || !["tenant_admin", "office_manager", "platform_admin"].includes(actor.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = broadcastSendSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      const { audience, locationIds, channels, subject, body } = parsed.data;

      const recipients = await resolveBroadcastRecipients(tenantId, audience, locationIds, {
        offeringId: parsed.data.offeringId,
        customEmails: parsed.data.customEmails,
        staleDays: parsed.data.staleDays,
      });
      if (recipients.length === 0) {
        return res.status(400).json({ message: "No recipients match this audience." });
      }

      const tally = {
        sent: 0,
        skippedUnsubscribed: 0,
        skippedNoProvider: 0,
        failed: 0,
        noEmail: 0,
      };
      let notifications = 0;

      const { sendEmail } = await import("./email-service");

      for (const r of recipients) {
        if (channels.email) {
          if (!r.email) {
            tally.noEmail++;
          } else {
            try {
              const result = await sendEmail({
                tenantId,
                to: r.email,
                recipientUserId: r.userId,
                subject,
                body,
                actorUserId: req.user.claims.sub,
              });
              if (result.status === "sent") tally.sent++;
              else if (result.status === "skipped_unsubscribed") tally.skippedUnsubscribed++;
              else if (result.status === "skipped_no_provider") tally.skippedNoProvider++;
              else tally.failed++;
            } catch (e) {
              tally.failed++;
            }
          }
        }
        if (channels.inApp && r.userId) {
          // Defensive cross-tenant guard: even if a recipient slipped through
          // with a userId from a different tenant, never deliver an in-app
          // notification to a user who is not an active member of THIS tenant.
          const isMember = await storage.getTenantMember(tenantId, r.userId);
          if (!isMember) {
            continue;
          }
          try {
            await storage.createNotification({
              userId: r.userId,
              type: "ticket_update",
              title: subject,
              message: body.length > 240 ? body.substring(0, 237) + "..." : body,
              link: "/notifications",
              read: false,
            });
            notifications++;
          } catch (e) {
            // best-effort
          }
        }
      }

      try {
        await storage.createAuditEvent({
          tenantId,
          actorUserId: req.user.claims.sub,
          action: "BROADCAST_SENT",
          targetType: "TENANT",
          targetId: tenantId,
          details: {
            audience,
            locationIds: locationIds ?? null,
            channels,
            subjectPreview: subject.substring(0, 100),
            recipients: recipients.length,
            email: tally,
            notifications,
          },
        });
      } catch {}

      res.json({
        recipients: recipients.length,
        email: tally,
        notifications,
      });
    } catch (err) {
      console.error("Failed to send broadcast:", err);
      res.status(500).json({ message: "Failed to send broadcast" });
    }
  });

  return httpServer;
}

async function notifyPlatformTeam(title: string, message: string, link?: string) {
  try {
    const members = await db.select({ userId: platformMembers.userId }).from(platformMembers).where(eq(platformMembers.active, true));
    if (members.length === 0) return;
    const notifs = members.map((m) => ({
      userId: m.userId,
      type: "ticket_update",
      title,
      message,
      link: link || "/platform/tickets",
      read: false,
    }));
    await storage.createNotifications(notifs);
  } catch (error) {
    console.error("Error notifying platform team:", error);
  }
}

async function notifyUser(userId: string, title: string, message: string, link?: string) {
  try {
    await storage.createNotification({
      userId,
      type: "ticket_update",
      title,
      message,
      link: link || "/admin/tickets",
      read: false,
    });
  } catch (error) {
    console.error("Error notifying user:", error);
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.substring(0, 4) + "****" + key.substring(key.length - 4);
}

async function findEnrollmentDirectly(id: number) {
  const { db } = await import("./db");
  const { enrollments } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const [e] = await db.select().from(enrollments).where(eq(enrollments.id, id));
  return e;
}
