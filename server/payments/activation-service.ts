import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import type { Enrollment, Payment } from "@shared/schema";
import { sendPaymentReceived, fireAndForget } from "../enrollment-emails";
import { sendAdminEnrollmentNotification } from "../admin-enrollment-notifications";

// Hash a string into a 32-bit signed int for use with Postgres advisory locks.
// (pg_advisory_lock takes a bigint or two ints; we use the single-int variant.)
function cartLockKey(cartId: string): number {
  let h = 0;
  for (let i = 0; i < cartId.length; i++) {
    h = ((h << 5) - h + cartId.charCodeAt(i)) | 0;
  }
  // Keep it positive-ish; pg accepts negative ints fine but readable logs help.
  return h;
}

export interface ActivationResult {
  ok: boolean;
  alreadyActive?: boolean;
  enrollmentId: number;
  error?: string;
}

export async function activateEnrollment(
  enrollmentId: number,
  paymentId: number
): Promise<ActivationResult> {
  const payment = await storage.getPayment(paymentId);
  if (!payment || payment.status !== "COMPLETED") {
    return { ok: false, enrollmentId, error: "Payment not completed" };
  }

  if (payment.enrollmentId !== enrollmentId) {
    return { ok: false, enrollmentId, error: "Payment does not belong to this enrollment" };
  }

  const enrollment = await storage.getEnrollmentById(enrollmentId, payment.tenantId);
  if (!enrollment) {
    return { ok: false, enrollmentId, error: "Enrollment not found for this tenant" };
  }

  const result = await activateWithEnrollment(enrollment, payment, payment.amountCents);
  if (result.ok) {
    try {
      await storage.markCartRemindersRecovered(payment.tenantId, {
        cartId: payment.cartId,
        paymentId: payment.id,
      });
    } catch (err) {
      console.error("[CartReminders] failed to mark recovered:", err);
    }
  }
  return result;
}

export interface CartActivationResult {
  ok: boolean;
  cartId: string;
  enrollmentIds: number[];
  errors?: string[];
}

export async function activateCart(paymentId: number): Promise<CartActivationResult> {
  const payment = await storage.getPayment(paymentId);
  if (!payment) {
    return { ok: false, cartId: "", enrollmentIds: [], errors: ["Payment not found"] };
  }
  if (!payment.cartId) {
    return { ok: false, cartId: "", enrollmentIds: [], errors: ["Payment has no associated cart"] };
  }
  if (payment.status !== "COMPLETED") {
    return { ok: false, cartId: payment.cartId, enrollmentIds: [], errors: ["Payment not completed"] };
  }

  const cartId = payment.cartId;
  const errors: string[] = [];

  // Serialize concurrent activation attempts for the same cart with a
  // Postgres advisory lock. This prevents two simultaneous webhook deliveries
  // (or admin confirms) from racing past the "no enrollments yet" check and
  // both creating duplicate enrollments. The lock is auto-released when this
  // session disconnects, but we explicitly release in finally for clarity.
  const lockKey = cartLockKey(cartId);
  await db.execute(sql`SELECT pg_advisory_lock(${lockKey})`);
  let cartEnrollments: Enrollment[];
  try {
    // Idempotency: if enrollments already exist for this cart, skip the
    // create+book step (this is a webhook re-delivery / retry).
    cartEnrollments = await storage.getEnrollmentsByCart(cartId);

    if (cartEnrollments.length === 0) {
      // Capture-time atomic step: create enrollments AND book offerings inside
      // a single DB transaction. If anything fails, nothing is persisted.
      const created = await storage.createCartEnrollmentsAndBookAtomic(cartId, {
        id: payment.id,
        tenantId: payment.tenantId,
        amountCents: payment.amountCents,
      });
      if (!created.ok) {
        errors.push(`Cart capture failed: ${created.error}`);
        return { ok: false, cartId, enrollmentIds: [], errors };
      }
      cartEnrollments = created.enrollments;
      // The cart flow doesn't create enrollment rows until payment lands here,
      // so fire the per-enrollment admin notification at this point. The
      // notification helper is idempotent via a DB column claim, so re-running
      // activateCart on webhook retries won't double-send.
      for (const enr of cartEnrollments) {
        fireAndForget(
          () => sendAdminEnrollmentNotification(enr.id, payment.tenantId),
          `admin_enrollment_notification cart=${cartId} enrollment#${enr.id}`,
        );
      }
    }
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`).catch(() => {});
  }

  // Now run the per-enrollment side-effects (user creation, roles, credits,
  // audit). These are idempotent; failures here can be retried without
  // creating duplicates because grant/role checks short-circuit.
  const ids: number[] = [];
  for (const enrollment of cartEnrollments) {
    if (enrollment.status === "confirmed" || enrollment.status === "active") {
      ids.push(enrollment.id);
      continue;
    }
    const result = await activateWithEnrollment(enrollment, payment, enrollment.amountPaid || 0);
    if (result.ok) {
      ids.push(enrollment.id);
    } else {
      errors.push(`Activation failed for enrollment #${enrollment.id}: ${result.error}`);
    }
  }

  // Only mark converted on full success; keep cart in checkout_pending for
  // diagnostics/retry otherwise.
  if (errors.length === 0) {
    await storage.setCartStatus(cartId, "converted");
    // Mark any cart reminders sent for this cart/payment as "recovered" so the
    // tenant summary can attribute the conversion to the reminder cadence.
    try {
      await storage.markCartRemindersRecovered(payment.tenantId, { cartId, paymentId: payment.id });
    } catch (err) {
      console.error("[CartReminders] failed to mark recovered:", err);
    }
  }
  return { ok: errors.length === 0, cartId, enrollmentIds: ids, errors: errors.length ? errors : undefined };
}

