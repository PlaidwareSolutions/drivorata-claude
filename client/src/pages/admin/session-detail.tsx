import { useTenant } from "@/lib/tenant-context";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Car,
  Users,
  BookOpen,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import { useState } from "react";
import { CancelRescheduleDialog } from "@/components/admin/cancel-reschedule-dialog";
import { SessionActivityLog } from "@/components/admin/session-activity-log";
import { Breadcrumbs } from "@/components/breadcrumbs";

interface SessionDetailData {
  session: any;
  instructor: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    role: string;
  } | null;
  location: any | null;
  vehicle: any | null;
  bookings: any[];
}

interface FulfillablePackage {
  id: number;
  name: string;
  classroomHoursRequired: number | null;
  driveHoursRequired: number | null;
}

const sessionStatusLabels: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function getSessionBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "SCHEDULED":
      return "default";
    case "IN_PROGRESS":
      return "secondary";
    case "COMPLETED":
      return "default";
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

function getSessionBadgeClassName(status: string): string {
  if (status === "COMPLETED") {
    return "bg-green-600 hover:bg-green-700 text-white border-green-600 no-default-hover-elevate no-default-active-elevate";
  }
  return "";
}

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

function getBookingBadgeClassName(status: string): string {
  if (status === "ATTENDED") {
    return "bg-green-600 hover:bg-green-700 text-white border-green-600 no-default-hover-elevate no-default-active-elevate";
  }
  return "";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDurationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export default function SessionDetailPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const [, nestedParams] = useRoute("/admin/packages/:id/cohorts/:cid/sessions/:sid");
  const [, legacyParams] = useRoute("/admin/sessions/:sessionId");
  const sessionId = nestedParams?.sid ?? legacyParams?.sessionId;
  const urlPkgId = nestedParams?.id ? parseInt(nestedParams.id) : 0;
  const urlCohortId = nestedParams?.cid ? parseInt(nestedParams.cid) : 0;
  const [reschedOpen, setReschedOpen] = useState(false);

  const { data, isLoading } = useQuery<SessionDetailData>({
    queryKey: ["/api/tenants", tenantId, "sessions", sessionId, "detail"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/sessions/${sessionId}/detail`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch session detail");
      return res.json();
    },
    enabled: !!tenantId && !!sessionId,
  });

  const offeringIdForLookup = nestedParams?.cid ? parseInt(nestedParams.cid) : (data?.session?.offeringId ?? 0);
  const { data: offeringData } = useQuery<any>({
    queryKey: tenantId && offeringIdForLookup
      ? ["/api/tenants", tenantId, "schedule-offerings", offeringIdForLookup]
      : ["__no-offering"],
    enabled: !!tenantId && !!offeringIdForLookup,
  });
  const pkgIdForLookup = urlPkgId || offeringData?.packageId || 0;
  const { data: pkgData } = useQuery<any>({
    queryKey: tenantId && pkgIdForLookup
      ? ["/api/tenants", tenantId, "packages", pkgIdForLookup, "single"]
      : ["__no-pkg"],
    enabled: !!tenantId && !!pkgIdForLookup,
  });

  const { data: fulfillablePackages = [] } = useQuery<FulfillablePackage[]>({
    queryKey: ["/api/tenants", tenantId, "sessions", sessionId, "fulfillable-packages"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/sessions/${sessionId}/fulfillable-packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!sessionId,
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

  if (!data || !data.session) {
    const fallbackHref = urlPkgId && urlCohortId
      ? `/admin/packages/${urlPkgId}/cohorts/${urlCohortId}#sessions`
      : "/admin/calendar";
    return (
      <div className="p-6">
        <Link href={fallbackHref}>
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-schedule">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Cohort
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-base font-medium">Session not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { session, instructor, location, vehicle, bookings } = data;
  const duration = getDurationMinutes(session.startAt, session.endAt);
  const activeBookings = bookings.filter((b: any) => b.status !== "CANCELLED");
  const attendedCount = bookings.filter((b: any) => b.status === "ATTENDED").length;
  const noShowCount = bookings.filter((b: any) => b.status === "NO_SHOW").length;
  const capacityPercent = session.capacity > 0 ? Math.round((activeBookings.length / session.capacity) * 100) : 0;

  const cohortId = urlCohortId || session.offeringId || 0;
  const pkgIdForNav = urlPkgId || offeringData?.packageId || 0;
  const backHref = pkgIdForNav && cohortId
    ? `/admin/packages/${pkgIdForNav}/cohorts/${cohortId}#sessions`
    : "/admin/calendar";

  return (
    <div className="p-6">
      <Breadcrumbs
        items={[
          { label: "Packages", href: "/admin/packages" },
          pkgIdForNav
            ? { label: pkgData?.name ?? "Package", href: `/admin/packages/${pkgIdForNav}` }
            : { label: "Package", href: "/admin/packages" },
          cohortId && pkgIdForNav
            ? { label: offeringData?.name ?? "Cohort", href: `/admin/packages/${pkgIdForNav}/cohorts/${cohortId}` }
            : { label: "Cohort" },
          { label: `${formatDate(session.startAt)} · ${formatTime(session.startAt)}` },
        ]}
      />
      <Link href={backHref}>
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-schedule">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Cohort
        </Button>
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-session-detail-title">
              {session.type === "CLASSROOM" ? "Classroom" : session.type === "BTW_OBSERVATION" ? "BTW Observation" : session.type === "BTW_PRACTICE" ? "BTW Practice" : session.type === "ROAD_TEST" ? "Road Test" : "Drive"} Session #{session.id}
            </h1>
            <Badge
              variant={getSessionBadgeVariant(session.status)}
              className={getSessionBadgeClassName(session.status)}
              data-testid="badge-session-status"
            >
              {sessionStatusLabels[session.status] || session.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-session-date">
            {formatDate(session.startAt)}
          </p>
        </div>
        {session.status !== "CANCELLED" && (
          <Button
            variant="outline"
            onClick={() => setReschedOpen(true)}
            data-testid="button-cancel-reschedule"
          >
            <CalendarClock className="h-4 w-4 mr-2" />
            Cancel & Reschedule
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="text-sm font-medium" data-testid="text-session-time">
                {formatTime(session.startAt)} - {formatTime(session.endAt)}
              </p>
              <p className="text-xs text-muted-foreground">{duration} minutes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="text-sm font-medium" data-testid="text-session-location">
                {location?.name || "Not assigned"}
              </p>
              {location?.address && (
                <p className="text-xs text-muted-foreground">{location.address}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Instructor</p>
              <p className="text-sm font-medium" data-testid="text-session-instructor">
                {instructor ? `${instructor.firstName} ${instructor.lastName}` : "Not assigned"}
              </p>
              {instructor?.phone && (
                <p className="text-xs text-muted-foreground">{instructor.phone}</p>
              )}
            </div>
          </CardContent>
        </Card>
        {(session.type === "DRIVE" || session.type === "BTW_OBSERVATION" || session.type === "BTW_PRACTICE" || session.type === "ROAD_TEST") && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Car className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Vehicle</p>
                <p className="text-sm font-medium" data-testid="text-session-vehicle">
                  {vehicle ? `${vehicle.year || ""} ${vehicle.make} ${vehicle.model}`.trim() : "Not assigned"}
                </p>
                {vehicle?.licensePlate && (
                  <p className="text-xs text-muted-foreground">{vehicle.licensePlate}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base">Capacity</CardTitle>
          <span className="text-sm text-muted-foreground" data-testid="text-session-capacity">
            {activeBookings.length} / {session.capacity} booked
          </span>
        </CardHeader>
        <CardContent>
          <Progress value={capacityPercent} className="h-2" data-testid="progress-capacity" />
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{activeBookings.length} booked</span>
            </div>
            {attendedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span>{attendedCount} attended</span>
              </div>
            )}
            {noShowCount > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span>{noShowCount} no-show</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{session.capacity - activeBookings.length} available</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Student Roster ({bookings.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {bookings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No students booked for this session</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-session-roster">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Package</th>
                    <th className="px-4 py-3 font-medium">Attendance</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Credits Used</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Booked On</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking: any) => {
                    const enrollment = booking.enrollment;
                    const firstName = enrollment?.firstName || "Unknown";
                    const lastName = enrollment?.lastName || "";
                    const initials = `${(firstName[0] || "").toUpperCase()}${(lastName[0] || "").toUpperCase()}`;
                    const packageName = enrollment?.package?.name || `Enrollment #${booking.enrollmentId}`;

                    return (
                      <tr
                        key={booking.id}
                        className="border-b last:border-b-0"
                        data-testid={`row-roster-${booking.id}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            {booking.userId ? (
                              <Link
                                href={`/admin/students/${booking.userId}`}
                                className="text-sm font-medium hover:underline text-foreground"
                                data-testid={`link-roster-student-${booking.id}`}
                              >
                                {firstName} {lastName}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium">{firstName} {lastName}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">{packageName}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={getBookingBadgeVariant(booking.status)}
                            className={getBookingBadgeClassName(booking.status)}
                            data-testid={`badge-attendance-${booking.id}`}
                          >
                            {bookingStatusLabels[booking.status] || booking.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {booking.creditAmount || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {booking.createdAt ? formatShortDate(booking.createdAt) : "--"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Fulfillable Packages ({fulfillablePackages.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fulfillablePackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">This session does not currently fulfill any package's required hours.</p>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="list-fulfillable-packages">
              {fulfillablePackages.map((p) => (
                <Link key={p.id} href={`/admin/packages/${p.id}`}>
                  <Badge variant="outline" className="hover-elevate cursor-pointer" data-testid={`badge-fulfillable-${p.id}`}>
                    {p.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Students enrolled in these packages can book this session and have it deduct from their credit balance.
          </p>
        </CardContent>
      </Card>

      {session.notes && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-session-notes">{session.notes}</p>
          </CardContent>
        </Card>
      )}

      {tenantId && sessionId && (
        <SessionActivityLog tenantId={tenantId} sessionId={Number(sessionId)} />
      )}

      {tenantId && (
        <CancelRescheduleDialog
          tenantId={tenantId}
          session={session}
          bookings={bookings || []}
          open={reschedOpen}
          onOpenChange={setReschedOpen}
        />
      )}
    </div>
  );
}
