import { users, type User, type UpsertUser } from "@shared/models/auth";
import { tenantMembers, enrollments, instructorAvailability, scheduleSessions, bookings, media, auditEvents } from "@shared/schema";
import { db } from "../../db";
import { eq, and } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  setPassword(userId: string, passwordHash: string, firstName?: string, lastName?: string): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...userData,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    } catch (error: any) {
      if (error?.constraint === "users_email_unique" && userData.email) {
        return await this.mergeUserByEmail(userData);
      }
      throw error;
    }
  }

  async setPassword(userId: string, passwordHash: string, firstName?: string, lastName?: string): Promise<User> {
    const updates: any = { passwordHash, updatedAt: new Date() };
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  private async mergeUserByEmail(userData: UpsertUser): Promise<User> {
    return await db.transaction(async (tx) => {
      const [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.email, userData.email!));

      if (!existingUser) {
        throw new Error(`User with email ${userData.email} not found during merge`);
      }

      const oldId = existingUser.id;
      const newId = userData.id!;

      if (oldId === newId) {
        const [updated] = await tx
          .update(users)
          .set({
            firstName: userData.firstName ?? existingUser.firstName,
            lastName: userData.lastName ?? existingUser.lastName,
            profileImageUrl: userData.profileImageUrl ?? existingUser.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, oldId))
          .returning();
        return updated;
      }

      const [existingNewUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, newId));

      const tempEmail = `__merging__${oldId}__${Date.now()}`;
      await tx
        .update(users)
        .set({ email: tempEmail })
        .where(eq(users.id, oldId));

      if (!existingNewUser) {
        await tx.insert(users).values({
          id: newId,
          email: userData.email!,
          firstName: userData.firstName ?? existingUser.firstName,
          lastName: userData.lastName ?? existingUser.lastName,
          profileImageUrl: userData.profileImageUrl ?? existingUser.profileImageUrl,
        });
      } else {
        await tx
          .update(users)
          .set({
            email: userData.email!,
            firstName: userData.firstName ?? existingUser.firstName,
            lastName: userData.lastName ?? existingUser.lastName,
            profileImageUrl: userData.profileImageUrl ?? existingUser.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, newId));
      }

      await this.migrateReferencesInTx(tx, oldId, newId);

      await tx.delete(users).where(eq(users.id, oldId));

      const [result] = await tx
        .select()
        .from(users)
        .where(eq(users.id, newId));

      return result;
    });
  }

  private async migrateReferencesInTx(tx: any, oldId: string, newId: string) {
    const oldMembers = await tx
      .select()
      .from(tenantMembers)
      .where(eq(tenantMembers.userId, oldId));

    for (const member of oldMembers) {
      const [existing] = await tx
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.tenantId, member.tenantId),
            eq(tenantMembers.userId, newId),
            eq(tenantMembers.role, member.role)
          )
        );

      if (existing) {
        await tx.delete(tenantMembers).where(eq(tenantMembers.id, member.id));
      } else {
        await tx.update(tenantMembers).set({ userId: newId }).where(eq(tenantMembers.id, member.id));
      }
    }

    await tx.update(tenantMembers).set({ invitedByUserId: newId }).where(eq(tenantMembers.invitedByUserId, oldId));
    await tx.update(enrollments).set({ userId: newId }).where(eq(enrollments.userId, oldId));
    await tx.update(instructorAvailability).set({ instructorId: newId }).where(eq(instructorAvailability.instructorId, oldId));
    await tx.update(scheduleSessions).set({ instructorId: newId }).where(eq(scheduleSessions.instructorId, oldId));
    await tx.update(bookings).set({ userId: newId }).where(eq(bookings.userId, oldId));
    await tx.update(media).set({ uploadedBy: newId }).where(eq(media.uploadedBy, oldId));
    await tx.update(auditEvents).set({ actorUserId: newId }).where(eq(auditEvents.actorUserId, oldId));
  }
}

export const authStorage = new AuthStorage();
