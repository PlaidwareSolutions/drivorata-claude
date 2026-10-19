import { randomInt } from "crypto";
import type { Location, ScheduleOffering } from "@shared/schema";

// Every checkout gets a short human-readable reference (e.g. "AA-7K3F9Q") that
// ties the payment, its enrollment(s), the provider's record and every email
// together. It is also what a parent reads out on the phone, so it avoids
// look-alike characters. 20 characters max: Authorize.net's invoiceNumber limit.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

export function generateReference(schoolName: string | null | undefined): string {
  const initials =
    (schoolName || "")
      .split(/[^A-Za-z]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "DV";
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `${initials}-${code}`;
}

/**
 * What the customer chose, frozen at checkout start. Kept on the payment so
 * the class and date survive even if activation fails or the class is edited.
 */
export interface PurchaseItem {
  name: string;
  packageId?: number;
  onlineCourseId?: number;
  offeringId?: number;
  className?: string;
  startsAt?: string;
  endsAt?: string;
  locationId?: number | null;
  locationName?: string | null;
  timezone?: string | null;
  priceCents: number;
}

export function purchaseItem(args: {
  name: string;
  priceCents: number;
  packageId?: number;
  onlineCourseId?: number;
  offering?: Pick<ScheduleOffering, "id" | "name" | "startsAt" | "endsAt"> | null;
  location?: Pick<Location, "id" | "name" | "timezone"> | null;
}): PurchaseItem {
  const { offering, location } = args;
  return {
    name: args.name,
    priceCents: args.priceCents,
    ...(args.packageId != null ? { packageId: args.packageId } : {}),
    ...(args.onlineCourseId != null ? { onlineCourseId: args.onlineCourseId } : {}),
    ...(offering
      ? {
          offeringId: offering.id,
          className: offering.name,
          startsAt: new Date(offering.startsAt).toISOString(),
          endsAt: new Date(offering.endsAt).toISOString(),
        }
      : {}),
    ...(location ? { locationId: location.id, locationName: location.name, timezone: location.timezone } : {}),
  };
}

export function formatClassDate(iso: string, timezone?: string | null): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || "America/Chicago",
  });
}

/**
 * One line a person can read on the provider's checkout page, receipt and
 * dashboard: "Teen Class — Cypress — Mon, Nov 3, 2026, 6:00 PM (ref AA-7K3F9Q)".
 */
export function describePurchase(items: PurchaseItem[], reference: string | null, maxLength = 250): string {
  const parts = items.map((it) =>
    [
      it.className && it.className !== it.name ? `${it.name}: ${it.className}` : it.name,
      it.locationName,
      it.startsAt ? formatClassDate(it.startsAt, it.timezone) : null,
    ]
      .filter(Boolean)
      .join(" — "),
  );
  const suffix = reference ? ` (ref ${reference})` : "";
  let text = parts.join("; ");
  if (text.length + suffix.length > maxLength) {
    text = text.slice(0, Math.max(0, maxLength - suffix.length - 1)).trimEnd() + "…";
  }
  return text + suffix;
}
