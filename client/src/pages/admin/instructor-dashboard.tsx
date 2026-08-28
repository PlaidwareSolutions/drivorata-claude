import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MapPin,
  Car,
  Users,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useLocationFilter } from "@/lib/location-filter-context";
import { LocationFilterIndicator } from "@/components/admin/location-filter-indicator";

interface InstructorSession {
  id: number;
  type: string;
  startAt: string;
  endAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
  notes: string | null;
  locationId: number | null;
  vehicleId: number | null;
  locationName: string | null;
  vehicleName: string | null;
}

interface SessionBooking {
  id: number;
  status: string;
  enrollment?: {
    firstName: string;
    lastName: string;
    package?: { name: string } | null;
  };
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTypeBadge(type: string) {
  if (type === "CLASSROOM") return <Badge variant="default" data-testid={`badge-type-classroom`}>CLASSROOM</Badge>;
  return <Badge variant="secondary" data-testid={`badge-type-drive`}>DRIVE</Badge>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "SCHEDULED": return <Badge variant="default" data-testid="badge-status-scheduled">Scheduled</Badge>;
    case "IN_PROGRESS": return <Badge variant="secondary" data-testid="badge-status-in-progress">In Progress</Badge>;
    case "COMPLETED": return <Badge variant="outline" data-testid="badge-status-completed">Completed</Badge>;
    case "CANCELLED": return <Badge variant="destructive" data-testid="badge-status-cancelled">Cancelled</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function getBookingStatusBadge(status: string) {
  switch (status) {
    case "BOOKED": return <Badge variant="default">Booked</Badge>;
    case "ATTENDED": return <Badge variant="outline" data-testid="badge-attended">Attended</Badge>;
    case "NO_SHOW": return <Badge variant="destructive" data-testid="badge-no-show">No Show</Badge>;
    case "CANCELLED": return <Badge variant="outline">Cancelled</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function SessionCard({ session, tenantId }: { session: InstructorSession; tenantId: number }) {
  const { toast } = useToast();

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<SessionBooking[]>({
    queryKey: ["/api/tenants", tenantId, "sessions", session.id, "bookings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/sessions/${session.id}/bookings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: number; status: string }) => {
      return apiRequest("PATCH", `/api/tenants/${tenantId}/bookings/${bookingId}/attendance`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions", session.id, "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "instructor", "sessions"] });
      toast({ title: "Attendance updated" });
    },
    onError: () => {
      toast({ title: "Failed to update attendance", variant: "destructive" });
    },
  });

  return (
    <Card data-testid={`card-session-${session.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span data-testid={`text-session-time-${session.id}`}>
              {formatTime(session.startAt)} - {formatTime(session.endAt)}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {getTypeBadge(session.type)}
            {getStatusBadge(session.status)}
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span data-testid={`text-capacity-${session.id}`}>{session.bookedCount}/{session.capacity} students</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
          {session.locationName && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span data-testid={`text-location-${session.id}`}>{session.locationName}</span>
            </div>
          )}
          {session.type === "DRIVE" && session.vehicleName && (
            <div className="flex items-center gap-1">
              <Car className="h-4 w-4" />
              <span data-testid={`text-vehicle-${session.id}`}>{session.vehicleName}</span>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Student Roster</h4>
          {bookingsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid={`text-no-bookings-${session.id}`}>
              No students booked for this session.
            </p>
          ) : (
            <div className="space-y-2">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between gap-2 flex-wrap rounded-md border p-2"
                  data-testid={`row-booking-${booking.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" data-testid={`text-student-name-${booking.id}`}>
                      {booking.enrollment
                        ? `${booking.enrollment.firstName} ${booking.enrollment.lastName}`
                        : "Unknown Student"}
                    </span>
                    {booking.enrollment?.package && (
                      <span className="text-sm text-muted-foreground" data-testid={`text-package-${booking.id}`}>
                        {booking.enrollment.package.name}
                      </span>
                    )}
                    {getBookingStatusBadge(booking.status)}
                  </div>
                  {booking.status === "BOOKED" && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={attendanceMutation.isPending}
                        onClick={() => attendanceMutation.mutate({ bookingId: booking.id, status: "ATTENDED" })}
                        data-testid={`button-mark-attended-${booking.id}`}
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={attendanceMutation.isPending}
                        onClick={() => attendanceMutation.mutate({ bookingId: booking.id, status: "NO_SHOW" })}
                        data-testid={`button-mark-noshow-${booking.id}`}
                      >
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function InstructorDashboardPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const [selectedDate, setSelectedDate] = useState(getTodayString);

  const { data: sessions = [], isLoading } = useQuery<InstructorSession[]>({
    queryKey: ["/api/tenants", tenantId, "instructor", "sessions", selectedDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/tenants/${tenantId}/instructor/sessions?date=${selectedDate}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!selectedDate,
  });

  const { selectedLocationId } = useLocationFilter();
  const locationFilteredSessions = selectedLocationId
    ? sessions.filter(s => s.locationId === selectedLocationId)
    : sessions;
  const sortedSessions = [...locationFilteredSessions].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">My Sessions</h1>
            <LocationFilterIndicator appliesHere />
          </div>
          <p className="text-muted-foreground" data-testid="text-display-date">
            <Calendar className="inline h-4 w-4 mr-1" />
            {formatDateDisplay(selectedDate)}
          </p>
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-auto"
          data-testid="input-date-selector"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : sortedSessions.length === 0 ? (
        <p className="text-muted-foreground" data-testid="text-no-sessions">
          No sessions scheduled for this date.
        </p>
      ) : (
        <div className="space-y-4">
          {sortedSessions.map((session) => (
            <SessionCard key={session.id} session={session} tenantId={tenantId!} />
          ))}
        </div>
      )}
    </div>
  );
}
