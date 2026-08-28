import { db } from "../server/db";
import {
  tenants,
  users,
  tenantMembers,
  tenantThemes,
  tenantPaymentSettings,
} from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { applyDemoData } from "../server/demo-data";

async function seedDemoTenant() {
  const FORCE = process.argv.includes("--force");

  console.log("🚀 Seeding Tesla Driving Center demo tenant...\n");
  if (FORCE) {
    console.log("⚠️  --force flag detected: existing tenant will be deleted and re-created.\n");
  }

  const SLUG = "tesla-driving-center";
  const PASSWORD_HASH = await bcrypt.hash("password123", 10);

  const existingTenant = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (existingTenant.length > 0) {
    if (!FORCE) {
      console.error(`❌ Tenant "${SLUG}" already exists (ID: ${existingTenant[0].id}).`);
      console.error(`   Re-running this script against an existing database is destructive.`);
      console.error(`   If you are certain you want to wipe and re-seed this tenant, run:`);
      console.error(`   npx tsx scripts/seed-demo-tenant.ts --force`);
      console.error(`\n   DO NOT use --force against the production database.`);
      process.exit(1);
    }
    console.log(`⚠️  Tenant "${SLUG}" already exists (ID: ${existingTenant[0].id}). Deleting and re-seeding...`);
    await db.delete(tenants).where(eq(tenants.slug, SLUG));
    console.log("✓ Existing tenant deleted (cascade removed all related data)\n");
  }

  const [tenant] = await db.insert(tenants).values({
    name: "Tesla Driving Center",
    slug: SLUG,
    email: "contact@tesladrivingcenter.com",
    phone: "(512) 555-0100",
    timezone: "America/Chicago",
    active: true,
    previewMode: false,
  }).returning();
  console.log(`✓ Tenant created: "${tenant.name}" (ID: ${tenant.id})`);

  await db.insert(tenantThemes).values({
    tenantId: tenant.id,
    primaryColor: "#CC0000",
    secondaryColor: "#1a1a1a",
    accentColor: "#C0A062",
    backgroundColor: "#ffffff",
    textColor: "#1e293b",
    fontFamily: "Inter",
    headingFont: "Inter",
    borderRadius: "8px",
  });

  await db.insert(tenantPaymentSettings).values({
    tenantId: tenant.id,
    stripeEnabled: false,
    paypalEnabled: false,
    cashEnabled: true,
    cashRequireSignature: false,
    autoExpireEnabled: true,
    expireAfterHours: 2,
  });

  console.log("✓ Theme and payment settings created");

  const namedUsers = [
    { email: "contact@teslamodcenter.com", firstName: "Carlos", lastName: "Mendez", role: "tenant_admin" as const, instructorType: null, locScope: "ALL" as const },
    { email: "owner@tesladrivingcenter.com", firstName: "Sarah", lastName: "Mitchell", role: "tenant_admin" as const, instructorType: null, locScope: "ALL" as const },
    { email: "kfnawaz@gmail.com", firstName: "Kashif", lastName: "Nawaz", role: "office_manager" as const, instructorType: null, locScope: "ALL" as const },
    { email: "officemanager@tesladrivingcenter.com", firstName: "Linda", lastName: "Torres", role: "office_manager" as const, instructorType: null, locScope: "ALL" as const },
    { email: "officemanager-1@tesladrivingcenter.com", firstName: "Rachel", lastName: "Kim", role: "office_manager" as const, instructorType: null, locScope: "ALL" as const },
    { email: "officemanager-2@tesladrivingcenter.com", firstName: "Derek", lastName: "Owens", role: "office_manager" as const, instructorType: null, locScope: "ALL" as const },
    { email: "nousheenfa@gmail.com", firstName: "Nousheen", lastName: "Farooq", role: "instructor" as const, instructorType: "BOTH" as const, locScope: "ALL" as const },
    { email: "instructor@tesladrivingcenter.com", firstName: "James", lastName: "Rivera", role: "instructor" as const, instructorType: "DRIVE" as const, locScope: "ALL" as const },
    { email: "instructor-1@tesladrivingcenter.com", firstName: "Priya", lastName: "Sharma", role: "instructor" as const, instructorType: "BOTH" as const, locScope: "ALL" as const },
    { email: "instructor-2@tesladrivingcenter.com", firstName: "Marcus", lastName: "Webb", role: "instructor" as const, instructorType: "CLASSROOM" as const, locScope: "ALL" as const },
    { email: "instructor-3@tesladrivingcenter.com", firstName: "Angela", lastName: "Brooks", role: "instructor" as const, instructorType: "DRIVE" as const, locScope: "ALL" as const },
    { email: "student@tesladrivingcenter.com", firstName: "Alex", lastName: "Johnson", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-1@tesladrivingcenter.com", firstName: "Emma", lastName: "Davis", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-2@tesladrivingcenter.com", firstName: "Liam", lastName: "Martinez", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-3@tesladrivingcenter.com", firstName: "Olivia", lastName: "Wilson", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-4@tesladrivingcenter.com", firstName: "Noah", lastName: "Thompson", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-5@tesladrivingcenter.com", firstName: "Ava", lastName: "Anderson", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-6@tesladrivingcenter.com", firstName: "Ethan", lastName: "Garcia", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-7@tesladrivingcenter.com", firstName: "Sophia", lastName: "Lee", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-8@tesladrivingcenter.com", firstName: "Mason", lastName: "White", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "student-9@tesladrivingcenter.com", firstName: "Isabella", lastName: "Harris", role: "student" as const, instructorType: null, locScope: "ALL" as const },
    { email: "parent@tesladrivingcenter.com", firstName: "Patricia", lastName: "Johnson", role: "parent" as const, instructorType: null, locScope: "ALL" as const },
    { email: "parent-1@tesladrivingcenter.com", firstName: "Robert", lastName: "Davis", role: "parent" as const, instructorType: null, locScope: "ALL" as const },
    { email: "parent-2@tesladrivingcenter.com", firstName: "Maria", lastName: "Martinez", role: "parent" as const, instructorType: null, locScope: "ALL" as const },
    { email: "parent-3@tesladrivingcenter.com", firstName: "Jennifer", lastName: "Wilson", role: "parent" as const, instructorType: null, locScope: "ALL" as const },
  ];

  let createdUsers = 0;
  let reusedUsers = 0;

  for (const u of namedUsers) {
    let userId: string;
    const [existing] = await db.select().from(users).where(eq(users.email, u.email));
    if (existing) {
      userId = existing.id;
      reusedUsers++;
    } else {
      const [created] = await db.insert(users).values({
        email: u.email,
        passwordHash: PASSWORD_HASH,
        firstName: u.firstName,
        lastName: u.lastName,
      }).returning();
      userId = created.id;
      createdUsers++;
    }

    await db.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId,
      role: u.role,
      status: "ACTIVE",
      firstName: u.firstName,
      lastName: u.lastName,
      instructorType: u.instructorType || undefined,
      locationScope: u.locScope as any,
    });
  }

  console.log(`✓ ${namedUsers.length} members created (${createdUsers} new users, ${reusedUsers} existing)`);

  console.log("\n📊 Seeding demo data (locations, vehicles, packages, sessions, enrollments, bookings)...");
  await applyDemoData(tenant.id);

  console.log("\n🎉 Tesla Driving Center seed complete!");
  console.log(`   Tenant ID: ${tenant.id}`);
  console.log(`   URL slug:  ${tenant.slug}`);
  console.log(`   Password:  password123 (all accounts)`);
  console.log(`\n   Login with any of these emails:`);
  namedUsers.slice(0, 6).forEach(u => console.log(`   - ${u.email} (${u.role})`));
  console.log(`   - ...and ${namedUsers.length - 6} more`);

  process.exit(0);
}

seedDemoTenant().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
