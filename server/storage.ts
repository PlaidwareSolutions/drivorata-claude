import {
  type User,
  type UpsertUser,
  type Tenant,
  type InsertTenant,
  type TenantTheme,
  type InsertTenantTheme,
  type TenantMember,
  type InsertTenantMember,
  type Location,
  type InsertLocation,
  type Package,
  type InsertPackage,
  type PackageComponent,
  type InsertPackageComponent,
  type ScheduleOffering,
  type InsertScheduleOffering,
  type OfferingWaitlist,
  type InsertOfferingWaitlist,
  type Enrollment,
  type InsertEnrollment,
  type AuditEvent,
  type InsertAuditEvent,
  type Media,
  type InsertMedia,
  type ContactSubmission,
  type InsertContactSubmission,
  type ContactMessageReply,
  type InsertContactMessageReply,
  type Payment,
  type InsertPayment,
  type CreditLedgerEntry,
  type InsertCreditLedger,
  type TenantPaymentSettings,
  type InsertTenantPaymentSettings,
  type Vehicle,
  type InsertVehicle,
  type InstructorAvailability,
  type InsertInstructorAvailability,
  type ScheduleSession,
  type InsertScheduleSession,
  type Booking,
  type InsertBooking,
  type SavedBlock,
  type InsertSavedBlock,
  type TenantApiKey,
  type InsertTenantApiKey,
  type SupportTicket,
  type InsertSupportTicket,
  type TicketResponse,
  type InsertTicketResponse,
  type Notification,
  type InsertNotification,
  type StaleCreditReminder,
  type InsertStaleCreditReminder,
  type MarketingProgramSettings,
  type InsertMarketingProgramSettings,
  type Affiliate,
  type InsertAffiliate,
  type AffiliateReferral,
  type InsertAffiliateReferral,
  type AffiliateCommission,
  type InsertAffiliateCommission,
  type AffiliatePayout,
  type InsertAffiliatePayout,
  type AffiliateApplication,
  type InsertAffiliateApplication,
  type PlatformPlan,
  type InsertPlatformPlan,
  type TenantInvoice,
  type InsertTenantInvoice,
  type Promotion,
  type InsertPromotion,
  type TenantAnnouncement,
  type InsertTenantAnnouncement,
  type Testimonial,
  type InsertTestimonial,
  type PublicTestimonial,
  type TestimonialStatus,
  type OnlineCourse,
  type InsertOnlineCourse,
  type OnlineCourseLocation,
  type InsertOnlineCourseLocation,
  type Cart,
  type InsertCart,
  type CartItem,
  type InsertCartItem,
  carts,
  cartItems,
  users,
  tenants,
  tenantThemes,
  tenantMembers,
  locations,
  packages,
  packageLocations,
  packageComponents,
  packageUpsellDependencies,
  scheduleOfferings,
  offeringWaitlist,
  enrollments,
  auditEvents,
  media,
  contactSubmissions,
  contactMessageReplies,
  payments,
  creditLedger,
  tenantPaymentSettings,
  vehicles,
  instructorAvailability,
  scheduleSessions,
  bookings,
  savedBlocks,
  tenantApiKeys,
  supportTickets,
  ticketResponses,
  notifications,
  staleCreditReminders,
  cartReminders,
  type CartReminder,
  type InsertCartReminder,
  emailUnsubscribes,
  type EmailUnsubscribe,
  type InsertEmailUnsubscribe,
  marketingProgramSettings,
  affiliates,
  affiliateReferrals,
  affiliateCommissions,
  affiliatePayouts,
  affiliateApplications,
  platformPlans,
  tenantInvoices,
  promotions,
  tenantAnnouncements,
  testimonials,
  onlineCourses,
  onlineCourseLocations,
  sessionActivityLog,
  sessionChangeEmails,
  tenantEmailTemplates,
  type TenantEmailTemplate,
  type InsertTenantEmailTemplate,
  faqs,
  type Faq,
  type InsertFaq,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, ilike, inArray, sql, desc, lt, count, type SQL } from "drizzle-orm";
import {
  CartCheckoutError,
  CartCheckoutErrorCode,
  CART_CHECKOUT_ERROR_MESSAGES,
} from "@shared/api-errors";

export type PackageLocationLink = {
  locationId: number;
  priceOverrideCents?: number | null;
};

function normalizeLocationLinks(
  input: number[] | PackageLocationLink[] | null | undefined,
): PackageLocationLink[] {
  if (!input) return [];
  return input.map((v) =>
    typeof v === "number"
      ? { locationId: v, priceOverrideCents: null }
      : { locationId: v.locationId, priceOverrideCents: v.priceOverrideCents ?? null },
  );
}

export type CartReminderAggregate = {
  lastSentAt: Date | null;
  stagesSent: number[];
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  hasOpened: boolean;
  hasClicked: boolean;
  recoveredAt: Date | null;
};

export type CartReminderTrackingSummary = {
  remindersSent: number;
  uniqueReminders: number;
  totalOpens: number;
  totalClicks: number;
  recoveries: number;
  openRate: number;
  clickRate: number;
  recoveryRate: number;
  byStage: Array<{
    stage: number;
    sent: number;
    uniqueOpens: number;
    uniqueClicks: number;
    recoveries: number;
    openRate: number;
    clickRate: number;
    recoveryRate: number;
  }>;
};

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getTenant(id: number): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  getTenantByDomain(domain: string): Promise<Tenant | undefined>;
  getAllTenants(): Promise<Tenant[]>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant>;

  getTenantTheme(tenantId: number): Promise<TenantTheme | undefined>;
  upsertTenantTheme(theme: InsertTenantTheme): Promise<TenantTheme>;

  getTenantMember(tenantId: number, userId: string): Promise<TenantMember | undefined>;
  getTenantMemberRoles(tenantId: number, userId: string): Promise<TenantMember[]>;
  getTenantMemberById(id: number, tenantId: number): Promise<TenantMember | undefined>;
  getTenantMemberByEmail(tenantId: number, email: string): Promise<TenantMember | undefined>;
  getTenantMemberByEmailAndRole(tenantId: number, email: string, role: string): Promise<TenantMember | undefined>;
  getTenantMembers(tenantId: number): Promise<(TenantMember & { user: User | null })[]>;
  getUserTenants(userId: string): Promise<(TenantMember & { tenant: Tenant })[]>;
  createTenantMember(member: InsertTenantMember): Promise<TenantMember>;
  updateTenantMember(id: number, tenantId: number, data: Partial<InsertTenantMember>): Promise<TenantMember>;
  countTenantAdmins(tenantId: number): Promise<number>;
  linkInvitedMember(tenantId: number, email: string, userId: string): Promise<TenantMember | undefined>;

  deleteTenantMember(id: number, tenantId: number): Promise<void>;
  getInvitedMembersByEmail(email: string): Promise<TenantMember[]>;
  getTenantMembersByEmailInvited(tenantId: number, email: string): Promise<TenantMember[]>;

  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEvents(tenantId: number, limit?: number): Promise<AuditEvent[]>;

  getLocations(tenantId: number): Promise<Location[]>;
  getLocation(id: number): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: number, tenantId: number, data: Partial<InsertLocation>): Promise<Location>;
  deleteLocation(id: number, tenantId: number): Promise<void>;

  getPackages(tenantId: number, filters?: { locationId?: number | null }): Promise<Package[]>;
  getPackageLocationIds(packageId: number): Promise<number[]>;
  getPackageLocationsMap(tenantId: number): Promise<Record<number, number[]>>;
  getPackageLocationOverrides(packageId: number): Promise<Record<number, number | null>>;
  getPackageLocationOverridesMap(tenantId: number): Promise<Record<number, Record<number, number>>>;
  getEffectivePackagePrice(packageId: number, locationId: number | null | undefined): Promise<number>;
  setPackageLocations(packageId: number, tenantId: number, links: number[] | PackageLocationLink[]): Promise<void>;
  validateTenantLocations(tenantId: number, locationIds: number[]): Promise<number[]>;
  isPackageAllowedAtLocation(packageId: number, locationId: number | null | undefined): Promise<boolean>;
  assertPackageAllowedAtLocation(packageId: number, locationId: number | null | undefined): Promise<{ ok: true } | { ok: false; message: string; code: CartCheckoutErrorCode }>;
  getPackage(id: number): Promise<Package | undefined>;
  createPackage(pkg: InsertPackage): Promise<Package>;
  createPackageWithLocations(pkg: InsertPackage, links: number[] | PackageLocationLink[] | null): Promise<Package>;
  updatePackage(id: number, tenantId: number, data: Partial<InsertPackage>): Promise<Package>;
  updatePackageWithLocations(id: number, tenantId: number, data: Partial<InsertPackage>, links: number[] | PackageLocationLink[] | null): Promise<Package>;
  deletePackage(id: number, tenantId: number): Promise<void>;
  // Upsell dependencies
  listUpsellDependencies(packageId: number): Promise<number[]>;
  setUpsellDependencies(packageId: number, tenantId: number, parentPackageIds: number[]): Promise<void>;
  getUpsellDependenciesMap(tenantId: number): Promise<Record<number, number[]>>;

  getEnrollmentsForPackage(tenantId: number, packageId: number): Promise<Enrollment[]>;
  getSessionsForPackage(tenantId: number, packageId: number): Promise<ScheduleSession[]>;
  getPackageFinancials(tenantId: number, packageId: number, opts?: { from?: Date; to?: Date }): Promise<{
    totalRevenueCents: number;
    paidCount: number;
    pendingCount: number;
    failedCount: number;
    refundedCount: number;
    refundedTotalCents: number;
    avgTicketCents: number;
    outstandingBalanceCents: number;
    enrollmentCount: number;
  }>;
  getPackageRevenueSeries(tenantId: number, packageId: number, opts?: { from?: Date; to?: Date }): Promise<{ month: string; revenueCents: number }[]>;
  getFulfillablePackagesForSession(tenantId: number, sessionId: number): Promise<Package[]>;
  getSetupHealth(tenantId: number): Promise<{
    packagesWithoutOfferings: { id: number; name: string }[];
    publishedOfferingsWithoutSessions: { id: number; name: string }[];
    sessionsMissingResources: { id: number; type: string; startAt: Date; missing: string[] }[];
    enrollmentsWithUnusedCredits: { id: number; firstName: string; lastName: string; email: string; classroom: number; drive: number }[];
  }>;

  getPackageComponents(packageId: number): Promise<PackageComponent[]>;
  getPackageComponentsByTenant(tenantId: number): Promise<PackageComponent[]>;
  createPackageComponent(comp: InsertPackageComponent): Promise<PackageComponent>;
  updatePackageComponent(id: number, tenantId: number, data: Partial<InsertPackageComponent>): Promise<PackageComponent>;
  deletePackageComponent(id: number, tenantId: number): Promise<void>;

  getScheduleOfferings(tenantId: number): Promise<ScheduleOffering[]>;
  getScheduleOffering(id: number, tenantId: number): Promise<ScheduleOffering | undefined>;
  createScheduleOffering(offering: InsertScheduleOffering): Promise<ScheduleOffering>;
  updateScheduleOffering(id: number, tenantId: number, data: Partial<InsertScheduleOffering>): Promise<ScheduleOffering>;
  deleteScheduleOffering(id: number, tenantId: number): Promise<{ ok: true } | { ok: false; sessionIdsWithBookings: number[] }>;
  getOfferingMoveImpact(id: number, tenantId: number): Promise<{ bookedSessionCount: number; confirmedEnrollmentCount: number; enrollees: { id: number; dateOfBirth: string | null }[] }>;
  createPackageWithCohorts(
    pkg: InsertPackage,
    locationLinks: number[] | PackageLocationLink[] | null,
    cohorts: { offering: Omit<InsertScheduleOffering, "packageId" | "tenantId">; sessions?: Omit<InsertScheduleSession, "offeringId" | "tenantId">[] }[],
  ): Promise<{ package: Package; offerings: ScheduleOffering[]; sessionsCreated: number }>;

  getOfferingWaitlist(offeringId: number, tenantId: number): Promise<OfferingWaitlist[]>;
  addOfferingWaitlist(entry: InsertOfferingWaitlist): Promise<OfferingWaitlist>;
  removeOfferingWaitlist(id: number, tenantId: number): Promise<void>;

  getOnlineCourses(tenantId: number, filters?: { locationId?: number | null }): Promise<OnlineCourse[]>;
  getOnlineCourse(id: number): Promise<OnlineCourse | undefined>;
  createOnlineCourse(course: InsertOnlineCourse): Promise<OnlineCourse>;
  createOnlineCourseWithLocations(course: InsertOnlineCourse, locationIds: number[] | null): Promise<OnlineCourse>;
  updateOnlineCourse(id: number, tenantId: number, data: Partial<InsertOnlineCourse>): Promise<OnlineCourse>;
  updateOnlineCourseWithLocations(id: number, tenantId: number, data: Partial<InsertOnlineCourse>, locationIds: number[] | null): Promise<OnlineCourse>;
  deleteOnlineCourse(id: number, tenantId: number): Promise<void>;
  getOnlineCourseLocationIds(onlineCourseId: number): Promise<number[]>;
  setOnlineCourseLocations(onlineCourseId: number, tenantId: number, locationIds: number[]): Promise<void>;
  isOnlineCourseAllowedAtLocation(onlineCourseId: number, locationId: number | null | undefined): Promise<boolean>;
  assertOnlineCourseAllowedAtLocation(onlineCourseId: number, locationId: number | null | undefined): Promise<{ ok: true } | { ok: false; message: string }>;

  getEnrollments(tenantId: number, filters?: { status?: string; search?: string }): Promise<Enrollment[]>;
  getEnrollmentById(id: number, tenantId: number): Promise<Enrollment | undefined>;
  createEnrollment(enrollment: InsertEnrollment): Promise<Enrollment>;
  updateEnrollment(id: number, tenantId: number, data: Partial<InsertEnrollment>): Promise<Enrollment>;

  getMedia(tenantId: number): Promise<Media[]>;
  createMedia(item: InsertMedia): Promise<Media>;
  deleteMedia(id: number, tenantId: number): Promise<void>;

  createContactSubmission(data: InsertContactSubmission): Promise<ContactSubmission>;
  getContactSubmissions(tenantId: number, filters?: { status?: "all" | "unread" | "read" | "archived"; search?: string; limit?: number; offset?: number }): Promise<ContactSubmission[]>;
  getContactSubmission(id: number, tenantId: number): Promise<ContactSubmission | undefined>;
  getContactSubmissionByReplyToken(token: string): Promise<ContactSubmission | undefined>;
  backfillContactSubmissionReplyTokens(): Promise<number>;
  updateContactSubmissionRead(id: number, tenantId: number, read: boolean): Promise<ContactSubmission | undefined>;
  archiveContactSubmission(id: number, tenantId: number): Promise<ContactSubmission | undefined>;
  unarchiveContactSubmission(id: number, tenantId: number): Promise<ContactSubmission | undefined>;
  deleteContactSubmission(id: number, tenantId: number): Promise<void>;
  getUnreadContactSubmissionCount(tenantId: number): Promise<number>;
  claimContactConfirmationEmailSend(id: number, tenantId: number): Promise<ContactSubmission | undefined>;
  createContactMessageReply(data: InsertContactMessageReply): Promise<ContactMessageReply>;
  getContactMessageReplies(submissionId: number, tenantId: number): Promise<ContactMessageReply[]>;
  updateContactMessageReplyEmailStatus(id: number, status: string, emailId: number | null): Promise<void>;
  getLatestContactReplyMap(tenantId: number, submissionIds: number[]): Promise<Map<number, { lastReplyAt: Date; replyCount: number }>>;
  releaseContactConfirmationEmailSend(id: number, tenantId: number): Promise<void>;

  resolveTenant(hostname: string): Promise<Tenant | undefined>;

  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentByProviderOrderId(provider: string, providerOrderId: string): Promise<Payment | undefined>;
  getPaymentsByEnrollment(enrollmentId: number): Promise<Payment[]>;
  getPaymentsByTenant(tenantId: number, filters?: { status?: string; provider?: string }): Promise<Payment[]>;
  updatePayment(id: number, data: Partial<Payment>): Promise<Payment>;

  createCreditLedgerEntry(entry: InsertCreditLedger): Promise<CreditLedgerEntry>;
  createCreditLedgerEntries(entries: InsertCreditLedger[]): Promise<CreditLedgerEntry[]>;
  getCreditsByEnrollment(enrollmentId: number): Promise<CreditLedgerEntry[]>;
  hasPackageGrant(enrollmentId: number): Promise<boolean>;

  getTenantPaymentSettings(tenantId: number): Promise<TenantPaymentSettings | undefined>;
  upsertTenantPaymentSettings(data: InsertTenantPaymentSettings): Promise<TenantPaymentSettings>;

  getExpiredPendingEnrollments(olderThanHours: number): Promise<Enrollment[]>;
  getExpiredPendingEnrollmentsByTenant(tenantId: number, olderThanHours: number): Promise<Enrollment[]>;
  expireEnrollment(enrollmentId: number, tenantId: number): Promise<void>;
  getAllTenantPaymentSettings(): Promise<TenantPaymentSettings[]>;
  countPendingPaymentEnrollments(tenantId: number, olderThanHours: number): Promise<number>;
  createUserByEmail(email: string, name: string, phone?: string | null): Promise<User>;

  // Phase 2: Vehicles
  getVehicles(tenantId: number): Promise<Vehicle[]>;
  getVehicle(id: number, tenantId: number): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: number, tenantId: number, data: Partial<InsertVehicle>): Promise<Vehicle>;
  deleteVehicle(id: number, tenantId: number): Promise<void>;

  // Phase 2: Instructor Availability
  getInstructorAvailability(tenantId: number, instructorId?: string): Promise<InstructorAvailability[]>;
  createInstructorAvailability(block: InsertInstructorAvailability): Promise<InstructorAvailability>;
  updateInstructorAvailability(id: number, tenantId: number, data: Partial<InsertInstructorAvailability>): Promise<InstructorAvailability>;
  deleteInstructorAvailability(id: number, tenantId: number): Promise<void>;

  // Phase 2: Sessions
  getScheduleSessions(tenantId: number, filters?: { type?: string; instructorId?: string; locationId?: number; from?: Date; to?: Date; status?: string }): Promise<ScheduleSession[]>;
  getScheduleSession(id: number, tenantId: number): Promise<ScheduleSession | undefined>;
  createScheduleSession(session: InsertScheduleSession): Promise<ScheduleSession>;
  createScheduleSessions(sessions: InsertScheduleSession[]): Promise<ScheduleSession[]>;
  updateScheduleSession(id: number, tenantId: number, data: Partial<InsertScheduleSession>): Promise<ScheduleSession>;
  cancelScheduleSession(id: number, tenantId: number): Promise<ScheduleSession>;
  bulkAssignInstructorToSessions(tenantId: number, sessionIds: number[], instructorId: string | null): Promise<{
    updated: ScheduleSession[];
    skipped: Array<{ sessionId: number; reason: string }>;
  }>;

  // Phase 2: Bookings
  getBookings(tenantId: number, filters?: { sessionId?: number; enrollmentId?: number; userId?: string; status?: string }): Promise<Booking[]>;
  getBooking(id: number, tenantId: number): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBooking(id: number, tenantId: number, data: Partial<Booking>): Promise<Booking>;
  getSessionBookings(sessionId: number): Promise<(Booking & { enrollment?: Enrollment })[]>;
  getCreditBalance(enrollmentId: number, type: string): Promise<number>;
  checkSessionConflict(instructorId: string, vehicleId: number | null, startAt: Date, endAt: Date, excludeSessionId?: number, tenantId?: number): Promise<boolean>;

  getOutstandingComponents(enrollmentId: number, tenantId: number): Promise<{
    components: Array<{ type: string; requiredHours: number; bookedHours: number; attendedHours: number; remainingHours: number }>;
    inClassFromThisSchool: boolean;
    inClassRequired: number;
    inClassAttended: number;
    inClassGate: boolean;
  }>;
  createBtwSessionAtomic(params: {
    tenantId: number;
    enrollmentId: number;
    componentType: "BTW_OBSERVATION" | "BTW_PRACTICE" | "ROAD_TEST";
    instructorId: string;
    locationId: number | null;
    vehicleId: number | null;
    startAt: Date;
    endAt: Date;
    notes: string | null;
    actorUserId: string;
  }): Promise<{ ok: boolean; reason?: string; gate?: boolean; session?: ScheduleSession; booking?: Booking }>;
  cancelAndRescheduleSession(params: {
    tenantId: number;
    sessionId: number;
    newStartAt: Date;
    newEndAt: Date;
    newInstructorId?: string | null;
    newLocationId?: number | null;
    newVehicleId?: number | null;
    actorUserId: string;
  }): Promise<{ ok: boolean; reason?: string; originalSession?: ScheduleSession; newSession?: ScheduleSession; movedBookings?: Booking[] }>;

  getSavedBlocks(tenantId: number): Promise<SavedBlock[]>;
  createSavedBlock(block: InsertSavedBlock): Promise<SavedBlock>;
  deleteSavedBlock(id: number, tenantId: number): Promise<void>;

  createTenantApiKey(data: InsertTenantApiKey): Promise<TenantApiKey>;
  getTenantApiKeys(tenantId: number): Promise<TenantApiKey[]>;
  revokeTenantApiKey(id: number, tenantId: number): Promise<void>;
  getTenantApiKeyById(id: number): Promise<TenantApiKey | undefined>;
  updateApiKeyLastUsed(id: number): Promise<void>;
  getApiKeyByPrefix(prefix: string): Promise<TenantApiKey | undefined>;

  createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket>;
  getSupportTicketsByTenant(tenantId: number): Promise<SupportTicket[]>;
  getSupportTicketsByUser(tenantId: number, userId: string): Promise<SupportTicket[]>;
  getAllSupportTickets(filters?: { status?: string; type?: string; search?: string }): Promise<(SupportTicket & { tenantName: string; submitterName: string; submitterEmail: string })[]>;
  getSupportTicket(id: number): Promise<(SupportTicket & { tenantName: string; submitterName: string; submitterEmail: string }) | undefined>;
  updateSupportTicket(id: number, data: { status?: string; priority?: string | null }): Promise<SupportTicket>;
  createTicketResponse(data: InsertTicketResponse): Promise<TicketResponse>;
  getTicketResponses(ticketId: number, includeInternal?: boolean): Promise<(TicketResponse & { authorName: string; authorEmail: string })[]>;

  createNotification(data: InsertNotification): Promise<Notification>;
  createNotifications(data: InsertNotification[]): Promise<void>;
  getNotificationsForUser(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  getStaleCreditReminderCandidates(tenantId: number, intervalDays: number): Promise<Array<{
    enrollmentId: number;
    userId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    classroom: number;
    drive: number;
    enrollmentCreatedAt: Date;
    lastReminderAt: Date | null;
  }>>;
  recordStaleCreditReminder(data: InsertStaleCreditReminder): Promise<StaleCreditReminder>;
  getStaleCreditReminderHistory(tenantId: number, enrollmentId?: number, limit?: number): Promise<StaleCreditReminder[]>;
  getLastStaleCreditReminderAt(enrollmentId: number): Promise<Date | null>;
  getLastStaleCreditReminderAtForStudent(tenantId: number, recipientUserId: string | null, recipientEmail: string): Promise<Date | null>;

  recordCartReminder(data: InsertCartReminder): Promise<CartReminder>;
  getCartReminderHistory(tenantId: number, opts?: { cartId?: string; paymentId?: number; limit?: number }): Promise<CartReminder[]>;
  getCartReminderStagesByTenant(tenantId: number): Promise<{
    byCartId: Map<string, CartReminderAggregate>;
    byPaymentId: Map<number, CartReminderAggregate>;
  }>;
  getCartReminderByToken(token: string): Promise<CartReminder | undefined>;
  recordCartReminderOpen(token: string): Promise<CartReminder | undefined>;
  recordCartReminderClick(token: string): Promise<CartReminder | undefined>;
  markCartRemindersRecovered(tenantId: number, opts: { cartId?: string | null; paymentId?: number | null }): Promise<number>;
  getCartReminderTrackingSummary(tenantId: number): Promise<CartReminderTrackingSummary>;

  isEmailUnsubscribed(tenantId: number, email: string): Promise<boolean>;
  getEmailTemplate(tenantId: number, templateKey: string): Promise<TenantEmailTemplate | undefined>;
  listEmailTemplates(tenantId: number): Promise<TenantEmailTemplate[]>;
  upsertEmailTemplate(data: InsertTenantEmailTemplate): Promise<TenantEmailTemplate>;
  addEmailUnsubscribe(data: InsertEmailUnsubscribe): Promise<EmailUnsubscribe>;
  getUnsubscribedEmailsForTenant(tenantId: number): Promise<Map<string, string>>;
  getSessionChangeEmailByProviderMessageId(providerMessageId: string): Promise<{ tenantId: number } | undefined>;

  getMarketingProgramSettings(): Promise<MarketingProgramSettings>;
  updateMarketingProgramSettings(data: Partial<InsertMarketingProgramSettings>): Promise<MarketingProgramSettings>;

  createAffiliate(data: InsertAffiliate): Promise<Affiliate>;
  getAffiliate(id: number): Promise<(Affiliate & { userName: string; userEmail: string }) | undefined>;
  getAffiliateByCode(code: string): Promise<Affiliate | undefined>;
  getAffiliateByUserId(userId: string): Promise<Affiliate | undefined>;
  getAllAffiliates(): Promise<(Affiliate & { userName: string; userEmail: string; schoolCount: number; totalEarnedCents: number })[]>;
  updateAffiliate(id: number, data: Partial<InsertAffiliate>): Promise<Affiliate>;

  createAffiliateReferral(data: InsertAffiliateReferral): Promise<AffiliateReferral>;
  getReferralsByAffiliate(affiliateId: number): Promise<(AffiliateReferral & { tenantName: string })[]>;
  getReferralByTenant(tenantId: number): Promise<AffiliateReferral | undefined>;
  updateAffiliateReferral(id: number, data: Partial<InsertAffiliateReferral>): Promise<AffiliateReferral>;

  createAffiliateCommission(data: InsertAffiliateCommission): Promise<AffiliateCommission>;
  getCommissionsByAffiliate(affiliateId: number, filters?: { status?: string; period?: string }): Promise<AffiliateCommission[]>;
  getCommissionSummary(affiliateId: number): Promise<{ pending: number; approved: number; paid: number }>;

  createAffiliatePayout(data: InsertAffiliatePayout): Promise<AffiliatePayout>;
  getPayoutsByAffiliate(affiliateId: number): Promise<AffiliatePayout[]>;

  getAffiliateStats(affiliateId: number): Promise<{
    totalReferrals: number;
    activeSchools: number;
    totalEarnedCents: number;
    pendingCents: number;
    approvedCents: number;
  }>;

  createAffiliateApplication(data: InsertAffiliateApplication): Promise<AffiliateApplication>;
  getAffiliateApplications(): Promise<AffiliateApplication[]>;
  getAffiliateApplication(id: number): Promise<AffiliateApplication | undefined>;
  updateAffiliateApplication(id: number, data: Partial<AffiliateApplication>): Promise<AffiliateApplication>;

  createPlan(data: InsertPlatformPlan): Promise<PlatformPlan>;
  getPlan(id: number): Promise<PlatformPlan | undefined>;
  getAllPlans(): Promise<PlatformPlan[]>;
  updatePlan(id: number, data: Partial<InsertPlatformPlan>): Promise<PlatformPlan>;
  getActivePlans(): Promise<PlatformPlan[]>;

  updateTenantBilling(tenantId: number, data: { planId?: number | null; subscriptionStatus?: string; billingEmail?: string | null; trialEndsAt?: Date | null; currentPeriodStart?: Date | null; currentPeriodEnd?: Date | null; stripeCustomerId?: string | null }): Promise<Tenant>;

  createInvoice(data: InsertTenantInvoice): Promise<TenantInvoice>;
  getInvoice(id: number): Promise<TenantInvoice | undefined>;
  getInvoicesByTenant(tenantId: number): Promise<TenantInvoice[]>;
  getAllInvoices(filters?: { status?: string; tenantId?: number; from?: Date; to?: Date }): Promise<TenantInvoice[]>;
  updateInvoice(id: number, data: Partial<InsertTenantInvoice>): Promise<TenantInvoice>;
  getOverdueInvoices(): Promise<TenantInvoice[]>;
  getInvoiceSummary(): Promise<{ draft: number; pending: number; paid: number; failed: number; void: number }>;

  // ===== Checkout cart =====
  createCart(tenantId: number): Promise<Cart>;
  getCart(cartId: string): Promise<Cart | undefined>;
  listCartItems(cartId: string): Promise<(CartItem & { package: Package; offering?: ScheduleOffering | null })[]>;
  addCartItem(cartId: string, packageId: number, offeringId: number | null): Promise<CartItem>;
  removeCartItem(cartId: string, itemId: number): Promise<void>;
  clearCart(cartId: string): Promise<void>;
  setCartStatus(cartId: string, status: "open" | "checkout_pending" | "converted" | "abandoned"): Promise<void>;
  setCartCustomer(cartId: string, customer: any, locationId: number | null): Promise<void>;
  setCartLocation(cartId: string, locationId: number | null): Promise<void>;
  listPendingCashPayments(tenantId: number): Promise<Array<Payment & { enrollment: Enrollment | null; cartCustomer: any; cartItems: Array<{ package: Package | null; offering: ScheduleOffering | null; quantity: number }> }>>;
  countPendingCashPayments(tenantId: number): Promise<number>;
  cancelCashPayment(paymentId: number, tenantId: number): Promise<{ ok: boolean; cartId: string | null; enrollmentIds: number[] }>;
  listAbandonedCarts(tenantId: number): Promise<Array<Cart & { items: Array<CartItem & { package: Package; offering?: ScheduleOffering | null }> }>>;
  expireAbandonedCarts(tenantId: number, olderThanHours: number): Promise<Array<{ cartId: string; tenantId: number }>>;
  getPendingInterestByOffering(tenantId: number): Promise<Record<number, number>>;
  countAttentionEnrollments(tenantId: number): Promise<{ pendingCash: number; abandoned: number }>;
  listOfferingsForPackage(tenantId: number, packageId: number, opts?: { onlyPublished?: boolean }): Promise<(ScheduleOffering & { remainingSeats: number })[]>;
  listAddOnPackages(
    tenantId: number,
    filters?: { locationId?: number | null; parentPackageId?: number | null },
  ): Promise<Package[]>;
  listCartUpsells(cartId: string): Promise<Package[]>;
  listUpsellsForPackages(
    tenantId: number,
    packageIds: number[],
    locationId?: number | null,
  ): Promise<Package[]>;
  getEnrollmentsByCart(cartId: string): Promise<Enrollment[]>;
  createCartEnrollmentsAndBookAtomic(
    cartId: string,
    payment: { id: number; tenantId: number; amountCents: number }
  ): Promise<{ ok: true; enrollments: Enrollment[]; bookings: { enrollmentId: number; booked: number; waitlisted: boolean }[] } | { ok: false; error: string }>;
  bookOfferingSessionsAtomic(enrollmentId: number, offeringId: number, tenantId: number, userId: string | null): Promise<{ booked: number; waitlisted: boolean }>;
  bookCartOfferingsAtomic(items: { enrollmentId: number; offeringId: number; tenantId: number; userId: string | null }[]): Promise<{ ok: boolean; results: { enrollmentId: number; booked: number; waitlisted: boolean }[]; error?: string }>;
  promoteWaitlistEntry(waitlistId: number, tenantId: number): Promise<{ ok: boolean; reason?: string; enrollmentId?: number }>;
  getOfferingSessions(offeringId: number, tenantId: number): Promise<ScheduleSession[]>;

  getPromotions(tenantId: number): Promise<Promotion[]>;
  getPromotion(id: number): Promise<Promotion | undefined>;
  createPromotion(promo: InsertPromotion): Promise<Promotion>;
  updatePromotion(id: number, tenantId: number, data: Partial<InsertPromotion>): Promise<Promotion>;
  deletePromotion(id: number, tenantId: number): Promise<void>;

  getTenantAnnouncement(tenantId: number): Promise<TenantAnnouncement | undefined>;
  getTenantAnnouncements(tenantId: number): Promise<TenantAnnouncement[]>;
  getTenantAnnouncementById(id: number, tenantId: number): Promise<TenantAnnouncement | undefined>;
  createTenantAnnouncement(data: InsertTenantAnnouncement): Promise<TenantAnnouncement>;
  updateTenantAnnouncement(id: number, tenantId: number, data: Partial<InsertTenantAnnouncement>): Promise<TenantAnnouncement | undefined>;
  deleteTenantAnnouncement(id: number, tenantId: number): Promise<void>;

  getTestimonials(tenantId: number, filters?: { status?: TestimonialStatus; locationId?: number }): Promise<Testimonial[]>;
  getTestimonial(id: number): Promise<Testimonial | undefined>;
  createTestimonial(data: InsertTestimonial): Promise<Testimonial>;
  updateTestimonial(id: number, tenantId: number, data: Partial<InsertTestimonial> & { approvedByUserId?: string | null; approvedAt?: Date | null }): Promise<Testimonial>;
  deleteTestimonial(id: number, tenantId: number): Promise<void>;
  listPublicTestimonials(tenantId: number, opts?: { locationId?: number; featured?: boolean }): Promise<PublicTestimonial[]>;

  getFaqs(tenantId: number): Promise<Faq[]>;
  createFaq(data: InsertFaq): Promise<Faq>;
  updateFaq(id: number, tenantId: number, data: Partial<InsertFaq>): Promise<Faq>;
  deleteFaq(id: number, tenantId: number): Promise<void>;
}

