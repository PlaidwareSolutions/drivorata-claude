import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "./db";
import { locations, packages, scheduleOfferings, scheduleSessions, type Tenant } from "@shared/schema";
import { storage } from "./storage";

// The public class schedule: one ready-to-render row per upcoming class, so a
// first-time visitor can see class → dates/times → location (+ phone) →
// price → seats → Enroll without calling. Served at
// GET /api/public/tenant/:slug/class-schedule (contract C1).

export interface ClassScheduleRow {
  offeringId: number;
  packageId: number;
  packageName: string;
  audience: "TEENS" | "ADULTS" | "BOTH";
  className: string;
  details: string | null;
  location: { id: number; name: string; city: string | null; phone: string | null } | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  dateRange: string;
  scheduleSummary: string;
  sessions: Array<{ startAt: string; endAt: string }>;
  priceCents: number;
  remainingSeats: number;
  availability: "OPEN" | "FEW_LEFT" | "FULL";
  enroll: { packageId: number; offeringId: number; locationId: number | null };
}

export interface ClassScheduleFilters {
  locationId?: number;
  packageId?: number;
  audience?: "TEENS" | "ADULTS";
  from?: Date;
  to?: Date;
}

const FEW_LEFT = 3;
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parts(d: Date, timezone: string) {
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: timezone });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  return { weekday, time };
}

function joinDays(days: string[]): string {
  const idx = days.map((d) => DAY_ORDER.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (idx.length === 0) return "";
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (idx.length >= 3 && consecutive) return `${DAY_ORDER[idx[0]]}–${DAY_ORDER[idx[idx.length - 1]]}`;
  const names = idx.map((i) => DAY_ORDER[i]);
  return names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** "6:00 PM" + "9:00 PM" → "6:00–9:00 PM"; mixed meridiem keeps both. */
function timeRange(start: string, end: string): string {
  const [st, sm] = start.split(" ");
  const [et, em] = end.split(" ");
  return sm === em ? `${st}–${et} ${em}` : `${start}–${end}`;
}

/** "Mon–Thu, 6:00–9:00 PM" from a class's sessions, or "Sat & Sun, times vary". */
export function summarizeSchedule(sessions: Array<{ startAt: Date; endAt: Date }>, timezone: string): string {
  if (sessions.length === 0) return "";
  const days = new Set<string>();
  const ranges = new Set<string>();
  for (const s of sessions) {
    const a = parts(s.startAt, timezone);
    const b = parts(s.endAt, timezone);
    days.add(a.weekday);
    ranges.add(timeRange(a.time, b.time));
  }
  const dayText = joinDays(Array.from(days));
  const timeText = ranges.size === 1 ? Array.from(ranges)[0] : "times vary";
  return [dayText, timeText].filter(Boolean).join(", ");
}

/** "Nov 3 – Nov 20, 2026", or "Sat, Nov 8, 2026" for a one-day class. */
export function formatDateRange(start: Date, end: Date, timezone: string): string {
  const day = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { ...opts, timeZone: timezone });
  const sameDay = day(start, { dateStyle: "short" }) === day(end, { dateStyle: "short" });
  if (sameDay) return day(start, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const sameYear = day(start, { year: "numeric" }) === day(end, { year: "numeric" });
  return sameYear
    ? `${day(start, { month: "short", day: "numeric" })} – ${day(end, { month: "short", day: "numeric", year: "numeric" })}`
    : `${day(start, { month: "short", day: "numeric", year: "numeric" })} – ${day(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

export async function buildClassSchedule(tenant: Tenant, f: ClassScheduleFilters = {}): Promise<ClassScheduleRow[]> {
  const from = f.from ?? new Date();
  const conds = [
    eq(scheduleOfferings.tenantId, tenant.id),
    inArray(scheduleOfferings.status, ["PUBLISHED", "FULL"]),
    gte(scheduleOfferings.startsAt, from),
  ];
  if (f.to) conds.push(lte(scheduleOfferings.startsAt, f.to));
  if (f.locationId) conds.push(eq(scheduleOfferings.locationId, f.locationId));
  if (f.packageId) conds.push(eq(scheduleOfferings.packageId, f.packageId));
  const offerings = await db.select().from(scheduleOfferings).where(and(...conds)).orderBy(asc(scheduleOfferings.startsAt));
  if (offerings.length === 0) return [];

  const pkgIds = Array.from(new Set(offerings.map((o) => o.packageId)));
  const locIds = Array.from(new Set(offerings.map((o) => o.locationId).filter((x): x is number => x != null)));
  const [pkgRows, locRows, sessionRows] = await Promise.all([
    db.select().from(packages).where(inArray(packages.id, pkgIds)),
    locIds.length ? db.select().from(locations).where(inArray(locations.id, locIds)) : Promise.resolve([]),
    db.select().from(scheduleSessions).where(and(
      eq(scheduleSessions.tenantId, tenant.id),
      inArray(scheduleSessions.offeringId, offerings.map((o) => o.id)),
    )),
  ]);
  const pkgById = new Map(pkgRows.map((p) => [p.id, p]));
  const locById = new Map(locRows.map((l) => [l.id, l]));
  const sessionsByOffering = new Map<number, Array<{ startAt: Date; endAt: Date }>>();
  for (const s of sessionRows) {
    if (s.status === "CANCELLED" || s.offeringId == null) continue;
    const list = sessionsByOffering.get(s.offeringId) ?? [];
    list.push({ startAt: new Date(s.startAt), endAt: new Date(s.endAt) });
    sessionsByOffering.set(s.offeringId, list);
  }

  const rows: ClassScheduleRow[] = [];
  for (const o of offerings) {
    const pkg = pkgById.get(o.packageId);
    if (!pkg || !pkg.active) continue;
    const audience = (pkg.audience ?? "BOTH") as ClassScheduleRow["audience"];
    if (f.audience && audience !== "BOTH" && audience !== f.audience) continue;
    const loc = o.locationId != null ? locById.get(o.locationId) ?? null : null;
    if (loc && loc.active === false) continue;
    const timezone = loc?.timezone || tenant.timezone || "America/Chicago";
    const sessions = (sessionsByOffering.get(o.id) ?? []).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const startsAt = sessions[0]?.startAt ?? new Date(o.startsAt);
    const endsAt = sessions[sessions.length - 1]?.endAt ?? new Date(o.endsAt);
    const remainingSeats = Math.max(0, (o.capacity ?? 0) - (o.enrolledCount ?? 0));
    const availability = o.status === "FULL" || remainingSeats === 0 ? "FULL" : remainingSeats <= FEW_LEFT ? "FEW_LEFT" : "OPEN";

    rows.push({
      offeringId: o.id,
      packageId: pkg.id,
      packageName: pkg.name,
      audience,
      className: o.name,
      details: o.description?.trim() || null,
      location: loc ? { id: loc.id, name: loc.name, city: loc.city ?? null, phone: loc.phone ?? null } : null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone,
      dateRange: formatDateRange(startsAt, endsAt, timezone),
      scheduleSummary: summarizeSchedule(sessions, timezone),
      sessions: sessions.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
      priceCents: await storage.getEffectivePackagePrice(pkg.id, o.locationId ?? null),
      remainingSeats,
      availability,
      enroll: { packageId: pkg.id, offeringId: o.id, locationId: o.locationId ?? null },
    });
  }
  return rows;
}
