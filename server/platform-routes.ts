import type { Express, Request, Response, NextFunction } from "express";
import { isAuthenticated } from "./replit_integrations/auth";
import { db } from "./db";
import { platformMembers, tenants, tenantMembers, users, enrollments, locations, payments, leads, leadNotes, insertLeadSchema, passwordResetTokens, supportTickets, affiliates, affiliateReferrals, affiliateCommissions, platformPlans, tenantInvoices } from "@shared/schema";
import { applyDemoData, purgePreviewData } from "./demo-data";
import { seedDemoTenant, clearDemoTenant } from "./seed-demo-tenant";
import { storage } from "./storage";
import { eq, sql, and, count, desc, gte, or, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { generateToolkitPDF } from "./toolkit-pdf";
import { calculateCommissionsForInvoice } from "./affiliate-billing";

async function getPlatformMember(userId: string) {
  const [member] = await db
    .select()
    .from(platformMembers)
    .where(and(eq(platformMembers.userId, userId), eq(platformMembers.active, true)));
  return member || null;
}

function requirePlatformRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const member = await getPlatformMember(user.claims.sub);
    if (!member || !roles.includes(member.role)) {
      return res.status(403).json({ message: "Forbidden: Platform access required" });
    }
    (req as any).platformRole = member.role;
    next();
  };
}

const requirePlatformAccess = requirePlatformRole("admin", "support");
const requirePlatformAdmin = requirePlatformRole("admin");

