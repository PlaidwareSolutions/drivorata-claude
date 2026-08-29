import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  GraduationCap,
  BookOpen,
  Car,
  Calendar,
  Clock,
  MapPin,
  ArrowUp,
  ArrowDown,
  CreditCard,
  User,
  Mail,
  Phone,
  Cake,
  Users,
  Pencil,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BtwScheduler } from "@/components/admin/btw-scheduler";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface StudentDetailData {
  enrollments: any[];
  bookings: any[];
  creditLedger: Record<number, any[]>;
  payments: any[];
  packages: any[];
  locations: any[];
}

const statusLabels: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Awaiting Payment",
  confirmed: "Confirmed",
  active: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
};

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "confirmed":
    case "active":
      return "default";
    case "in_progress":
      return "secondary";
    case "completed":
      return "default";
    case "cancelled":
    case "expired":
    case "refunded":
      return "destructive";
    default:
      return "outline";
  }
}

function getStatusBadgeClassName(status: string): string {
  if (status === "completed") {
    return "bg-green-600 hover:bg-green-700 text-white border-green-600 no-default-hover-elevate no-default-active-elevate";
  }
  return "";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDob(dob: string | null | undefined): string | null {
  if (!dob) return null;
  // Accept YYYY-MM-DD or ISO; render in local without timezone shift for plain dates.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  const d = new Date(dob);
  return isNaN(d.getTime()) ? dob : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  let birth: Date | null = null;
  if (m) birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  else {
    const d = new Date(dob);
    if (!isNaN(d.getTime())) birth = d;
  }
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const md = today.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

type ContactFields = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
};

function resolveContact(enrollments: any[]): ContactFields & { sourceEnrollmentId: number | null } {
  const sorted = [...enrollments].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  const pick = (key: keyof ContactFields): string => {
    for (const e of sorted) {
      const v = e?.[key];
      if (v != null && String(v).trim() !== "") return String(v);
    }
    return "";
  };
  return {
    firstName: pick("firstName"),
    lastName: pick("lastName"),
    email: pick("email"),
    phone: pick("phone"),
    dateOfBirth: pick("dateOfBirth"),
    parentName: pick("parentName"),
    parentEmail: pick("parentEmail"),
    parentPhone: pick("parentPhone"),
    sourceEnrollmentId: sorted[0]?.id ?? null,
  };
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const reasonLabels: Record<string, string> = {
  PACKAGE_GRANT: "Package Grant",
  SESSION_CONSUME: "Session Booking",
  ADJUSTMENT: "Manual Adjustment",
  REFUND_REVERSAL: "Refund Reversal",
  BOOKING_CANCEL: "Booking Cancelled",
};

const bookingStatusLabels: Record<string, string> = {
  BOOKED: "Booked",
  ATTENDED: "Attended",
  NO_SHOW: "No Show",
  CANCELLED: "Cancelled",
};

function getBookingBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ATTENDED":
      return "default";
    case "BOOKED":
      return "secondary";
    case "NO_SHOW":
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export default function StudentDetailPage() {
  const { currentTenant, hasAnyRole } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const [, params] = useRoute("/admin/students/:userId");
  const userId = params?.userId;
  const { toast } = useToast();
  const canEditContact = hasAnyRole("tenant_admin", "office_manager");
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading } = useQuery<StudentDetailData>({
    queryKey: ["/api/tenants", tenantId, "students", userId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/students/${userId}/detail`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch student detail");
      return res.json();
    },
    enabled: !!tenantId && !!userId,
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data || data.enrollments.length === 0) {
    return (
      <div className="p-6">
        <Link href="/admin/enrollments">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-enrollments">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Enrollments
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <User className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-base font-medium">Student not found</p>
            <p className="text-sm">No enrollment data found for this student.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const packageMap = new Map(data.packages.map((p: any) => [p.id, p]));
  const locationMap = new Map(data.locations.map((l: any) => [l.id, l]));
  const contact = resolveContact(data.enrollments);
  const student = { firstName: contact.firstName, lastName: contact.lastName, email: contact.email };
  const dobLabel = formatDob(contact.dateOfBirth);
  const age = calcAge(contact.dateOfBirth);
  const hasParentInfo = !!(contact.parentName || contact.parentEmail || contact.parentPhone);

  return (
    <div className="p-6">
      <Link href="/admin/enrollments">
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-enrollments">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Enrollments
        </Button>
      </Link>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Avatar className="h-12 w-12">
          <AvatarFallback className="text-lg">
            {(student.firstName?.[0] || "").toUpperCase()}{(student.lastName?.[0] || "").toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-student-detail-name">
            {student.firstName} {student.lastName}
          </h1>
          <p className="text-sm text-muted-foreground" data-testid="text-student-detail-email">{student.email}</p>
        </div>
      </div>

      <Card className="mb-6" data-testid="card-student-contact">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Contact information
          </CardTitle>
          {canEditContact && contact.sourceEnrollmentId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              data-testid="button-edit-contact"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className={`grid gap-6 ${hasParentInfo ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Student</p>
              <ContactRow icon={Mail} label="Email" value={contact.email}
                href={contact.email ? `mailto:${contact.email}` : undefined}
                testId="text-contact-student-email" />
              <ContactRow icon={Phone} label="Phone" value={contact.phone}
                href={contact.phone ? `tel:${contact.phone}` : undefined}
                testId="text-contact-student-phone" />
              <ContactRow icon={Cake} label="Date of birth"
                value={dobLabel ? `${dobLabel}${age != null ? ` (${age} yrs)` : ""}` : ""}
                testId="text-contact-student-dob" />
            </div>
            {hasParentInfo && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-2">
                  <Users className="h-3 w-3" />
                  Parent / Guardian
                </p>
                <ContactRow icon={User} label="Name" value={contact.parentName}
                  testId="text-contact-parent-name" />
                <ContactRow icon={Mail} label="Email" value={contact.parentEmail}
                  href={contact.parentEmail ? `mailto:${contact.parentEmail}` : undefined}
                  testId="text-contact-parent-email" />
                <ContactRow icon={Phone} label="Phone" value={contact.parentPhone}
                  href={contact.parentPhone ? `tel:${contact.parentPhone}` : undefined}
                  testId="text-contact-parent-phone" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {canEditContact && contact.sourceEnrollmentId && tenantId && (
        <EditContactDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          tenantId={tenantId}
          enrollmentId={contact.sourceEnrollmentId}
          studentUserId={userId}
          initial={contact}
          onSaved={() => {
            toast({ title: "Contact updated" });
            setEditOpen(false);
          }}
        />
      )}

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-4 flex items-center gap-3">
            <GraduationCap className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Enrollments</p>
              <p className="text-xl font-bold" data-testid="text-stat-enrollments">{data.enrollments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Bookings</p>
              <p className="text-xl font-bold" data-testid="text-stat-bookings">{data.bookings.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[140px]">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Payments</p>
              <p className="text-xl font-bold" data-testid="text-stat-payments">{data.payments.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="enrollments" className="space-y-4">
        <TabsList data-testid="tabs-student-detail">
          <TabsTrigger value="enrollments" data-testid="tab-enrollments">
            Enrollments ({data.enrollments.length})
          </TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tab-bookings">
            Bookings ({data.bookings.length})
          </TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments">
            Payments ({data.payments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enrollments" className="space-y-4">
          {data.enrollments.map((enrollment: any) => {
            const pkg = packageMap.get(enrollment.packageId);
            const loc = locationMap.get(enrollment.locationId);
            const credits = data.creditLedger[enrollment.id] || [];
            const totalClassroom = pkg?.creditClassroom ?? 0;
            const totalDrive = pkg?.creditDrive ?? 0;
            const remainClassroom = enrollment.creditClassroom ?? 0;
            const remainDrive = enrollment.creditDrive ?? 0;

            return (
              <Card key={enrollment.id} data-testid={`card-enrollment-${enrollment.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base" data-testid={`text-enrollment-package-${enrollment.id}`}>
                      {pkg?.name || (enrollment.packageId ? `Package #${enrollment.packageId}` : "Online Course")}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {loc?.name || "No location"} | Enrolled {formatDate(enrollment.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant={getStatusBadgeVariant(enrollment.status)}
                    className={getStatusBadgeClassName(enrollment.status)}
                    data-testid={`badge-enrollment-status-${enrollment.id}`}
                  >
                    {statusLabels[enrollment.status] || enrollment.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-6 flex-wrap">
                    {(totalClassroom > 0 || remainClassroom > 0) && (
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Classroom: <span className="font-medium">{remainClassroom}</span>
                          {totalClassroom > 0 && <span className="text-muted-foreground"> / {totalClassroom}</span>}
                        </span>
                      </div>
                    )}
                    {(totalDrive > 0 || remainDrive > 0) && (
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Drive: <span className="font-medium">{remainDrive}</span>
                          {totalDrive > 0 && <span className="text-muted-foreground"> / {totalDrive}</span>}
                        </span>
                      </div>
                    )}
                    {pkg?.price != null && (
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">${(pkg.price / 100).toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  {credits.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Credit History</p>
                      <div className="space-y-1.5">
                        {credits.slice(0, 5).map((entry: any) => (
                          <div key={entry.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                            <div className="flex items-center gap-2">
                              {entry.delta > 0 ? (
                                <ArrowUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 text-destructive" />
                              )}
                              <span>
                                {entry.delta > 0 ? "+" : ""}{entry.delta} {entry.type}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {reasonLabels[entry.reason] || entry.reason}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {entry.createdAt ? formatDate(entry.createdAt) : ""}
                            </span>
                          </div>
                        ))}
                        {credits.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center py-1">
                            + {credits.length - 5} more entries
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {enrollment.notes && (
                    <p className="text-sm text-muted-foreground italic">Notes: {enrollment.notes}</p>
                  )}

                  {tenantId && <BtwScheduler tenantId={tenantId} enrollmentId={enrollment.id} />}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="bookings">
          {data.bookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-base font-medium">No bookings yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="table-student-bookings">
                    <thead>
                      <tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Session</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Date & Time</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Location</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium hidden lg:table-cell">Booked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bookings.map((booking: any) => {
                        const session = booking.session;
                        const loc = session ? locationMap.get(session.locationId) : null;
                        return (
                          <tr
                            key={booking.id}
                            className="border-b last:border-b-0"
                            data-testid={`row-booking-${booking.id}`}
                          >
                            <td className="px-4 py-3">
                              {session ? (
                                <Link
                                  href={
                                    booking.packageId && booking.offeringId
                                      ? `/admin/packages/${booking.packageId}/cohorts/${booking.offeringId}/sessions/${session.id}`
                                      : `/admin/sessions/${session.id}`
                                  }
                                  className="text-sm font-medium hover:underline text-foreground"
                                  data-testid={`link-session-${session.id}`}
                                >
                                  Session #{session.id}
                                </Link>
                              ) : (
                                <span className="text-sm text-muted-foreground">Session #{booking.sessionId}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-xs">
                                {session?.type || "N/A"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {session ? (
                                <div>
                                  <p className="text-sm">{formatDate(session.startAt)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatTime(session.startAt)} - {formatTime(session.endAt)}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">--</span>
                              )}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="text-sm text-muted-foreground">
                                {loc?.name || "--"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={getBookingBadgeVariant(booking.status)}>
                                {bookingStatusLabels[booking.status] || booking.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 hidden lg:table-cell">
                              <span className="text-xs text-muted-foreground">
                                {booking.createdAt ? formatDate(booking.createdAt) : "--"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {data.payments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-base font-medium">No payments recorded</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="table-student-payments">
                    <thead>
                      <tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Provider</th>
                        <th className="px-4 py-3 font-medium">Amount</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((payment: any) => (
                        <tr
                          key={payment.id}
                          className="border-b last:border-b-0"
                          data-testid={`row-payment-${payment.id}`}
                        >
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium">{payment.provider || "N/A"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium">
                              ${((payment.amountCents || 0) / 100).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={payment.status === "completed" ? "default" : "outline"}>
                              {payment.status || "unknown"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {payment.createdAt ? formatDate(payment.createdAt) : "--"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  testId,
}: {
  icon: any;
  label: string;
  value: string;
  href?: string;
  testId: string;
}) {
  const empty = !value || value.trim() === "";
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {empty ? (
          <p className="text-sm text-muted-foreground italic" data-testid={testId}>Not on file</p>
        ) : href ? (
          <a href={href} className="text-sm hover:underline break-all" data-testid={testId}>{value}</a>
        ) : (
          <p className="text-sm break-all" data-testid={testId}>{value}</p>
        )}
      </div>
    </div>
  );
}

function EditContactDialog({
  open,
  onOpenChange,
  tenantId,
  enrollmentId,
  studentUserId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: number;
  enrollmentId: number;
  studentUserId: string | undefined;
  initial: ContactFields;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ContactFields>(initial);

  // Re-seed when reopened with new initial values
  const initialKey = JSON.stringify(initial);
  const [seededKey, setSeededKey] = useState(initialKey);
  if (open && seededKey !== initialKey) {
    setForm(initial);
    setSeededKey(initialKey);
  }

  const isoDob = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(form.dateOfBirth || "");
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  })();

  const mutation = useMutation({
    mutationFn: async (payload: Partial<ContactFields>) => {
      return apiRequest("PATCH", `/api/tenants/${tenantId}/enrollments/${enrollmentId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "students", studentUserId, "detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      onSaved();
    },
    onError: (err: any) => {
      toast({
        title: "Could not save changes",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, string | null> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      dateOfBirth: form.dateOfBirth.trim() || null,
      parentName: form.parentName.trim() || null,
      parentEmail: form.parentEmail.trim() || null,
      parentPhone: form.parentPhone.trim() || null,
    };
    mutation.mutate(payload);
  };

  const set = (k: keyof ContactFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit contact information</DialogTitle>
          <DialogDescription>
            Updates apply to the student's most recent enrollment record.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Student</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="contact-firstName">First name</Label>
                <Input id="contact-firstName" value={form.firstName} onChange={set("firstName")} data-testid="input-contact-firstName" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-lastName">Last name</Label>
                <Input id="contact-lastName" value={form.lastName} onChange={set("lastName")} data-testid="input-contact-lastName" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" type="email" value={form.email} onChange={set("email")} data-testid="input-contact-email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" value={form.phone} onChange={set("phone")} data-testid="input-contact-phone" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-dob">Date of birth</Label>
                <Input id="contact-dob" type="date" value={isoDob} onChange={set("dateOfBirth")} data-testid="input-contact-dob" />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Parent / Guardian <span className="normal-case font-normal text-muted-foreground">(leave blank for adult students)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label htmlFor="contact-parentName">Parent name</Label>
                <Input id="contact-parentName" value={form.parentName} onChange={set("parentName")} data-testid="input-contact-parentName" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-parentEmail">Parent email</Label>
                <Input id="contact-parentEmail" type="email" value={form.parentEmail} onChange={set("parentEmail")} data-testid="input-contact-parentEmail" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="contact-parentPhone">Parent phone</Label>
                <Input id="contact-parentPhone" value={form.parentPhone} onChange={set("parentPhone")} data-testid="input-contact-parentPhone" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-contact">
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-contact">
              {mutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