export async function confirmEnrollmentManually(
  enrollmentId: number,
  tenantId: number,
  actorUserId: string
): Promise<ActivationResult> {
  const enrollment = await storage.getEnrollmentById(enrollmentId, tenantId);
  if (!enrollment) {
    return { ok: false, enrollmentId, error: "Enrollment not found" };
  }

  if (enrollment.status === "confirmed" || enrollment.status === "active") {
    return { ok: true, alreadyActive: true, enrollmentId };
  }

  if (!["pending", "pending_payment"].includes(enrollment.status)) {
    return { ok: false, enrollmentId, error: `Cannot confirm enrollment with status: ${enrollment.status}` };
  }

  const studentName = `${enrollment.firstName} ${enrollment.lastName}`;
  const user = await storage.createUserByEmail(
    enrollment.email,
    studentName,
    enrollment.phone
  );

  await ensureStudentRole(enrollment.tenantId, user.id);
  await ensureParentRole(enrollment);
  await grantCreditsIfNeeded(enrollment, `manual-confirm-${actorUserId}`);

  await storage.updateEnrollment(enrollment.id, enrollment.tenantId, {
    status: "confirmed",
    userId: user.id,
    activatedAt: new Date(),
  } as any);

  fireAndForget(
    () => sendPaymentReceived(enrollment.id, enrollment.tenantId),
    `payment_received (manual) enrollment#${enrollment.id}`,
  );

  try {
    await storage.createAuditEvent({
      tenantId: enrollment.tenantId,
      actorUserId,
      action: "ENROLLMENT_CONFIRMED",
      targetType: "ENROLLMENT",
      targetId: enrollment.id,
      details: { method: "manual" },
    });
  } catch {}

  return { ok: true, enrollmentId };
}