export function registerPlatformRoutes(app: Express): void {
  app.get(
    "/api/platform/membership",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const member = await getPlatformMember(req.user.claims.sub);
        if (!member) {
          return res.json({ isPlatformMember: false, role: null });
        }
        return res.json({ isPlatformMember: true, role: member.role });
      } catch (error) {
        console.error("Error checking platform membership:", error);
        return res.status(500).json({ message: "Failed to check membership" });
      }
    }
  );

  app.get(
    "/api/platform/stats",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const [tenantCount] = await db
          .select({ count: count() })
          .from(tenants)
          .where(eq(tenants.active, true));

        const [enrollmentCount] = await db
          .select({ count: count() })
          .from(enrollments);

        const [memberCount] = await db
          .select({ count: count() })
          .from(tenantMembers);

        const [userCount] = await db
          .select({ count: count() })
          .from(users);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [recentEnrollments] = await db
          .select({ count: count() })
          .from(enrollments)
          .where(gte(enrollments.createdAt, thirtyDaysAgo));

        const [recentUsers] = await db
          .select({ count: count() })
          .from(users)
          .where(gte(users.createdAt, thirtyDaysAgo));

        const revenueResult = await db
          .select({ total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)` })
          .from(payments)
          .where(eq(payments.status, "COMPLETED" as any));
        const totalRevenue = parseInt(revenueResult[0]?.total || "0", 10);

        const enrollmentsByMonth = await db
          .select({
            month: sql<string>`to_char(${enrollments.createdAt}, 'YYYY-MM')`,
            count: count(),
          })
          .from(enrollments)
          .where(gte(enrollments.createdAt, sql`NOW() - INTERVAL '12 months'`))
          .groupBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`)
          .orderBy(sql`to_char(${enrollments.createdAt}, 'YYYY-MM')`);

        const tenantsByMonth = await db
          .select({
            month: sql<string>`to_char(${tenants.createdAt}, 'YYYY-MM')`,
            count: count(),
          })
          .from(tenants)
          .where(gte(tenants.createdAt, sql`NOW() - INTERVAL '12 months'`))
          .groupBy(sql`to_char(${tenants.createdAt}, 'YYYY-MM')`)
          .orderBy(sql`to_char(${tenants.createdAt}, 'YYYY-MM')`);

        const signupsByMonth = await db
          .select({
            month: sql<string>`to_char(${users.createdAt}, 'YYYY-MM')`,
            count: count(),
          })
          .from(users)
          .where(gte(users.createdAt, sql`NOW() - INTERVAL '12 months'`))
          .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM')`)
          .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM')`);

        const [totalTicketCount] = await db.select({ count: count() }).from(supportTickets);
        const [openTicketCount] = await db.select({ count: count() }).from(supportTickets).where(
          or(
            eq(supportTickets.status, "open" as any),
            eq(supportTickets.status, "acknowledged" as any),
            eq(supportTickets.status, "planned" as any),
            eq(supportTickets.status, "wip" as any),
          )
        );
        const [readyTicketCount] = await db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.status, "ready" as any));

        const [totalAffiliateCount] = await db.select({ count: count() }).from(affiliates);
        const [activeAffiliateCount] = await db.select({ count: count() }).from(affiliates).where(eq(affiliates.status, "active"));
        const [commissionsPaid] = await db
          .select({ total: sql<number>`coalesce(sum(${affiliateCommissions.amountCents}), 0)::int` })
          .from(affiliateCommissions)
          .where(eq(affiliateCommissions.status, "paid"));

        const [activeSubCount] = await db
          .select({ count: count() })
          .from(tenants)
          .where(eq(tenants.subscriptionStatus, "active"));

        const mrrResult = await db
          .select({ total: sql<string>`COALESCE(SUM(${platformPlans.monthlyPriceCents}), 0)` })
          .from(tenants)
          .innerJoin(platformPlans, eq(tenants.planId, platformPlans.id))
          .where(eq(tenants.subscriptionStatus, "active"));
        const mrr = parseInt(mrrResult[0]?.total || "0", 10);

        const invoiceSummary = await storage.getInvoiceSummary();
        const overdueInvoices = await storage.getOverdueInvoices();

        return res.json({
          totalTenants: tenantCount.count,
          totalEnrollments: enrollmentCount.count,
          totalMembers: memberCount.count,
          totalUsers: userCount.count,
          totalRevenue,
          recentEnrollments: recentEnrollments.count,
          recentSignups: recentUsers.count,
          enrollmentsByMonth,
          tenantsByMonth,
          signupsByMonth,
          totalTickets: totalTicketCount.count,
          openTickets: openTicketCount.count,
          readyTickets: readyTicketCount.count,
          totalAffiliates: totalAffiliateCount.count,
          activeAffiliates: activeAffiliateCount.count,
          totalCommissionsPaidCents: commissionsPaid.total,
          mrr,
          activeSubscriptions: activeSubCount.count,
          totalInvoicedCents: invoiceSummary.pending + invoiceSummary.paid + invoiceSummary.failed,
          totalCollectedCents: invoiceSummary.paid,
          overdueInvoiceCount: overdueInvoices.length,
        });
      } catch (error) {
        console.error("Error fetching platform stats:", error);
        return res.status(500).json({ message: "Failed to fetch stats" });
      }
    }
  );

  app.get(
    "/api/platform/tenants",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const allTenants = await db
          .select({
            id: tenants.id,
            name: tenants.name,
            slug: tenants.slug,
            email: tenants.email,
            phone: tenants.phone,
            active: tenants.active,
            createdAt: tenants.createdAt,
            customDomain: tenants.customDomain,
            domainVerified: tenants.domainVerified,
            logoUrl: tenants.logoUrl,
            previewMode: tenants.previewMode,
            websiteEnabled: tenants.websiteEnabled,
            planId: tenants.planId,
            subscriptionStatus: tenants.subscriptionStatus,
            billingEmail: tenants.billingEmail,
            trialEndsAt: tenants.trialEndsAt,
            currentPeriodStart: tenants.currentPeriodStart,
            currentPeriodEnd: tenants.currentPeriodEnd,
            stripeCustomerId: tenants.stripeCustomerId,
          })
          .from(tenants)
          .orderBy(desc(tenants.createdAt));

        const plans = await storage.getAllPlans();
        const planMap = new Map(plans.map((p: any) => [p.id, p]));

        const tenantsWithStats = await Promise.all(
          allTenants.map(async (tenant) => {
            const [locCount] = await db
              .select({ count: count() })
              .from(locations)
              .where(eq(locations.tenantId, tenant.id));

            const [memCount] = await db
              .select({ count: count() })
              .from(tenantMembers)
              .where(eq(tenantMembers.tenantId, tenant.id));

            const [enrCount] = await db
              .select({ count: count() })
              .from(enrollments)
              .where(eq(enrollments.tenantId, tenant.id));

            const plan = tenant.planId ? planMap.get(tenant.planId) : null;
            return {
              ...tenant,
              locationCount: locCount.count,
              memberCount: memCount.count,
              enrollmentCount: enrCount.count,
              planName: plan?.name || null,
              monthlyPriceCents: plan?.monthlyPriceCents || null,
              maxLocations: plan?.maxLocations || null,
              maxStudents: plan?.maxStudents || null,
              maxInstructors: plan?.maxInstructors || null,
            };
          })
        );

        return res.json(tenantsWithStats);
      } catch (error) {
        console.error("Error fetching platform tenants:", error);
        return res.status(500).json({ message: "Failed to fetch tenants" });
      }
    }
  );

  app.get(
    "/api/platform/members",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const members = await db
          .select({
            id: platformMembers.id,
            userId: platformMembers.userId,
            role: platformMembers.role,
            active: platformMembers.active,
            createdAt: platformMembers.createdAt,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(platformMembers)
          .innerJoin(users, eq(platformMembers.userId, users.id))
          .orderBy(desc(platformMembers.createdAt));

        return res.json(members);
      } catch (error) {
        console.error("Error fetching platform members:", error);
        return res.status(500).json({ message: "Failed to fetch members" });
      }
    }
  );

  const addMemberSchema = z.object({
    email: z.string().email().transform((e) => e.toLowerCase().trim()),
    role: z.enum(["admin", "support"]),
  });

  app.post(
    "/api/platform/members",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const parsed = addMemberSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0].message });
        }

        const { email, role } = parsed.data;
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) {
          return res.status(404).json({ message: "No user found with that email. They must register first." });
        }

        const [existing] = await db
          .select()
          .from(platformMembers)
          .where(eq(platformMembers.userId, user.id));
        if (existing) {
          return res.status(409).json({ message: "User is already a platform member" });
        }

        const [member] = await db
          .insert(platformMembers)
          .values({ userId: user.id, role, active: true })
          .returning();

        return res.status(201).json({
          ...member,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        });
      } catch (error) {
        console.error("Error adding platform member:", error);
        return res.status(500).json({ message: "Failed to add member" });
      }
    }
  );

  app.patch(
    "/api/platform/members/:id",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        const { role, active } = req.body;
        const updates: any = {};
        if (role) updates.role = role;
        if (typeof active === "boolean") updates.active = active;

        const [updated] = await db
          .update(platformMembers)
          .set(updates)
          .where(eq(platformMembers.id, id))
          .returning();

        if (!updated) {
          return res.status(404).json({ message: "Member not found" });
        }

        return res.json(updated);
      } catch (error) {
        console.error("Error updating platform member:", error);
        return res.status(500).json({ message: "Failed to update member" });
      }
    }
  );

  app.delete(
    "/api/platform/members/:id",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);

        const [member] = await db
          .select()
          .from(platformMembers)
          .where(eq(platformMembers.id, id));
        if (!member) {
          return res.status(404).json({ message: "Member not found" });
        }

        if (member.userId === req.user.claims.sub) {
          return res.status(400).json({ message: "Cannot remove yourself" });
        }

        await db.delete(platformMembers).where(eq(platformMembers.id, id));
        return res.json({ message: "Member removed" });
      } catch (error) {
        console.error("Error deleting platform member:", error);
        return res.status(500).json({ message: "Failed to remove member" });
      }
    }
  );

  const leadRateLimit = new Map<string, { count: number; resetAt: number }>();

  const leadSubmitSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    phone: z.string().optional().nullable(),
    schoolName: z.string().min(1, "School name is required"),
    city: z.string().optional().nullable(),
    locationsRange: z.string().optional().nullable(),
    primaryNeed: z.string().optional().nullable(),
    source: z.string().optional().default("lead-magnet"),
    referralCode: z.string().optional().nullable(),
  });

  app.get("/api/toolkit/download", async (_req, res) => {
    try {
      const pdfBuffer = await generateToolkitPDF();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="Texas-Driving-School-Growth-Toolkit.pdf"');
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating toolkit PDF:", error);
      res.status(500).json({ error: "Failed to generate toolkit" });
    }
  });

  app.post("/api/leads", async (req: any, res) => {
    try {
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      const now = Date.now();
      const windowMs = 15 * 60 * 1000;
      const maxRequests = 5;

      const entry = leadRateLimit.get(ip);
      if (entry) {
        if (now < entry.resetAt) {
          if (entry.count >= maxRequests) {
            return res.status(429).json({ ok: false, error: "Too many submissions. Please try again later." });
          }
          entry.count++;
        } else {
          leadRateLimit.set(ip, { count: 1, resetAt: now + windowMs });
        }
      } else {
        leadRateLimit.set(ip, { count: 1, resetAt: now + windowMs });
      }

      const parsed = leadSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: parsed.error.errors[0]?.message || "Invalid data" });
      }

      await db.insert(leads).values({
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase().trim(),
        phone: parsed.data.phone || null,
        schoolName: parsed.data.schoolName,
        city: parsed.data.city || null,
        locationsRange: parsed.data.locationsRange || null,
        primaryNeed: parsed.data.primaryNeed || null,
        source: parsed.data.source,
        referralCode: parsed.data.referralCode || null,
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error("Error creating lead:", error);
      return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
    }
  });

  app.get(
    "/api/platform/leads",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const search = (req.query.search as string) || "";
        const statusFilter = (req.query.status as string) || "";
        const conditions: any[] = [];

        if (search.trim()) {
          const searchTerm = `%${search.trim()}%`;
          conditions.push(
            or(
              ilike(leads.email, searchTerm),
              ilike(leads.schoolName, searchTerm),
              ilike(leads.name, searchTerm)
            )
          );
        }

        if (statusFilter && statusFilter !== "all") {
          conditions.push(eq(leads.status, statusFilter as any));
        }

        let query = db.select().from(leads).orderBy(desc(leads.createdAt));
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        const results = await query;
        return res.json(results);
      } catch (error) {
        console.error("Error fetching leads:", error);
        return res.status(500).json({ message: "Failed to fetch leads" });
      }
    }
  );

  app.get(
    "/api/platform/leads/:id",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const leadId = parseInt(req.params.id);
        if (isNaN(leadId)) return res.status(400).json({ message: "Invalid lead ID" });

        const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        const notes = await db
          .select({
            id: leadNotes.id,
            leadId: leadNotes.leadId,
            authorId: leadNotes.authorId,
            content: leadNotes.content,
            type: leadNotes.type,
            createdAt: leadNotes.createdAt,
            authorFirstName: users.firstName,
            authorLastName: users.lastName,
            authorEmail: users.email,
          })
          .from(leadNotes)
          .leftJoin(users, eq(leadNotes.authorId, users.id))
          .where(eq(leadNotes.leadId, leadId))
          .orderBy(desc(leadNotes.createdAt));

        let convertedTenant = null;
        if (lead.convertedTenantId) {
          const [tenant] = await db.select().from(tenants).where(eq(tenants.id, lead.convertedTenantId));
          convertedTenant = tenant || null;
        }

        return res.json({ lead, notes, convertedTenant });
      } catch (error) {
        console.error("Error fetching lead detail:", error);
        return res.status(500).json({ message: "Failed to fetch lead" });
      }
    }
  );

  app.patch(
    "/api/platform/leads/:id/status",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const leadId = parseInt(req.params.id);
        if (isNaN(leadId)) return res.status(400).json({ message: "Invalid lead ID" });

        const schema = z.object({ status: z.enum(["new", "contacted", "qualified", "converted", "lost"]) });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid status" });

        const [updated] = await db
          .update(leads)
          .set({ status: parsed.data.status })
          .where(eq(leads.id, leadId))
          .returning();

        if (!updated) return res.status(404).json({ message: "Lead not found" });

        await db.insert(leadNotes).values({
          leadId,
          authorId: req.user.claims.sub,
          content: `Status changed to "${parsed.data.status}"`,
          type: "status_change",
        });

        return res.json(updated);
      } catch (error) {
        console.error("Error updating lead status:", error);
        return res.status(500).json({ message: "Failed to update status" });
      }
    }
  );

  app.post(
    "/api/platform/leads/:id/notes",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const leadId = parseInt(req.params.id);
        if (isNaN(leadId)) return res.status(400).json({ message: "Invalid lead ID" });

        const schema = z.object({ content: z.string().min(1, "Note cannot be empty") });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

        const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        const [note] = await db
          .insert(leadNotes)
          .values({
            leadId,
            authorId: req.user.claims.sub,
            content: parsed.data.content,
            type: "note",
          })
          .returning();

        return res.json(note);
      } catch (error) {
        console.error("Error adding note:", error);
        return res.status(500).json({ message: "Failed to add note" });
      }
    }
  );

  app.post(
    "/api/platform/leads/:id/convert",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const leadId = parseInt(req.params.id);
        if (isNaN(leadId)) return res.status(400).json({ message: "Invalid lead ID" });

        const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
        if (!lead) return res.status(404).json({ message: "Lead not found" });
        if (lead.status === "converted") return res.status(400).json({ message: "Lead is already converted" });

        const slug = lead.schoolName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 50);

        const existingSlugs = await db
          .select({ slug: tenants.slug })
          .from(tenants)
          .where(ilike(tenants.slug, `${slug}%`));
        const usedSlugs = new Set(existingSlugs.map((t) => t.slug));
        let finalSlug = slug;
        let counter = 2;
        while (usedSlugs.has(finalSlug)) {
          finalSlug = `${slug}-${counter}`;
          counter++;
        }

        const [tenant] = await db
          .insert(tenants)
          .values({
            name: lead.schoolName,
            slug: finalSlug,
            email: lead.email,
            phone: lead.phone || null,
          })
          .returning();

        let [existingUser] = await db.select().from(users).where(eq(users.email, lead.email.toLowerCase().trim()));
        let isNewUser = false;
        let tempPassword: string | null = null;

        if (!existingUser) {
          isNewUser = true;
          tempPassword = Math.random().toString(36).slice(-10) + "A1!";
          const hash = await bcrypt.hash(tempPassword, 10);
          [existingUser] = await db
            .insert(users)
            .values({
              email: lead.email.toLowerCase().trim(),
              passwordHash: hash,
              firstName: lead.name.split(" ")[0] || lead.name,
              lastName: lead.name.split(" ").slice(1).join(" ") || null,
            })
            .returning();
        }

        await db.insert(tenantMembers).values({
          tenantId: tenant.id,
          userId: existingUser.id,
          role: "tenant_admin",
          status: "ACTIVE",
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          phone: lead.phone || null,
        });

        const PLATFORM_OWNER_EMAIL = "solutions@plaidware.com";
        let platformOwnerAdded = false;
        try {
          const [platformOwner] = await db.select().from(users).where(eq(users.email, PLATFORM_OWNER_EMAIL));
          if (platformOwner && platformOwner.id !== existingUser.id) {
            await db.insert(tenantMembers).values({
              tenantId: tenant.id,
              userId: platformOwner.id,
              role: "tenant_admin",
              status: "ACTIVE",
              firstName: platformOwner.firstName,
              lastName: platformOwner.lastName,
              phone: null,
            });
            platformOwnerAdded = true;
          }
        } catch (ownerErr) {
          console.warn("Could not add platform owner as tenant admin:", ownerErr);
        }

        await db
          .update(leads)
          .set({ status: "converted", convertedTenantId: tenant.id })
          .where(eq(leads.id, leadId));

        const refCode = req.body.referralCode || lead.referralCode;
        if (refCode) {
          try {
            const affiliate = await storage.getAffiliateByCode(refCode);
            if (affiliate && affiliate.status === "active") {
              const existingRef = await storage.getReferralByTenant(tenant.id);
              if (!existingRef) {
                await storage.createAffiliateReferral({
                  affiliateId: affiliate.id,
                  tenantId: tenant.id,
                  status: "pending",
                });
              }
            }
          } catch (refErr) {
            console.error("Error creating affiliate referral:", refErr);
          }
        }

        await db.insert(leadNotes).values({
          leadId,
          authorId: req.user.claims.sub,
          content: `Converted to tenant "${tenant.name}" (ID: ${tenant.id}). Admin accounts: ${lead.email}${platformOwnerAdded ? `, ${PLATFORM_OWNER_EMAIL}` : ""}`,
          type: "conversion",
        });

        const { generateWebsite, templateId, enablePreview } = req.body || {};

        if (enablePreview) {
          try {
            await applyDemoData(tenant.id);
            await db.update(tenants).set({ previewMode: true, previewEnabledAt: new Date() }).where(eq(tenants.id, tenant.id));
            await db.insert(leadNotes).values({
              leadId,
              authorId: req.user.claims.sub,
              content: `Preview mode enabled with demo data for tenant "${tenant.name}"`,
              type: "note",
            });
          } catch (previewErr) {
            console.error("Error applying demo data during conversion:", previewErr);
          }
        }

        return res.json({
          ok: true,
          tenant,
          isNewUser,
          tempPassword: isNewUser ? tempPassword : null,
          message: `School "${tenant.name}" created successfully`,
          websiteGenerated: false,
          pagesCreated: 0,
        });
      } catch (error) {
        console.error("Error converting lead:", error);
        return res.status(500).json({ message: "Failed to convert lead to tenant" });
      }
    }
  );

  app.get(
    "/api/platform/tenants/:id",
    isAuthenticated,
    requirePlatformRole("admin"),
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });
        return res.json(tenant);
      } catch (error) {
        console.error("Error fetching tenant:", error);
        return res.status(500).json({ message: "Failed to fetch tenant" });
      }
    }
  );

  app.post(
    "/api/platform/tenants/:id/enable-preview",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });
        await purgePreviewData(tenantId);
        await applyDemoData(tenantId);
        const [updated] = await db
          .update(tenants)
          .set({ previewMode: true, previewEnabledAt: new Date() })
          .where(eq(tenants.id, tenantId))
          .returning();
        return res.json({ ok: true, tenant: updated });
      } catch (error) {
        console.error("Error enabling preview:", error);
        return res.status(500).json({ message: "Failed to enable preview mode" });
      }
    }
  );

  app.post(
    "/api/platform/tenants/:id/seed-demo-data",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const bodySchema = z.object({
          locationIds: z.array(z.number().int().positive()).optional(),
          instructorUserId: z.string().min(1).optional(),
        });
        const parsed = bodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        }

        const actorId = req.user?.claims?.sub ?? "unknown";
        console.log(
          `[platform-audit] seed-demo-data tenant=${tenantId} actor=${actorId} options=${JSON.stringify(parsed.data)}`,
        );
        const summary = await seedDemoTenant({ tenantId, ...parsed.data });
        const totals = Object.entries(summary.counts).reduce(
          (acc, [, c]) => {
            acc.created += c.created;
            acc.existed += c.existed;
            return acc;
          },
          { created: 0, existed: 0 },
        );
        console.log(
          `[platform-audit] seed-demo-data tenant=${tenantId} actor=${actorId} created=${totals.created} existed=${totals.existed}`,
        );
        return res.json({ ok: true, summary, totals });
      } catch (error: any) {
        console.error("Error seeding demo data:", error);
        const msg = String(error?.message || "Failed to seed demo data");
        // Surface known precondition failures from seedDemoTenant as 400s so
        // the UI can show a helpful message instead of a generic server error.
        const isPrecondition =
          /no locations|no active instructor|not an active instructor|Location \d+ not found/i.test(
            msg,
          );
        return res.status(isPrecondition ? 400 : 500).json({ message: msg });
      }
    },
  );

  app.post(
    "/api/platform/tenants/:id/clear-demo-data",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const actorId = req.user?.claims?.sub ?? "unknown";
        console.log(
          `[platform-audit] clear-demo-data tenant=${tenantId} actor=${actorId}`,
        );
        const summary = await clearDemoTenant({ tenantId });
        const totals = Object.entries(summary.counts).reduce(
          (acc, [, c]) => {
            acc.deleted += c.deleted;
            acc.skipped += c.skipped;
            return acc;
          },
          { deleted: 0, skipped: 0 },
        );
        console.log(
          `[platform-audit] clear-demo-data tenant=${tenantId} actor=${actorId} deleted=${totals.deleted} skipped=${totals.skipped}`,
        );
        return res.json({ ok: true, summary, totals });
      } catch (error: any) {
        console.error("Error clearing demo data:", error);
        const msg = String(error?.message || "Failed to clear demo data");
        const isPrecondition = /Tenant \d+ not found/i.test(msg);
        return res.status(isPrecondition ? 400 : 500).json({ message: msg });
      }
    },
  );

  app.post(
    "/api/platform/tenants/:id/disable-preview",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });
        await purgePreviewData(tenantId);
        const [updated] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        return res.json({ ok: true, tenant: updated });
      } catch (error) {
        console.error("Error disabling preview:", error);
        return res.status(500).json({ message: "Failed to disable preview mode" });
      }
    }
  );

  app.post(
    "/api/platform/reset-user-password",
    isAuthenticated,
    requirePlatformRole("admin"),
    async (req: any, res) => {
      try {
        const { email } = z.object({ email: z.string().email() }).parse(req.body);
        const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
        if (!user) {
          return res.status(404).json({ message: "No user found with that email address" });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.update(passwordResetTokens)
          .set({ used: true })
          .where(and(eq(passwordResetTokens.userId, user.id), eq(passwordResetTokens.used, false)));

        await db.insert(passwordResetTokens).values({
          userId: user.id,
          token,
          expiresAt,
        });

        return res.json({
          message: `Reset link generated for ${email}`,
          resetToken: token,
        });
      } catch (error: any) {
        if (error?.name === "ZodError") {
          return res.status(400).json({ message: "Please provide a valid email" });
        }
        console.error("Admin reset password error:", error);
        return res.status(500).json({ message: "Failed to generate reset link" });
      }
    }
  );

  app.get(
    "/api/platform/tickets",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const { status, type, search } = req.query;
        const tickets = await storage.getAllSupportTickets({
          status: status as string,
          type: type as string,
          search: search as string,
        });
        res.json(tickets);
      } catch (error) {
        console.error("Error fetching platform tickets:", error);
        res.status(500).json({ message: "Failed to fetch tickets" });
      }
    }
  );

  app.get(
    "/api/platform/tickets/stats",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const stats = await db
          .select({
            status: supportTickets.status,
            count: sql<number>`count(*)::int`,
          })
          .from(supportTickets)
          .groupBy(supportTickets.status);
        const result: Record<string, number> = { open: 0, acknowledged: 0, planned: 0, wip: 0, ready: 0, resolved: 0, closed: 0, cancelled: 0 };
        for (const row of stats) {
          result[row.status] = row.count;
        }
        res.json(result);
      } catch (error) {
        console.error("Error fetching ticket stats:", error);
        res.status(500).json({ message: "Failed to fetch ticket stats" });
      }
    }
  );

  app.get(
    "/api/platform/tickets/:ticketId",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const ticketId = parseInt(req.params.ticketId);
        const ticket = await storage.getSupportTicket(ticketId);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });
        const responses = await storage.getTicketResponses(ticketId, true);
        res.json({ ...ticket, responses });
      } catch (error) {
        console.error("Error fetching platform ticket:", error);
        res.status(500).json({ message: "Failed to fetch ticket" });
      }
    }
  );

  app.patch(
    "/api/platform/tickets/:ticketId",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const ticketId = parseInt(req.params.ticketId);
        const { status, priority } = req.body;
        const validStatuses = ["open", "acknowledged", "planned", "wip", "ready", "resolved", "closed", "cancelled"];
        const validPriorities = ["low", "medium", "high", null];
        if (status && !validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });
        if (priority !== undefined && !validPriorities.includes(priority)) return res.status(400).json({ message: "Invalid priority" });
        const existing = await storage.getSupportTicket(ticketId);
        if (!existing) return res.status(404).json({ message: "Ticket not found" });
        const ticket = await storage.updateSupportTicket(ticketId, { status, priority: priority !== undefined ? priority : undefined });
        if (status && status !== existing.status && existing.submittedByUserId) {
          const statusLabels: Record<string, string> = { open: "Open", acknowledged: "Acknowledged", planned: "Planned", wip: "In Progress", ready: "Ready", resolved: "Resolved", closed: "Closed", cancelled: "Cancelled" };
          await storage.createNotification({
            userId: existing.submittedByUserId,
            type: "ticket_update",
            title: `Ticket ${statusLabels[status] || status}`,
            message: `Your feedback "${existing.subject}" has been marked as ${statusLabels[status] || status}`,
            link: "/admin/tickets",
            read: false,
          });
        }
        res.json(ticket);
      } catch (error) {
        console.error("Error updating platform ticket:", error);
        res.status(500).json({ message: "Failed to update ticket" });
      }
    }
  );

  app.post(
    "/api/platform/tickets/:ticketId/responses",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const ticketId = parseInt(req.params.ticketId);
        const userId = req.user.claims.sub;
        const { content, isInternal } = req.body;
        if (!content) return res.status(400).json({ message: "Content is required" });
        const response = await storage.createTicketResponse({
          ticketId,
          authorUserId: userId,
          content,
          isInternal: isInternal || false,
        });
        if (!isInternal) {
          const ticket = await storage.getSupportTicket(ticketId);
          if (ticket?.submittedByUserId) {
            await storage.createNotification({
              userId: ticket.submittedByUserId,
              type: "ticket_response",
              title: "New Response",
              message: `The support team responded to your feedback: "${ticket.subject}"`,
              link: "/admin/tickets",
              read: false,
            });
          }
        }
        res.json(response);
      } catch (error) {
        console.error("Error creating platform ticket response:", error);
        res.status(500).json({ message: "Failed to create response" });
      }
    }
  );

  app.post(
    "/api/public/affiliate-apply",
    async (req: any, res) => {
      try {
        const applicationSchema = z.object({
          firstName: z.string().min(1, "First name is required"),
          lastName: z.string().min(1, "Last name is required"),
          email: z.string().email("Valid email is required"),
          phone: z.string().nullable().optional(),
          company: z.string().nullable().optional(),
          website: z.string().nullable().optional(),
          preferredModel: z.string().nullable().optional(),
          experience: z.string().nullable().optional(),
        });
        const parsed = applicationSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }
        const { firstName, lastName, email, phone, company, website, preferredModel, experience } = parsed.data;
        const application = await storage.createAffiliateApplication({
          firstName,
          lastName,
          email,
          phone: phone || null,
          company: company || null,
          website: website || null,
          preferredModel: preferredModel || null,
          experience: experience || null,
        });

        const pmRows = await db.select({ userId: platformMembers.userId }).from(platformMembers).where(eq(platformMembers.active, true));
        if (pmRows.length > 0) {
          const notifs = pmRows.map((pm: any) => ({
            userId: pm.userId,
            type: "affiliate_application",
            title: "New Affiliate Application",
            message: `${firstName} ${lastName} (${email}) submitted an affiliate application.`,
            link: "/platform/affiliates",
            read: false,
          }));
          await storage.createNotifications(notifs);
        }

        res.status(201).json({ message: "Application submitted successfully!", id: application.id });
      } catch (error) {
        console.error("Error submitting affiliate application:", error);
        res.status(500).json({ message: "Failed to submit application" });
      }
    }
  );

  app.get(
    "/api/platform/affiliate-applications",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const applications = await storage.getAffiliateApplications();
        res.json(applications);
      } catch (error) {
        console.error("Error fetching affiliate applications:", error);
        res.status(500).json({ message: "Failed to fetch applications" });
      }
    }
  );

  app.patch(
    "/api/platform/affiliate-applications/:id",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        const existing = await storage.getAffiliateApplication(id);
        if (!existing) {
          return res.status(404).json({ message: "Application not found" });
        }
        const updateSchema = z.object({
          status: z.enum(["pending", "approved", "rejected", "converted"]).optional(),
          notes: z.string().nullable().optional(),
        });
        const parsed = updateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
        }
        const application = await storage.updateAffiliateApplication(id, parsed.data);
        res.json(application);
      } catch (error) {
        console.error("Error updating affiliate application:", error);
        res.status(500).json({ message: "Failed to update application" });
      }
    }
  );

  app.get(
    "/api/public/affiliate-program-info",
    async (req: any, res) => {
      try {
        const settings = await storage.getMarketingProgramSettings();
        res.json({
          enabledModels: settings.enabledModels,
          recurringDefaultRate: settings.recurringDefaultRate,
          hybridDefaultUpfrontCents: settings.hybridDefaultUpfrontCents,
          hybridDefaultRecurringRate: settings.hybridDefaultRecurringRate,
          resellerDefaultWholesaleCents: settings.resellerDefaultWholesaleCents,
          tierSilverThreshold: settings.tierSilverThreshold,
          tierGoldThreshold: settings.tierGoldThreshold,
          tierSilverBonusRate: settings.tierSilverBonusRate,
          tierGoldBonusRate: settings.tierGoldBonusRate,
          minRetentionMonths: settings.minRetentionMonths,
        });
      } catch (error) {
        console.error("Error fetching public affiliate info:", error);
        res.status(500).json({ message: "Failed to fetch info" });
      }
    }
  );

  app.get(
    "/api/platform/marketing-settings",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const settings = await storage.getMarketingProgramSettings();
        res.json(settings);
      } catch (error) {
        console.error("Error fetching marketing settings:", error);
        res.status(500).json({ message: "Failed to fetch settings" });
      }
    }
  );

  app.patch(
    "/api/platform/marketing-settings",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const updated = await storage.updateMarketingProgramSettings(req.body);
        res.json(updated);
      } catch (error) {
        console.error("Error updating marketing settings:", error);
        res.status(500).json({ message: "Failed to update settings" });
      }
    }
  );

  app.get(
    "/api/platform/affiliates",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const allAffiliates = await storage.getAllAffiliates();
        res.json(allAffiliates);
      } catch (error) {
        console.error("Error fetching affiliates:", error);
        res.status(500).json({ message: "Failed to fetch affiliates" });
      }
    }
  );

  app.post(
    "/api/platform/affiliates",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const createAffiliateSchema = z.object({
          email: z.string().email(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          commissionModel: z.enum(["recurring", "hybrid", "reseller"]),
          recurringRate: z.number().int().min(1).max(100).optional().nullable(),
          hybridUpfrontCents: z.number().int().min(0).optional().nullable(),
          hybridRecurringRate: z.number().int().min(1).max(100).optional().nullable(),
          resellerWholesaleCents: z.number().int().min(0).optional().nullable(),
          paypalEmail: z.string().email().optional().nullable(),
          notes: z.string().optional().nullable(),
        });
        const parsed = createAffiliateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
        }
        const { email, firstName, lastName, commissionModel, recurringRate, hybridUpfrontCents, hybridRecurringRate, resellerWholesaleCents, paypalEmail, notes } = parsed.data;

        const settings = await storage.getMarketingProgramSettings();
        if (!settings.enabledModels.includes(commissionModel)) {
          return res.status(400).json({ message: `Commission model "${commissionModel}" is not enabled` });
        }

        let user = await storage.getUserByEmail(email.toLowerCase().trim());
        let isNewUser = false;
        if (!user) {
          isNewUser = true;
          const hash = await bcrypt.hash("password123", 10);
          user = await storage.upsertUser({
            email: email.toLowerCase().trim(),
            passwordHash: hash,
            firstName: firstName || null,
            lastName: lastName || null,
          });
        }

        const existingAffiliate = await storage.getAffiliateByUserId(user.id);
        if (existingAffiliate) {
          return res.status(400).json({ message: "This user is already an affiliate" });
        }

        const code = (firstName || email.split("@")[0]).toLowerCase().replace(/[^a-z0-9]/g, "") + "-" + crypto.randomBytes(3).toString("hex");

        const affiliate = await storage.createAffiliate({
          userId: user.id,
          code,
          commissionModel,
          recurringRate: recurringRate || null,
          hybridUpfrontCents: hybridUpfrontCents || null,
          hybridRecurringRate: hybridRecurringRate || null,
          resellerWholesaleCents: resellerWholesaleCents || null,
          paypalEmail: paypalEmail || null,
          notes: notes || null,
          status: "active",
          tier: "base",
        });

        res.json({ affiliate, isNewUser });
      } catch (error) {
        console.error("Error creating affiliate:", error);
        res.status(500).json({ message: "Failed to create affiliate" });
      }
    }
  );

  app.get(
    "/api/platform/affiliates/:id",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid affiliate ID" });

        const affiliate = await storage.getAffiliate(id);
        if (!affiliate) return res.status(404).json({ message: "Affiliate not found" });

        const referrals = await storage.getReferralsByAffiliate(id);
        const stats = await storage.getAffiliateStats(id);

        res.json({ ...affiliate, referrals, stats });
      } catch (error) {
        console.error("Error fetching affiliate:", error);
        res.status(500).json({ message: "Failed to fetch affiliate" });
      }
    }
  );

  app.patch(
    "/api/platform/affiliates/:id",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid affiliate ID" });

        const updated = await storage.updateAffiliate(id, req.body);
        res.json(updated);
      } catch (error) {
        console.error("Error updating affiliate:", error);
        res.status(500).json({ message: "Failed to update affiliate" });
      }
    }
  );

  app.get(
    "/api/platform/affiliates/:id/commissions",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid affiliate ID" });

        const commissions = await storage.getCommissionsByAffiliate(id, {
          status: req.query.status as string | undefined,
          period: req.query.period as string | undefined,
        });

        const enriched = await Promise.all(commissions.map(async (comm) => {
          let invoiceId: number | null = null;
          let invoiceAmountCents: number | null = null;
          let tenantName: string | null = null;
          let commissionRate: string | null = null;

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

          const rateMatch = comm.description?.match(/\((\d+)%\)/);
          if (rateMatch) {
            commissionRate = rateMatch[1] + "%";
          }
          const marginMatch = comm.description?.match(/(\d+)c - (\d+)c wholesale/);
          if (marginMatch) {
            commissionRate = `margin (${marginMatch[1]}c - ${marginMatch[2]}c)`;
          }

          if (!tenantName && comm.referralId) {
            try {
              const referrals = await storage.getReferralsByAffiliate(id);
              const ref = referrals.find((r: any) => r.id === comm.referralId);
              if (ref) tenantName = ref.tenantName;
            } catch {}
          }

          return {
            ...comm,
            invoiceId,
            invoiceAmountCents,
            tenantName,
            commissionRate,
          };
        }));

        res.json(enriched);
      } catch (error) {
        console.error("Error fetching commissions:", error);
        res.status(500).json({ message: "Failed to fetch commissions" });
      }
    }
  );

  app.get(
    "/api/platform/affiliates/:id/payouts",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid affiliate ID" });

        const payouts = await storage.getPayoutsByAffiliate(id);
        res.json(payouts);
      } catch (error) {
        console.error("Error fetching payouts:", error);
        res.status(500).json({ message: "Failed to fetch payouts" });
      }
    }
  );

  app.post(
    "/api/platform/affiliates/:id/payouts",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid affiliate ID" });

        const payoutSchema = z.object({
          amountCents: z.number().int().min(1),
          method: z.string().min(1),
          reference: z.string().optional().nullable(),
        });
        const parsed = payoutSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
        }

        const payout = await storage.createAffiliatePayout({
          affiliateId: id,
          amountCents: parsed.data.amountCents,
          method: parsed.data.method,
          reference: parsed.data.reference || null,
        });
        res.json(payout);
      } catch (error) {
        console.error("Error creating payout:", error);
        res.status(500).json({ message: "Failed to create payout" });
      }
    }
  );

  app.get(
    "/api/platform/plans",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const plans = await storage.getAllPlans();
        res.json(plans);
      } catch (error) {
        console.error("Error fetching plans:", error);
        res.status(500).json({ message: "Failed to fetch plans" });
      }
    }
  );

  app.post(
    "/api/platform/plans",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const planSchema = z.object({
          name: z.string().min(1, "Name is required"),
          slug: z.string().min(1, "Slug is required"),
          monthlyPriceCents: z.number().int().min(0),
          annualPriceCents: z.number().int().min(0).nullable().optional(),
          features: z.array(z.string()).optional().default([]),
          maxLocations: z.number().int().min(1).nullable().optional(),
          maxStudents: z.number().int().min(1).nullable().optional(),
          maxInstructors: z.number().int().min(1).nullable().optional(),
          active: z.boolean().optional().default(true),
          sortOrder: z.number().int().optional().default(0),
        });
        const parsed = planSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
        }
        const plan = await storage.createPlan(parsed.data);
        res.status(201).json(plan);
      } catch (error) {
        console.error("Error creating plan:", error);
        res.status(500).json({ message: "Failed to create plan" });
      }
    }
  );

  app.patch(
    "/api/platform/plans/:id",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid plan ID" });

        const existing = await storage.getPlan(id);
        if (!existing) return res.status(404).json({ message: "Plan not found" });

        const updateSchema = z.object({
          name: z.string().min(1).optional(),
          slug: z.string().min(1).optional(),
          monthlyPriceCents: z.number().int().min(0).optional(),
          annualPriceCents: z.number().int().min(0).nullable().optional(),
          features: z.array(z.string()).optional(),
          maxLocations: z.number().int().min(1).nullable().optional(),
          maxStudents: z.number().int().min(1).nullable().optional(),
          maxInstructors: z.number().int().min(1).nullable().optional(),
          active: z.boolean().optional(),
          sortOrder: z.number().int().optional(),
        });
        const parsed = updateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
        }
        const updated = await storage.updatePlan(id, parsed.data);
        res.json(updated);
      } catch (error) {
        console.error("Error updating plan:", error);
        res.status(500).json({ message: "Failed to update plan" });
      }
    }
  );

  app.patch(
    "/api/platform/tenants/:id/billing",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });

        const tenant = await storage.getTenant(tenantId);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const billingSchema = z.object({
          planId: z.number().int().nullable().optional(),
          subscriptionStatus: z.enum(["trialing", "active", "past_due", "canceled", "suspended"]).optional(),
          billingEmail: z.string().email().nullable().optional(),
          trialEndsAt: z.string().nullable().optional(),
          currentPeriodStart: z.string().nullable().optional(),
          currentPeriodEnd: z.string().nullable().optional(),
          stripeCustomerId: z.string().refine(v => v.startsWith("cus_"), { message: "Stripe Customer ID must start with \"cus_\"" }).nullable().optional(),
        });
        const parsed = billingSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
        }

        const updateData: any = {};
        if (parsed.data.planId !== undefined) updateData.planId = parsed.data.planId;
        if (parsed.data.subscriptionStatus !== undefined) updateData.subscriptionStatus = parsed.data.subscriptionStatus;
        if (parsed.data.billingEmail !== undefined) updateData.billingEmail = parsed.data.billingEmail;
        if (parsed.data.trialEndsAt !== undefined) updateData.trialEndsAt = parsed.data.trialEndsAt ? new Date(parsed.data.trialEndsAt) : null;
        if (parsed.data.currentPeriodStart !== undefined) updateData.currentPeriodStart = parsed.data.currentPeriodStart ? new Date(parsed.data.currentPeriodStart) : null;
        if (parsed.data.currentPeriodEnd !== undefined) updateData.currentPeriodEnd = parsed.data.currentPeriodEnd ? new Date(parsed.data.currentPeriodEnd) : null;
        if (parsed.data.stripeCustomerId !== undefined) {
          const newCid = parsed.data.stripeCustomerId;
          if (newCid !== null && newCid !== tenant.stripeCustomerId) {
            const secretKey = process.env.STRIPE_SECRET_KEY;
            if (!secretKey) {
              return res.status(503).json({ message: "STRIPE_SECRET_KEY is not configured; cannot verify Stripe Customer ID." });
            }
            try {
              const Stripe = (await import("stripe")).default;
              const stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
              const customer = await stripe.customers.retrieve(newCid);
              if ((customer as any).deleted) {
                return res.status(422).json({ message: `Stripe Customer ID ${newCid} has been deleted and cannot be linked.` });
              }
            } catch (stripeErr: any) {
              if (stripeErr?.code === "resource_missing") {
                return res.status(422).json({ message: `Stripe Customer ID ${newCid} does not exist in Stripe.` });
              }
              return res.status(503).json({ message: `Could not verify Stripe Customer ID: ${stripeErr?.message || "unknown error"}` });
            }
          }
          updateData.stripeCustomerId = newCid;
        }

        const updated = await storage.updateTenantBilling(tenantId, updateData);
        res.json(updated);
      } catch (error) {
        console.error("Error updating tenant billing:", error);
        res.status(500).json({ message: "Failed to update billing" });
      }
    }
  );

  app.get(
    "/api/platform/tenants/:id/stripe-status",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });

        const tenant = await storage.getTenant(tenantId);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        if (!tenant.stripeCustomerId) {
          return res.json({ hasCustomer: false });
        }

        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
          return res.json({ hasCustomer: true, error: "STRIPE_SECRET_KEY not configured on platform" });
        }

        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });

        const [subscriptions, invoiceList] = await Promise.all([
          stripe.subscriptions.list({ customer: tenant.stripeCustomerId, limit: 5, status: "all" }),
          stripe.invoices.list({ customer: tenant.stripeCustomerId, limit: 10 }),
        ]);

        const activeSub = subscriptions.data.find((s) => s.status === "active" || s.status === "trialing") ?? subscriptions.data[0] ?? null;

        return res.json({
          hasCustomer: true,
          customerId: tenant.stripeCustomerId,
          subscription: activeSub
            ? {
                id: activeSub.id,
                status: activeSub.status,
                currentPeriodStart: new Date(activeSub.current_period_start * 1000).toISOString(),
                currentPeriodEnd: new Date(activeSub.current_period_end * 1000).toISOString(),
                cancelAtPeriodEnd: activeSub.cancel_at_period_end,
                items: activeSub.items.data.map((item) => ({
                  id: item.id,
                  priceId: item.price.id,
                  productId: typeof item.price.product === "string" ? item.price.product : (item.price.product as any)?.id,
                  nickname: item.price.nickname,
                  unitAmount: item.price.unit_amount,
                  currency: item.price.currency,
                  interval: item.price.recurring?.interval,
                })),
              }
            : null,
          invoices: invoiceList.data.map((inv) => ({
            id: inv.id,
            amountPaid: inv.amount_paid,
            currency: inv.currency,
            status: inv.status,
            paidAt: inv.status_transitions?.paid_at
              ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
              : null,
            createdAt: new Date(inv.created * 1000).toISOString(),
            hostedInvoiceUrl: inv.hosted_invoice_url,
          })),
        });
      } catch (error: any) {
        console.error("Error fetching Stripe status:", error);
        res.status(500).json({ message: error?.message || "Failed to fetch Stripe status" });
      }
    }
  );

  app.get(
    "/api/platform/tenants/:id/invoices",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const tenantId = parseInt(req.params.id);
        if (isNaN(tenantId)) return res.status(400).json({ message: "Invalid tenant ID" });

        const invoices = await storage.getInvoicesByTenant(tenantId);
        res.json(invoices);
      } catch (error) {
        console.error("Error fetching tenant invoices:", error);
        res.status(500).json({ message: "Failed to fetch invoices" });
      }
    }
  );

  app.get(
    "/api/platform/invoices",
    isAuthenticated,
    requirePlatformAccess,
    async (req: any, res) => {
      try {
        const filters: { status?: string; tenantId?: number; from?: Date; to?: Date } = {};
        if (req.query.status) filters.status = req.query.status as string;
        if (req.query.tenantId) filters.tenantId = parseInt(req.query.tenantId as string);
        if (req.query.from) filters.from = new Date(req.query.from as string);
        if (req.query.to) filters.to = new Date(req.query.to as string);

        const invoices = await storage.getAllInvoices(filters);

        const tenantIds = Array.from(new Set(invoices.map((inv) => inv.tenantId)));
        const tenantMap = new Map<number, string>();
        for (const tid of tenantIds) {
          const t = await storage.getTenant(tid);
          if (t) tenantMap.set(tid, t.name);
        }

        const enriched = invoices.map((inv) => ({
          ...inv,
          tenantName: tenantMap.get(inv.tenantId) || "Unknown",
        }));

        res.json(enriched);
      } catch (error) {
        console.error("Error fetching invoices:", error);
        res.status(500).json({ message: "Failed to fetch invoices" });
      }
    }
  );

  app.post(
    "/api/platform/invoices",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const invoiceSchema = z.object({
          tenantId: z.number().int(),
          planId: z.number().int().nullable().optional(),
          amountCents: z.number().int().min(0),
          status: z.enum(["draft", "pending", "paid", "failed", "void"]).optional().default("pending"),
          periodStart: z.string(),
          periodEnd: z.string(),
          dueDate: z.string(),
          notes: z.string().nullable().optional(),
        });
        const parsed = invoiceSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
        }

        const tenant = await storage.getTenant(parsed.data.tenantId);
        if (!tenant) return res.status(404).json({ message: "Tenant not found" });

        const invoice = await storage.createInvoice({
          tenantId: parsed.data.tenantId,
          planId: parsed.data.planId ?? tenant.planId ?? null,
          amountCents: parsed.data.amountCents,
          status: parsed.data.status,
          periodStart: new Date(parsed.data.periodStart),
          periodEnd: new Date(parsed.data.periodEnd),
          dueDate: new Date(parsed.data.dueDate),
          notes: parsed.data.notes || null,
        });

        res.status(201).json(invoice);
      } catch (error) {
        console.error("Error creating invoice:", error);
        res.status(500).json({ message: "Failed to create invoice" });
      }
    }
  );

  app.patch(
    "/api/platform/invoices/:id",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid invoice ID" });

        const existing = await storage.getInvoice(id);
        if (!existing) return res.status(404).json({ message: "Invoice not found" });

        const updateSchema = z.object({
          status: z.enum(["draft", "pending", "paid", "failed", "void"]).optional(),
          amountCents: z.number().int().min(0).optional(),
          notes: z.string().nullable().optional(),
          paidAt: z.string().nullable().optional(),
          stripeInvoiceId: z.string().nullable().optional(),
        });
        const parsed = updateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
        }

        const updateData: any = { ...parsed.data };
        if (parsed.data.paidAt !== undefined) {
          updateData.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : null;
        }

        const updated = await storage.updateInvoice(id, updateData);
        res.json(updated);
      } catch (error) {
        console.error("Error updating invoice:", error);
        res.status(500).json({ message: "Failed to update invoice" });
      }
    }
  );

  app.post(
    "/api/platform/invoices/:id/mark-paid",
    isAuthenticated,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid invoice ID" });

        const invoice = await storage.getInvoice(id);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });

        if (invoice.status === "paid") {
          return res.status(400).json({ message: "Invoice is already paid" });
        }

        const updated = await storage.updateInvoice(id, {
          status: "paid",
          paidAt: new Date(),
        });

        try {
          await calculateCommissionsForInvoice(id);
        } catch (commErr) {
          console.error("Error calculating commissions for invoice:", commErr);
        }

        res.json(updated);
      } catch (error) {
        console.error("Error marking invoice as paid:", error);
        res.status(500).json({ message: "Failed to mark invoice as paid" });
      }
    }
  );

  app.get(
    "/api/affiliate/membership",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const affiliate = await storage.getAffiliateByUserId(userId);
        if (!affiliate || affiliate.status !== "active") {
          return res.json({ isAffiliate: false, affiliateId: null });
        }
        return res.json({ isAffiliate: true, affiliateId: affiliate.id });
      } catch (error) {
        console.error("Error checking affiliate membership:", error);
        res.status(500).json({ message: "Failed to check membership" });
      }
    }
  );

  app.patch("/api/platform/tenants/:id/website-enabled", requirePlatformAccess, async (req: any, res) => {
    try {
      const tenantId = parseInt(req.params.id);
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }
      const updated = await storage.updateTenant(tenantId, { websiteEnabled: enabled });
      res.json(updated);
    } catch (error) {
      console.error("Error toggling website:", error);
      res.status(500).json({ message: "Failed to update website setting" });
    }
  });
}