const ROLE_PRIORITY: Record<string, number> = {
  platform_admin: 0,
  tenant_admin: 1,
  office_manager: 2,
  instructor: 3,
  parent: 4,
  student: 5,
};

export function getRolePriority(role: string): number {
  return ROLE_PRIORITY[role] ?? 99;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant;
  }

  async getTenantByDomain(domain: string): Promise<Tenant | undefined> {
    const bare = domain.replace(/^www\./, "");
    const withWww = `www.${bare}`;
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(and(
        or(eq(tenants.customDomain, domain), eq(tenants.customDomain, bare), eq(tenants.customDomain, withWww)),
        eq(tenants.domainVerified, true)
      ));
    return tenant;
  }

  async getAllTenants(): Promise<Tenant[]> {
    return db.select().from(tenants);
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    await db.insert(tenantThemes).values({ tenantId: created.id });
    return created;
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant> {
    const [updated] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  }

  async getTenantTheme(tenantId: number): Promise<TenantTheme | undefined> {
    const [theme] = await db
      .select()
      .from(tenantThemes)
      .where(eq(tenantThemes.tenantId, tenantId));
    return theme;
  }

  async upsertTenantTheme(theme: InsertTenantTheme): Promise<TenantTheme> {
    const existing = await this.getTenantTheme(theme.tenantId);
    if (existing) {
      const [updated] = await db
        .update(tenantThemes)
        .set(theme)
        .where(eq(tenantThemes.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(tenantThemes).values(theme).returning();
    return created;
  }

  async getTenantMember(tenantId: number, userId: string): Promise<TenantMember | undefined> {
    const members = await db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)));
    if (members.length === 0) return undefined;
    if (members.length === 1) return members[0];
    return members.sort((a, b) => getRolePriority(a.role) - getRolePriority(b.role))[0];
  }

  async getTenantMemberRoles(tenantId: number, userId: string): Promise<TenantMember[]> {
    return db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)));
  }

  async getTenantMemberById(id: number, tenantId: number): Promise<TenantMember | undefined> {
    const [member] = await db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.id, id), eq(tenantMembers.tenantId, tenantId)));
    return member;
  }

  async getTenantMemberByEmail(tenantId: number, email: string): Promise<TenantMember | undefined> {
    const [member] = await db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.emailInvited, email)));
    return member;
  }

  async getTenantMemberByEmailAndRole(tenantId: number, email: string, role: string): Promise<TenantMember | undefined> {
    const [member] = await db
      .select()
      .from(tenantMembers)
      .where(and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.emailInvited, email),
        eq(tenantMembers.role, role as any),
      ));
    return member;
  }

  async getTenantMembers(tenantId: number): Promise<(TenantMember & { user: User | null })[]> {
    const results = await db
      .select()
      .from(tenantMembers)
      .leftJoin(users, eq(tenantMembers.userId, users.id))
      .where(eq(tenantMembers.tenantId, tenantId));
    return results.map((r) => ({ ...r.tenant_members, user: r.users }));
  }

  async getUserTenants(userId: string): Promise<(TenantMember & { tenant: Tenant })[]> {
    const results = await db
      .select()
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
      .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.status, "ACTIVE")));
    return results.map((r) => ({ ...r.tenant_members, tenant: r.tenants }));
  }

  async createTenantMember(member: InsertTenantMember): Promise<TenantMember> {
    const [created] = await db.insert(tenantMembers).values(member as any).returning();
    return created;
  }

  async updateTenantMember(id: number, tenantId: number, data: Partial<InsertTenantMember>): Promise<TenantMember> {
    const [updated] = await db
      .update(tenantMembers)
      .set(data as any)
      .where(and(eq(tenantMembers.id, id), eq(tenantMembers.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async countTenantAdmins(tenantId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(tenantMembers)
      .where(and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.role, "tenant_admin"),
        eq(tenantMembers.status, "ACTIVE"),
      ));
    return Number(result[0]?.count ?? 0);
  }

  async linkInvitedMember(tenantId: number, email: string, userId: string): Promise<TenantMember | undefined> {
    const updated = await db
      .update(tenantMembers)
      .set({ userId, status: "ACTIVE", joinedAt: new Date() })
      .where(and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.emailInvited, email),
        eq(tenantMembers.status, "INVITED"),
      ))
      .returning();
    return updated[0];
  }

  async deleteTenantMember(id: number, tenantId: number): Promise<void> {
    await db.delete(tenantMembers).where(and(eq(tenantMembers.id, id), eq(tenantMembers.tenantId, tenantId)));
  }

  async getInvitedMembersByEmail(email: string): Promise<TenantMember[]> {
    return db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.emailInvited, email), eq(tenantMembers.status, "INVITED")));
  }

  async getTenantMembersByEmailInvited(tenantId: number, email: string): Promise<TenantMember[]> {
    return db
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.emailInvited, email)));
  }

  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [created] = await db.insert(auditEvents).values(event).returning();
    return created;
  }

  async getAuditEvents(tenantId: number, limit = 50): Promise<AuditEvent[]> {
    return db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId))
      .orderBy(sql`${auditEvents.createdAt} DESC`)
      .limit(limit);
  }

  async getLocations(tenantId: number): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.tenantId, tenantId));
  }

  async getLocation(id: number): Promise<Location | undefined> {
    const [loc] = await db.select().from(locations).where(eq(locations.id, id));
    return loc;
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [created] = await db.insert(locations).values(location).returning();
    return created;
  }

  async updateLocation(id: number, tenantId: number, data: Partial<InsertLocation>): Promise<Location> {
    const [updated] = await db
      .update(locations)
      .set(data)
      .where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteLocation(id: number, tenantId: number): Promise<void> {
    await db.delete(locations).where(and(eq(locations.id, id), eq(locations.tenantId, tenantId)));
  }

  async getPackages(tenantId: number, filters?: { locationId?: number | null }): Promise<Package[]> {
    const rows = await db.select().from(packages).where(eq(packages.tenantId, tenantId));
    if (!filters || filters.locationId == null) return rows;

    const targetLocationId = filters.locationId;
    // Pull every link for this location so we can both filter SPECIFIC_LOCATIONS
    // packages AND apply per-location price overrides (which can also exist
    // on ALL_LOCATIONS packages that have a link row to this location).
    const links = await db
      .select()
      .from(packageLocations)
      .where(
        and(
          inArray(packageLocations.packageId, rows.map((p) => p.id)),
          eq(packageLocations.locationId, targetLocationId),
        ),
      );
    const linkByPkg = new Map(links.map((l) => [l.packageId, l]));
    return rows
      .filter((p) =>
        p.locationScopeMode === "ALL_LOCATIONS" || linkByPkg.has(p.id),
      )
      .map((p) => {
        const override = linkByPkg.get(p.id)?.priceOverrideCents;
        return override != null ? { ...p, price: override } : p;
      });
  }

  async getPackageLocationIds(packageId: number): Promise<number[]> {
    const rows = await db
      .select({ locationId: packageLocations.locationId })
      .from(packageLocations)
      .where(eq(packageLocations.packageId, packageId));
    return rows.map((r) => r.locationId);
  }

  async getPackageLocationsMap(tenantId: number): Promise<Record<number, number[]>> {
    const rows = await db
      .select({
        packageId: packageLocations.packageId,
        locationId: packageLocations.locationId,
      })
      .from(packageLocations)
      .where(eq(packageLocations.tenantId, tenantId));
    const map: Record<number, number[]> = {};
    for (const row of rows) {
      if (!map[row.packageId]) map[row.packageId] = [];
      map[row.packageId].push(row.locationId);
    }
    return map;
  }

  async setPackageLocations(
    packageId: number,
    tenantId: number,
    links: number[] | PackageLocationLink[],
  ): Promise<void> {
    const normalized = normalizeLocationLinks(links);
    // Dedupe by locationId, keeping last override.
    const byId = new Map<number, number | null>();
    for (const l of normalized) byId.set(l.locationId, l.priceOverrideCents ?? null);
    await db.transaction(async (tx) => {
      await tx
        .delete(packageLocations)
        .where(and(eq(packageLocations.packageId, packageId), eq(packageLocations.tenantId, tenantId)));
      if (byId.size === 0) return;
      const ids = Array.from(byId.keys());
      const validLocs = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(inArray(locations.id, ids), eq(locations.tenantId, tenantId)));
      const validIds = new Set(validLocs.map((l) => l.id));
      const invalidIds = ids.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new Error(
          `Invalid location IDs for tenant ${tenantId}: ${invalidIds.join(", ")}`,
        );
      }
      await tx.insert(packageLocations).values(
        ids.map((locationId) => ({
          tenantId,
          packageId,
          locationId,
          priceOverrideCents: byId.get(locationId) ?? null,
        })),
      );
    });
  }

  async getPackageLocationOverrides(packageId: number): Promise<Record<number, number | null>> {
    const rows = await db
      .select({
        locationId: packageLocations.locationId,
        priceOverrideCents: packageLocations.priceOverrideCents,
      })
      .from(packageLocations)
      .where(eq(packageLocations.packageId, packageId));
    const out: Record<number, number | null> = {};
    for (const r of rows) out[r.locationId] = r.priceOverrideCents ?? null;
    return out;
  }

  async getPackageLocationOverridesMap(
    tenantId: number,
  ): Promise<Record<number, Record<number, number>>> {
    const rows = await db
      .select({
        packageId: packageLocations.packageId,
        locationId: packageLocations.locationId,
        priceOverrideCents: packageLocations.priceOverrideCents,
      })
      .from(packageLocations)
      .where(eq(packageLocations.tenantId, tenantId));
    const map: Record<number, Record<number, number>> = {};
    for (const r of rows) {
      if (r.priceOverrideCents == null) continue;
      if (!map[r.packageId]) map[r.packageId] = {};
      map[r.packageId][r.locationId] = r.priceOverrideCents;
    }
    return map;
  }

  async getEffectivePackagePrice(
    packageId: number,
    locationId: number | null | undefined,
  ): Promise<number> {
    const pkg = await this.getPackage(packageId);
    if (!pkg) throw new Error("Package not found");
    if (locationId == null) return pkg.price;
    const [link] = await db
      .select({ priceOverrideCents: packageLocations.priceOverrideCents })
      .from(packageLocations)
      .where(
        and(
          eq(packageLocations.packageId, packageId),
          eq(packageLocations.locationId, locationId),
        ),
      )
      .limit(1);
    if (link && link.priceOverrideCents != null) return link.priceOverrideCents;
    return pkg.price;
  }

  async getPackage(id: number): Promise<Package | undefined> {
    const [pkg] = await db.select().from(packages).where(eq(packages.id, id));
    return pkg;
  }

  async createPackage(pkg: InsertPackage): Promise<Package> {
    const [created] = await db.insert(packages).values(pkg).returning();
    return created;
  }

  async createPackageWithLocations(
    pkg: InsertPackage,
    links: number[] | PackageLocationLink[] | null,
  ): Promise<Package> {
    const normalized = normalizeLocationLinks(links);
    const byId = new Map<number, number | null>();
    for (const l of normalized) byId.set(l.locationId, l.priceOverrideCents ?? null);
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(packages).values(pkg).returning();
      if (byId.size > 0) {
        const ids = Array.from(byId.keys());
        const validLocs = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(and(inArray(locations.id, ids), eq(locations.tenantId, pkg.tenantId)));
        const validIds = new Set(validLocs.map((l) => l.id));
        const invalidIds = ids.filter((id) => !validIds.has(id));
        if (invalidIds.length > 0) {
          throw new Error(
            `Invalid location IDs for tenant ${pkg.tenantId}: ${invalidIds.join(", ")}`,
          );
        }
        await tx.insert(packageLocations).values(
          ids.map((locationId) => ({
            tenantId: pkg.tenantId,
            packageId: created.id,
            locationId,
            priceOverrideCents: byId.get(locationId) ?? null,
          })),
        );
      }
      return created;
    });
  }

  async updatePackage(id: number, tenantId: number, data: Partial<InsertPackage>): Promise<Package> {
    const [updated] = await db
      .update(packages)
      .set(data)
      .where(and(eq(packages.id, id), eq(packages.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async updatePackageWithLocations(
    id: number,
    tenantId: number,
    data: Partial<InsertPackage>,
    links: number[] | PackageLocationLink[] | null,
  ): Promise<Package> {
    const normalized = links === null ? null : normalizeLocationLinks(links);
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(packages)
        .set(data)
        .where(and(eq(packages.id, id), eq(packages.tenantId, tenantId)))
        .returning();
      if (normalized !== null) {
        await tx
          .delete(packageLocations)
          .where(and(eq(packageLocations.packageId, id), eq(packageLocations.tenantId, tenantId)));
        const byId = new Map<number, number | null>();
        for (const l of normalized) byId.set(l.locationId, l.priceOverrideCents ?? null);
        if (byId.size > 0) {
          const ids = Array.from(byId.keys());
          const validLocs = await tx
            .select({ id: locations.id })
            .from(locations)
            .where(and(inArray(locations.id, ids), eq(locations.tenantId, tenantId)));
          const validIds = new Set(validLocs.map((l) => l.id));
          const invalidIds = ids.filter((lid) => !validIds.has(lid));
          if (invalidIds.length > 0) {
            throw new Error(
              `Invalid location IDs for tenant ${tenantId}: ${invalidIds.join(", ")}`,
            );
          }
          await tx.insert(packageLocations).values(
            ids.map((locationId) => ({
              tenantId,
              packageId: id,
              locationId,
              priceOverrideCents: byId.get(locationId) ?? null,
            })),
          );
        }
      }
      return updated;
    });
  }

  async deletePackage(id: number, tenantId: number): Promise<void> {
    await db.delete(packages).where(and(eq(packages.id, id), eq(packages.tenantId, tenantId)));
  }

  async listUpsellDependencies(packageId: number): Promise<number[]> {
    const rows = await db
      .select({ parentPackageId: packageUpsellDependencies.parentPackageId })
      .from(packageUpsellDependencies)
      .where(eq(packageUpsellDependencies.upsellPackageId, packageId));
    return rows.map((r) => r.parentPackageId);
  }

  async setUpsellDependencies(
    packageId: number,
    tenantId: number,
    parentPackageIds: number[],
  ): Promise<void> {
    const unique = Array.from(new Set(parentPackageIds.filter((n) => Number.isFinite(n) && n !== packageId)));
    await db.transaction(async (tx) => {
      await tx
        .delete(packageUpsellDependencies)
        .where(and(
          eq(packageUpsellDependencies.upsellPackageId, packageId),
          eq(packageUpsellDependencies.tenantId, tenantId),
        ));
      if (unique.length === 0) return;
      const validParents = await tx
        .select({ id: packages.id })
        .from(packages)
        .where(and(inArray(packages.id, unique), eq(packages.tenantId, tenantId)));
      const validIds = new Set(validParents.map((p) => p.id));
      const invalidIds = unique.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new Error(
          `Invalid parent package IDs for tenant ${tenantId}: ${invalidIds.join(", ")}`,
        );
      }
      await tx.insert(packageUpsellDependencies).values(
        unique.map((parentPackageId) => ({
          tenantId,
          upsellPackageId: packageId,
          parentPackageId,
        })),
      );
    });
  }

  async getUpsellDependenciesMap(tenantId: number): Promise<Record<number, number[]>> {
    const rows = await db
      .select({
        upsellPackageId: packageUpsellDependencies.upsellPackageId,
        parentPackageId: packageUpsellDependencies.parentPackageId,
      })
      .from(packageUpsellDependencies)
      .where(eq(packageUpsellDependencies.tenantId, tenantId));
    const map: Record<number, number[]> = {};
    for (const r of rows) {
      if (!map[r.upsellPackageId]) map[r.upsellPackageId] = [];
      map[r.upsellPackageId].push(r.parentPackageId);
    }
    return map;
  }

  async validateTenantLocations(tenantId: number, locationIds: number[]): Promise<number[]> {
    const unique = Array.from(new Set(locationIds)).filter((n) => Number.isFinite(n));
    if (unique.length === 0) return [];
    const validLocs = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(inArray(locations.id, unique), eq(locations.tenantId, tenantId)));
    const validIds = new Set(validLocs.map((l) => l.id));
    const invalidIds = unique.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(
        `Invalid location IDs for tenant ${tenantId}: ${invalidIds.join(", ")}`,
      );
    }
    return unique;
  }

  async isPackageAllowedAtLocation(packageId: number, locationId: number | null | undefined): Promise<boolean> {
    if (locationId == null) return true;
    const pkg = await this.getPackage(packageId);
    if (!pkg) return false;
    if (pkg.locationScopeMode === "ALL_LOCATIONS") return true;
    const [link] = await db
      .select({ id: packageLocations.id })
      .from(packageLocations)
      .where(
        and(
          eq(packageLocations.packageId, packageId),
          eq(packageLocations.locationId, locationId),
        ),
      )
      .limit(1);
    return !!link;
  }

  // Stricter checkout-time guard: SPECIFIC_LOCATIONS packages REQUIRE a
  // non-null locationId AND that location must be in the package's allowed
  // list. Used by all enrollment / checkout entry points so a restricted
  // package cannot be purchased without a valid allowed location.
  async assertPackageAllowedAtLocation(
    packageId: number,
    locationId: number | null | undefined,
  ): Promise<{ ok: true } | { ok: false; message: string; code: CartCheckoutErrorCode }> {
    const pkg = await this.getPackage(packageId);
    if (!pkg) return { ok: false, message: "Invalid package", code: CartCheckoutErrorCode.INVALID_PACKAGE };
    if (pkg.locationScopeMode !== "SPECIFIC_LOCATIONS") return { ok: true };
    if (locationId == null) {
      return {
        ok: false,
        code: CartCheckoutErrorCode.LOCATION_REQUIRED,
        message: `Package "${pkg.name}" is restricted to specific locations. Please select a location to continue.`,
      };
    }
    const allowed = await this.getPackageLocationIds(packageId);
    if (!allowed.includes(locationId)) {
      return {
        ok: false,
        code: CartCheckoutErrorCode.LOCATION_NOT_ALLOWED,
        message: `Package "${pkg.name}" is not available at the selected location.`,
      };
    }
    return { ok: true };
  }

  async getPackageComponents(packageId: number): Promise<PackageComponent[]> {
    return db.select().from(packageComponents).where(eq(packageComponents.packageId, packageId)).orderBy(packageComponents.sortOrder, packageComponents.id);
  }

  async getPackageComponentsByTenant(tenantId: number): Promise<PackageComponent[]> {
    return db.select().from(packageComponents).where(eq(packageComponents.tenantId, tenantId)).orderBy(packageComponents.packageId, packageComponents.sortOrder, packageComponents.id);
  }

  async createPackageComponent(comp: InsertPackageComponent): Promise<PackageComponent> {
    const [created] = await db.insert(packageComponents).values(comp).returning();
    return created;
  }

  async updatePackageComponent(id: number, tenantId: number, data: Partial<InsertPackageComponent>): Promise<PackageComponent> {
    const [updated] = await db.update(packageComponents)
      .set(data)
      .where(and(eq(packageComponents.id, id), eq(packageComponents.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deletePackageComponent(id: number, tenantId: number): Promise<void> {
    await db.delete(packageComponents)
      .where(and(eq(packageComponents.id, id), eq(packageComponents.tenantId, tenantId)));
  }

  async getScheduleOfferings(tenantId: number): Promise<ScheduleOffering[]> {
    return db.select().from(scheduleOfferings)
      .where(eq(scheduleOfferings.tenantId, tenantId))
      .orderBy(scheduleOfferings.startsAt);
  }

  async getScheduleOffering(id: number, tenantId: number): Promise<ScheduleOffering | undefined> {
    const [row] = await db.select().from(scheduleOfferings)
      .where(and(eq(scheduleOfferings.id, id), eq(scheduleOfferings.tenantId, tenantId)));
    return row;
  }

  private async assertPackageBelongsToTenant(packageId: number, tenantId: number): Promise<void> {
    const [row] = await db.select({ id: packages.id }).from(packages)
      .where(and(eq(packages.id, packageId), eq(packages.tenantId, tenantId)));
    if (!row) throw new Error(`Package #${packageId} not found in tenant ${tenantId}`);
  }

  async createScheduleOffering(offering: InsertScheduleOffering): Promise<ScheduleOffering> {
    await this.assertPackageBelongsToTenant(offering.packageId, offering.tenantId);
    const [created] = await db.insert(scheduleOfferings).values(offering).returning();
    return created;
  }

  async updateScheduleOffering(id: number, tenantId: number, data: Partial<InsertScheduleOffering>): Promise<ScheduleOffering> {
    if (data.packageId != null) {
      await this.assertPackageBelongsToTenant(data.packageId, tenantId);
    }
    const [updated] = await db.update(scheduleOfferings)
      .set(data)
      .where(and(eq(scheduleOfferings.id, id), eq(scheduleOfferings.tenantId, tenantId)))
      .returning();
    if (!updated) throw new Error("Schedule offering not found");
    return updated;
  }

  async deleteScheduleOffering(
    id: number,
    tenantId: number,
  ): Promise<{ ok: true } | { ok: false; sessionIdsWithBookings: number[] }> {
    const sessionRows = await db
      .select({ id: scheduleSessions.id })
      .from(scheduleSessions)
      .where(and(eq(scheduleSessions.tenantId, tenantId), eq(scheduleSessions.offeringId, id)));
    const sessionIds = sessionRows.map((r) => r.id);
    let blockedSessionIds: number[] = [];
    if (sessionIds.length > 0) {
      const bookingRows = await db
        .select({ sessionId: bookings.sessionId })
        .from(bookings)
        .where(and(inArray(bookings.sessionId, sessionIds), eq(bookings.status, "BOOKED")));
      blockedSessionIds = Array.from(new Set(bookingRows.map((b) => b.sessionId)));
    }
    if (blockedSessionIds.length > 0) {
      return { ok: false, sessionIdsWithBookings: blockedSessionIds };
    }
    await db.transaction(async (tx) => {
      if (sessionIds.length > 0) {
        await tx.delete(scheduleSessions).where(inArray(scheduleSessions.id, sessionIds));
      }
      await tx.delete(scheduleOfferings)
        .where(and(eq(scheduleOfferings.id, id), eq(scheduleOfferings.tenantId, tenantId)));
    });
    return { ok: true };
  }

  async getOfferingMoveImpact(
    id: number,
    tenantId: number,
  ): Promise<{ bookedSessionCount: number; confirmedEnrollmentCount: number; enrollees: { id: number; dateOfBirth: string | null }[] }> {
    // Count sessions in this offering with at least one BOOKED booking.
    const sessionRows = await db
      .select({ id: scheduleSessions.id })
      .from(scheduleSessions)
      .where(and(eq(scheduleSessions.tenantId, tenantId), eq(scheduleSessions.offeringId, id)));
    const sessionIds = sessionRows.map((r) => r.id);
    let bookedSessionCount = 0;
    if (sessionIds.length > 0) {
      const bookingRows = await db
        .select({ sessionId: bookings.sessionId })
        .from(bookings)
        .where(and(inArray(bookings.sessionId, sessionIds), eq(bookings.status, "BOOKED")));
      bookedSessionCount = new Set(bookingRows.map((b) => b.sessionId)).size;
    }
    // Confirmed/active enrollments (excluding cancelled/refunded/expired).
    const enrolleeRows = await db
      .select({ id: enrollments.id, dateOfBirth: enrollments.dateOfBirth, status: enrollments.status })
      .from(enrollments)
      .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.offeringId, id)));
    const active = enrolleeRows.filter((e) =>
      ["confirmed", "active", "in_progress", "completed", "pending"].includes(e.status as string),
    );
    return {
      bookedSessionCount,
      confirmedEnrollmentCount: active.length,
      enrollees: active.map((e) => ({ id: e.id, dateOfBirth: e.dateOfBirth ?? null })),
    };
  }

  async createPackageWithCohorts(
    pkg: InsertPackage,
    locationLinks: number[] | PackageLocationLink[] | null,
    cohorts: { offering: Omit<InsertScheduleOffering, "packageId" | "tenantId">; sessions?: Omit<InsertScheduleSession, "offeringId" | "tenantId">[] }[],
  ): Promise<{ package: Package; offerings: ScheduleOffering[]; sessionsCreated: number }> {
    const normalized = normalizeLocationLinks(locationLinks);
    const linkById = new Map<number, number | null>();
    for (const l of normalized) linkById.set(l.locationId, l.priceOverrideCents ?? null);
    return await db.transaction(async (tx) => {
      const [createdPkg] = await tx.insert(packages).values(pkg).returning();
      if (linkById.size > 0) {
        const ids = Array.from(linkById.keys());
        const validLocs = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(and(inArray(locations.id, ids), eq(locations.tenantId, pkg.tenantId)));
        const validIds = new Set(validLocs.map((l) => l.id));
        const invalid = ids.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
          throw new Error(`Invalid location IDs for tenant ${pkg.tenantId}: ${invalid.join(", ")}`);
        }
        await tx.insert(packageLocations).values(
          ids.map((locationId) => ({
            tenantId: pkg.tenantId,
            packageId: createdPkg.id,
            locationId,
            priceOverrideCents: linkById.get(locationId) ?? null,
          })),
        );
      }
      const createdOfferings: ScheduleOffering[] = [];
      let sessionsCreated = 0;
      for (const c of cohorts) {
        const [createdOff] = await tx
          .insert(scheduleOfferings)
          .values({ ...c.offering, tenantId: pkg.tenantId, packageId: createdPkg.id } as InsertScheduleOffering)
          .returning();
        createdOfferings.push(createdOff);
        if (c.sessions && c.sessions.length > 0) {
          const rows = c.sessions.map((s) => ({ ...s, tenantId: pkg.tenantId, offeringId: createdOff.id } as InsertScheduleSession));
          await tx.insert(scheduleSessions).values(rows);
          sessionsCreated += rows.length;
        }
      }
      return { package: createdPkg, offerings: createdOfferings, sessionsCreated };
    });
  }

  async getOfferingWaitlist(offeringId: number, tenantId: number): Promise<OfferingWaitlist[]> {
    return db.select().from(offeringWaitlist)
      .where(and(eq(offeringWaitlist.offeringId, offeringId), eq(offeringWaitlist.tenantId, tenantId)))
      .orderBy(offeringWaitlist.createdAt);
  }

  async addOfferingWaitlist(entry: InsertOfferingWaitlist): Promise<OfferingWaitlist> {
    const [created] = await db.insert(offeringWaitlist).values(entry).returning();
    return created;
  }

  async removeOfferingWaitlist(id: number, tenantId: number): Promise<void> {
    await db.delete(offeringWaitlist)
      .where(and(eq(offeringWaitlist.id, id), eq(offeringWaitlist.tenantId, tenantId)));
  }

  // ===== Checkout cart =====

  async createCart(tenantId: number): Promise<Cart> {
    const [created] = await db.insert(carts).values({ tenantId } as InsertCart).returning();
    return created;
  }

  async getCart(cartId: string): Promise<Cart | undefined> {
    const [c] = await db.select().from(carts).where(eq(carts.id, cartId));
    return c;
  }

  async listCartItems(cartId: string): Promise<(CartItem & { package: Package; offering?: ScheduleOffering | null })[]> {
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId)).orderBy(cartItems.addedAt);
    if (items.length === 0) return [];
    const pkgIds = Array.from(new Set(items.map(i => i.packageId)));
    const offIds = Array.from(new Set(items.map(i => i.offeringId).filter((x): x is number => x != null)));
    const pkgRows = await db.select().from(packages).where(inArray(packages.id, pkgIds));
    const pkgMap = new Map(pkgRows.map(p => [p.id, p]));
    const offRows = offIds.length > 0 ? await db.select().from(scheduleOfferings).where(inArray(scheduleOfferings.id, offIds)) : [];
    const offMap = new Map(offRows.map(o => [o.id, o]));
    return items.map(i => ({
      ...i,
      package: pkgMap.get(i.packageId)!,
      offering: i.offeringId ? offMap.get(i.offeringId) || null : null,
    })).filter(i => i.package);
  }

  async addCartItem(cartId: string, packageId: number, offeringId: number | null): Promise<CartItem> {
    const cart = await this.getCart(cartId);
    if (!cart) throw new CartCheckoutError(CartCheckoutErrorCode.CART_NOT_FOUND, "Cart not found");
    const [pkg] = await db.select().from(packages).where(and(eq(packages.id, packageId), eq(packages.tenantId, cart.tenantId), eq(packages.active, true)));
    if (!pkg) throw new CartCheckoutError(CartCheckoutErrorCode.PACKAGE_INACTIVE, "Package not available");
    if (offeringId) {
      const [off] = await db.select().from(scheduleOfferings).where(and(eq(scheduleOfferings.id, offeringId), eq(scheduleOfferings.tenantId, cart.tenantId)));
      if (!off) throw new CartCheckoutError(CartCheckoutErrorCode.OFFERING_NOT_FOUND, "Offering not available");
      if (off.packageId !== packageId) throw new CartCheckoutError(CartCheckoutErrorCode.OFFERING_PACKAGE_MISMATCH, "Offering does not fulfill this package");
      // Only publicly-bookable offerings may enter the cart. DRAFT/CANCELLED/COMPLETED are rejected.
      if (!["PUBLISHED", "FULL"].includes(off.status as string)) {
        throw new CartCheckoutError(CartCheckoutErrorCode.OFFERING_NOT_BOOKABLE, "Offering is not available for booking");
      }
    } else {
      // Cohort-based packages still require an offering pick at add-to-cart
      // time. SIMPLE packages (e.g. Road Test, School Car) skip this check.
      const isCohortBased = pkg.kind === "COHORT_BASED";
      const requiresInClass = (pkg.classroomHoursRequired ?? 0) > 0;
      if (isCohortBased && requiresInClass && !pkg.isAddOn) {
        throw new CartCheckoutError(
          CartCheckoutErrorCode.COHORT_SELECTION_REQUIRED,
          "This package requires picking a class schedule (offering)",
        );
      }
    }
    // Channel-flag enforcement.  `sellableStandalone` and `availableAsUpsell`
    // are independent and authoritative:
    //   - sellable=false + upsell=false → unbookable (admin misconfiguration).
    //   - sellable=false + upsell=true  → upsell-only; require a parent to be
    //     in the cart (specific dependencies if configured, otherwise any
    //     other item, mirroring legacy generic add-on behaviour).
    //   - sellable=true  + upsell=*     → may be added freely on its own.
    if (!pkg.sellableStandalone) {
      if (!pkg.availableAsUpsell) {
        throw new CartCheckoutError(
          CartCheckoutErrorCode.PACKAGE_NOT_AVAILABLE,
          "This package is not available for purchase",
        );
      }
      const existingItems = await db
        .select({ packageId: cartItems.packageId })
        .from(cartItems)
        .where(eq(cartItems.cartId, cartId));
      const inCart = new Set(existingItems.map((i) => i.packageId));
      const deps = await this.listUpsellDependencies(pkg.id);
      if (deps.length > 0) {
        if (!deps.some((parentId) => inCart.has(parentId))) {
          throw new CartCheckoutError(
            CartCheckoutErrorCode.UPSELL_PARENT_MISSING,
            "This add-on can only be added when its parent package is in the cart",
          );
        }
      } else {
        if (existingItems.length === 0) {
          throw new CartCheckoutError(
            CartCheckoutErrorCode.UPSELL_PARENT_MISSING,
            "This add-on can only be added alongside another package",
          );
        }
      }
    }
    // Apply per-location price override (when the cart has a pinned location).
    let priceCents = pkg.price;
    if (cart.locationId != null) {
      const [link] = await db
        .select({ priceOverrideCents: packageLocations.priceOverrideCents })
        .from(packageLocations)
        .where(
          and(
            eq(packageLocations.packageId, packageId),
            eq(packageLocations.locationId, cart.locationId),
          ),
        )
        .limit(1);
      if (link && link.priceOverrideCents != null) priceCents = link.priceOverrideCents;
    }
    const [created] = await db.insert(cartItems).values({
      cartId,
      packageId,
      offeringId: offeringId ?? null,
      priceCents,
    } as InsertCartItem).returning();
    await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
    return created;
  }

  async removeCartItem(cartId: string, itemId: number): Promise<void> {
    await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
    await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  }

  async clearCart(cartId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
    await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  }

  async setCartStatus(cartId: string, status: "open" | "checkout_pending" | "converted" | "abandoned"): Promise<void> {
    await db.update(carts).set({ status: status as any, updatedAt: new Date() }).where(eq(carts.id, cartId));
  }

  async setCartCustomer(cartId: string, customer: any, locationId: number | null): Promise<void> {
    await db.update(carts)
      .set({ customerSnapshotJson: customer, locationId: locationId ?? null, updatedAt: new Date() } as any)
      .where(eq(carts.id, cartId));
  }

  async setCartLocation(cartId: string, locationId: number | null): Promise<void> {
    await db.update(carts)
      .set({ locationId: locationId ?? null, updatedAt: new Date() } as any)
      .where(eq(carts.id, cartId));
  }

  async listPendingCashPayments(tenantId: number): Promise<Array<Payment & { enrollment: Enrollment | null; cartCustomer: any; cartItems: Array<{ package: Package | null; offering: ScheduleOffering | null; quantity: number }> }>> {
    const rows = await db.select().from(payments)
      .where(and(
        eq(payments.tenantId, tenantId),
        eq(payments.provider, "CASH"),
        eq(payments.status, "PENDING"),
      ))
      .orderBy(desc(payments.createdAt));
    if (rows.length === 0) return [];
    const enrollmentIds = Array.from(new Set(rows.map(r => r.enrollmentId).filter((x): x is number => x != null)));
    const cartIds = Array.from(new Set(rows.map(r => r.cartId).filter((x): x is string => x != null)));
    const enrRows = enrollmentIds.length > 0
      ? await db.select().from(enrollments).where(inArray(enrollments.id, enrollmentIds))
      : [];
    const enrMap = new Map(enrRows.map(e => [e.id, e]));
    const cartRows = cartIds.length > 0
      ? await db.select().from(carts).where(inArray(carts.id, cartIds))
      : [];
    const cartMap = new Map(cartRows.map(c => [c.id, c]));
    // For cart-payments without enrollmentId, fetch the first enrollment of cart (if any)
    const cartEnrRows = cartIds.length > 0
      ? await db.select().from(enrollments).where(inArray(enrollments.cartId, cartIds))
      : [];
    const cartEnrMap = new Map<string, Enrollment>();
    for (const e of cartEnrRows) {
      if (e.cartId && !cartEnrMap.has(e.cartId)) cartEnrMap.set(e.cartId, e);
    }
    // Join cart items → package + offering so cart-only payments can still show
    // package + cohort info in the Pending Cash tab.
    const itemRows = cartIds.length > 0
      ? await db.select().from(cartItems).where(inArray(cartItems.cartId, cartIds))
      : [];
    const pkgIds = Array.from(new Set(itemRows.map(i => i.packageId).filter((x): x is number => x != null)));
    const offIds = Array.from(new Set(itemRows.map(i => i.offeringId).filter((x): x is number => x != null)));
    const pkgRows = pkgIds.length > 0 ? await db.select().from(packages).where(inArray(packages.id, pkgIds)) : [];
    const offRows = offIds.length > 0 ? await db.select().from(scheduleOfferings).where(inArray(scheduleOfferings.id, offIds)) : [];
    const pkgMap = new Map(pkgRows.map(p => [p.id, p]));
    const offMap = new Map(offRows.map(o => [o.id, o]));
    const itemsByCart = new Map<string, Array<{ package: Package | null; offering: ScheduleOffering | null; quantity: number }>>();
    for (const it of itemRows) {
      const list = itemsByCart.get(it.cartId) || [];
      list.push({
        package: it.packageId ? (pkgMap.get(it.packageId) || null) : null,
        offering: it.offeringId ? (offMap.get(it.offeringId) || null) : null,
        quantity: it.quantity || 1,
      });
      itemsByCart.set(it.cartId, list);
    }
    return rows.map(p => {
      const enrollment = (p.enrollmentId ? enrMap.get(p.enrollmentId) : (p.cartId ? cartEnrMap.get(p.cartId) : null)) || null;
      const cartCustomer = p.cartId ? (cartMap.get(p.cartId)?.customerSnapshotJson || null) : null;
      const items = p.cartId ? (itemsByCart.get(p.cartId) || []) : [];
      return { ...p, enrollment, cartCustomer, cartItems: items };
    });
  }

  async countPendingCashPayments(tenantId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(and(
        eq(payments.tenantId, tenantId),
        eq(payments.provider, "CASH"),
        eq(payments.status, "PENDING"),
      ));
    return result[0]?.count || 0;
  }

  async cancelCashPayment(paymentId: number, tenantId: number): Promise<{ ok: boolean; cartId: string | null; enrollmentIds: number[] }> {
    const [payment] = await db.select().from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)));
    if (!payment) return { ok: false, cartId: null, enrollmentIds: [] };
    if (payment.status !== "PENDING") return { ok: false, cartId: payment.cartId, enrollmentIds: [] };

    await db.update(payments)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    // Mark associated enrollments as cancelled (only if still in pending states)
    const enrollmentIds: number[] = [];
    if (payment.cartId) {
      const enrRows = await db.select().from(enrollments).where(eq(enrollments.cartId, payment.cartId));
      for (const e of enrRows) {
        if (["pending", "pending_payment"].includes(e.status)) {
          await db.update(enrollments)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(eq(enrollments.id, e.id));
          enrollmentIds.push(e.id);
        }
      }
      await db.update(carts).set({ status: "abandoned", updatedAt: new Date() }).where(eq(carts.id, payment.cartId));
    } else if (payment.enrollmentId) {
      const [e] = await db.select().from(enrollments).where(eq(enrollments.id, payment.enrollmentId));
      if (e && ["pending", "pending_payment"].includes(e.status)) {
        await db.update(enrollments)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(enrollments.id, e.id));
        enrollmentIds.push(e.id);
      }
    }
    return { ok: true, cartId: payment.cartId, enrollmentIds };
  }

  async listAbandonedCarts(tenantId: number): Promise<Array<Cart & { items: Array<CartItem & { package: Package; offering?: ScheduleOffering | null }> }>> {
    const cartRows = await db.select().from(carts)
      .where(and(eq(carts.tenantId, tenantId), eq(carts.status, "abandoned")))
      .orderBy(desc(carts.updatedAt));
    const result: Array<Cart & { items: Array<CartItem & { package: Package; offering?: ScheduleOffering | null }> }> = [];
    for (const c of cartRows) {
      const items = await this.listCartItems(c.id);
      // Always exclude empty carts: nothing actionable to surface.
      if (items.length === 0) continue;
      result.push({ ...c, items });
    }
    return result;
  }

  async expireAbandonedCarts(tenantId: number, olderThanHours: number): Promise<Array<{ cartId: string; tenantId: number }>> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const stale = await db.select().from(carts)
      .where(and(
        eq(carts.tenantId, tenantId),
        inArray(carts.status, ["open", "checkout_pending"]),
        lt(carts.updatedAt, cutoff),
      ));
    const abandoned: Array<{ cartId: string; tenantId: number }> = [];
    for (const c of stale) {
      // Skip carts with no items: nothing to follow up on.
      const items = await db.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.cartId, c.id));
      if (items.length === 0) continue;
      await db.update(carts).set({ status: "abandoned", updatedAt: new Date() }).where(eq(carts.id, c.id));
      // Cancel only PENDING CASH payments on this cart. Stripe/PayPal pending
      // intents are out of scope and should not be touched here.
      const cartPayments = await db.select().from(payments).where(eq(payments.cartId, c.id));
      for (const p of cartPayments) {
        if (p.provider === "CASH" && p.status === "PENDING") {
          // System expiry — distinct from admin "CANCELLED" action.
          await db.update(payments)
            .set({ status: "EXPIRED", updatedAt: new Date() })
            .where(eq(payments.id, p.id));
        }
      }
      abandoned.push({ cartId: c.id, tenantId: c.tenantId });
    }
    return abandoned;
  }

  async getPendingInterestByOffering(tenantId: number): Promise<Record<number, number>> {
    // Distinct shopper emails per offeringId from PENDING CASH cart intent.
    // Source: pending CASH payments → carts → cart_items.offeringId, with the
    // shopper's email taken from carts.customer_snapshot_json (with enrollment
    // email as a fallback). This correctly counts pre-activation carts that
    // have not yet produced enrollment rows. We do NOT count open/checkout
    // carts without a pending CASH payment — pure browsing is not "intent".
    const out: Record<number, Set<string>> = {};
    const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();

    // (a) Direct enrollment link — pending CASH payment carrying enrollmentId.
    const directRows = await db.select({
      offeringId: enrollments.offeringId,
      email: enrollments.email,
    }).from(payments)
      .innerJoin(enrollments, eq(enrollments.id, payments.enrollmentId))
      .where(and(
        eq(payments.tenantId, tenantId),
        eq(payments.provider, "CASH"),
        eq(payments.status, "PENDING"),
      ));
    for (const r of directRows) {
      if (r.offeringId == null) continue;
      const email = norm(r.email);
      if (!email) continue;
      (out[r.offeringId] ??= new Set()).add(email);
    }

    // (b) Cart-only path — pending CASH payment with cartId. Resolve offerings
    // from cart_items, and shopper email from cart customer snapshot.
    const cartPendingRows = await db.select({ cartId: payments.cartId })
      .from(payments)
      .where(and(
        eq(payments.tenantId, tenantId),
        eq(payments.provider, "CASH"),
        eq(payments.status, "PENDING"),
        sql`${payments.cartId} IS NOT NULL`,
      ));
    const pendingCartIds = Array.from(new Set(cartPendingRows.map(r => r.cartId).filter((x): x is string => !!x)));
    if (pendingCartIds.length > 0) {
      const cartRows = await db.select({
        id: carts.id,
        customerSnapshotJson: carts.customerSnapshotJson,
      }).from(carts).where(and(eq(carts.tenantId, tenantId), inArray(carts.id, pendingCartIds)));
      const cartEmail = new Map<string, string>();
      for (const c of cartRows) {
        const snap = (c.customerSnapshotJson as any) || {};
        const email = norm(snap?.email);
        if (email) cartEmail.set(c.id, email);
      }
      const itemRows = await db.select({
        cartId: cartItems.cartId,
        offeringId: cartItems.offeringId,
      }).from(cartItems).where(inArray(cartItems.cartId, pendingCartIds));
      // Fallback: if the cart snapshot has no email, try first enrollment for
      // that cart (rare — covers older flows that wrote enrollment first).
      const missingEmailCartIds = Array.from(new Set(itemRows.map(i => i.cartId).filter(cid => !cartEmail.has(cid))));
      if (missingEmailCartIds.length > 0) {
        const enrFallback = await db.select({ cartId: enrollments.cartId, email: enrollments.email })
          .from(enrollments).where(inArray(enrollments.cartId, missingEmailCartIds));
        for (const e of enrFallback) {
          if (!e.cartId) continue;
          const email = norm(e.email);
          if (email && !cartEmail.has(e.cartId)) cartEmail.set(e.cartId, email);
        }
      }
      for (const it of itemRows) {
        if (it.offeringId == null) continue;
        const email = cartEmail.get(it.cartId);
        if (!email) continue;
        (out[it.offeringId] ??= new Set()).add(email);
      }
    }

    const counts: Record<number, number> = {};
    for (const [k, v] of Object.entries(out)) counts[Number(k)] = v.size;
    return counts;
  }

  async countAttentionEnrollments(tenantId: number): Promise<{ pendingCash: number; abandoned: number }> {
    const pendingCash = await this.countPendingCashPayments(tenantId);
    const abandonedRow = await db.select({ count: sql<number>`count(*)::int` })
      .from(carts)
      .where(and(eq(carts.tenantId, tenantId), eq(carts.status, "abandoned")));
    return {
      pendingCash,
      abandoned: abandonedRow[0]?.count || 0,
    };
  }

  async listCartUpsells(cartId: string): Promise<Package[]> {
    const cart = await this.getCart(cartId);
    if (!cart) return [];
    const items = await this.listCartItems(cartId);
    if (items.length === 0) return [];
    const cartLocationId = (cart as any).locationId ?? null;
    return this.listUpsellsForPackages(
      cart.tenantId,
      items.map((i) => i.packageId),
      cartLocationId,
    );
  }

  async listUpsellsForPackages(
    tenantId: number,
    packageIds: number[],
    locationId?: number | null,
  ): Promise<Package[]> {
    if (!packageIds || packageIds.length === 0) return [];
    const inSet = new Set(packageIds);
    const allAddOns = await this.listAddOnPackages(tenantId, { locationId: locationId ?? null });
    const depsMap = await this.getUpsellDependenciesMap(tenantId);

    // Hydrate the input packages so we can replicate the legacy
    // component-based fallback (classroom vs drive add-ons).
    const inputPkgs = await db
      .select()
      .from(packages)
      .where(and(eq(packages.tenantId, tenantId), inArray(packages.id, packageIds)));
    const hasClassroom = inputPkgs.some((p) => (p.classroomHoursRequired ?? 0) > 0);
    const hasDrive = inputPkgs.some((p) => (p.driveHoursRequired ?? 0) > 0);

    return allAddOns.filter((p) => {
      if (inSet.has(p.id)) return false;
      const deps = depsMap[p.id] ?? [];
      if (deps.length > 0) {
        return deps.some((parentId) => inSet.has(parentId));
      }
      const classroomAddOn = (p.classroomHoursRequired ?? 0) > 0;
      const driveAddOn = (p.driveHoursRequired ?? 0) > 0;
      if (!classroomAddOn && !driveAddOn) return true;
      if (classroomAddOn && hasClassroom) return true;
      if (driveAddOn && hasDrive) return true;
      return false;
    });
  }

  async createCartEnrollmentsAndBookAtomic(
    cartId: string,
    payment: { id: number; tenantId: number; amountCents: number }
  ): Promise<{ ok: true; enrollments: Enrollment[]; bookings: { enrollmentId: number; booked: number; waitlisted: boolean }[] } | { ok: false; error: string }> {
    const cart = await this.getCart(cartId);
    if (!cart) return { ok: false, error: "Cart not found" };
    if (cart.tenantId !== payment.tenantId) return { ok: false, error: "Tenant mismatch" };
    const items = await this.listCartItems(cartId);
    if (items.length === 0) return { ok: false, error: "Cart is empty" };
    const customer = (cart.customerSnapshotJson as any) || {};
    if (!customer.firstName || !customer.lastName || !customer.email) {
      return { ok: false, error: "Cart is missing customer details" };
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Re-validate every offering inside the tx to prevent races. Also
        // capture the offering's locationId so the resulting enrollment can
        // inherit it when the cart itself doesn't carry an explicit choice
        // (e.g. when the buyer picks a location-specific schedule directly).
        const offeringLocationByItem = new Map<number, number | null>();
        for (const item of items) {
          if (item.offeringId) {
            const [off] = await tx.select().from(scheduleOfferings).where(and(
              eq(scheduleOfferings.id, item.offeringId),
              eq(scheduleOfferings.tenantId, cart.tenantId),
            ));
            if (!off) throw new Error(`Offering #${item.offeringId} not found`);
            if (!["PUBLISHED", "FULL"].includes(off.status as string)) {
              throw new Error(`Offering #${item.offeringId} is not bookable (status: ${off.status})`);
            }
            if (off.packageId !== item.packageId) throw new Error(`Offering #${item.offeringId} no longer fulfills package #${item.packageId}`);
            offeringLocationByItem.set(item.id, off.locationId ?? null);
          }
        }

        const createdEnrollments: Enrollment[] = [];
        const bookingResults: { enrollmentId: number; booked: number; waitlisted: boolean }[] = [];

        for (const item of items) {
          const pkg = item.package;
          // Prefer the buyer's explicit cart-level location choice when set;
          // otherwise fall back to the offering's own location so admins
          // don't see "Not assigned" for offering-bound enrollments.
          const inheritedOfferingLocationId = offeringLocationByItem.get(item.id) ?? null;
          const resolvedLocationId = cart.locationId ?? inheritedOfferingLocationId ?? null;
          const [enr] = await tx.insert(enrollments).values({
            tenantId: cart.tenantId,
            packageId: pkg.id,
            locationId: resolvedLocationId,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone || null,
            dateOfBirth: customer.dateOfBirth || null,
            parentName: customer.parentName || null,
            parentEmail: customer.parentEmail || null,
            parentPhone: customer.parentPhone || null,
            status: "pending_payment",
            priceSnapshotCents: item.priceCents,
            currencySnapshot: "USD",
            packageSnapshotJson: {
              name: pkg.name, price: pkg.price,
              classroomHoursRequired: pkg.classroomHoursRequired,
              driveHoursRequired: pkg.driveHoursRequired,
              isAddOn: pkg.isAddOn,
            },
            amountPaid: item.priceCents,
            cartId: cart.id,
            offeringId: item.offeringId ?? null,
          } as any).returning();
          createdEnrollments.push(enr);

          if (item.offeringId) {
            const r = await this.bookOfferingInTx(tx, enr.id, item.offeringId, cart.tenantId, null);
            bookingResults.push({ enrollmentId: enr.id, ...r });
          }
        }

        return { createdEnrollments, bookingResults };
      });

      return { ok: true, enrollments: result.createdEnrollments, bookings: result.bookingResults };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async getEnrollmentsForPackage(tenantId: number, packageId: number): Promise<Enrollment[]> {
    return db.select().from(enrollments)
      .where(and(
        eq(enrollments.tenantId, tenantId),
        eq(enrollments.packageId, packageId),
        sql`${enrollments.status} IN ('confirmed','active','in_progress')`,
      ))
      .orderBy(desc(enrollments.createdAt));
  }

  async getSessionsForPackage(tenantId: number, packageId: number): Promise<ScheduleSession[]> {
    const pkg = await this.getPackage(packageId);
    if (!pkg || pkg.tenantId !== tenantId) return [];
    const offeringRows = await db.select({ id: scheduleOfferings.id }).from(scheduleOfferings)
      .where(and(eq(scheduleOfferings.tenantId, tenantId), eq(scheduleOfferings.packageId, packageId)));
    const offeringIds = offeringRows.map(o => o.id);
    const comps = await db.select().from(packageComponents).where(eq(packageComponents.packageId, packageId));
    const driveComponentTypes = ["BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"] as const;
    const driveTypesNeeded = new Set<string>();
    for (const c of comps) {
      if ((driveComponentTypes as readonly string[]).includes(c.type)) driveTypesNeeded.add(c.type);
    }
    const needsDrive = (pkg.driveHoursRequired ?? 0) > 0 || driveTypesNeeded.size > 0;
    if (needsDrive) {
      driveTypesNeeded.add("DRIVE");
      if (comps.length === 0) {
        driveTypesNeeded.add("BTW_OBSERVATION");
        driveTypesNeeded.add("BTW_PRACTICE");
      }
    }
    const conditions: SQL[] = [eq(scheduleSessions.tenantId, tenantId)];
    const orParts: SQL[] = [];
    if (offeringIds.length > 0) {
      orParts.push(inArray(scheduleSessions.offeringId, offeringIds));
    }
    if (driveTypesNeeded.size > 0) {
      const typeList = Array.from(driveTypesNeeded) as Array<typeof scheduleSessions.type._.data>;
      orParts.push(inArray(scheduleSessions.type, typeList));
    }
    if (orParts.length === 0) return [];
    conditions.push(orParts.length === 1 ? orParts[0] : or(...orParts)!);
    return db.select().from(scheduleSessions).where(and(...conditions)).orderBy(scheduleSessions.startAt);
  }

  async getPackageFinancials(tenantId: number, packageId: number, opts?: { from?: Date; to?: Date }): Promise<{
    totalRevenueCents: number;
    paidCount: number;
    pendingCount: number;
    failedCount: number;
    refundedCount: number;
    refundedTotalCents: number;
    avgTicketCents: number;
    outstandingBalanceCents: number;
    enrollmentCount: number;
  }> {
    const pkg = await this.getPackage(packageId);
    if (!pkg || pkg.tenantId !== tenantId) {
      return { totalRevenueCents: 0, paidCount: 0, pendingCount: 0, failedCount: 0, refundedCount: 0, refundedTotalCents: 0, avgTicketCents: 0, outstandingBalanceCents: 0, enrollmentCount: 0 };
    }

    const enrollRows = await db.select({ id: enrollments.id, status: enrollments.status }).from(enrollments)
      .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.packageId, packageId)));
    const enrollmentIds = enrollRows.map(e => e.id);
    if (enrollmentIds.length === 0) {
      return { totalRevenueCents: 0, paidCount: 0, pendingCount: 0, failedCount: 0, refundedCount: 0, refundedTotalCents: 0, avgTicketCents: 0, outstandingBalanceCents: 0, enrollmentCount: 0 };
    }

    const conds: SQL[] = [eq(payments.tenantId, tenantId), inArray(payments.enrollmentId, enrollmentIds)];
    if (opts?.from) conds.push(sql`${payments.createdAt} >= ${opts.from}`);
    if (opts?.to) conds.push(sql`${payments.createdAt} <= ${opts.to}`);

    const rows = await db.select({
      status: payments.status,
      total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)`,
      cnt: count(),
      distinctEnrollments: sql<string>`COUNT(DISTINCT ${payments.enrollmentId})`,
    }).from(payments).where(and(...conds)).groupBy(payments.status);

    let totalRevenueCents = 0, paidCount = 0, pendingCount = 0, failedCount = 0, refundedCount = 0, refundedTotalCents = 0;
    for (const r of rows) {
      const sum = parseInt(r.total || "0", 10);
      const cnt = Number(r.cnt) || 0;
      const distinct = parseInt(r.distinctEnrollments || "0", 10);
      if (r.status === "COMPLETED") { totalRevenueCents += sum; paidCount += distinct; }
      else if (r.status === "PENDING" || r.status === "CREATED") { pendingCount += cnt; }
      else if (r.status === "FAILED") { failedCount += cnt; }
      else if (r.status === "REFUNDED") { refundedCount += cnt; refundedTotalCents += sum; }
    }

    const pendingEnrollments = enrollRows.filter(e => e.status === "pending_payment" || e.status === "pending").length;
    const outstandingBalanceCents = pendingEnrollments * pkg.price;

    const avgTicketCents = paidCount > 0 ? Math.round(totalRevenueCents / paidCount) : 0;

    return {
      totalRevenueCents,
      paidCount,
      pendingCount,
      failedCount,
      refundedCount,
      refundedTotalCents,
      avgTicketCents,
      outstandingBalanceCents,
      enrollmentCount: enrollRows.length,
    };
  }

  async getPackageRevenueSeries(tenantId: number, packageId: number, opts?: { from?: Date; to?: Date }): Promise<{ month: string; revenueCents: number }[]> {
    const pkg = await this.getPackage(packageId);
    if (!pkg || pkg.tenantId !== tenantId) return [];
    const enrollRows = await db.select({ id: enrollments.id }).from(enrollments)
      .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.packageId, packageId)));
    const enrollmentIds = enrollRows.map(e => e.id);
    if (enrollmentIds.length === 0) return [];
    const conds: SQL[] = [
      eq(payments.tenantId, tenantId),
      inArray(payments.enrollmentId, enrollmentIds),
      eq(payments.status, "COMPLETED"),
    ];
    if (opts?.from) conds.push(sql`${payments.createdAt} >= ${opts.from}`);
    if (opts?.to) conds.push(sql`${payments.createdAt} <= ${opts.to}`);
    const rows = await db.select({
      month: sql<string>`to_char(${payments.createdAt}, 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)`,
    }).from(payments)
      .where(and(...conds))
      .groupBy(sql`to_char(${payments.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${payments.createdAt}, 'YYYY-MM')`);
    return rows.map(r => ({ month: r.month, revenueCents: parseInt(r.total || "0", 10) }));
  }

  async getFulfillablePackagesForSession(tenantId: number, sessionId: number): Promise<Package[]> {
    const [session] = await db.select().from(scheduleSessions)
      .where(and(eq(scheduleSessions.id, sessionId), eq(scheduleSessions.tenantId, tenantId)));
    if (!session) return [];
    const result = new Map<number, Package>();
    if (session.offeringId) {
      const [off] = await db.select({ packageId: scheduleOfferings.packageId }).from(scheduleOfferings)
        .where(and(eq(scheduleOfferings.id, session.offeringId), eq(scheduleOfferings.tenantId, tenantId)));
      if (off) {
        const [pkg] = await db.select().from(packages).where(and(eq(packages.tenantId, tenantId), eq(packages.id, off.packageId)));
        if (pkg) result.set(pkg.id, pkg);
      }
    }
    const driveSessionTypes = ["DRIVE", "BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"];
    if (driveSessionTypes.includes(session.type)) {
      if (session.type !== "DRIVE") {
        const compRows = await db.select({ packageId: packageComponents.packageId }).from(packageComponents)
          .where(and(eq(packageComponents.tenantId, tenantId), eq(packageComponents.type, session.type as typeof packageComponents.type._.data)));
        const ids = Array.from(new Set(compRows.map(r => r.packageId)));
        if (ids.length > 0) {
          const pkgs = await db.select().from(packages).where(and(eq(packages.tenantId, tenantId), inArray(packages.id, ids), eq(packages.active, true)));
          for (const p of pkgs) result.set(p.id, p);
        }
      }
      const drivePkgs = await db.select().from(packages)
        .where(and(eq(packages.tenantId, tenantId), eq(packages.active, true), sql`${packages.driveHoursRequired} > 0`));
      for (const p of drivePkgs) {
        if (result.has(p.id)) continue;
        if (session.type === "DRIVE") {
          result.set(p.id, p);
        } else {
          const hasComps = await db.select({ id: packageComponents.id }).from(packageComponents).where(eq(packageComponents.packageId, p.id)).limit(1);
          if (hasComps.length === 0) result.set(p.id, p);
        }
      }
    }
    if (session.type === "CLASSROOM" && !session.offeringId) {
      const compRows = await db.select({ packageId: packageComponents.packageId }).from(packageComponents)
        .where(and(eq(packageComponents.tenantId, tenantId), eq(packageComponents.type, "IN_CLASS")));
      const ids = Array.from(new Set(compRows.map(r => r.packageId)));
      if (ids.length > 0) {
        const pkgs = await db.select().from(packages).where(and(eq(packages.tenantId, tenantId), inArray(packages.id, ids), eq(packages.active, true)));
        for (const p of pkgs) result.set(p.id, p);
      }
    }
    return Array.from(result.values());
  }

  async getSetupHealth(tenantId: number): Promise<{
    packagesWithoutOfferings: { id: number; name: string }[];
    publishedOfferingsWithoutSessions: { id: number; name: string }[];
    sessionsMissingResources: { id: number; type: string; startAt: Date; missing: string[] }[];
    enrollmentsWithUnusedCredits: { id: number; firstName: string; lastName: string; email: string; classroom: number; drive: number }[];
  }> {
    const allPackages = await db.select().from(packages)
      .where(and(eq(packages.tenantId, tenantId), eq(packages.active, true), eq(packages.isAddOn, false)));
    const linkRows = await db.select({ packageId: scheduleOfferings.packageId })
      .from(scheduleOfferings)
      .where(and(eq(scheduleOfferings.tenantId, tenantId), sql`${scheduleOfferings.status} != 'CANCELLED'`));
    const packagesWithOfferings = new Set(linkRows.map(l => l.packageId));
    const packagesWithoutOfferings = allPackages
      .filter(p => (p.classroomHoursRequired ?? 0) > 0 && !packagesWithOfferings.has(p.id))
      .map(p => ({ id: p.id, name: p.name }));

    const publishedOfferings = await db.select().from(scheduleOfferings)
      .where(and(eq(scheduleOfferings.tenantId, tenantId), eq(scheduleOfferings.status, "PUBLISHED")));
    const offeringIdsWithSessions = new Set(
      (await db.select({ offeringId: scheduleSessions.offeringId }).from(scheduleSessions)
        .where(and(eq(scheduleSessions.tenantId, tenantId), sql`${scheduleSessions.offeringId} IS NOT NULL`)))
        .map(r => r.offeringId)
    );
    const publishedOfferingsWithoutSessions = publishedOfferings
      .filter(o => !offeringIdsWithSessions.has(o.id))
      .map(o => ({ id: o.id, name: o.name }));

    const now = new Date();
    const upcomingSessions = await db.select().from(scheduleSessions)
      .where(and(
        eq(scheduleSessions.tenantId, tenantId),
        eq(scheduleSessions.status, "SCHEDULED"),
        sql`${scheduleSessions.startAt} >= ${now}`,
      ))
      .orderBy(scheduleSessions.startAt)
      .limit(200);
    const driveTypes = ["DRIVE", "BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"];
    const sessionsMissingResources: { id: number; type: string; startAt: Date; missing: string[] }[] = [];
    for (const s of upcomingSessions) {
      const missing: string[] = [];
      if (!s.instructorId) missing.push("instructor");
      if (driveTypes.includes(s.type) && !s.vehicleId) missing.push("vehicle");
      if (missing.length > 0) {
        sessionsMissingResources.push({ id: s.id, type: s.type, startAt: s.startAt, missing });
      }
    }

    const activeEnrollments = await db.select().from(enrollments)
      .where(and(
        eq(enrollments.tenantId, tenantId),
        sql`${enrollments.status} IN ('confirmed','active','in_progress')`,
        sql`${enrollments.createdAt} < NOW() - INTERVAL '30 days'`,
      ));
    const enrollmentsWithUnusedCredits: { id: number; firstName: string; lastName: string; email: string; classroom: number; drive: number }[] = [];
    for (const e of activeEnrollments) {
      const classroomBal = await this.getCreditBalance(e.id, "CLASSROOM");
      const driveBal = await this.getCreditBalance(e.id, "DRIVE");
      if (classroomBal <= 0 && driveBal <= 0) continue;
      const upcoming = await db.select({ id: bookings.id }).from(bookings)
        .innerJoin(scheduleSessions, eq(bookings.sessionId, scheduleSessions.id))
        .where(and(
          eq(bookings.enrollmentId, e.id),
          eq(bookings.status, "BOOKED"),
          sql`${scheduleSessions.startAt} >= ${now}`,
        ))
        .limit(1);
      if (upcoming.length === 0) {
        enrollmentsWithUnusedCredits.push({ id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email, classroom: classroomBal, drive: driveBal });
      }
    }

    return { packagesWithoutOfferings, publishedOfferingsWithoutSessions, sessionsMissingResources, enrollmentsWithUnusedCredits };
  }

  async listOfferingsForPackage(tenantId: number, packageId: number, opts?: { onlyPublished?: boolean }): Promise<(ScheduleOffering & { remainingSeats: number })[]> {
    const conditions = [eq(scheduleOfferings.tenantId, tenantId), eq(scheduleOfferings.packageId, packageId)];
    if (opts?.onlyPublished) {
      conditions.push(sql`${scheduleOfferings.status} IN ('PUBLISHED','FULL')`);
    } else {
      conditions.push(sql`${scheduleOfferings.status} != 'CANCELLED'`);
    }
    const rows = await db.select().from(scheduleOfferings).where(and(...conditions)).orderBy(scheduleOfferings.startsAt);
    return rows.map(r => ({ ...r, remainingSeats: Math.max(0, (r.capacity ?? 0) - (r.enrolledCount ?? 0)) }));
  }

  async listAddOnPackages(
    tenantId: number,
    filters?: { locationId?: number | null; parentPackageId?: number | null },
  ): Promise<Package[]> {
    // `availableAsUpsell` is the authoritative channel flag for the
    // add-ons / upsell list. Legacy `isAddOn=true` rows are migrated into
    // `availableAsUpsell=true` by the backfill, and POST/PATCH keep the
    // two in sync, so we only filter on the new flag here.
    let rows = await db
      .select()
      .from(packages)
      .where(and(
        eq(packages.tenantId, tenantId),
        eq(packages.active, true),
        eq(packages.availableAsUpsell, true),
      ))
      .orderBy(packages.name);
    if (filters?.parentPackageId != null) {
      const depsMap = await this.getUpsellDependenciesMap(tenantId);
      const parentId = filters.parentPackageId;
      rows = rows.filter((p) => {
        const deps = depsMap[p.id] ?? [];
        // No deps configured → legacy generic add-on, surface for any parent.
        if (deps.length === 0) return true;
        return deps.includes(parentId);
      });
    }
    if (!filters || filters.locationId == null) return rows;

    const targetLocationId = filters.locationId;
    const links = rows.length === 0 ? [] : await db
      .select()
      .from(packageLocations)
      .where(
        and(
          inArray(packageLocations.packageId, rows.map((p) => p.id)),
          eq(packageLocations.locationId, targetLocationId),
        ),
      );
    const linkByPkg = new Map(links.map((l) => [l.packageId, l]));
    return rows
      .filter((p) =>
        p.locationScopeMode === "ALL_LOCATIONS" || linkByPkg.has(p.id),
      )
      .map((p) => {
        const override = linkByPkg.get(p.id)?.priceOverrideCents;
        return override != null ? { ...p, price: override } : p;
      });
  }

  async getEnrollmentsByCart(cartId: string): Promise<Enrollment[]> {
    return db.select().from(enrollments).where(eq(enrollments.cartId, cartId));
  }

  async getOfferingSessions(offeringId: number, tenantId: number): Promise<ScheduleSession[]> {
    return db.select().from(scheduleSessions)
      .where(and(eq(scheduleSessions.offeringId, offeringId), eq(scheduleSessions.tenantId, tenantId)))
      .orderBy(scheduleSessions.startAt);
  }

  async getEnrollmentsForOffering(tenantId: number, offeringId: number): Promise<Enrollment[]> {
    return db.select().from(enrollments)
      .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.offeringId, offeringId)))
      .orderBy(sql`${enrollments.createdAt} DESC`);
  }

  async getAuditEventsForTarget(tenantId: number, targetType: string, targetId: number, limit = 100): Promise<AuditEvent[]> {
    return db.select()
      .from(auditEvents)
      .where(and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.targetType, targetType),
        eq(auditEvents.targetId, targetId),
      ))
      .orderBy(sql`${auditEvents.createdAt} DESC`)
      .limit(limit);
  }

  private async bookOfferingInTx(tx: any, enrollmentId: number, offeringId: number, tenantId: number, userId: string | null, opts?: { skipWaitlistInsert?: boolean }): Promise<{ booked: number; waitlisted: boolean }> {
    const [offering] = await tx.select().from(scheduleOfferings)
      .where(and(eq(scheduleOfferings.id, offeringId), eq(scheduleOfferings.tenantId, tenantId)))
      .for("update");
    if (!offering) {
      return { booked: 0, waitlisted: true };
    }

    const sessions = await tx.select().from(scheduleSessions)
      .where(and(eq(scheduleSessions.offeringId, offeringId), eq(scheduleSessions.tenantId, tenantId)))
      .orderBy(scheduleSessions.startAt)
      .for("update");

    const remainingOfferingSeats = (offering.capacity ?? 0) - (offering.enrolledCount ?? 0);
    const allSessionsHaveSeats = sessions.every((s: any) => (s.capacity ?? 0) - (s.bookedCount ?? 0) >= 1);

    if (sessions.length === 0 || remainingOfferingSeats <= 0 || !allSessionsHaveSeats) {
      // skipWaitlistInsert is set by promoteWaitlistEntry — the enrollment is
      // already on the waitlist and a re-attempt that fails must not create a
      // duplicate row.
      if (!opts?.skipWaitlistInsert) {
        const [enr] = await tx.select().from(enrollments).where(eq(enrollments.id, enrollmentId));
        await tx.insert(offeringWaitlist).values({
          tenantId,
          offeringId,
          enrollmentId,
          firstName: enr?.firstName || "",
          lastName: enr?.lastName || "",
          email: enr?.email || "",
          phone: enr?.phone || null,
          notes: `Auto from enrollment #${enrollmentId}`,
        } as InsertOfferingWaitlist);
      }
      await tx.update(enrollments).set({ isWaitlisted: true, updatedAt: new Date() } as any).where(eq(enrollments.id, enrollmentId));
      return { booked: 0, waitlisted: true };
    }

    let booked = 0;
    for (const s of sessions) {
      await tx.insert(bookings).values({
        tenantId,
        enrollmentId,
        sessionId: s.id,
        userId: userId || null,
        status: "BOOKED",
        creditType: s.type === "CLASSROOM" ? "CLASSROOM" : "DRIVE",
        creditAmount: 0,
      } as InsertBooking);
      await tx.update(scheduleSessions).set({ bookedCount: sql`${scheduleSessions.bookedCount} + 1` }).where(eq(scheduleSessions.id, s.id));
      booked++;
    }

    await tx.update(scheduleOfferings).set({
      enrolledCount: sql`${scheduleOfferings.enrolledCount} + 1`,
      status: (offering.enrolledCount + 1 >= offering.capacity) ? "FULL" as any : offering.status,
    }).where(eq(scheduleOfferings.id, offeringId));

    await tx.update(enrollments).set({ isWaitlisted: false, updatedAt: new Date() } as any).where(eq(enrollments.id, enrollmentId));
    return { booked, waitlisted: false };
  }

  async bookOfferingSessionsAtomic(enrollmentId: number, offeringId: number, tenantId: number, userId: string | null): Promise<{ booked: number; waitlisted: boolean }> {
    return await db.transaction((tx) => this.bookOfferingInTx(tx, enrollmentId, offeringId, tenantId, userId));
  }

  async bookCartOfferingsAtomic(items: { enrollmentId: number; offeringId: number; tenantId: number; userId: string | null }[]): Promise<{ ok: boolean; results: { enrollmentId: number; booked: number; waitlisted: boolean }[]; error?: string }> {
    if (items.length === 0) return { ok: true, results: [] };
    try {
      const results = await db.transaction(async (tx) => {
        const out: { enrollmentId: number; booked: number; waitlisted: boolean }[] = [];
        for (const it of items) {
          const r = await this.bookOfferingInTx(tx, it.enrollmentId, it.offeringId, it.tenantId, it.userId);
          out.push({ enrollmentId: it.enrollmentId, ...r });
        }
        return out;
      });
      return { ok: true, results };
    } catch (e: any) {
      return { ok: false, results: [], error: e?.message || String(e) };
    }
  }

  async promoteWaitlistEntry(waitlistId: number, tenantId: number): Promise<{ ok: boolean; reason?: string; enrollmentId?: number }> {
    const [w] = await db.select().from(offeringWaitlist)
      .where(and(eq(offeringWaitlist.id, waitlistId), eq(offeringWaitlist.tenantId, tenantId)));
    if (!w) return { ok: false, reason: "Waitlist entry not found" };

    // Prefer the deterministic enrollmentId on the waitlist row; fall back
    // to email matching only for legacy rows that predate that column.
    let enr: any | undefined;
    if (w.enrollmentId) {
      const [byId] = await db.select().from(enrollments)
        .where(and(eq(enrollments.id, w.enrollmentId), eq(enrollments.tenantId, tenantId)));
      enr = byId;
    }
    if (!enr) {
      const [byEmail] = await db.select().from(enrollments)
        .where(and(
          eq(enrollments.tenantId, tenantId),
          eq(enrollments.email, w.email),
          eq(enrollments.offeringId, w.offeringId),
          eq(enrollments.isWaitlisted, true),
        ));
      enr = byEmail;
    }
    if (!enr) return { ok: false, reason: "No matching waitlisted enrollment" };

    // Wrap in a transaction and pass skipWaitlistInsert so a failed promote
    // attempt (no seats) does not create a duplicate waitlist row.
    const result = await db.transaction((tx) =>
      this.bookOfferingInTx(tx, enr.id, w.offeringId, tenantId, enr.userId, { skipWaitlistInsert: true })
    );
    if (result.waitlisted) {
      return { ok: false, reason: "No seats currently available" };
    }
    await db.delete(offeringWaitlist).where(eq(offeringWaitlist.id, waitlistId));
    return { ok: true, enrollmentId: enr.id };
  }

  async getOnlineCourses(tenantId: number, filters?: { locationId?: number | null }): Promise<OnlineCourse[]> {
    const rows = await db.select().from(onlineCourses).where(eq(onlineCourses.tenantId, tenantId));
    if (!filters || filters.locationId == null) return rows;

    const targetLocationId = filters.locationId;
    const specificIds = rows
      .filter((c) => c.locationScopeMode === "SPECIFIC_LOCATIONS")
      .map((c) => c.id);
    let allowedSpecific = new Set<number>();
    if (specificIds.length > 0) {
      const links = await db
        .select()
        .from(onlineCourseLocations)
        .where(
          and(
            inArray(onlineCourseLocations.onlineCourseId, specificIds),
            eq(onlineCourseLocations.locationId, targetLocationId),
          ),
        );
      allowedSpecific = new Set(links.map((l) => l.onlineCourseId));
    }
    return rows.filter((c) =>
      c.locationScopeMode === "ALL_LOCATIONS" || allowedSpecific.has(c.id),
    );
  }

  async getOnlineCourse(id: number): Promise<OnlineCourse | undefined> {
    const [course] = await db.select().from(onlineCourses).where(eq(onlineCourses.id, id));
    return course;
  }

  async createOnlineCourse(course: InsertOnlineCourse): Promise<OnlineCourse> {
    const [created] = await db.insert(onlineCourses).values(course).returning();
    return created;
  }

  async createOnlineCourseWithLocations(
    course: InsertOnlineCourse,
    locationIds: number[] | null,
  ): Promise<OnlineCourse> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(onlineCourses).values(course).returning();
      if (locationIds && locationIds.length > 0) {
        const unique = Array.from(new Set(locationIds));
        const validLocs = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(and(inArray(locations.id, unique), eq(locations.tenantId, course.tenantId)));
        const validIds = new Set(validLocs.map((l) => l.id));
        const invalidIds = unique.filter((id) => !validIds.has(id));
        if (invalidIds.length > 0) {
          throw new Error(
            `Invalid location IDs for tenant ${course.tenantId}: ${invalidIds.join(", ")}`,
          );
        }
        await tx.insert(onlineCourseLocations).values(
          unique.map((locationId) => ({ tenantId: course.tenantId, onlineCourseId: created.id, locationId })),
        );
      }
      return created;
    });
  }

  async updateOnlineCourse(id: number, tenantId: number, data: Partial<InsertOnlineCourse>): Promise<OnlineCourse> {
    const [updated] = await db
      .update(onlineCourses)
      .set(data)
      .where(and(eq(onlineCourses.id, id), eq(onlineCourses.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async updateOnlineCourseWithLocations(
    id: number,
    tenantId: number,
    data: Partial<InsertOnlineCourse>,
    locationIds: number[] | null,
  ): Promise<OnlineCourse> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(onlineCourses)
        .set(data)
        .where(and(eq(onlineCourses.id, id), eq(onlineCourses.tenantId, tenantId)))
        .returning();
      if (locationIds !== null) {
        await tx
          .delete(onlineCourseLocations)
          .where(and(eq(onlineCourseLocations.onlineCourseId, id), eq(onlineCourseLocations.tenantId, tenantId)));
        if (locationIds.length > 0) {
          const unique = Array.from(new Set(locationIds));
          const validLocs = await tx
            .select({ id: locations.id })
            .from(locations)
            .where(and(inArray(locations.id, unique), eq(locations.tenantId, tenantId)));
          const validIds = new Set(validLocs.map((l) => l.id));
          const invalidIds = unique.filter((id) => !validIds.has(id));
          if (invalidIds.length > 0) {
            throw new Error(
              `Invalid location IDs for tenant ${tenantId}: ${invalidIds.join(", ")}`,
            );
          }
          await tx.insert(onlineCourseLocations).values(
            unique.map((locationId) => ({ tenantId, onlineCourseId: id, locationId })),
          );
        }
      }
      return updated;
    });
  }

  async deleteOnlineCourse(id: number, tenantId: number): Promise<void> {
    await db.delete(onlineCourses).where(and(eq(onlineCourses.id, id), eq(onlineCourses.tenantId, tenantId)));
  }

  async getOnlineCourseLocationIds(onlineCourseId: number): Promise<number[]> {
    const rows = await db
      .select({ locationId: onlineCourseLocations.locationId })
      .from(onlineCourseLocations)
      .where(eq(onlineCourseLocations.onlineCourseId, onlineCourseId));
    return rows.map((r) => r.locationId);
  }

  async setOnlineCourseLocations(onlineCourseId: number, tenantId: number, locationIds: number[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(onlineCourseLocations)
        .where(and(eq(onlineCourseLocations.onlineCourseId, onlineCourseId), eq(onlineCourseLocations.tenantId, tenantId)));
      const unique = Array.from(new Set(locationIds));
      if (unique.length === 0) return;
      const validLocs = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(inArray(locations.id, unique), eq(locations.tenantId, tenantId)));
      const validIds = new Set(validLocs.map((l) => l.id));
      const invalidIds = unique.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new Error(
          `Invalid location IDs for tenant ${tenantId}: ${invalidIds.join(", ")}`,
        );
      }
      await tx.insert(onlineCourseLocations).values(
        unique.map((locationId) => ({ tenantId, onlineCourseId, locationId })),
      );
    });
  }

  async isOnlineCourseAllowedAtLocation(onlineCourseId: number, locationId: number | null | undefined): Promise<boolean> {
    if (locationId == null) return true;
    const course = await this.getOnlineCourse(onlineCourseId);
    if (!course) return false;
    if (course.locationScopeMode === "ALL_LOCATIONS") return true;
    const [link] = await db
      .select({ id: onlineCourseLocations.id })
      .from(onlineCourseLocations)
      .where(
        and(
          eq(onlineCourseLocations.onlineCourseId, onlineCourseId),
          eq(onlineCourseLocations.locationId, locationId),
        ),
      )
      .limit(1);
    return !!link;
  }

  // Stricter checkout-time guard: SPECIFIC_LOCATIONS online courses REQUIRE
  // a non-null locationId AND that location must be in the course's allowed
  // list. Mirrors assertPackageAllowedAtLocation so a restricted course
  // cannot be purchased without a valid allowed location.
  async assertOnlineCourseAllowedAtLocation(
    onlineCourseId: number,
    locationId: number | null | undefined,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const course = await this.getOnlineCourse(onlineCourseId);
    if (!course) return { ok: false, message: "Invalid online course" };
    if (course.locationScopeMode !== "SPECIFIC_LOCATIONS") return { ok: true };
    if (locationId == null) {
      return {
        ok: false,
        message: `Course "${course.name}" is restricted to specific locations. Please select a location to continue.`,
      };
    }
    const allowed = await this.getOnlineCourseLocationIds(onlineCourseId);
    if (!allowed.includes(locationId)) {
      return {
        ok: false,
        message: `Course "${course.name}" is not available at the selected location.`,
      };
    }
    return { ok: true };
  }

  async getEnrollments(tenantId: number, filters?: { status?: string; search?: string }): Promise<Enrollment[]> {
    const conditions = [eq(enrollments.tenantId, tenantId)];
    if (filters?.status) {
      conditions.push(eq(enrollments.status, filters.status as any));
    }
    if (filters?.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${enrollments.firstName}) LIKE ${term}`,
          sql`LOWER(${enrollments.lastName}) LIKE ${term}`,
          sql`LOWER(${enrollments.email}) LIKE ${term}`,
        )!
      );
    }
    return db.select().from(enrollments).where(and(...conditions)).orderBy(desc(enrollments.createdAt));
  }

  async getEnrollmentById(id: number, tenantId: number): Promise<Enrollment | undefined> {
    const [enrollment] = await db.select().from(enrollments).where(and(eq(enrollments.id, id), eq(enrollments.tenantId, tenantId)));
    return enrollment;
  }

  async createEnrollment(enrollment: InsertEnrollment): Promise<Enrollment> {
    const [created] = await db.insert(enrollments).values(enrollment).returning();
    return created;
  }

  async updateEnrollment(id: number, tenantId: number, data: Partial<InsertEnrollment>): Promise<Enrollment> {
    const [updated] = await db.update(enrollments).set({ ...data, updatedAt: new Date() }).where(and(eq(enrollments.id, id), eq(enrollments.tenantId, tenantId))).returning();
    return updated;
  }

  async getMedia(tenantId: number): Promise<Media[]> {
    return db.select().from(media).where(eq(media.tenantId, tenantId)).orderBy(desc(media.createdAt));
  }

  async createMedia(item: InsertMedia): Promise<Media> {
    const [created] = await db.insert(media).values(item).returning();
    return created;
  }

  async deleteMedia(id: number, tenantId: number): Promise<void> {
    await db.delete(media).where(and(eq(media.id, id), eq(media.tenantId, tenantId)));
  }

  async createContactSubmission(data: InsertContactSubmission): Promise<ContactSubmission> {
    const { randomBytes } = await import("crypto");
    const replyToken = randomBytes(16).toString("base64url");
    const [created] = await db
      .insert(contactSubmissions)
      .values({ ...data, replyToken })
      .returning();
    return created;
  }

  async getContactSubmissionByReplyToken(token: string): Promise<ContactSubmission | undefined> {
    const [row] = await db
      .select()
      .from(contactSubmissions)
      .where(eq(contactSubmissions.replyToken, token));
    return row;
  }

  async backfillContactSubmissionReplyTokens(): Promise<number> {
    const { randomBytes } = await import("crypto");
    const rows = await db
      .select({ id: contactSubmissions.id })
      .from(contactSubmissions)
      .where(sql`${contactSubmissions.replyToken} is null`);
    for (const r of rows) {
      await db
        .update(contactSubmissions)
        .set({ replyToken: randomBytes(16).toString("base64url") })
        .where(eq(contactSubmissions.id, r.id));
    }
    return rows.length;
  }

  async getContactSubmissions(
    tenantId: number,
    filters?: { status?: "all" | "unread" | "read" | "archived"; search?: string; limit?: number; offset?: number },
  ): Promise<ContactSubmission[]> {
    const conditions: SQL[] = [eq(contactSubmissions.tenantId, tenantId)];
    const status = filters?.status ?? "all";
    if (status === "unread") {
      conditions.push(eq(contactSubmissions.read, false));
      conditions.push(sql`${contactSubmissions.archivedAt} is null`);
    } else if (status === "read") {
      conditions.push(eq(contactSubmissions.read, true));
      conditions.push(sql`${contactSubmissions.archivedAt} is null`);
    } else if (status === "archived") {
      conditions.push(sql`${contactSubmissions.archivedAt} is not null`);
    } else {
      conditions.push(sql`${contactSubmissions.archivedAt} is null`);
    }
    const search = filters?.search?.trim();
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(
        ilike(contactSubmissions.name, like),
        ilike(contactSubmissions.email, like),
        ilike(contactSubmissions.phone, like),
        ilike(contactSubmissions.message, like),
      )!);
    }
    let q = db.select().from(contactSubmissions)
      .where(and(...conditions))
      .orderBy(desc(contactSubmissions.createdAt))
      .$dynamic();
    if (typeof filters?.limit === "number") q = q.limit(filters.limit);
    if (typeof filters?.offset === "number") q = q.offset(filters.offset);
    return q;
  }

  async getContactSubmission(id: number, tenantId: number): Promise<ContactSubmission | undefined> {
    const [row] = await db.select().from(contactSubmissions)
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.tenantId, tenantId)));
    return row;
  }

  async updateContactSubmissionRead(id: number, tenantId: number, read: boolean): Promise<ContactSubmission | undefined> {
    const [row] = await db.update(contactSubmissions)
      .set({ read })
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.tenantId, tenantId)))
      .returning();
    return row;
  }

  async archiveContactSubmission(id: number, tenantId: number): Promise<ContactSubmission | undefined> {
    const [row] = await db.update(contactSubmissions)
      .set({ archivedAt: new Date() })
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.tenantId, tenantId)))
      .returning();
    return row;
  }

  async unarchiveContactSubmission(id: number, tenantId: number): Promise<ContactSubmission | undefined> {
    const [row] = await db.update(contactSubmissions)
      .set({ archivedAt: null })
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.tenantId, tenantId)))
      .returning();
    return row;
  }

  async deleteContactSubmission(id: number, tenantId: number): Promise<void> {
    await db.delete(contactSubmissions)
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.tenantId, tenantId)));
  }

  async getUnreadContactSubmissionCount(tenantId: number): Promise<number> {
    const [row] = await db.select({ c: count() }).from(contactSubmissions)
      .where(and(
        eq(contactSubmissions.tenantId, tenantId),
        eq(contactSubmissions.read, false),
        sql`${contactSubmissions.archivedAt} is null`,
      ));
    return Number(row?.c ?? 0);
  }

  async claimContactConfirmationEmailSend(id: number, tenantId: number): Promise<ContactSubmission | undefined> {
    const [row] = await db.update(contactSubmissions)
      .set({ confirmationEmailSentAt: new Date() })
      .where(and(
        eq(contactSubmissions.id, id),
        eq(contactSubmissions.tenantId, tenantId),
        sql`${contactSubmissions.confirmationEmailSentAt} is null`,
      ))
      .returning();
    return row;
  }

  async releaseContactConfirmationEmailSend(id: number, tenantId: number): Promise<void> {
    await db.update(contactSubmissions)
      .set({ confirmationEmailSentAt: null })
      .where(and(
        eq(contactSubmissions.id, id),
        eq(contactSubmissions.tenantId, tenantId),
      ));
  }

  async createContactMessageReply(data: InsertContactMessageReply): Promise<ContactMessageReply> {
    const [created] = await db.insert(contactMessageReplies).values(data).returning();
    return created;
  }

  async getContactMessageReplies(submissionId: number, tenantId: number): Promise<ContactMessageReply[]> {
    return db.select().from(contactMessageReplies)
      .where(and(
        eq(contactMessageReplies.submissionId, submissionId),
        eq(contactMessageReplies.tenantId, tenantId),
      ))
      .orderBy(contactMessageReplies.createdAt);
  }

  async updateContactMessageReplyEmailStatus(id: number, status: string, emailId: number | null): Promise<void> {
    await db.update(contactMessageReplies)
      .set({ emailStatus: status, emailId })
      .where(eq(contactMessageReplies.id, id));
  }

  async getLatestContactReplyMap(
    tenantId: number,
    submissionIds: number[],
  ): Promise<Map<number, { lastReplyAt: Date; replyCount: number }>> {
    const result = new Map<number, { lastReplyAt: Date; replyCount: number }>();
    if (submissionIds.length === 0) return result;
    const rows = await db
      .select({
        submissionId: contactMessageReplies.submissionId,
        lastReplyAt: sql<Date>`max(${contactMessageReplies.createdAt})`,
        replyCount: count(),
      })
      .from(contactMessageReplies)
      .where(and(
        eq(contactMessageReplies.tenantId, tenantId),
        inArray(contactMessageReplies.submissionId, submissionIds),
      ))
      .groupBy(contactMessageReplies.submissionId);
    for (const r of rows) {
      if (r.lastReplyAt) {
        result.set(r.submissionId, {
          lastReplyAt: r.lastReplyAt as Date,
          replyCount: Number(r.replyCount),
        });
      }
    }
    return result;
  }

  async resolveTenant(hostname: string): Promise<Tenant | undefined> {
    const byDomain = await this.getTenantByDomain(hostname);
    if (byDomain) return byDomain;
    const withWww = hostname.startsWith("www.") ? hostname : `www.${hostname}`;
    const withoutWww = hostname.startsWith("www.") ? hostname.slice(4) : null;
    const byWww = await this.getTenantByDomain(withWww);
    if (byWww) return byWww;
    if (withoutWww) {
      const byNoWww = await this.getTenantByDomain(withoutWww);
      if (byNoWww) return byNoWww;
    }
    const slugMatch = hostname.split(".")[0];
    return this.getTenantBySlug(slugMatch);
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    const [p] = await db.select().from(payments).where(eq(payments.id, id));
    return p;
  }

  async getPaymentByProviderOrderId(provider: string, providerOrderId: string): Promise<Payment | undefined> {
    const [p] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.provider, provider as any), eq(payments.providerOrderId, providerOrderId)));
    return p;
  }

  async getPaymentsByEnrollment(enrollmentId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.enrollmentId, enrollmentId)).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByTenant(tenantId: number, filters?: { status?: string; provider?: string }): Promise<Payment[]> {
    const conditions = [eq(payments.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(payments.status, filters.status as any));
    if (filters?.provider) conditions.push(eq(payments.provider, filters.provider as any));
    return db.select().from(payments).where(and(...conditions)).orderBy(desc(payments.createdAt));
  }

  async updatePayment(id: number, data: Partial<Payment>): Promise<Payment> {
    const [updated] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return updated;
  }

  async createCreditLedgerEntry(entry: InsertCreditLedger): Promise<CreditLedgerEntry> {
    const [created] = await db.insert(creditLedger).values(entry).returning();
    return created;
  }

  async createCreditLedgerEntries(entries: InsertCreditLedger[]): Promise<CreditLedgerEntry[]> {
    if (entries.length === 0) return [];
    return db.insert(creditLedger).values(entries).returning();
  }

  async getCreditsByEnrollment(enrollmentId: number): Promise<CreditLedgerEntry[]> {
    return db.select().from(creditLedger).where(eq(creditLedger.enrollmentId, enrollmentId)).orderBy(desc(creditLedger.createdAt));
  }

  async hasPackageGrant(enrollmentId: number): Promise<boolean> {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(creditLedger)
      .where(and(eq(creditLedger.enrollmentId, enrollmentId), eq(creditLedger.reason, "PACKAGE_GRANT")));
    return Number(row?.count ?? 0) > 0;
  }

  async getTenantPaymentSettings(tenantId: number): Promise<TenantPaymentSettings | undefined> {
    const [settings] = await db
      .select()
      .from(tenantPaymentSettings)
      .where(eq(tenantPaymentSettings.tenantId, tenantId));
    return settings;
  }

  async upsertTenantPaymentSettings(data: InsertTenantPaymentSettings): Promise<TenantPaymentSettings> {
    const existing = await this.getTenantPaymentSettings(data.tenantId);
    if (existing) {
      const [updated] = await db
        .update(tenantPaymentSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tenantPaymentSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(tenantPaymentSettings).values(data).returning();
    return created;
  }

  async getEmailTemplate(tenantId: number, templateKey: string): Promise<TenantEmailTemplate | undefined> {
    const [row] = await db
      .select()
      .from(tenantEmailTemplates)
      .where(and(eq(tenantEmailTemplates.tenantId, tenantId), eq(tenantEmailTemplates.templateKey, templateKey)));
    return row;
  }

  async listEmailTemplates(tenantId: number): Promise<TenantEmailTemplate[]> {
    return db
      .select()
      .from(tenantEmailTemplates)
      .where(eq(tenantEmailTemplates.tenantId, tenantId));
  }

  async upsertEmailTemplate(data: InsertTenantEmailTemplate): Promise<TenantEmailTemplate> {
    const existing = await this.getEmailTemplate(data.tenantId, data.templateKey);
    if (existing) {
      const [updated] = await db
        .update(tenantEmailTemplates)
        .set({
          subjectOverride: data.subjectOverride ?? null,
          bodyOverride: data.bodyOverride ?? null,
          updatedAt: new Date(),
        })
        .where(eq(tenantEmailTemplates.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(tenantEmailTemplates).values(data).returning();
    return created;
  }

  async getExpiredPendingEnrollments(olderThanHours: number): Promise<Enrollment[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    return db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.status, "pending_payment"), lt(enrollments.createdAt, cutoff)));
  }

  async getExpiredPendingEnrollmentsByTenant(tenantId: number, olderThanHours: number): Promise<Enrollment[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    return db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.tenantId, tenantId),
        eq(enrollments.status, "pending_payment"),
        lt(enrollments.createdAt, cutoff)
      ));
  }

  async expireEnrollment(enrollmentId: number, tenantId: number): Promise<void> {
    await db
      .update(enrollments)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.tenantId, tenantId)));

    const paymentsList = await this.getPaymentsByEnrollment(enrollmentId);
    for (const p of paymentsList) {
      if (p.status === "PENDING" || p.status === "CREATED") {
        await db
          .update(payments)
          .set({ status: "EXPIRED" as any, updatedAt: new Date() })
          .where(eq(payments.id, p.id));
      }
    }
  }

  async getAllTenantPaymentSettings(): Promise<TenantPaymentSettings[]> {
    return db.select().from(tenantPaymentSettings);
  }

  async countPendingPaymentEnrollments(tenantId: number, olderThanHours: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(and(
        eq(enrollments.tenantId, tenantId),
        eq(enrollments.status, "pending_payment"),
        lt(enrollments.createdAt, cutoff)
      ));
    return result[0]?.count || 0;
  }

  async createUserByEmail(email: string, name: string, phone?: string | null): Promise<User> {
    const nameParts = name.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const [user] = await db
      .insert(users)
      .values({ email, firstName, lastName })
      .onConflictDoUpdate({
        target: users.email,
        set: { firstName, lastName, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  // ===== Phase 2: Vehicles =====

  async getVehicles(tenantId: number): Promise<Vehicle[]> {
    return db.select().from(vehicles).where(eq(vehicles.tenantId, tenantId));
  }

  async getVehicle(id: number, tenantId: number): Promise<Vehicle | undefined> {
    const [v] = await db.select().from(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.tenantId, tenantId)));
    return v;
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const [created] = await db.insert(vehicles).values(vehicle).returning();
    return created;
  }

  async updateVehicle(id: number, tenantId: number, data: Partial<InsertVehicle>): Promise<Vehicle> {
    const [updated] = await db.update(vehicles).set(data).where(and(eq(vehicles.id, id), eq(vehicles.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteVehicle(id: number, tenantId: number): Promise<void> {
    await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.tenantId, tenantId)));
  }

  // ===== Phase 2: Instructor Availability =====

  async getInstructorAvailability(tenantId: number, instructorId?: string): Promise<InstructorAvailability[]> {
    const conditions = [eq(instructorAvailability.tenantId, tenantId)];
    if (instructorId) conditions.push(eq(instructorAvailability.instructorId, instructorId));
    return db.select().from(instructorAvailability).where(and(...conditions));
  }

  async createInstructorAvailability(block: InsertInstructorAvailability): Promise<InstructorAvailability> {
    const [created] = await db.insert(instructorAvailability).values(block).returning();
    return created;
  }

  async updateInstructorAvailability(id: number, tenantId: number, data: Partial<InsertInstructorAvailability>): Promise<InstructorAvailability> {
    const [updated] = await db.update(instructorAvailability).set(data).where(and(eq(instructorAvailability.id, id), eq(instructorAvailability.tenantId, tenantId))).returning();
    return updated;
  }

  async deleteInstructorAvailability(id: number, tenantId: number): Promise<void> {
    await db.delete(instructorAvailability).where(and(eq(instructorAvailability.id, id), eq(instructorAvailability.tenantId, tenantId)));
  }

  // ===== Phase 2: Schedule Sessions =====

  async getScheduleSessions(tenantId: number, filters?: { type?: string; instructorId?: string; locationId?: number; from?: Date; to?: Date; status?: string }): Promise<ScheduleSession[]> {
    const conditions: any[] = [eq(scheduleSessions.tenantId, tenantId)];
    if (filters?.type) conditions.push(eq(scheduleSessions.type, filters.type as any));
    if (filters?.instructorId) conditions.push(eq(scheduleSessions.instructorId, filters.instructorId));
    if (filters?.locationId) conditions.push(eq(scheduleSessions.locationId, filters.locationId));
    if (filters?.status) conditions.push(eq(scheduleSessions.status, filters.status as any));
    if (filters?.from) conditions.push(sql`${scheduleSessions.startAt} >= ${filters.from}`);
    if (filters?.to) conditions.push(sql`${scheduleSessions.startAt} <= ${filters.to}`);
    return db.select().from(scheduleSessions).where(and(...conditions)).orderBy(scheduleSessions.startAt);
  }

  async getScheduleSession(id: number, tenantId: number): Promise<ScheduleSession | undefined> {
    const [s] = await db.select().from(scheduleSessions).where(and(eq(scheduleSessions.id, id), eq(scheduleSessions.tenantId, tenantId)));
    return s;
  }

  async createScheduleSession(session: InsertScheduleSession): Promise<ScheduleSession> {
    const [created] = await db.insert(scheduleSessions).values(session).returning();
    return created;
  }

  async createScheduleSessions(sessionList: InsertScheduleSession[]): Promise<ScheduleSession[]> {
    if (sessionList.length === 0) return [];
    return db.insert(scheduleSessions).values(sessionList).returning();
  }

  async updateScheduleSession(id: number, tenantId: number, data: Partial<InsertScheduleSession>): Promise<ScheduleSession> {
    const [updated] = await db.update(scheduleSessions).set(data).where(and(eq(scheduleSessions.id, id), eq(scheduleSessions.tenantId, tenantId))).returning();
    return updated;
  }

  async cancelScheduleSession(id: number, tenantId: number): Promise<ScheduleSession> {
    const [updated] = await db.update(scheduleSessions).set({ status: "CANCELLED" as any }).where(and(eq(scheduleSessions.id, id), eq(scheduleSessions.tenantId, tenantId))).returning();
    return updated;
  }

  async bulkAssignInstructorToSessions(
    tenantId: number,
    sessionIds: number[],
    instructorId: string | null,
  ): Promise<{ updated: ScheduleSession[]; skipped: Array<{ sessionId: number; reason: string }> }> {
    const updated: ScheduleSession[] = [];
    const skipped: Array<{ sessionId: number; reason: string }> = [];
    if (sessionIds.length === 0) return { updated, skipped };

    const existing = await db
      .select()
      .from(scheduleSessions)
      .where(and(eq(scheduleSessions.tenantId, tenantId), inArray(scheduleSessions.id, sessionIds)));
    const byId = new Map(existing.map((s) => [s.id, s]));

    const accepted: ScheduleSession[] = [];
    for (const sid of sessionIds) {
      const s = byId.get(sid);
      if (!s) { skipped.push({ sessionId: sid, reason: "Session not found" }); continue; }
      if (s.status === "CANCELLED") { skipped.push({ sessionId: sid, reason: "Session is cancelled" }); continue; }
      if (s.status === "COMPLETED") { skipped.push({ sessionId: sid, reason: "Session is completed" }); continue; }
      if (s.instructorId === instructorId) { skipped.push({ sessionId: sid, reason: "Already assigned" }); continue; }
      accepted.push(s);
    }

    if (instructorId) {
      const dbConflictCache = new Map<number, boolean>();
      const intraBatch: ScheduleSession[] = [];
      for (const s of accepted) {
        const overlapInBatch = intraBatch.find(
          (b) => new Date(b.startAt) < new Date(s.endAt) && new Date(b.endAt) > new Date(s.startAt),
        );
        if (overlapInBatch) {
          skipped.push({ sessionId: s.id, reason: `Conflicts with session #${overlapInBatch.id} in this batch` });
          continue;
        }
        const conflict = await this.checkSessionConflict(
          instructorId,
          null,
          new Date(s.startAt),
          new Date(s.endAt),
          s.id,
          tenantId,
        );
        dbConflictCache.set(s.id, conflict);
        if (conflict) {
          skipped.push({ sessionId: s.id, reason: "Instructor already booked at this time" });
          continue;
        }
        intraBatch.push(s);
      }
      const okIds = intraBatch.map((s) => s.id);
      if (okIds.length > 0) {
        const rows = await db
          .update(scheduleSessions)
          .set({ instructorId })
          .where(and(eq(scheduleSessions.tenantId, tenantId), inArray(scheduleSessions.id, okIds)))
          .returning();
        updated.push(...rows);
      }
    } else {
      const okIds = accepted.map((s) => s.id);
      if (okIds.length > 0) {
        const rows = await db
          .update(scheduleSessions)
          .set({ instructorId: null })
          .where(and(eq(scheduleSessions.tenantId, tenantId), inArray(scheduleSessions.id, okIds)))
          .returning();
        updated.push(...rows);
      }
    }
    return { updated, skipped };
  }

  // ===== Phase 2: Bookings =====

  async getBookings(tenantId: number, filters?: { sessionId?: number; enrollmentId?: number; userId?: string; status?: string }): Promise<Booking[]> {
    const conditions: any[] = [eq(bookings.tenantId, tenantId)];
    if (filters?.sessionId) conditions.push(eq(bookings.sessionId, filters.sessionId));
    if (filters?.enrollmentId) conditions.push(eq(bookings.enrollmentId, filters.enrollmentId));
    if (filters?.userId) conditions.push(eq(bookings.userId, filters.userId));
    if (filters?.status) conditions.push(eq(bookings.status, filters.status as any));
    return db.select().from(bookings).where(and(...conditions));
  }

  async getBooking(id: number, tenantId: number): Promise<Booking | undefined> {
    const [b] = await db.select().from(bookings).where(and(eq(bookings.id, id), eq(bookings.tenantId, tenantId)));
    return b;
  }

  async createBooking(booking: InsertBooking): Promise<Booking> {
    const [created] = await db.insert(bookings).values(booking).returning();
    await db.update(scheduleSessions).set({ bookedCount: sql`${scheduleSessions.bookedCount} + 1` }).where(eq(scheduleSessions.id, booking.sessionId));
    return created;
  }

  async updateBooking(id: number, tenantId: number, data: Partial<Booking>): Promise<Booking> {
    const [updated] = await db.update(bookings).set(data).where(and(eq(bookings.id, id), eq(bookings.tenantId, tenantId))).returning();
    return updated;
  }

  async getSessionBookings(sessionId: number): Promise<(Booking & { enrollment?: Enrollment })[]> {
    const rows = await db
      .select({
        booking: bookings,
        enrollment: enrollments,
      })
      .from(bookings)
      .leftJoin(enrollments, eq(bookings.enrollmentId, enrollments.id))
      .where(eq(bookings.sessionId, sessionId));
    return rows.map((r) => ({ ...r.booking, enrollment: r.enrollment || undefined }));
  }

  async getCreditBalance(enrollmentId: number, type: string): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${creditLedger.delta}), 0)::int` })
      .from(creditLedger)
      .where(and(eq(creditLedger.enrollmentId, enrollmentId), eq(creditLedger.type, type as any)));
    return result[0]?.total || 0;
  }

  async getOutstandingComponents(enrollmentId: number, tenantId: number): Promise<{
    components: Array<{
      type: string;
      label: string | null;
      requiredHours: number;
      bookedHours: number;
      attendedHours: number;
      remainingHours: number;
    }>;
    inClassFromThisSchool: boolean;
    inClassRequired: number;
    inClassAttended: number;
    inClassGate: boolean;
  }> {
    const [enr] = await db.select().from(enrollments)
      .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.tenantId, tenantId)));
    if (!enr || !enr.packageId) {
      return { components: [], inClassFromThisSchool: false, inClassRequired: 0, inClassAttended: 0, inClassGate: false };
    }
    const comps = await db.select().from(packageComponents).where(eq(packageComponents.packageId, enr.packageId));
    const allBookings = await db.select().from(bookings)
      .where(and(eq(bookings.enrollmentId, enrollmentId), eq(bookings.tenantId, tenantId)));
    const sessionIds = allBookings.map(b => b.sessionId).filter((x): x is number => !!x);
    const sessionsList = sessionIds.length > 0
      ? await db.select().from(scheduleSessions).where(inArray(scheduleSessions.id, sessionIds))
      : [];
    const sessionMap = new Map(sessionsList.map(s => [s.id, s]));

    function inferComponentType(b: any, s: any): string | null {
      if (b.componentType) return b.componentType;
      if (s?.componentType) return s.componentType;
      if (s?.type === "CLASSROOM") return "IN_CLASS";
      if (s?.type === "BTW_OBSERVATION" || s?.type === "BTW_PRACTICE" || s?.type === "ROAD_TEST") return s.type;
      return null;
    }

    const out: Array<{ type: string; label: string | null; requiredHours: number; bookedHours: number; attendedHours: number; remainingHours: number }> = [];
    for (const c of comps) {
      const type = c.type;
      const required = c.hours ?? 0;
      let booked = 0;
      let attended = 0;
      for (const b of allBookings) {
        const s = sessionMap.get(b.sessionId);
        const ct = inferComponentType(b, s);
        if (ct !== type) continue;
        const hrs = b.creditAmount && b.creditAmount > 0
          ? b.creditAmount
          : (s?.startAt && s?.endAt ? Math.round((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 3600000) : 1);
        if (b.status === "BOOKED") booked += hrs;
        if (b.status === "ATTENDED") attended += hrs;
      }
      const remaining = Math.max(0, required - attended - booked);
      out.push({ type, label: c.label, requiredHours: required, bookedHours: booked, attendedHours: attended, remainingHours: remaining });
    }

    const inClassComp = out.find(c => c.type === "IN_CLASS");
    const inClassFromThisSchool = !!inClassComp;
    const inClassRequired = inClassComp?.requiredHours ?? 0;
    const inClassAttended = inClassComp?.attendedHours ?? 0;
    const inClassGate = inClassFromThisSchool && inClassAttended < inClassRequired;
    return { components: out, inClassFromThisSchool, inClassRequired, inClassAttended, inClassGate };
  }

  async createBtwSessionAtomic(params: {
    tenantId: number;
    enrollmentId: number;
    componentType: "BTW_OBSERVATION" | "BTW_PRACTICE" | "ROAD_TEST";
    instructorId: string;
    locationId: number | null;
    vehicleId: number | null;
    startAt: Date;
    endAt: Date;
    notes?: string | null;
    actorUserId: string;
  }): Promise<{ ok: boolean; reason?: string; session?: ScheduleSession; booking?: Booking; gate?: boolean }> {
    const outstanding = await this.getOutstandingComponents(params.enrollmentId, params.tenantId);
    if (outstanding.inClassGate) {
      return {
        ok: false,
        gate: true,
        reason: "In-class component must be completed at this school before BTW or Road Test sessions can be booked.",
      };
    }
    const compRow = outstanding.components.find(c => c.type === params.componentType);
    if (!compRow || compRow.remainingHours <= 0) {
      return { ok: false, reason: `No remaining ${params.componentType} hours on this enrollment.` };
    }
    const requestedHours = Math.max(1, Math.round((params.endAt.getTime() - params.startAt.getTime()) / 3600000));
    if (requestedHours > compRow.remainingHours) {
      return { ok: false, reason: `Requested ${requestedHours}h exceeds remaining ${compRow.remainingHours}h for ${params.componentType}.` };
    }
    const driveBalance = await this.getCreditBalance(params.enrollmentId, "DRIVE");
    if (driveBalance < requestedHours) {
      return { ok: false, reason: `Insufficient drive credits: ${driveBalance}h available, ${requestedHours}h requested.` };
    }
    const conflict = await this.checkSessionConflict(params.instructorId, params.vehicleId, params.startAt, params.endAt, undefined, params.tenantId);
    if (conflict) return { ok: false, reason: "Instructor or vehicle is not available at this time." };

    const availability = await this.getInstructorAvailability(params.tenantId, params.instructorId);
    if (availability.length > 0) {
      const dow = params.startAt.getDay();
      const dayBlocks = availability.filter((a: any) => a.dayOfWeek === dow);
      const inWindow = dayBlocks.some((b: any) => {
        const [sh, sm] = String(b.startTime).split(":").map(Number);
        const [eh, em] = String(b.endTime).split(":").map(Number);
        const winStart = new Date(params.startAt); winStart.setHours(sh, sm || 0, 0, 0);
        const winEnd = new Date(params.startAt); winEnd.setHours(eh, em || 0, 0, 0);
        return winStart <= params.startAt && winEnd >= params.endAt;
      });
      if (!inWindow) return { ok: false, reason: "Requested time is outside the instructor's availability windows." };
    }

    const hours = Math.max(1, Math.round((params.endAt.getTime() - params.startAt.getTime()) / 3600000));

    return await db.transaction(async (tx) => {
      const [enr] = await tx.select().from(enrollments)
        .where(and(eq(enrollments.id, params.enrollmentId), eq(enrollments.tenantId, params.tenantId)));
      if (!enr) return { ok: false, reason: "Enrollment not found" };

      const [session] = await tx.insert(scheduleSessions).values({
        tenantId: params.tenantId,
        instructorId: params.instructorId,
        locationId: params.locationId,
        vehicleId: params.vehicleId,
        type: params.componentType,
        startAt: params.startAt,
        endAt: params.endAt,
        capacity: 1,
        status: "SCHEDULED",
        notes: params.notes || null,
        componentType: params.componentType,
        enrollmentId: params.enrollmentId,
      }).returning();

      const [booking] = await tx.insert(bookings).values({
        tenantId: params.tenantId,
        enrollmentId: params.enrollmentId,
        sessionId: session.id,
        userId: enr.userId || null,
        status: "BOOKED",
        creditType: "DRIVE",
        componentType: params.componentType,
        creditAmount: hours,
      }).returning();

      await tx.update(scheduleSessions).set({ bookedCount: sql`${scheduleSessions.bookedCount} + 1` }).where(eq(scheduleSessions.id, session.id));

      await tx.insert(creditLedger).values({
        tenantId: params.tenantId,
        enrollmentId: params.enrollmentId,
        type: "DRIVE",
        delta: -hours,
        reason: "SESSION_CONSUME",
        refId: `btw-booking-${booking.id}`,
        note: `${params.componentType} session scheduled by office`,
      } as InsertCreditLedger);

      await tx.insert(sessionActivityLog).values({
        tenantId: params.tenantId,
        sessionId: session.id,
        action: "btw_scheduled",
        actorUserId: params.actorUserId,
        message: `${params.componentType} session created for enrollment #${params.enrollmentId} (${hours}h).`,
        payload: { enrollmentId: params.enrollmentId, hours, componentType: params.componentType },
      });

      return { ok: true, session, booking };
    });
  }

  async cancelAndRescheduleSession(params: {
    tenantId: number;
    sessionId: number;
    newStartAt: Date;
    newEndAt: Date;
    newInstructorId?: string | null;
    newLocationId?: number | null;
    newVehicleId?: number | null;
    actorUserId: string;
  }): Promise<{
    ok: boolean;
    reason?: string;
    originalSession?: ScheduleSession;
    newSession?: ScheduleSession;
    movedBookings?: Booking[];
  }> {
    return await db.transaction(async (tx) => {
      const [original] = await tx.select().from(scheduleSessions)
        .where(and(eq(scheduleSessions.id, params.sessionId), eq(scheduleSessions.tenantId, params.tenantId)))
        .for("update");
      if (!original) return { ok: false, reason: "Session not found" };
      if (original.status === "CANCELLED") return { ok: false, reason: "Session is already cancelled" };

      const instructorId = params.newInstructorId || original.instructorId;
      if (!instructorId) return { ok: false, reason: "Instructor required" };

      const conflictRows = await tx.select().from(scheduleSessions).where(and(
        eq(scheduleSessions.tenantId, params.tenantId),
        sql`${scheduleSessions.id} != ${params.sessionId}`,
        sql`${scheduleSessions.status} != 'CANCELLED'`,
        eq(scheduleSessions.instructorId, instructorId),
        sql`${scheduleSessions.startAt} < ${params.newEndAt}`,
        sql`${scheduleSessions.endAt} > ${params.newStartAt}`,
      ));
      if (conflictRows.length > 0) return { ok: false, reason: "Instructor has a conflicting session at the new time." };

      const newAvailability = await this.getInstructorAvailability(params.tenantId, instructorId);
      if (newAvailability.length > 0) {
        const dow = params.newStartAt.getDay();
        const dayBlocks = newAvailability.filter((a: any) => a.dayOfWeek === dow);
        const inWindow = dayBlocks.some((b: any) => {
          const [sh, sm] = String(b.startTime).split(":").map(Number);
          const [eh, em] = String(b.endTime).split(":").map(Number);
          const winStart = new Date(params.newStartAt); winStart.setHours(sh, sm || 0, 0, 0);
          const winEnd = new Date(params.newStartAt); winEnd.setHours(eh, em || 0, 0, 0);
          return winStart <= params.newStartAt && winEnd >= params.newEndAt;
        });
        if (!inWindow) return { ok: false, reason: "New time is outside the instructor's availability windows." };
      }

      const vId = params.newVehicleId !== undefined ? params.newVehicleId : original.vehicleId;
      if (vId) {
        const vConflict = await tx.select().from(scheduleSessions).where(and(
          eq(scheduleSessions.tenantId, params.tenantId),
          sql`${scheduleSessions.id} != ${params.sessionId}`,
          sql`${scheduleSessions.status} != 'CANCELLED'`,
          eq(scheduleSessions.vehicleId, vId),
          sql`${scheduleSessions.startAt} < ${params.newEndAt}`,
          sql`${scheduleSessions.endAt} > ${params.newStartAt}`,
        ));
        if (vConflict.length > 0) return { ok: false, reason: "Vehicle has a conflicting session at the new time." };
      }

      const activeBookings = await tx.select().from(bookings).where(and(
        eq(bookings.sessionId, params.sessionId),
        eq(bookings.status, "BOOKED"),
      ));

      const [newSession] = await tx.insert(scheduleSessions).values({
        tenantId: params.tenantId,
        instructorId,
        locationId: params.newLocationId !== undefined ? params.newLocationId : original.locationId,
        vehicleId: vId,
        type: original.type,
        startAt: params.newStartAt,
        endAt: params.newEndAt,
        capacity: original.capacity,
        bookedCount: activeBookings.length,
        status: "SCHEDULED",
        notes: original.notes,
        offeringId: original.offeringId,
        componentType: original.componentType,
        enrollmentId: original.enrollmentId,
        rescheduledFromSessionId: original.id,
      }).returning();

      const oldHours = Math.max(1, Math.round((new Date(original.endAt).getTime() - new Date(original.startAt).getTime()) / 3600000));
      const newHours = Math.max(1, Math.round((params.newEndAt.getTime() - params.newStartAt.getTime()) / 3600000));
      const hoursDelta = newHours - oldHours;

      for (const b of activeBookings) {
        const updates: any = { sessionId: newSession.id };
        if (hoursDelta !== 0 && b.creditType && b.creditAmount && b.creditAmount > 0) {
          updates.creditAmount = b.creditAmount + hoursDelta;
          await tx.insert(creditLedger).values({
            tenantId: params.tenantId,
            enrollmentId: b.enrollmentId,
            type: b.creditType,
            delta: -hoursDelta,
            reason: hoursDelta > 0 ? "SESSION_CONSUME" : "BOOKING_CANCEL",
            refId: `reschedule-session-${params.sessionId}-booking-${b.id}`,
            note: `Credit adjusted ${hoursDelta > 0 ? "-" : "+"}${Math.abs(hoursDelta)}h for reschedule of session #${params.sessionId}`,
          } as InsertCreditLedger);
        }
        await tx.update(bookings).set(updates).where(eq(bookings.id, b.id));
      }

      await tx.update(scheduleSessions)
        .set({ status: "CANCELLED", bookedCount: 0 })
        .where(eq(scheduleSessions.id, params.sessionId));

      await tx.insert(sessionActivityLog).values({
        tenantId: params.tenantId,
        sessionId: params.sessionId,
        action: "rescheduled",
        actorUserId: params.actorUserId,
        message: `Session rescheduled to ${params.newStartAt.toISOString()} (new session #${newSession.id}). ${activeBookings.length} booking(s) moved.`,
        payload: { newSessionId: newSession.id, movedBookings: activeBookings.length },
      });

      await tx.insert(sessionActivityLog).values({
        tenantId: params.tenantId,
        sessionId: newSession.id,
        action: "created",
        actorUserId: params.actorUserId,
        message: `Created via reschedule of session #${params.sessionId}.`,
        payload: { rescheduledFromSessionId: params.sessionId, movedBookings: activeBookings.length },
      });

      return { ok: true, originalSession: original, newSession, movedBookings: activeBookings };
    });
  }

  async checkSessionConflict(instructorId: string, vehicleId: number | null, startAt: Date, endAt: Date, excludeSessionId?: number, tenantId?: number): Promise<boolean> {
    const baseConditions = [
      sql`${scheduleSessions.status} != 'CANCELLED'`,
      sql`${scheduleSessions.startAt} < ${endAt}`,
      sql`${scheduleSessions.endAt} > ${startAt}`,
    ];
    if (excludeSessionId) {
      baseConditions.push(sql`${scheduleSessions.id} != ${excludeSessionId}`);
    }
    if (tenantId !== undefined) {
      baseConditions.push(eq(scheduleSessions.tenantId, tenantId));
    }
    const instructorConflict = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scheduleSessions)
      .where(and(eq(scheduleSessions.instructorId, instructorId), ...baseConditions));
    if ((instructorConflict[0]?.count || 0) > 0) return true;

    if (vehicleId) {
      const vehicleConflict = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scheduleSessions)
        .where(and(eq(scheduleSessions.vehicleId, vehicleId), ...baseConditions));
      if ((vehicleConflict[0]?.count || 0) > 0) return true;
    }
    return false;
  }

  async getSavedBlocks(tenantId: number): Promise<SavedBlock[]> {
    return db.select().from(savedBlocks).where(eq(savedBlocks.tenantId, tenantId)).orderBy(desc(savedBlocks.createdAt));
  }

  async createSavedBlock(block: InsertSavedBlock): Promise<SavedBlock> {
    const [created] = await db.insert(savedBlocks).values(block).returning();
    return created;
  }

  async deleteSavedBlock(id: number, tenantId: number): Promise<void> {
    await db.delete(savedBlocks).where(and(eq(savedBlocks.id, id), eq(savedBlocks.tenantId, tenantId)));
  }

  async createTenantApiKey(data: InsertTenantApiKey): Promise<TenantApiKey> {
    const [created] = await db.insert(tenantApiKeys).values(data).returning();
    return created;
  }

  async getTenantApiKeys(tenantId: number): Promise<TenantApiKey[]> {
    return db.select().from(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId)).orderBy(desc(tenantApiKeys.createdAt));
  }

  async revokeTenantApiKey(id: number, tenantId: number): Promise<void> {
    await db.update(tenantApiKeys).set({ revokedAt: new Date() }).where(and(eq(tenantApiKeys.id, id), eq(tenantApiKeys.tenantId, tenantId)));
  }

  async getTenantApiKeyById(id: number): Promise<TenantApiKey | undefined> {
    const [key] = await db.select().from(tenantApiKeys).where(eq(tenantApiKeys.id, id));
    return key;
  }

  async updateApiKeyLastUsed(id: number): Promise<void> {
    await db.update(tenantApiKeys).set({ lastUsedAt: new Date() }).where(eq(tenantApiKeys.id, id));
  }

  async getApiKeyByPrefix(prefix: string): Promise<TenantApiKey | undefined> {
    const [key] = await db.select().from(tenantApiKeys).where(eq(tenantApiKeys.keyPrefix, prefix));
    return key;
  }

  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [created] = await db.insert(supportTickets).values(data).returning();
    return created;
  }

  async getSupportTicketsByTenant(tenantId: number): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).where(eq(supportTickets.tenantId, tenantId)).orderBy(desc(supportTickets.createdAt));
  }

  async getSupportTicketsByUser(tenantId: number, userId: string): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).where(and(eq(supportTickets.tenantId, tenantId), eq(supportTickets.submittedByUserId, userId))).orderBy(desc(supportTickets.createdAt));
  }

  async getAllSupportTickets(filters?: { status?: string; type?: string; search?: string }): Promise<(SupportTicket & { tenantName: string; submitterName: string; submitterEmail: string })[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(supportTickets.status, filters.status as any));
    if (filters?.type) conditions.push(eq(supportTickets.type, filters.type as any));
    if (filters?.search) {
      conditions.push(
        or(
          ilike(supportTickets.subject, `%${filters.search}%`),
          ilike(tenants.name, `%${filters.search}%`),
          ilike(users.email, `%${filters.search}%`)
        )
      );
    }
    const rows = await db
      .select({
        id: supportTickets.id,
        tenantId: supportTickets.tenantId,
        submittedByUserId: supportTickets.submittedByUserId,
        type: supportTickets.type,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        priority: supportTickets.priority,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        tenantName: tenants.name,
        submitterName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        submitterEmail: sql<string>`coalesce(${users.email}, '')`,
      })
      .from(supportTickets)
      .leftJoin(tenants, eq(supportTickets.tenantId, tenants.id))
      .leftJoin(users, eq(supportTickets.submittedByUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(supportTickets.createdAt));
    return rows as any;
  }

  async getSupportTicket(id: number): Promise<(SupportTicket & { tenantName: string; submitterName: string; submitterEmail: string }) | undefined> {
    const [row] = await db
      .select({
        id: supportTickets.id,
        tenantId: supportTickets.tenantId,
        submittedByUserId: supportTickets.submittedByUserId,
        type: supportTickets.type,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        priority: supportTickets.priority,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        tenantName: tenants.name,
        submitterName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        submitterEmail: sql<string>`coalesce(${users.email}, '')`,
      })
      .from(supportTickets)
      .leftJoin(tenants, eq(supportTickets.tenantId, tenants.id))
      .leftJoin(users, eq(supportTickets.submittedByUserId, users.id))
      .where(eq(supportTickets.id, id));
    return row as any;
  }

  async updateSupportTicket(id: number, data: { status?: string; priority?: string | null }): Promise<SupportTicket> {
    const updateData: any = { updatedAt: new Date() };
    if (data.status) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    const [updated] = await db.update(supportTickets).set(updateData).where(eq(supportTickets.id, id)).returning();
    return updated;
  }

  async createTicketResponse(data: InsertTicketResponse): Promise<TicketResponse> {
    const [created] = await db.insert(ticketResponses).values(data).returning();
    return created;
  }

  async getTicketResponses(ticketId: number, includeInternal: boolean = true): Promise<(TicketResponse & { authorName: string; authorEmail: string })[]> {
    const conditions: any[] = [eq(ticketResponses.ticketId, ticketId)];
    if (!includeInternal) {
      conditions.push(eq(ticketResponses.isInternal, false));
    }
    const rows = await db
      .select({
        id: ticketResponses.id,
        ticketId: ticketResponses.ticketId,
        authorUserId: ticketResponses.authorUserId,
        content: ticketResponses.content,
        isInternal: ticketResponses.isInternal,
        createdAt: ticketResponses.createdAt,
        authorName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        authorEmail: sql<string>`coalesce(${users.email}, '')`,
      })
      .from(ticketResponses)
      .leftJoin(users, eq(ticketResponses.authorUserId, users.id))
      .where(and(...conditions))
      .orderBy(ticketResponses.createdAt);
    return rows as any;
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notif] = await db.insert(notifications).values(data).returning();
    return notif;
  }

  async createNotifications(data: InsertNotification[]): Promise<void> {
    if (data.length === 0) return;
    await db.insert(notifications).values(data);
  }

  async getNotificationsForUser(userId: string, limit: number = 50): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationRead(id: number, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result.count;
  }

  async getStaleCreditReminderCandidates(tenantId: number, intervalDays: number): Promise<Array<{
    enrollmentId: number;
    userId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    classroom: number;
    drive: number;
    enrollmentCreatedAt: Date;
    lastReminderAt: Date | null;
  }>> {
    const STALE_AGE_DAYS = 30;
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_AGE_DAYS * 24 * 60 * 60 * 1000);
    const cadenceCutoff = new Date(now.getTime() - intervalDays * 24 * 60 * 60 * 1000);
    const activeEnrollments = await db.select().from(enrollments)
      .where(and(
        eq(enrollments.tenantId, tenantId),
        sql`${enrollments.status} IN ('confirmed','active','in_progress')`,
        sql`${enrollments.createdAt} <= ${staleCutoff}`,
      ));
    // Dedupe by student within this batch (one student may have multiple enrollments).
    const seenStudentKeys = new Set<string>();
    type Candidate = {
      enrollmentId: number;
      userId: string | null;
      firstName: string;
      lastName: string;
      email: string;
      classroom: number;
      drive: number;
      enrollmentCreatedAt: Date;
      lastReminderAt: Date | null;
    };
    // Pre-build a set of all enrollment IDs in this tenant for the same student
    // so the upcoming-session check can be student-scoped (a student with two
    // enrollments shouldn't be reminded on enrollment A if enrollment B has an
    // upcoming session).
    const enrollmentsByStudent = new Map<string, number[]>();
    {
      const allTenantEnrollments = await db.select({
        id: enrollments.id,
        userId: enrollments.userId,
        email: enrollments.email,
      }).from(enrollments).where(eq(enrollments.tenantId, tenantId));
      for (const row of allTenantEnrollments) {
        if (!row.email && !row.userId) continue;
        const key = row.userId ? `u:${row.userId}` : `e:${(row.email ?? "").trim().toLowerCase()}`;
        const list = enrollmentsByStudent.get(key) ?? [];
        list.push(row.id);
        enrollmentsByStudent.set(key, list);
      }
    }
    const result: Candidate[] = [];
    for (const e of activeEnrollments) {
      if (!e.email) continue;
      const studentKey = e.userId ? `u:${e.userId}` : `e:${e.email.trim().toLowerCase()}`;
      if (seenStudentKeys.has(studentKey)) continue;
      const classroomBal = await this.getCreditBalance(e.id, "CLASSROOM");
      const driveBal = await this.getCreditBalance(e.id, "DRIVE");
      if (classroomBal <= 0 && driveBal <= 0) continue;
      const studentEnrollmentIds = enrollmentsByStudent.get(studentKey) ?? [e.id];
      const upcoming = await db.select({ id: bookings.id }).from(bookings)
        .innerJoin(scheduleSessions, eq(bookings.sessionId, scheduleSessions.id))
        .where(and(
          inArray(bookings.enrollmentId, studentEnrollmentIds),
          eq(bookings.status, "BOOKED"),
          sql`${scheduleSessions.startAt} >= ${now}`,
        ))
        .limit(1);
      if (upcoming.length > 0) continue;
      // Dedupe at the student level, not the enrollment level.
      const lastReminderAt = await this.getLastStaleCreditReminderAtForStudent(tenantId, e.userId, e.email);
      if (lastReminderAt && lastReminderAt.getTime() > cadenceCutoff.getTime()) continue;
      seenStudentKeys.add(studentKey);
      result.push({
        enrollmentId: e.id,
        userId: e.userId,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        classroom: classroomBal,
        drive: driveBal,
        enrollmentCreatedAt: e.createdAt!,
        lastReminderAt,
      });
    }
    return result;
  }

  async recordStaleCreditReminder(data: InsertStaleCreditReminder): Promise<StaleCreditReminder> {
    const [row] = await db.insert(staleCreditReminders).values(data).returning();
    return row;
  }

  async getStaleCreditReminderHistory(tenantId: number, enrollmentId?: number, limit: number = 100): Promise<StaleCreditReminder[]> {
    const where = enrollmentId
      ? and(eq(staleCreditReminders.tenantId, tenantId), eq(staleCreditReminders.enrollmentId, enrollmentId))
      : eq(staleCreditReminders.tenantId, tenantId);
    return db.select().from(staleCreditReminders).where(where).orderBy(desc(staleCreditReminders.createdAt)).limit(limit);
  }

  async getLastStaleCreditReminderAt(enrollmentId: number): Promise<Date | null> {
    const [row] = await db.select({ sentAt: staleCreditReminders.sentAt })
      .from(staleCreditReminders)
      .where(eq(staleCreditReminders.enrollmentId, enrollmentId))
      .orderBy(desc(staleCreditReminders.sentAt))
      .limit(1);
    return row?.sentAt ?? null;
  }

  async getLastStaleCreditReminderAtForStudent(tenantId: number, recipientUserId: string | null, recipientEmail: string): Promise<Date | null> {
    const normalizedEmail = (recipientEmail || "").trim().toLowerCase();
    const identityFilter = recipientUserId
      ? or(
          eq(staleCreditReminders.recipientUserId, recipientUserId),
          sql`LOWER(${staleCreditReminders.recipientEmail}) = ${normalizedEmail}`,
        )
      : sql`LOWER(${staleCreditReminders.recipientEmail}) = ${normalizedEmail}`;
    // Only successful deliveries count toward cooldown; a fully-failed attempt
    // shouldn't suppress a retry on the next scheduler tick.
    const successFilter = or(
      eq(staleCreditReminders.emailStatus, "sent"),
      eq(staleCreditReminders.inAppStatus, "created"),
    );
    const [row] = await db.select({ sentAt: staleCreditReminders.sentAt })
      .from(staleCreditReminders)
      .where(and(eq(staleCreditReminders.tenantId, tenantId), identityFilter!, successFilter!))
      .orderBy(desc(staleCreditReminders.sentAt))
      .limit(1);
    return row?.sentAt ?? null;
  }

  async recordCartReminder(data: InsertCartReminder): Promise<CartReminder> {
    const [row] = await db.insert(cartReminders).values(data).returning();
    return row;
  }

  async getCartReminderHistory(tenantId: number, opts?: { cartId?: string; paymentId?: number; limit?: number }): Promise<CartReminder[]> {
    const filters: SQL[] = [eq(cartReminders.tenantId, tenantId)];
    if (opts?.cartId) filters.push(eq(cartReminders.cartId, opts.cartId));
    if (opts?.paymentId != null) filters.push(eq(cartReminders.paymentId, opts.paymentId));
    return db.select().from(cartReminders)
      .where(and(...filters))
      .orderBy(desc(cartReminders.createdAt))
      .limit(opts?.limit ?? 200);
  }

  async getCartReminderStagesByTenant(tenantId: number): Promise<{
    byCartId: Map<string, CartReminderAggregate>;
    byPaymentId: Map<number, CartReminderAggregate>;
  }> {
    const rows = await db.select().from(cartReminders).where(eq(cartReminders.tenantId, tenantId));
    const byCartId = new Map<string, CartReminderAggregate>();
    const byPaymentId = new Map<number, CartReminderAggregate>();
    const emptySlot = (): CartReminderAggregate => ({
      lastSentAt: null, stagesSent: [], totalSent: 0,
      totalOpens: 0, totalClicks: 0, hasOpened: false, hasClicked: false, recoveredAt: null,
    });
    const fold = (slot: CartReminderAggregate, r: typeof rows[number]) => {
      // Only actual successful sends count toward dedupe / metrics. `skipped_no_provider`
      // means no email left the system, so we should retry once a provider is configured.
      if (r.emailStatus !== "sent") return slot;
      if (!slot.stagesSent.includes(r.stage)) slot.stagesSent.push(r.stage);
      if (!slot.lastSentAt || (r.sentAt && r.sentAt > slot.lastSentAt)) slot.lastSentAt = r.sentAt;
      slot.totalSent += 1;
      slot.totalOpens += r.openCount || 0;
      slot.totalClicks += r.clickCount || 0;
      // A click implies an open even if the pixel never fired (image-blocking
      // clients), so derive "opened" from firstOpenedAt — which is also set
      // by recordCartReminderClick.
      if (r.firstOpenedAt != null || (r.openCount || 0) > 0 || (r.clickCount || 0) > 0) slot.hasOpened = true;
      if ((r.clickCount || 0) > 0) slot.hasClicked = true;
      if (r.recoveredAt && (!slot.recoveredAt || r.recoveredAt > slot.recoveredAt)) {
        slot.recoveredAt = r.recoveredAt;
      }
      return slot;
    };
    for (const r of rows) {
      if (r.cartId) {
        const slot = byCartId.get(r.cartId) || emptySlot();
        byCartId.set(r.cartId, fold(slot, r));
      }
      if (r.paymentId != null) {
        const slot = byPaymentId.get(r.paymentId) || emptySlot();
        byPaymentId.set(r.paymentId, fold(slot, r));
      }
    }
    return { byCartId, byPaymentId };
  }

  async isEmailUnsubscribed(tenantId: number, email: string): Promise<boolean> {
    const normalized = (email || "").trim().toLowerCase();
    if (!normalized) return false;
    const [row] = await db.select().from(emailUnsubscribes)
      .where(and(eq(emailUnsubscribes.tenantId, tenantId), eq(emailUnsubscribes.email, normalized)))
      .limit(1);
    return !!row;
  }

  async addEmailUnsubscribe(data: InsertEmailUnsubscribe): Promise<EmailUnsubscribe> {
    const normalized = (data.email || "").trim().toLowerCase();
    const [row] = await db.insert(emailUnsubscribes)
      .values({ ...data, email: normalized })
      .onConflictDoUpdate({
        target: [emailUnsubscribes.tenantId, emailUnsubscribes.email],
        set: { source: data.source ?? "cart_reminder" },
      })
      .returning();
    return row;
  }

  async getUnsubscribedEmailsForTenant(tenantId: number): Promise<Map<string, string>> {
    const rows = await db.select({ email: emailUnsubscribes.email, source: emailUnsubscribes.source })
      .from(emailUnsubscribes)
      .where(eq(emailUnsubscribes.tenantId, tenantId));
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set((r.email || "").toLowerCase(), r.source || "cart_reminder");
    }
    return map;
  }

  async getSessionChangeEmailByProviderMessageId(providerMessageId: string): Promise<{ tenantId: number } | undefined> {
    if (!providerMessageId) return undefined;
    const [row] = await db.select({ tenantId: sessionChangeEmails.tenantId })
      .from(sessionChangeEmails)
      .where(eq(sessionChangeEmails.providerMessageId, providerMessageId))
      .limit(1);
    return row;
  }

  async getCartReminderByToken(token: string): Promise<CartReminder | undefined> {
    if (!token) return undefined;
    const [row] = await db.select().from(cartReminders)
      .where(eq(cartReminders.trackingToken, token))
      .limit(1);
    return row;
  }

  async recordCartReminderOpen(token: string): Promise<CartReminder | undefined> {
    if (!token) return undefined;
    const [row] = await db.update(cartReminders)
      .set({
        openCount: sql`${cartReminders.openCount} + 1`,
        firstOpenedAt: sql`COALESCE(${cartReminders.firstOpenedAt}, NOW())`,
      })
      .where(eq(cartReminders.trackingToken, token))
      .returning();
    return row;
  }

  async recordCartReminderClick(token: string): Promise<CartReminder | undefined> {
    if (!token) return undefined;
    const [row] = await db.update(cartReminders)
      .set({
        clickCount: sql`${cartReminders.clickCount} + 1`,
        firstClickedAt: sql`COALESCE(${cartReminders.firstClickedAt}, NOW())`,
        // A click implies an open; some clients block remote images so the
        // pixel never fires. Only set firstOpenedAt; do not double-count opens.
        firstOpenedAt: sql`COALESCE(${cartReminders.firstOpenedAt}, NOW())`,
      })
      .where(eq(cartReminders.trackingToken, token))
      .returning();
    return row;
  }

  async markCartRemindersRecovered(
    tenantId: number,
    opts: { cartId?: string | null; paymentId?: number | null },
  ): Promise<number> {
    const filters: SQL[] = [eq(cartReminders.tenantId, tenantId), sql`${cartReminders.recoveredAt} IS NULL`];
    const orParts: SQL[] = [];
    if (opts.cartId) orParts.push(eq(cartReminders.cartId, opts.cartId));
    if (opts.paymentId != null) orParts.push(eq(cartReminders.paymentId, opts.paymentId));
    if (orParts.length === 0) return 0;
    filters.push(orParts.length === 1 ? orParts[0] : or(...orParts)!);
    const updated = await db.update(cartReminders)
      .set({ recoveredAt: new Date() })
      .where(and(...filters))
      .returning({ id: cartReminders.id });
    return updated.length;
  }

  async getCartReminderTrackingSummary(tenantId: number): Promise<CartReminderTrackingSummary> {
    const rows = await db.select().from(cartReminders).where(eq(cartReminders.tenantId, tenantId));
    const sentRows = rows.filter(r => r.emailStatus === "sent");
    const remindersSent = sentRows.length;
    const totalOpens = sentRows.reduce((s, r) => s + (r.openCount || 0), 0);
    const totalClicks = sentRows.reduce((s, r) => s + (r.clickCount || 0), 0);
    // "Opened" includes engagements detected via the click endpoint, which sets
    // firstOpenedAt for clients that block the tracking pixel.
    const uniqueOpens = sentRows.filter(r => r.firstOpenedAt != null || (r.openCount || 0) > 0 || (r.clickCount || 0) > 0).length;
    const uniqueClicks = sentRows.filter(r => (r.clickCount || 0) > 0).length;

    // Recovered targets are de-duped by (cart|payment); count one recovery per
    // recipient, not per email send. This avoids inflating recovery rate when
    // a recipient receives both stage 1 and stage 2 before paying.
    const recoveredTargets = new Set<string>();
    for (const r of sentRows) {
      if (!r.recoveredAt) continue;
      const key = r.cartId ? `c:${r.cartId}` : (r.paymentId != null ? `p:${r.paymentId}` : null);
      if (key) recoveredTargets.add(key);
    }
    const uniqueTargets = new Set<string>();
    for (const r of sentRows) {
      const key = r.cartId ? `c:${r.cartId}` : (r.paymentId != null ? `p:${r.paymentId}` : `id:${r.id}`);
      uniqueTargets.add(key);
    }
    const recoveries = recoveredTargets.size;
    const uniqueReminders = uniqueTargets.size;

    const stages = [1, 2].map(stage => {
      const sRows = sentRows.filter(r => r.stage === stage);
      const sent = sRows.length;
      const sUniqueOpens = sRows.filter(r => (r.openCount || 0) > 0).length;
      const sUniqueClicks = sRows.filter(r => (r.clickCount || 0) > 0).length;
      const sRecoveryTargets = new Set<string>();
      for (const r of sRows) {
        if (!r.recoveredAt) continue;
        const key = r.cartId ? `c:${r.cartId}` : (r.paymentId != null ? `p:${r.paymentId}` : null);
        if (key) sRecoveryTargets.add(key);
      }
      const sRecoveries = sRecoveryTargets.size;
      return {
        stage,
        sent,
        uniqueOpens: sUniqueOpens,
        uniqueClicks: sUniqueClicks,
        recoveries: sRecoveries,
        openRate: sent > 0 ? sUniqueOpens / sent : 0,
        clickRate: sent > 0 ? sUniqueClicks / sent : 0,
        recoveryRate: sent > 0 ? sRecoveries / sent : 0,
      };
    });

    return {
      remindersSent,
      uniqueReminders,
      totalOpens,
      totalClicks,
      recoveries,
      openRate: remindersSent > 0 ? uniqueOpens / remindersSent : 0,
      clickRate: remindersSent > 0 ? uniqueClicks / remindersSent : 0,
      recoveryRate: uniqueReminders > 0 ? recoveries / uniqueReminders : 0,
      byStage: stages,
    };
  }

  async getMarketingProgramSettings(): Promise<MarketingProgramSettings> {
    const [existing] = await db.select().from(marketingProgramSettings).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(marketingProgramSettings).values({}).returning();
    return created;
  }

  async updateMarketingProgramSettings(data: Partial<InsertMarketingProgramSettings>): Promise<MarketingProgramSettings> {
    const existing = await this.getMarketingProgramSettings();
    const [updated] = await db
      .update(marketingProgramSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(marketingProgramSettings.id, existing.id))
      .returning();
    return updated;
  }

  async createAffiliate(data: InsertAffiliate): Promise<Affiliate> {
    const [aff] = await db.insert(affiliates).values(data).returning();
    return aff;
  }

  async getAffiliate(id: number): Promise<(Affiliate & { userName: string; userEmail: string }) | undefined> {
    const [row] = await db
      .select({
        id: affiliates.id, userId: affiliates.userId, code: affiliates.code,
        status: affiliates.status, commissionModel: affiliates.commissionModel,
        recurringRate: affiliates.recurringRate, hybridUpfrontCents: affiliates.hybridUpfrontCents,
        hybridRecurringRate: affiliates.hybridRecurringRate, resellerWholesaleCents: affiliates.resellerWholesaleCents,
        tier: affiliates.tier, paypalEmail: affiliates.paypalEmail, notes: affiliates.notes,
        createdAt: affiliates.createdAt, updatedAt: affiliates.updatedAt,
        userName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        userEmail: sql<string>`coalesce(${users.email}, '')`,
      })
      .from(affiliates)
      .leftJoin(users, eq(affiliates.userId, users.id))
      .where(eq(affiliates.id, id));
    return row as any;
  }

  async getAffiliateByCode(code: string): Promise<Affiliate | undefined> {
    const [row] = await db.select().from(affiliates).where(eq(affiliates.code, code));
    return row;
  }

  async getAffiliateByUserId(userId: string): Promise<Affiliate | undefined> {
    const [row] = await db.select().from(affiliates).where(eq(affiliates.userId, userId));
    return row;
  }

  async getAllAffiliates(): Promise<(Affiliate & { userName: string; userEmail: string; schoolCount: number; totalEarnedCents: number })[]> {
    const rows = await db
      .select({
        id: affiliates.id, userId: affiliates.userId, code: affiliates.code,
        status: affiliates.status, commissionModel: affiliates.commissionModel,
        recurringRate: affiliates.recurringRate, hybridUpfrontCents: affiliates.hybridUpfrontCents,
        hybridRecurringRate: affiliates.hybridRecurringRate, resellerWholesaleCents: affiliates.resellerWholesaleCents,
        tier: affiliates.tier, paypalEmail: affiliates.paypalEmail, notes: affiliates.notes,
        createdAt: affiliates.createdAt, updatedAt: affiliates.updatedAt,
        userName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        userEmail: sql<string>`coalesce(${users.email}, '')`,
        schoolCount: sql<number>`(SELECT count(*) FROM affiliate_referrals WHERE affiliate_id = ${affiliates.id})::int`,
        totalEarnedCents: sql<number>`coalesce((SELECT sum(amount_cents) FROM affiliate_commissions WHERE affiliate_id = ${affiliates.id} AND status = 'paid'), 0)::int`,
      })
      .from(affiliates)
      .leftJoin(users, eq(affiliates.userId, users.id))
      .orderBy(desc(affiliates.createdAt));
    return rows as any;
  }

  async updateAffiliate(id: number, data: Partial<InsertAffiliate>): Promise<Affiliate> {
    const [updated] = await db
      .update(affiliates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(affiliates.id, id))
      .returning();
    return updated;
  }

  async createAffiliateReferral(data: InsertAffiliateReferral): Promise<AffiliateReferral> {
    const [ref] = await db.insert(affiliateReferrals).values(data).returning();
    return ref;
  }

  async getReferralsByAffiliate(affiliateId: number): Promise<(AffiliateReferral & { tenantName: string })[]> {
    const rows = await db
      .select({
        id: affiliateReferrals.id, affiliateId: affiliateReferrals.affiliateId,
        tenantId: affiliateReferrals.tenantId, status: affiliateReferrals.status,
        referredAt: affiliateReferrals.referredAt, activatedAt: affiliateReferrals.activatedAt,
        churnedAt: affiliateReferrals.churnedAt,
        tenantName: sql<string>`coalesce(${tenants.name}, 'Unknown')`,
      })
      .from(affiliateReferrals)
      .leftJoin(tenants, eq(affiliateReferrals.tenantId, tenants.id))
      .where(eq(affiliateReferrals.affiliateId, affiliateId))
      .orderBy(desc(affiliateReferrals.referredAt));
    return rows as any;
  }

  async getReferralByTenant(tenantId: number): Promise<AffiliateReferral | undefined> {
    const [row] = await db.select().from(affiliateReferrals).where(eq(affiliateReferrals.tenantId, tenantId));
    return row;
  }

  async updateAffiliateReferral(id: number, data: Partial<InsertAffiliateReferral>): Promise<AffiliateReferral> {
    const [updated] = await db
      .update(affiliateReferrals)
      .set(data)
      .where(eq(affiliateReferrals.id, id))
      .returning();
    return updated;
  }

  async createAffiliateCommission(data: InsertAffiliateCommission): Promise<AffiliateCommission> {
    const [comm] = await db.insert(affiliateCommissions).values(data).returning();
    return comm;
  }

  async getCommissionsByAffiliate(affiliateId: number, filters?: { status?: string; period?: string }): Promise<AffiliateCommission[]> {
    const conditions: any[] = [eq(affiliateCommissions.affiliateId, affiliateId)];
    if (filters?.status) conditions.push(eq(affiliateCommissions.status, filters.status as any));
    if (filters?.period) conditions.push(eq(affiliateCommissions.period, filters.period));
    return db
      .select()
      .from(affiliateCommissions)
      .where(and(...conditions))
      .orderBy(desc(affiliateCommissions.createdAt));
  }

  async getCommissionSummary(affiliateId: number): Promise<{ pending: number; approved: number; paid: number }> {
    const rows = await db
      .select({
        status: affiliateCommissions.status,
        total: sql<number>`coalesce(sum(${affiliateCommissions.amountCents}), 0)::int`,
      })
      .from(affiliateCommissions)
      .where(eq(affiliateCommissions.affiliateId, affiliateId))
      .groupBy(affiliateCommissions.status);
    const result = { pending: 0, approved: 0, paid: 0 };
    for (const r of rows) {
      if (r.status === "pending") result.pending = r.total;
      else if (r.status === "approved") result.approved = r.total;
      else if (r.status === "paid") result.paid = r.total;
    }
    return result;
  }

  async createAffiliatePayout(data: InsertAffiliatePayout): Promise<AffiliatePayout> {
    const [payout] = await db.insert(affiliatePayouts).values(data).returning();
    return payout;
  }

  async getPayoutsByAffiliate(affiliateId: number): Promise<AffiliatePayout[]> {
    return db
      .select()
      .from(affiliatePayouts)
      .where(eq(affiliatePayouts.affiliateId, affiliateId))
      .orderBy(desc(affiliatePayouts.paidAt));
  }

  async getAffiliateStats(affiliateId: number): Promise<{
    totalReferrals: number;
    activeSchools: number;
    totalEarnedCents: number;
    pendingCents: number;
    approvedCents: number;
  }> {
    const [refStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${affiliateReferrals.status} = 'active')::int`,
      })
      .from(affiliateReferrals)
      .where(eq(affiliateReferrals.affiliateId, affiliateId));
    const summary = await this.getCommissionSummary(affiliateId);
    return {
      totalReferrals: refStats.total,
      activeSchools: refStats.active,
      totalEarnedCents: summary.paid,
      pendingCents: summary.pending,
      approvedCents: summary.approved,
    };
  }

  async createAffiliateApplication(data: InsertAffiliateApplication): Promise<AffiliateApplication> {
    const [app] = await db.insert(affiliateApplications).values(data).returning();
    return app;
  }

  async getAffiliateApplications(): Promise<AffiliateApplication[]> {
    return db.select().from(affiliateApplications).orderBy(desc(affiliateApplications.createdAt));
  }

  async getAffiliateApplication(id: number): Promise<AffiliateApplication | undefined> {
    const [app] = await db.select().from(affiliateApplications).where(eq(affiliateApplications.id, id));
    return app;
  }

  async updateAffiliateApplication(id: number, data: Partial<AffiliateApplication>): Promise<AffiliateApplication> {
    const [app] = await db.update(affiliateApplications).set(data).where(eq(affiliateApplications.id, id)).returning();
    return app;
  }

  async createPlan(data: InsertPlatformPlan): Promise<PlatformPlan> {
    const [plan] = await db.insert(platformPlans).values(data).returning();
    return plan;
  }

  async getPlan(id: number): Promise<PlatformPlan | undefined> {
    const [plan] = await db.select().from(platformPlans).where(eq(platformPlans.id, id));
    return plan;
  }

  async getAllPlans(): Promise<PlatformPlan[]> {
    return db.select().from(platformPlans).orderBy(platformPlans.sortOrder);
  }

  async updatePlan(id: number, data: Partial<InsertPlatformPlan>): Promise<PlatformPlan> {
    const [updated] = await db
      .update(platformPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(platformPlans.id, id))
      .returning();
    return updated;
  }

  async getActivePlans(): Promise<PlatformPlan[]> {
    return db.select().from(platformPlans).where(eq(platformPlans.active, true)).orderBy(platformPlans.sortOrder);
  }

  async updateTenantBilling(tenantId: number, data: { planId?: number | null; subscriptionStatus?: string; billingEmail?: string | null; trialEndsAt?: Date | null; currentPeriodStart?: Date | null; currentPeriodEnd?: Date | null; stripeCustomerId?: string | null }): Promise<Tenant> {
    const [updated] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();
    return updated;
  }

  async createInvoice(data: InsertTenantInvoice): Promise<TenantInvoice> {
    const [invoice] = await db.insert(tenantInvoices).values(data).returning();
    return invoice;
  }

  async getInvoice(id: number): Promise<TenantInvoice | undefined> {
    const [invoice] = await db.select().from(tenantInvoices).where(eq(tenantInvoices.id, id));
    return invoice;
  }

  async getInvoicesByTenant(tenantId: number): Promise<TenantInvoice[]> {
    return db.select().from(tenantInvoices).where(eq(tenantInvoices.tenantId, tenantId)).orderBy(desc(tenantInvoices.createdAt));
  }

  async getAllInvoices(filters?: { status?: string; tenantId?: number; from?: Date; to?: Date }): Promise<TenantInvoice[]> {
    const conditions: any[] = [];
    if (filters?.status) conditions.push(eq(tenantInvoices.status, filters.status));
    if (filters?.tenantId) conditions.push(eq(tenantInvoices.tenantId, filters.tenantId));
    if (filters?.from) conditions.push(sql`${tenantInvoices.periodStart} >= ${filters.from}`);
    if (filters?.to) conditions.push(sql`${tenantInvoices.periodEnd} <= ${filters.to}`);
    return db
      .select()
      .from(tenantInvoices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tenantInvoices.createdAt));
  }

  async updateInvoice(id: number, data: Partial<InsertTenantInvoice>): Promise<TenantInvoice> {
    const [updated] = await db
      .update(tenantInvoices)
      .set(data)
      .where(eq(tenantInvoices.id, id))
      .returning();
    return updated;
  }

  async getOverdueInvoices(): Promise<TenantInvoice[]> {
    return db
      .select()
      .from(tenantInvoices)
      .where(
        and(
          or(eq(tenantInvoices.status, "pending"), eq(tenantInvoices.status, "draft")),
          lt(tenantInvoices.dueDate, new Date())
        )
      )
      .orderBy(tenantInvoices.dueDate);
  }

  async getInvoiceSummary(): Promise<{ draft: number; pending: number; paid: number; failed: number; void: number }> {
    const rows = await db
      .select({
        status: tenantInvoices.status,
        total: sql<number>`coalesce(sum(${tenantInvoices.amountCents}), 0)::int`,
      })
      .from(tenantInvoices)
      .groupBy(tenantInvoices.status);
    const result = { draft: 0, pending: 0, paid: 0, failed: 0, void: 0 };
    for (const r of rows) {
      if (r.status in result) {
        (result as any)[r.status] = r.total;
      }
    }
    return result;
  }

  async getPromotions(tenantId: number): Promise<Promotion[]> {
    return db.select().from(promotions).where(eq(promotions.tenantId, tenantId)).orderBy(promotions.sortOrder, promotions.id);
  }

  async getPromotion(id: number): Promise<Promotion | undefined> {
    const [promo] = await db.select().from(promotions).where(eq(promotions.id, id));
    return promo;
  }

  async createPromotion(promo: InsertPromotion): Promise<Promotion> {
    const [created] = await db.insert(promotions).values(promo).returning();
    return created;
  }

  async updatePromotion(id: number, tenantId: number, data: Partial<InsertPromotion>): Promise<Promotion> {
    const [updated] = await db
      .update(promotions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deletePromotion(id: number, tenantId: number): Promise<void> {
    await db.delete(promotions).where(and(eq(promotions.id, id), eq(promotions.tenantId, tenantId)));
  }

  async getTenantAnnouncement(tenantId: number): Promise<TenantAnnouncement | undefined> {
    const rows = await db
      .select()
      .from(tenantAnnouncements)
      .where(eq(tenantAnnouncements.tenantId, tenantId));
    const now = new Date();
    const live = rows.filter((r) => {
      if (!r.enabled) return false;
      if (!r.message || r.message.trim().length === 0) return false;
      if (r.validFrom && new Date(r.validFrom) > now) return false;
      if (r.validUntil && new Date(r.validUntil) < now) return false;
      return true;
    });
    if (live.length === 0) return undefined;
    live.sort((a, b) => {
      const ap = a.priority ?? 0;
      const bp = b.priority ?? 0;
      if (bp !== ap) return bp - ap;
      const af = a.validFrom ? new Date(a.validFrom).getTime() : 0;
      const bf = b.validFrom ? new Date(b.validFrom).getTime() : 0;
      if (bf !== af) return bf - af;
      return b.id - a.id;
    });
    return live[0];
  }

  async getTenantAnnouncements(tenantId: number): Promise<TenantAnnouncement[]> {
    const rows = await db
      .select()
      .from(tenantAnnouncements)
      .where(eq(tenantAnnouncements.tenantId, tenantId));
    rows.sort((a, b) => {
      const ap = a.priority ?? 0;
      const bp = b.priority ?? 0;
      if (bp !== ap) return bp - ap;
      const af = a.validFrom ? new Date(a.validFrom).getTime() : 0;
      const bf = b.validFrom ? new Date(b.validFrom).getTime() : 0;
      if (bf !== af) return bf - af;
      return b.id - a.id;
    });
    return rows;
  }

  async getTenantAnnouncementById(id: number, tenantId: number): Promise<TenantAnnouncement | undefined> {
    const [row] = await db
      .select()
      .from(tenantAnnouncements)
      .where(and(eq(tenantAnnouncements.id, id), eq(tenantAnnouncements.tenantId, tenantId)));
    return row;
  }

  async createTenantAnnouncement(data: InsertTenantAnnouncement): Promise<TenantAnnouncement> {
    const [created] = await db.insert(tenantAnnouncements).values(data).returning();
    return created;
  }

  async updateTenantAnnouncement(
    id: number,
    tenantId: number,
    data: Partial<InsertTenantAnnouncement>,
  ): Promise<TenantAnnouncement | undefined> {
    const { tenantId: _t, ...rest } = data as any;
    const [updated] = await db
      .update(tenantAnnouncements)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(tenantAnnouncements.id, id), eq(tenantAnnouncements.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteTenantAnnouncement(id: number, tenantId: number): Promise<void> {
    await db
      .delete(tenantAnnouncements)
      .where(and(eq(tenantAnnouncements.id, id), eq(tenantAnnouncements.tenantId, tenantId)));
  }

  async getTestimonials(
    tenantId: number,
    filters?: { status?: TestimonialStatus; locationId?: number },
  ): Promise<Testimonial[]> {
    const conditions: SQL[] = [eq(testimonials.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(testimonials.status, filters.status));
    if (filters?.locationId !== undefined) conditions.push(eq(testimonials.locationId, filters.locationId));
    return db
      .select()
      .from(testimonials)
      .where(and(...conditions))
      .orderBy(testimonials.sortOrder, desc(testimonials.id));
  }

  async getTestimonial(id: number): Promise<Testimonial | undefined> {
    const [row] = await db.select().from(testimonials).where(eq(testimonials.id, id));
    return row;
  }

  async createTestimonial(data: InsertTestimonial): Promise<Testimonial> {
    const [created] = await db.insert(testimonials).values(data).returning();
    return created;
  }

  async updateTestimonial(
    id: number,
    tenantId: number,
    data: Partial<InsertTestimonial> & { approvedByUserId?: string | null; approvedAt?: Date | null },
  ): Promise<Testimonial> {
    const [updated] = await db
      .update(testimonials)
      .set(data)
      .where(and(eq(testimonials.id, id), eq(testimonials.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteTestimonial(id: number, tenantId: number): Promise<void> {
    await db.delete(testimonials).where(and(eq(testimonials.id, id), eq(testimonials.tenantId, tenantId)));
  }

  async listPublicTestimonials(
    tenantId: number,
    opts?: { locationId?: number; featured?: boolean },
  ): Promise<PublicTestimonial[]> {
    const statusCondition = opts?.featured
      ? eq(testimonials.status, "featured")
      : inArray(testimonials.status, ["approved", "featured"]);
    const conditions = [eq(testimonials.tenantId, tenantId), statusCondition];
    if (opts?.locationId !== undefined) {
      const locFilter = or(
        eq(testimonials.locationId, opts.locationId),
        sql`${testimonials.locationId} IS NULL`,
      );
      if (locFilter) conditions.push(locFilter);
    }
    return db
      .select({
        id: testimonials.id,
        name: testimonials.name,
        rating: testimonials.rating,
        quote: testimonials.quote,
        photoUrl: testimonials.photoUrl,
        videoUrl: testimonials.videoUrl,
        source: testimonials.source,
        status: testimonials.status,
        locationId: testimonials.locationId,
        sortOrder: testimonials.sortOrder,
        approvedAt: testimonials.approvedAt,
      })
      .from(testimonials)
      .where(and(...conditions))
      .orderBy(testimonials.sortOrder, desc(testimonials.id));
  }

  async getFaqs(tenantId: number): Promise<Faq[]> {
    return db
      .select()
      .from(faqs)
      .where(eq(faqs.tenantId, tenantId))
      .orderBy(faqs.category, faqs.sortOrder, faqs.id);
  }

  async createFaq(data: InsertFaq): Promise<Faq> {
    const [created] = await db.insert(faqs).values(data).returning();
    return created;
  }

  async updateFaq(id: number, tenantId: number, data: Partial<InsertFaq>): Promise<Faq> {
    const [updated] = await db
      .update(faqs)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(faqs.id, id), eq(faqs.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteFaq(id: number, tenantId: number): Promise<void> {
    await db.delete(faqs).where(and(eq(faqs.id, id), eq(faqs.tenantId, tenantId)));
  }
}

export const storage = new DatabaseStorage();