async function activateWithEnrollment(
  enrollment: Enrollment,
  payment: Payment,
  amountPaidCents: number
): Promise<ActivationResult> {
  if (enrollment.status === "confirmed" || enrollment.status === "active") {
    return { ok: true, alreadyActive: true, enrollmentId: enrollment.id };
  }

  if (enrollment.status !== "pending_payment") {
    return { ok: false, enrollmentId: enrollment.id, error: `Invalid enrollment status: ${enrollment.status}` };
  }

  if (enrollment.tenantId !== payment.tenantId) {
    return { ok: false, enrollmentId: enrollment.id, error: "Tenant mismatch" };
  }

  const studentName = `${enrollment.firstName} ${enrollment.lastName}`;
  const user = await storage.createUserByEmail(
    enrollment.email,
    studentName,
    enrollment.phone
  );

  await ensureStudentRole(enrollment.tenantId, user.id);
  await ensureParentRole(enrollment);
  await grantCreditsIfNeeded(enrollment, `payment-${payment.id}`);

  await storage.updateEnrollment(enrollment.id, enrollment.tenantId, {
    status: "confirmed",
    userId: user.id,
    activatedAt: new Date(),
    amountPaid: amountPaidCents,
  } as any);

  fireAndForget(
    () => sendPaymentReceived(enrollment.id, enrollment.tenantId),
    `payment_received enrollment#${enrollment.id}`,
  );

  try {
    await storage.createAuditEvent({
      tenantId: enrollment.tenantId,
      actorUserId: user.id,
      action: "ENROLLMENT_ACTIVATED",
      targetType: "ENROLLMENT",
      targetId: enrollment.id,
      details: { paymentId: payment.id, provider: payment.provider },
    });
  } catch {}

  return { ok: true, enrollmentId: enrollment.id };
}

async function ensureStudentRole(tenantId: number, userId: string) {
  const existingRoles = await storage.getTenantMemberRoles(tenantId, userId);
  const hasStudentRole = existingRoles.some(m => m.role === "student");
  if (!hasStudentRole) {
    await storage.createTenantMember({
      tenantId,
      userId,
      role: "student",
      status: "ACTIVE",
    });
  }
}

async function ensureParentRole(enrollment: Enrollment) {
  if (!enrollment.parentEmail) return;

  try {
    const parentName = enrollment.parentName || `Parent of ${enrollment.firstName}`;
    const parentUser = await storage.createUserByEmail(
      enrollment.parentEmail,
      parentName,
      enrollment.parentPhone
    );

    const existingRoles = await storage.getTenantMemberRoles(enrollment.tenantId, parentUser.id);
    const hasParentRole = existingRoles.some(m => m.role === "parent");
    if (!hasParentRole) {
      await storage.createTenantMember({
        tenantId: enrollment.tenantId,
        userId: parentUser.id,
        role: "parent",
        status: "ACTIVE",
      });
    }
  } catch (err) {
    console.error("Failed to create parent account:", err);
  }
}

async function grantCreditsIfNeeded(enrollment: Enrollment, refId: string) {
  const hasGrant = await storage.hasPackageGrant(enrollment.id);
  if (hasGrant) return;

  const pkgSnapshot = enrollment.packageSnapshotJson as any;
  const credits: any[] = [];

  const classroomHours = pkgSnapshot?.classroomHoursRequired || pkgSnapshot?.classroomCredits || pkgSnapshot?.creditClassroom || 0;
  const driveHours = pkgSnapshot?.driveHoursRequired || pkgSnapshot?.driveCredits || pkgSnapshot?.creditDrive || 0;

  if (classroomHours > 0) {
    credits.push({
      tenantId: enrollment.tenantId,
      enrollmentId: enrollment.id,
      type: "CLASSROOM" as const,
      delta: classroomHours,
      reason: "PACKAGE_GRANT" as const,
      refId,
    });
  }
  if (driveHours > 0) {
    credits.push({
      tenantId: enrollment.tenantId,
      enrollmentId: enrollment.id,
      type: "DRIVE" as const,
      delta: driveHours,
      reason: "PACKAGE_GRANT" as const,
      refId,
    });
  }

  if (credits.length > 0) {
    await storage.createCreditLedgerEntries(credits);
  }
}
