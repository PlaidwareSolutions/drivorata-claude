import { db } from "./db";
import { promotions, locations, packages } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedPromotions(tenantId: number) {
  const existingPromos = await db.select({ id: promotions.id }).from(promotions).where(eq(promotions.tenantId, tenantId)).limit(1);
  if (existingPromos.length > 0) {
    console.log(`  ⏭ Promotions already seeded for tenant ${tenantId}`);
    return;
  }

  const tenantLocations = await db.select().from(locations).where(eq(locations.tenantId, tenantId));
  const tenantPackages = await db.select().from(packages).where(eq(packages.tenantId, tenantId));

  const loc1 = tenantLocations[0] ?? null;
  const loc2 = tenantLocations[1] ?? null;
  const pkg1 = tenantPackages[0] ?? null;
  const pkg2 = tenantPackages[1] ?? null;

  const now = new Date();
  const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const future60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const past15 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  const seedData = [
    {
      tenantId,
      locationId: null,
      headline: "Spring Enrollment Special",
      description: "Save 20% on all teen driving packages when you enroll this spring. Limited time offer for new students!",
      badgeText: "20% OFF",
      icon: "percent" as const,
      ctaLabel: "Enroll Now",
      packageId: pkg1?.id ?? null,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 0,
    },
    {
      tenantId,
      locationId: loc1?.id ?? null,
      headline: "Free Behind-the-Wheel Session",
      description: "Get one free behind-the-wheel driving session when you sign up for any full course package.",
      badgeText: "FREE SESSION",
      icon: "gift" as const,
      ctaLabel: "Claim Offer",
      packageId: null,
      validFrom: now,
      validUntil: future30,
      active: true,
      sortOrder: 1,
    },
    {
      tenantId,
      locationId: null,
      headline: "Refer a Friend Bonus",
      description: "Refer a friend and both of you get $25 off your next course. No limit on referrals!",
      badgeText: "$25 OFF",
      icon: "star" as const,
      ctaLabel: "Get Referral Code",
      packageId: null,
      validFrom: null,
      validUntil: null,
      active: true,
      sortOrder: 2,
    },
    {
      tenantId,
      locationId: loc2?.id ?? null,
      headline: "Weekend Intensive Course",
      description: "Complete your classroom hours in just two weekends with our accelerated program.",
      badgeText: "NEW",
      icon: "zap" as const,
      ctaLabel: "Learn More",
      packageId: pkg2?.id ?? null,
      validFrom: now,
      validUntil: future30,
      active: true,
      sortOrder: 3,
    },
    {
      tenantId,
      locationId: null,
      headline: "Early Bird Discount",
      description: "Register before 8 AM and save 10% on any package. Available for morning class slots only.",
      badgeText: "10% OFF",
      icon: "tag" as const,
      ctaLabel: "Book Morning Slot",
      packageId: null,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 4,
    },
    {
      tenantId,
      locationId: loc1?.id ?? null,
      headline: "Summer Camp Driving Program",
      description: "Enroll teens in our popular summer driving camp. Includes classroom + behind-the-wheel training.",
      badgeText: "POPULAR",
      icon: "star" as const,
      ctaLabel: "Reserve Spot",
      packageId: pkg1?.id ?? null,
      validFrom: now,
      validUntil: future60,
      active: true,
      sortOrder: 5,
    },
    {
      tenantId,
      locationId: null,
      headline: "Sibling Discount",
      description: "Enroll two or more siblings and get 15% off each enrollment. Family savings made easy!",
      badgeText: "15% OFF",
      icon: "percent" as const,
      ctaLabel: "Enroll Siblings",
      packageId: null,
      validFrom: null,
      validUntil: null,
      active: true,
      sortOrder: 6,
    },
    {
      tenantId,
      locationId: null,
      headline: "Holiday Flash Sale",
      description: "48-hour flash sale on all adult driving courses. Don't miss out on these incredible savings!",
      badgeText: "FLASH SALE",
      icon: "zap" as const,
      ctaLabel: "Shop Now",
      packageId: null,
      validFrom: past15,
      validUntil: past15,
      active: false,
      sortOrder: 7,
    },
    {
      tenantId,
      locationId: loc1?.id ?? null,
      headline: "TDLR-Approved Online Combo",
      description: "Take the classroom portion online and schedule your behind-the-wheel sessions at your convenience.",
      badgeText: "FLEXIBLE",
      icon: "gift" as const,
      ctaLabel: "Start Online",
      packageId: pkg2?.id ?? null,
      validFrom: now,
      validUntil: future30,
      active: true,
      sortOrder: 8,
    },
    {
      tenantId,
      locationId: null,
      headline: "Military & First Responder Discount",
      description: "We proudly offer 15% off all packages for active military, veterans, and first responders.",
      badgeText: "15% OFF",
      icon: "tag" as const,
      ctaLabel: "Verify & Save",
      packageId: null,
      validFrom: null,
      validUntil: null,
      active: true,
      sortOrder: 9,
    },
  ];

  await db.insert(promotions).values(seedData);
  console.log(`  ✓ Seeded ${seedData.length} promotions for tenant ${tenantId}`);
}
