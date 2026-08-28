import { db } from "./db";
import {
  tenants,
  locations,
  vehicles,
  packages,
  tenantMembers,
  tenantThemes,
  tenantPaymentSettings,
  instructorAvailability,
  scheduleSessions,
  enrollments,
  payments,
  creditLedger,
  bookings,
  users,
  promotions,
} from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function dateAtTime(base: Date, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function addHours(d: Date, hrs: number): Date {
  return new Date(d.getTime() + hrs * 60 * 60 * 1000);
}

function getDatesInRange(startDaysOffset: number, endDaysOffset: number, targetDow: number[]): Date[] {
  const dates: Date[] = [];
  const start = daysFromNow(startDaysOffset);
  const end = daysFromNow(endDaysOffset);
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur <= end) {
    if (targetDow.includes(cur.getDay())) {
      dates.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

export async function applyDemoData(tenantId: number): Promise<void> {
  console.log(`  → Seeding demo data for tenant ${tenantId}...`);

  const existingLocations = await db.select({ id: locations.id }).from(locations).where(eq(locations.tenantId, tenantId)).limit(1);
  if (existingLocations.length > 0) {
    console.log(`  → Tenant ${tenantId} already has demo data (locations found). Skipping to avoid duplicates.`);
    return;
  }

  const [loc1] = await db.insert(locations).values({
    tenantId,
    name: "Austin HQ",
    address: "1001 S Congress Ave",
    city: "Austin",
    state: "TX",
    zip: "78704",
    active: true,
  }).returning();

  const [loc2] = await db.insert(locations).values({
    tenantId,
    name: "Dallas North",
    address: "5900 Greenville Ave",
    city: "Dallas",
    state: "TX",
    zip: "75206",
    active: true,
  }).returning();

  const [loc3] = await db.insert(locations).values({
    tenantId,
    name: "Houston West",
    address: "3200 Westheimer Rd",
    city: "Houston",
    state: "TX",
    zip: "77098",
    active: true,
  }).returning();

  console.log(`  → 3 locations created`);

  const vehicleData = [
    { tenantId, locationId: loc1.id, name: "Demo Tesla Model 3 #1", make: "Tesla", model: "Model 3", year: 2023, plate: "TX-DEMO-01", color: "Red", status: "ACTIVE" as const },
    { tenantId, locationId: loc1.id, name: "Demo Tesla Model 3 #2", make: "Tesla", model: "Model 3", year: 2023, plate: "TX-DEMO-02", color: "White", status: "ACTIVE" as const },
    { tenantId, locationId: loc1.id, name: "Demo Tesla Model Y #1", make: "Tesla", model: "Model Y", year: 2024, plate: "TX-DEMO-03", color: "Black", status: "ACTIVE" as const },
    { tenantId, locationId: loc2.id, name: "Demo Tesla Model Y #2", make: "Tesla", model: "Model Y", year: 2023, plate: "TX-DEMO-04", color: "Silver", status: "ACTIVE" as const },
    { tenantId, locationId: loc2.id, name: "Demo Tesla Model 3 #3", make: "Tesla", model: "Model 3", year: 2023, plate: "TX-DEMO-05", color: "Blue", status: "ACTIVE" as const },
    { tenantId, locationId: loc3.id, name: "Demo Tesla Model 3 #4", make: "Tesla", model: "Model 3", year: 2024, plate: "TX-DEMO-06", color: "Pearl", status: "ACTIVE" as const },
    { tenantId, locationId: loc3.id, name: "Demo Tesla Model Y #3", make: "Tesla", model: "Model Y", year: 2023, plate: "TX-DEMO-07", color: "Gray", status: "ACTIVE" as const },
    { tenantId, locationId: loc3.id, name: "Demo Tesla Model 3 #5", make: "Tesla", model: "Model 3", year: 2022, plate: "TX-DEMO-08", color: "White", status: "MAINTENANCE" as const },
  ];
  const insertedVehicles = await db.insert(vehicles).values(vehicleData).returning();
  const austinVehicles = insertedVehicles.filter(v => v.locationId === loc1.id && v.status === "ACTIVE");
  const dallasVehicles = insertedVehicles.filter(v => v.locationId === loc2.id && v.status === "ACTIVE");
  const houstonVehicles = insertedVehicles.filter(v => v.locationId === loc3.id && v.status === "ACTIVE");

  console.log(`  → 8 vehicles created`);

  const pkgData = [
    {
      tenantId,
      name: "Teen Complete Course",
      description: "The complete Texas TDLR-approved teen driver education program.",
      price: 49900,
      classroomHoursRequired: 32,
      driveHoursRequired: 14,
      ageMin: 14,
      ageMax: 17,
      creditClassroom: 32,
      creditDrive: 14,
      features: ["Texas TDLR Approved", "32-hour classroom course", "7 driving sessions (2 hrs each)", "Permit study guide included", "Completion certificate", "Flexible scheduling"],
      active: true,
      sortOrder: 1,
    },
    {
      tenantId,
      name: "Drive-Only Package",
      description: "For students who have completed classroom training and need behind-the-wheel hours.",
      price: 29900,
      classroomHoursRequired: 0,
      driveHoursRequired: 6,
      ageMin: 16,
      ageMax: null,
      creditClassroom: 0,
      creditDrive: 6,
      features: ["3 driving sessions (2 hrs each)", "Dual-control Tesla provided", "Professional instructor", "Completion certificate", "License test preparation"],
      active: true,
      sortOrder: 2,
    },
    {
      tenantId,
      name: "Classroom-Only (TDLR Approved)",
      description: "Texas TDLR-approved 32-hour classroom driver education course.",
      price: 14900,
      classroomHoursRequired: 32,
      driveHoursRequired: 0,
      ageMin: 14,
      ageMax: null,
      creditClassroom: 32,
      creditDrive: 0,
      features: ["Texas TDLR Approved", "32-hour structured curriculum", "Permit eligibility upon completion", "Group classroom setting", "Interactive learning materials", "Completion certificate"],
      active: true,
      sortOrder: 3,
    },
    {
      tenantId,
      name: "Adult Refresher Course",
      description: "Brush up on your driving skills with a professional Tesla-certified instructor.",
      price: 19900,
      classroomHoursRequired: 0,
      driveHoursRequired: 4,
      ageMin: 18,
      ageMax: null,
      creditClassroom: 0,
      creditDrive: 4,
      features: ["2 driving sessions (2 hrs each)", "Insurance discount letter", "Highway & city driving", "Modern Tesla vehicle", "No classroom required"],
      active: true,
      sortOrder: 4,
    },
    {
      tenantId,
      name: "Premium Bundle",
      description: "The ultimate teen driver education experience with priority scheduling.",
      price: 69900,
      classroomHoursRequired: 32,
      driveHoursRequired: 20,
      ageMin: 14,
      ageMax: 17,
      creditClassroom: 32,
      creditDrive: 20,
      features: ["Texas TDLR Approved", "32-hour classroom course", "10 driving sessions (2 hrs each)", "Priority scheduling", "Parent progress portal access", "Permit study guide", "Completion certificate", "Free re-test session"],
      active: true,
      sortOrder: 5,
    },
  ];
  const insertedPkgs = await db.insert(packages).values(pkgData).returning();
  const [pkgTeen, pkgDrive, pkgClassroom, pkgAdult, pkgPremium] = insertedPkgs;

  console.log(`  → 5 packages created`);

  const demoUserData = [
    { firstName: "Nousheen", lastName: "Farooq", idx: 0 },
    { firstName: "James", lastName: "Rivera", idx: 1 },
    { firstName: "Marcus", lastName: "Webb", idx: 2 },
    { firstName: "Priya", lastName: "Sharma", idx: 3 },
    { firstName: "Angela", lastName: "Brooks", idx: 4 },
    { firstName: "David", lastName: "Chen", idx: 5 },
    { firstName: "Rosa", lastName: "Gutierrez", idx: 6 },
    { firstName: "Alex", lastName: "Johnson", idx: 7 },
    { firstName: "Emma", lastName: "Davis", idx: 8 },
    { firstName: "Liam", lastName: "Martinez", idx: 9 },
    { firstName: "Olivia", lastName: "Wilson", idx: 10 },
    { firstName: "Noah", lastName: "Thompson", idx: 11 },
    { firstName: "Ava", lastName: "Anderson", idx: 12 },
    { firstName: "Ethan", lastName: "Garcia", idx: 13 },
    { firstName: "Sophia", lastName: "Lee", idx: 14 },
    { firstName: "Mason", lastName: "White", idx: 15 },
    { firstName: "Isabella", lastName: "Harris", idx: 16 },
    { firstName: "Tyler", lastName: "Brooks", idx: 17 },
    { firstName: "Mia", lastName: "Patel", idx: 18 },
    { firstName: "Patricia", lastName: "Johnson", idx: 19 },
    { firstName: "Robert", lastName: "Davis", idx: 20 },
    { firstName: "Maria", lastName: "Martinez", idx: 21 },
    { firstName: "Jennifer", lastName: "Wilson", idx: 22 },
  ];

  const demoUserRows = await db.insert(users).values(
    demoUserData.map(u => ({
      email: `demo.${tenantId}.user${u.idx}@preview.drivorata.com`,
      firstName: u.firstName,
      lastName: u.lastName,
      passwordHash: null,
    }))
  ).returning();

  const instrUsers = demoUserRows.slice(0, 7);
  const studentUsers = demoUserRows.slice(7, 19);
  const parentUsers = demoUserRows.slice(19, 23);

  const instrMeta = [
    { user: instrUsers[0], type: "BOTH" as const, locId: loc1.id, name: "Nousheen Farooq" },
    { user: instrUsers[1], type: "DRIVE" as const, locId: loc1.id, name: "James Rivera" },
    { user: instrUsers[2], type: "CLASSROOM" as const, locId: loc1.id, name: "Marcus Webb" },
    { user: instrUsers[3], type: "BOTH" as const, locId: loc2.id, name: "Priya Sharma" },
    { user: instrUsers[4], type: "DRIVE" as const, locId: loc2.id, name: "Angela Brooks" },
    { user: instrUsers[5], type: "BOTH" as const, locId: loc3.id, name: "David Chen" },
    { user: instrUsers[6], type: "DRIVE" as const, locId: loc3.id, name: "Rosa Gutierrez" },
  ];

  await db.insert(tenantMembers).values(
    instrMeta.map(m => ({
      tenantId,
      userId: m.user.id,
      role: "instructor" as const,
      status: "ACTIVE" as const,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      instructorType: m.type,
      locationScope: [m.locId] as any,
    }))
  );

  const studentDOBs = [
    "2008-03-15", "2007-07-22", "2008-11-05", "2009-01-30",
    "2007-05-18", "2008-09-12", "2009-04-25", "2007-12-08",
    "2008-06-14", "2009-02-28", "2008-04-10", "2007-09-03",
  ];
  const studentLocs = [loc1.id, loc1.id, loc1.id, loc1.id, loc2.id, loc2.id, loc2.id, loc3.id, loc3.id, loc1.id, loc3.id, loc2.id];

  await db.insert(tenantMembers).values(
    studentUsers.map((u, i) => ({
      tenantId,
      userId: u.id,
      role: "student" as const,
      status: "ACTIVE" as const,
      firstName: u.firstName,
      lastName: u.lastName,
      dateOfBirth: studentDOBs[i],
      locationScope: [studentLocs[i]] as any,
    }))
  );

  await db.insert(tenantMembers).values(
    parentUsers.map(u => ({
      tenantId,
      userId: u.id,
      role: "parent" as const,
      status: "ACTIVE" as const,
      firstName: u.firstName,
      lastName: u.lastName,
    }))
  );

  console.log(`  → 7 instructors, 12 students, 4 parents created`);

  const availData: any[] = [];
  const addAvail = (instructorId: string, locId: number, days: number[], startTime: string, endTime: string, type: "CLASSROOM" | "DRIVE" | "BOTH") => {
    for (const day of days) {
      availData.push({ tenantId, instructorId, locationId: locId, dayOfWeek: day, startTime, endTime, type });
    }
  };

  addAvail(instrUsers[0].id, loc1.id, [1,2,3,4,5], "08:00", "17:00", "BOTH");
  addAvail(instrUsers[1].id, loc1.id, [2,3,4,5,6], "09:00", "18:00", "DRIVE");
  addAvail(instrUsers[2].id, loc1.id, [1,2,3,4,5], "09:00", "16:00", "CLASSROOM");
  addAvail(instrUsers[3].id, loc2.id, [1,2,3,4,5], "08:00", "17:00", "BOTH");
  addAvail(instrUsers[4].id, loc2.id, [3,4,5,6,0], "10:00", "18:00", "DRIVE");
  addAvail(instrUsers[5].id, loc3.id, [1,2,3,4,5], "08:00", "17:00", "BOTH");
  addAvail(instrUsers[6].id, loc3.id, [2,3,4,5,6], "09:00", "18:00", "DRIVE");

  await db.insert(instructorAvailability).values(availData);
  console.log(`  → Instructor availability set`);

  const classroomInstructors = [instrUsers[2], instrUsers[0], instrUsers[3], instrUsers[5]];
  const classroomLocations = [loc1, loc1, loc2, loc3];
  const driveConfig = [
    { instructor: instrUsers[1], loc: loc1, vehicles: austinVehicles },
    { instructor: instrUsers[0], loc: loc1, vehicles: austinVehicles },
    { instructor: instrUsers[4], loc: loc2, vehicles: dallasVehicles },
    { instructor: instrUsers[3], loc: loc2, vehicles: dallasVehicles },
    { instructor: instrUsers[6], loc: loc3, vehicles: houstonVehicles },
    { instructor: instrUsers[5], loc: loc3, vehicles: houstonVehicles },
  ];

  const pastClassroomDates = getDatesInRange(-365, -1, [1, 3, 4]);
  const futureClassroomDates = getDatesInRange(1, 180, [1, 3, 4]);
  const pastDriveDates = getDatesInRange(-365, -1, [2, 4, 6]);
  const futureDriveDates = getDatesInRange(1, 180, [2, 4, 6]);

  const classroomSessionInserts: any[] = [];
  pastClassroomDates.forEach((d, i) => {
    const instr = classroomInstructors[i % 4];
    const loc = classroomLocations[i % 4];
    classroomSessionInserts.push({
      tenantId,
      locationId: loc.id,
      instructorId: instr.id,
      vehicleId: null,
      type: "CLASSROOM" as const,
      startAt: dateAtTime(d, 9),
      endAt: addHours(dateAtTime(d, 9), 4),
      capacity: 8,
      bookedCount: 0,
      status: "COMPLETED" as const,
    });
  });
  futureClassroomDates.forEach((d, i) => {
    const instr = classroomInstructors[i % 4];
    const loc = classroomLocations[i % 4];
    classroomSessionInserts.push({
      tenantId,
      locationId: loc.id,
      instructorId: instr.id,
      vehicleId: null,
      type: "CLASSROOM" as const,
      startAt: dateAtTime(d, 9),
      endAt: addHours(dateAtTime(d, 9), 4),
      capacity: 8,
      bookedCount: 0,
      status: "SCHEDULED" as const,
    });
  });

  const driveSessionInserts: any[] = [];
  pastDriveDates.forEach((d, i) => {
    const cfg = driveConfig[i % driveConfig.length];
    driveSessionInserts.push({
      tenantId,
      locationId: cfg.loc.id,
      instructorId: cfg.instructor.id,
      vehicleId: cfg.vehicles.length > 0 ? pick(cfg.vehicles, Math.floor(i / driveConfig.length)).id : null,
      type: "DRIVE" as const,
      startAt: dateAtTime(d, 9),
      endAt: addHours(dateAtTime(d, 9), 2),
      capacity: 1,
      bookedCount: 0,
      status: "COMPLETED" as const,
    });
    driveSessionInserts.push({
      tenantId,
      locationId: cfg.loc.id,
      instructorId: cfg.instructor.id,
      vehicleId: cfg.vehicles.length > 0 ? pick(cfg.vehicles, Math.floor(i / driveConfig.length) + 1).id : null,
      type: "DRIVE" as const,
      startAt: dateAtTime(d, 11),
      endAt: addHours(dateAtTime(d, 11), 2),
      capacity: 1,
      bookedCount: 0,
      status: "COMPLETED" as const,
    });
  });
  futureDriveDates.forEach((d, i) => {
    const cfg = driveConfig[i % driveConfig.length];
    driveSessionInserts.push({
      tenantId,
      locationId: cfg.loc.id,
      instructorId: cfg.instructor.id,
      vehicleId: cfg.vehicles.length > 0 ? pick(cfg.vehicles, Math.floor(i / driveConfig.length)).id : null,
      type: "DRIVE" as const,
      startAt: dateAtTime(d, 9),
      endAt: addHours(dateAtTime(d, 9), 2),
      capacity: 1,
      bookedCount: 0,
      status: "SCHEDULED" as const,
    });
    driveSessionInserts.push({
      tenantId,
      locationId: cfg.loc.id,
      instructorId: cfg.instructor.id,
      vehicleId: cfg.vehicles.length > 0 ? pick(cfg.vehicles, Math.floor(i / driveConfig.length) + 1).id : null,
      type: "DRIVE" as const,
      startAt: dateAtTime(d, 11),
      endAt: addHours(dateAtTime(d, 11), 2),
      capacity: 1,
      bookedCount: 0,
      status: "SCHEDULED" as const,
    });
  });

  const CHUNK = 500;
  const allSessionInserts = [...classroomSessionInserts, ...driveSessionInserts];
  let insertedSessions: any[] = [];
  for (let i = 0; i < allSessionInserts.length; i += CHUNK) {
    const chunk = allSessionInserts.slice(i, i + CHUNK);
    const rows = await db.insert(scheduleSessions).values(chunk).returning();
    insertedSessions = insertedSessions.concat(rows);
  }

  const pastCompletedClassroom = insertedSessions.filter(s => s.type === "CLASSROOM" && s.status === "COMPLETED");
  const pastCompletedDrive = insertedSessions.filter(s => s.type === "DRIVE" && s.status === "COMPLETED");
  const futureScheduledClassroom = insertedSessions.filter(s => s.type === "CLASSROOM" && s.status === "SCHEDULED");
  const futureScheduledDrive = insertedSessions.filter(s => s.type === "DRIVE" && s.status === "SCHEDULED");

  console.log(`  → ${insertedSessions.length} sessions created (${pastCompletedClassroom.length} past classroom, ${pastCompletedDrive.length} past drive)`);

  const enrollmentDefs = [
    { student: studentUsers[0], pkg: pkgTeen, locId: loc1.id, daysAgo: 365, status: "completed" as const, parentIdx: 0, parentName: "Patricia Johnson", parentEmail: `demo.${tenantId}.user19@preview.drivorata.com`, parentPhone: "(512) 555-0201" },
    { student: studentUsers[1], pkg: pkgTeen, locId: loc1.id, daysAgo: 300, status: "completed" as const, parentIdx: 1, parentName: "Robert Davis", parentEmail: `demo.${tenantId}.user20@preview.drivorata.com`, parentPhone: "(512) 555-0202" },
    { student: studentUsers[2], pkg: pkgTeen, locId: loc1.id, daysAgo: 270, status: "completed" as const, parentIdx: 2, parentName: "Maria Martinez", parentEmail: `demo.${tenantId}.user21@preview.drivorata.com`, parentPhone: "(512) 555-0203" },
    { student: studentUsers[3], pkg: pkgTeen, locId: loc1.id, daysAgo: 210, status: "completed" as const, parentIdx: 3, parentName: "Jennifer Wilson", parentEmail: `demo.${tenantId}.user22@preview.drivorata.com`, parentPhone: "(512) 555-0204" },
    { student: studentUsers[4], pkg: pkgDrive, locId: loc2.id, daysAgo: 210, status: "completed" as const },
    { student: studentUsers[5], pkg: pkgDrive, locId: loc2.id, daysAgo: 180, status: "completed" as const },
    { student: studentUsers[6], pkg: pkgDrive, locId: loc2.id, daysAgo: 150, status: "completed" as const },
    { student: studentUsers[7], pkg: pkgPremium, locId: loc3.id, daysAgo: 90, status: "in_progress" as const },
    { student: studentUsers[8], pkg: pkgPremium, locId: loc3.id, daysAgo: 75, status: "in_progress" as const },
    { student: studentUsers[9], pkg: pkgAdult, locId: loc1.id, daysAgo: 30, status: "confirmed" as const },
    { student: studentUsers[10], pkg: pkgClassroom, locId: loc3.id, daysAgo: 60, status: "in_progress" as const },
    { student: studentUsers[11], pkg: pkgClassroom, locId: loc2.id, daysAgo: 45, status: "in_progress" as const },
  ];

  const insertedEnrollments: any[] = [];
  for (const ed of enrollmentDefs) {
    const createdAt = daysFromNow(-ed.daysAgo);
    const [enr] = await db.insert(enrollments).values({
      tenantId,
      userId: ed.student.id,
      packageId: ed.pkg.id,
      locationId: ed.locId,
      firstName: ed.student.firstName!,
      lastName: ed.student.lastName!,
      email: ed.student.email,
      phone: `(512) 555-0${200 + insertedEnrollments.length}`,
      dateOfBirth: studentDOBs[studentUsers.indexOf(ed.student)],
      parentName: (ed as any).parentName || null,
      parentEmail: (ed as any).parentEmail || null,
      parentPhone: (ed as any).parentPhone || null,
      status: ed.status,
      amountPaid: ed.pkg.price,
      priceSnapshotCents: ed.pkg.price,
      classroomHoursCompleted: ed.status === "completed" ? ed.pkg.classroomHoursRequired : ed.status === "in_progress" ? Math.floor(ed.pkg.classroomHoursRequired * 0.6) : 0,
      drivingHoursCompleted: ed.status === "completed" ? ed.pkg.driveHoursRequired : ed.status === "in_progress" ? Math.floor(ed.pkg.driveHoursRequired * 0.4) : 0,
    }).returning();
    insertedEnrollments.push({ ...enr, pkgDef: ed.pkg, studentUser: ed.student, daysAgo: ed.daysAgo, enrollStatus: ed.status });
  }

  console.log(`  → 12 enrollments created`);

  const paymentInserts = insertedEnrollments.map(e => ({
    tenantId,
    enrollmentId: e.id,
    provider: "CASH" as const,
    status: "COMPLETED" as any,
    amountCents: e.pkgDef.price,
    providerOrderId: `DEMO-CASH-${e.id}`,
  }));
  await db.insert(payments).values(paymentInserts);

  console.log(`  → 12 payments created`);

  const ledgerInserts: any[] = [];
  for (const e of insertedEnrollments) {
    if (e.pkgDef.classroomHoursRequired > 0) {
      ledgerInserts.push({
        tenantId,
        enrollmentId: e.id,
        type: "CLASSROOM" as const,
        delta: e.pkgDef.classroomHoursRequired,
        reason: "PACKAGE_GRANT" as const,
        note: `Demo grant: ${e.pkgDef.classroomHoursRequired} classroom hours`,
      });
    }
    if (e.pkgDef.driveHoursRequired > 0) {
      ledgerInserts.push({
        tenantId,
        enrollmentId: e.id,
        type: "DRIVE" as const,
        delta: e.pkgDef.driveHoursRequired,
        reason: "PACKAGE_GRANT" as const,
        note: `Demo grant: ${e.pkgDef.driveHoursRequired} drive hours`,
      });
    }
  }
  await db.insert(creditLedger).values(ledgerInserts);

  console.log(`  → Credit ledger grants created`);

  const bookingInserts: any[] = [];
  const consumeInserts: any[] = [];

  for (let ei = 0; ei < insertedEnrollments.length; ei++) {
    const e = insertedEnrollments[ei];
    const pkg = e.pkgDef;
    const isCompleted = e.enrollStatus === "completed";
    const isInProgress = e.enrollStatus === "in_progress";
    const isConfirmed = e.enrollStatus === "confirmed";

    if (isCompleted || isInProgress) {
      if (pkg.classroomHoursRequired > 0) {
        const sessionsNeeded = Math.floor(pkg.classroomHoursRequired / 4);
        const classroomPool = pastCompletedClassroom.slice(ei * 5, ei * 5 + sessionsNeeded + 5);
        let classBooked = 0;
        for (const sess of classroomPool) {
          if (classBooked >= sessionsNeeded) break;
          const isNoShow = !isCompleted && classBooked === 0;
          bookingInserts.push({
            tenantId,
            enrollmentId: e.id,
            sessionId: sess.id,
            userId: e.studentUser.id,
            status: isNoShow ? "NO_SHOW" : "ATTENDED",
            creditType: "CLASSROOM" as const,
            creditAmount: 1,
          });
          if (!isNoShow) {
            consumeInserts.push({
              tenantId,
              enrollmentId: e.id,
              type: "CLASSROOM" as const,
              delta: -1,
              reason: "SESSION_CONSUME" as const,
              note: "Demo classroom session attended",
            });
          }
          classBooked++;
        }
      }

      if (pkg.driveHoursRequired > 0) {
        const driveSessionsNeeded = Math.floor(pkg.driveHoursRequired / 2);
        const drivePool = pastCompletedDrive.slice(ei * 8, ei * 8 + driveSessionsNeeded + 5);
        let driveBooked = 0;
        for (const sess of drivePool) {
          if (driveBooked >= driveSessionsNeeded) break;
          const isNoShow = !isCompleted && (ei === 4 || ei === 5 || ei === 6) && driveBooked === driveSessionsNeeded - 1;
          bookingInserts.push({
            tenantId,
            enrollmentId: e.id,
            sessionId: sess.id,
            userId: e.studentUser.id,
            status: isNoShow ? "NO_SHOW" : "ATTENDED",
            creditType: "DRIVE" as const,
            creditAmount: 1,
          });
          if (!isNoShow) {
            consumeInserts.push({
              tenantId,
              enrollmentId: e.id,
              type: "DRIVE" as const,
              delta: -1,
              reason: "SESSION_CONSUME" as const,
              note: "Demo drive session attended",
            });
          }
          driveBooked++;
        }
      }

      if (isInProgress) {
        const upcomingDriveSessions = futureScheduledDrive.slice(ei * 4, ei * 4 + 4);
        for (const sess of upcomingDriveSessions) {
          bookingInserts.push({
            tenantId,
            enrollmentId: e.id,
            sessionId: sess.id,
            userId: e.studentUser.id,
            status: "BOOKED",
            creditType: "DRIVE" as const,
            creditAmount: 1,
          });
        }
      }
    }

    if (isConfirmed) {
      const upcomingDrive = futureScheduledDrive.slice(0, 2);
      for (const sess of upcomingDrive) {
        bookingInserts.push({
          tenantId,
          enrollmentId: e.id,
          sessionId: sess.id,
          userId: e.studentUser.id,
          status: "BOOKED",
          creditType: "DRIVE" as const,
          creditAmount: 1,
        });
      }
    }
  }

  if (bookingInserts.length > 0) {
    for (let i = 0; i < bookingInserts.length; i += CHUNK) {
      await db.insert(bookings).values(bookingInserts.slice(i, i + CHUNK));
    }
  }
  if (consumeInserts.length > 0) {
    for (let i = 0; i < consumeInserts.length; i += CHUNK) {
      await db.insert(creditLedger).values(consumeInserts.slice(i, i + CHUNK));
    }
  }

  console.log(`  → ${bookingInserts.length} bookings created`);
  console.log(`  ✓ Demo data seeding complete for tenant ${tenantId}`);
}

export async function purgePreviewData(tenantId: number): Promise<void> {
  console.log(`  → Purging preview data for tenant ${tenantId}...`);

  await db.transaction(async (tx) => {
    await tx.delete(bookings).where(eq(bookings.tenantId, tenantId));
    await tx.delete(creditLedger).where(eq(creditLedger.tenantId, tenantId));
    await tx.delete(payments).where(eq(payments.tenantId, tenantId));
    await tx.delete(enrollments).where(eq(enrollments.tenantId, tenantId));
    await tx.delete(scheduleSessions).where(eq(scheduleSessions.tenantId, tenantId));
    await tx.delete(instructorAvailability).where(eq(instructorAvailability.tenantId, tenantId));
    await tx.delete(vehicles).where(eq(vehicles.tenantId, tenantId));
    await tx.delete(locations).where(eq(locations.tenantId, tenantId));
    await tx.delete(packages).where(eq(packages.tenantId, tenantId));

    const demoMembers = await tx
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), sql`${tenantMembers.role} != 'tenant_admin'`));

    if (demoMembers.length > 0) {
      const demoUserIds = demoMembers.map(m => m.userId).filter(Boolean) as string[];

      await tx.delete(tenantMembers).where(
        and(
          eq(tenantMembers.tenantId, tenantId),
          sql`${tenantMembers.role} != 'tenant_admin'`
        )
      );

      for (const userId of demoUserIds) {
        const otherMemberships = await tx
          .select()
          .from(tenantMembers)
          .where(eq(tenantMembers.userId, userId));

        if (otherMemberships.length === 0) {
          const [u] = await tx.select().from(users).where(eq(users.id, userId));
          if (u && u.email.includes("@preview.drivorata.com")) {
            await tx.delete(users).where(eq(users.id, userId));
          }
        }
      }
    }

    await tx
      .update(tenants)
      .set({ previewMode: false, previewEnabledAt: null })
      .where(eq(tenants.id, tenantId));
  });

  console.log(`  ✓ Preview data purged for tenant ${tenantId}`);
}
