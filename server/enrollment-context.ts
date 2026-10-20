import { db } from "./db";
import { payments, type Enrollment, type Location, type Payment, type ScheduleOffering, type Tenant } from "@shared/schema";
import { desc, eq, or } from "drizzle-orm";
import { storage } from "./storage";

// Everything an enrollment email needs, gathered in one place. Cart purchases
// (how the storefront sells classes) put the payment on the cart, not the
// enrollment, so payments are looked up by both.

export interface EnrollmentContext {
  enrollment: Enrollment;
  tenant: Tenant;
  /** Newest first: the enrollment's own payments plus its cart's. */
  payments: Payment[];
  /** The completed payment, else the most recent attempt. */
  payment: Payment | null;
  offering: ScheduleOffering | null;
  sessions: Array<{ startAt: Date; endAt: Date }>;
  location: Location | null;
  timezone: string;
  /** Location contact first, school contact as fallback. */
  contactPhone: string;
  contactEmail: string;
  reference: string | null;
}

export async function loadEnrollmentContext(enrollmentId: number, tenantId: number): Promise<EnrollmentContext | null> {
  const [tenant, enrollment] = await Promise.all([
    storage.getTenant(tenantId),
    storage.getEnrollmentById(enrollmentId, tenantId),
  ]);
  if (!tenant || !enrollment) return null;

  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      enrollment.cartId
        ? or(eq(payments.enrollmentId, enrollment.id), eq(payments.cartId, enrollment.cartId))
        : eq(payments.enrollmentId, enrollment.id),
    )
    .orderBy(desc(payments.createdAt));
  const payment = paymentRows.find((p) => p.status === "COMPLETED") ?? paymentRows[0] ?? null;

  const offering = enrollment.offeringId ? (await storage.getScheduleOffering(enrollment.offeringId, tenantId)) ?? null : null;
  const sessions = offering
    ? (await storage.getOfferingSessions(offering.id, tenantId))
        .filter((s) => s.status !== "CANCELLED")
        .map((s) => ({ startAt: new Date(s.startAt), endAt: new Date(s.endAt) }))
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    : [];

  const locationId = enrollment.locationId ?? offering?.locationId ?? null;
  const location = locationId ? (await storage.getLocation(locationId)) ?? null : null;

  return {
    enrollment,
    tenant,
    payments: paymentRows,
    payment,
    offering,
    sessions,
    location,
    timezone: location?.timezone || tenant.timezone || "America/Chicago",
    contactPhone: location?.phone || tenant.phone || "",
    contactEmail: location?.email || tenant.email || "",
    reference: enrollment.reference ?? payment?.reference ?? null,
  };
}

/** "Tue, Nov 3, 2026, 6:00 – 9:00 PM" (end time shown alone when same day). */
export function formatSessionRange(startAt: Date, endAt: Date, timezone: string): string {
  const day = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: timezone });
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  return day(startAt) === day(endAt)
    ? `${day(startAt)}, ${time(startAt)} – ${time(endAt)}`
    : `${day(startAt)}, ${time(startAt)} – ${day(endAt)}, ${time(endAt)}`;
}

export function formatLocalDateTime(d: Date | string | null | undefined, timezone: string): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  // dateStyle/timeStyle can't be combined with timeZoneName, so spell it out.
  return dt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: timezone, timeZoneName: "short",
  });
}

/** Class dates as display lines; falls back to the offering's span when it has no sessions. */
export function classDateLines(ctx: Pick<EnrollmentContext, "offering" | "sessions" | "timezone">): string[] {
  if (ctx.sessions.length) return ctx.sessions.map((s) => formatSessionRange(s.startAt, s.endAt, ctx.timezone));
  if (ctx.offering) return [formatSessionRange(new Date(ctx.offering.startsAt), new Date(ctx.offering.endsAt), ctx.timezone)];
  return [];
}

export function locationLine(location: Location | null): string {
  if (!location) return "";
  const address = [location.address, location.city, location.state].filter(Boolean).join(", ");
  return [location.name, address, location.phone].filter(Boolean).join(" — ");
}

export function paymentMethodLabel(provider: string | null | undefined): string {
  if (provider === "STRIPE" || provider === "AUTHORIZE_NET") return "credit/debit card";
  if (provider === "PAYPAL") return "PayPal";
  if (provider === "CASH") return "cash";
  return "—";
}
