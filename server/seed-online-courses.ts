import { db } from "./db";
import { onlineCourses } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const DRIVERZ_COURSES = [
  {
    name: "Parent-Taught Driver's Ed",
    description: "Learn to drive with help from a parent or guardian. Complete 100% online and earn your learner's permit after finishing the first learning module and passing the quiz, allowing you to complete your 44 hours of required driving practice with your parent or guardian. Ages 14-17. TDLR Approved.",
    price: 11995,
    providerName: "DriverZ by IMPROV",
    providerUrl: "https://driverz.com/texas-drivers-ed-course/?hl=en",
    imageUrl: null,
    active: true,
    sortOrder: 0,
  },
  {
    name: "Self-Taught Driver's Ed",
    description: "Prefer to learn solo? Start the course online immediately and qualify for your learner's permit after completing the first course chapter. Complete the required driving practice with a driving school or with a parent or guardian. Ages 14-17. TDLR Approved.",
    price: 11995,
    providerName: "DriverZ by IMPROV",
    providerUrl: "https://driverz.com/texas-drivers-ed-course/?hl=en",
    imageUrl: null,
    active: true,
    sortOrder: 1,
  },
  {
    name: "Texas Adult Drivers Ed",
    description: "Texas law requires all new drivers ages 18 to 25 to complete an adult driver's ed course. This is the easiest online course allowed by Texas law and meets the requirements of the TDLR to get your permit. Can be completed 100% online. Many driver license offices allow graduates to skip the written test for their license. Ages 18-25. TDLR Approved.",
    price: 11995,
    providerName: "DriverZ by IMPROV",
    providerUrl: "https://driverz.com/texas-drivers-ed-course/?hl=en",
    imageUrl: null,
    active: true,
    sortOrder: 2,
  },
];

export async function seedOnlineCourses(tenantId: number) {
  let insertedCount = 0;

  for (const course of DRIVERZ_COURSES) {
    const existing = await db
      .select({ id: onlineCourses.id })
      .from(onlineCourses)
      .where(and(eq(onlineCourses.tenantId, tenantId), eq(onlineCourses.name, course.name)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(onlineCourses).values({ tenantId, ...course });
      insertedCount++;
    }
  }

  if (insertedCount > 0) {
    console.log(`  ✓ Seeded ${insertedCount} online courses for tenant ${tenantId}`);
  } else {
    console.log(`  ⏭ Online courses already seeded for tenant ${tenantId}`);
  }

  const finalCount = await db
    .select({ id: onlineCourses.id })
    .from(onlineCourses)
    .where(eq(onlineCourses.tenantId, tenantId));
  console.log(`  ℹ Tenant ${tenantId} has ${finalCount.length} online course(s)`);
}
