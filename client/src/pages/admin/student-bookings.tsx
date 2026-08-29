import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  BookOpen,
  XCircle,
  CheckCircle,
} from "lucide-react";
import { useState, useMemo } from "react";
import type { Location } from "@shared/schema";

interface EnrichedEnrollment {
  id: number;
  packageId: number;
  status: string;
  package?: { name: string } | null;
  creditClassroom: number;
  creditDrive: number;
}

interface AvailableSession {
  id: number;
  type: string;
  startAt: string;
  endAt: string;
  capacity: number;
  bookedCount: number;
  locationId: number | null;
  instructorId: string | null;
  instructorName?: string;
  locationName?: string;
}

interface StudentBooking {
  id: number;
  status: string;
  sessionId: number;
  enrollmentId: number;
  session?: {
    id: number;
    type: string;
    startAt: string;
    endAt: string;
    locationId: number | null;
    instructorId: string | null;
    instructorName?: string;
    locationName?: string;
  };
}

function formatSessionDateTime(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dayStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dayStr} \u2022 ${startTime} - ${endTime}`;
}

export default function StudentBookingsPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>("");
  const [filterType, setFilterType] = useState("ALL");
  const [filterLocation, setFilterLocation] = useState("ALL");

  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery<EnrichedEnrollment[]>({
    queryKey: ["/api/tenants", tenantId, "student", "enrollments"],
    enabled: !!tenantId,
  });

  const { data: availableSessions = [], isLoading: sessionsLoading } = useQuery<AvailableSession[]>({
    queryKey: ["/api/tenants", tenantId, "student", "available-sessions"],
    enabled: !!tenantId,
  });

  const { data: studentBookings = [], isLoading: bookingsLoading } = useQuery<StudentBooking[]>({
    queryKey: ["/api/tenants", tenantId, "student", "bookings"],
    enabled: !!tenantId,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    enabled: !!tenantId,
  });

  const selectedEnrollment = useMemo(() => {
    if (!selectedEnrollmentId) return enrollments.length === 1 ? enrollments[0] : null;
    return enrollments.find((e) => String(e.id) === selectedEnrollmentId) || null;
  }, [enrollments, selectedEnrollmentId]);

  const effectiveEnrollmentId = selectedEnrollment?.id;

  const filteredSessions = useMemo(() => {
    return availableSessions.filter((s) => {
      if (filterType !== "ALL" && s.type !== filterType) return false;
      if (filterLocation !== "ALL" && String(s.locationId) !== filterLocation) return false;
      return true;
    });
  }, [availableSessions, filterType, filterLocation]);

  const sortedBookings = useMemo(() => {
    return [...studentBookings].sort((a, b) => {
      const dateA = a.session?.startAt ? new Date(a.session.startAt).getTime() : 0;
      const dateB = b.session?.startAt ? new Date(b.session.startAt).getTime() : 0;
      return dateA - dateB;
    });
  }, [studentBookings]);

  const bookMutation = useMutation({
    mutationFn: async ({ sessionId, enrollmentId }: { sessionId: number; enrollmentId: number }) => {
      return apiRequest("POST", `/api/tenants/${tenantId}/bookings`, { sessionId, enrollmentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "student", "available-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "student", "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "student", "enrollments"] });
      toast({ title: "Session booked!" });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to book session", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: number) => {
      return apiRequest("POST", `/api/tenants/${tenantId}/bookings/${bookingId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "student", "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "student", "available-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "student", "enrollments"] });
      toast({ title: "Booking cancelled. Credits will be restored if within the cancellation window." });
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Failed to cancel booking", variant: "destructive" });
    },
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  const cancellationWindowHours = currentTenant.tenant.cancellationWindowHours ?? 24;

  const getTypeBadge = (type: string) => {
    if (type === "CLASSROOM") return <Badge variant="default">CLASSROOM</Badge>;
    return <Badge variant="secondary">DRIVE</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "BOOKED": return <Badge variant="default">BOOKED</Badge>;
      case "CANCELLED": return <Badge variant="destructive">CANCELLED</Badge>;
      case "ATTENDED": return <Badge variant="outline">ATTENDED</Badge>;
      case "NO_SHOW": return <Badge variant="destructive">NO_SHOW</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canBook = (sessionType: string) => {
    if (!selectedEnrollment) return false;
    if (sessionType === "CLASSROOM") return selectedEnrollment.creditClassroom > 0;
    if (sessionType === "DRIVE") return selectedEnrollment.creditDrive > 0;
    return false;
  };

  return (
    <div className="p-6">
      <Tabs defaultValue="available">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Book a Session</h1>
          <TabsList>
            <TabsTrigger value="available" data-testid="tab-available-sessions">Available Sessions</TabsTrigger>
            <TabsTrigger value="bookings" data-testid="tab-my-bookings">My Bookings</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="available">
          {enrollmentsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : enrollments.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground" data-testid="text-no-enrollments">
                  You don't have any active enrollments. Contact your driving school to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {enrollments.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-muted-foreground">Enrollment:</span>
                  <Select
                    value={selectedEnrollmentId || (enrollments.length === 1 ? String(enrollments[0].id) : "")}
                    onValueChange={setSelectedEnrollmentId}
                  >
                    <SelectTrigger className="w-[280px]" data-testid="select-enrollment">
                      <SelectValue placeholder="Select enrollment" />
                    </SelectTrigger>
                    <SelectContent>
                      {enrollments.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.package?.name || `Enrollment #${e.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedEnrollment && (
                <div className="flex items-center gap-2 flex-wrap" data-testid="credit-summary">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{selectedEnrollment.package?.name || "Package"}</span>
                  <Badge variant="outline">Classroom Credits: {selectedEnrollment.creditClassroom} remaining</Badge>
                  <Badge variant="outline">Drive Credits: {selectedEnrollment.creditDrive} remaining</Badge>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[140px]" data-testid="filter-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="CLASSROOM">Classroom</SelectItem>
                    <SelectItem value="DRIVE">Drive</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterLocation} onValueChange={setFilterLocation}>
                  <SelectTrigger className="w-[180px]" data-testid="filter-location">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Locations</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {sessionsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : filteredSessions.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-muted-foreground" data-testid="text-no-sessions">
                      No available sessions match your filters.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredSessions.map((session) => (
                    <Card key={session.id} data-testid={`card-session-${session.id}`}>
                      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                        <div className="space-y-1">
                          {getTypeBadge(session.type)}
                          <CardTitle className="text-base mt-1" data-testid={`text-session-date-${session.id}`}>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {formatSessionDateTime(session.startAt, session.endAt)}
                            </div>
                          </CardTitle>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              disabled={!canBook(session.type) || bookMutation.isPending}
                              data-testid={`button-book-session-${session.id}`}
                            >
                              Book
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Book this session?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will use 1 {session.type.toLowerCase()} credit.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  if (effectiveEnrollmentId) {
                                    bookMutation.mutate({ sessionId: session.id, enrollmentId: effectiveEnrollmentId });
                                  }
                                }}
                                data-testid={`button-confirm-book-${session.id}`}
                              >
                                Confirm
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1 flex-wrap">
                            <User className="h-4 w-4" />
                            <span data-testid={`text-session-instructor-${session.id}`}>
                              {session.instructorName || "Instructor TBD"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <MapPin className="h-4 w-4" />
                            <span data-testid={`text-session-location-${session.id}`}>
                              {session.locationName || "Location TBD"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Clock className="h-4 w-4" />
                            <span data-testid={`text-session-spots-${session.id}`}>
                              {session.capacity - session.bookedCount} of {session.capacity} spots available
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bookings">
          {bookingsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : sortedBookings.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <p className="text-muted-foreground" data-testid="text-no-bookings">
                  You haven't booked any sessions yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedBookings.map((booking) => (
                <Card key={booking.id} data-testid={`card-booking-${booking.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {booking.session && getTypeBadge(booking.session.type)}
                        {getStatusBadge(booking.status)}
                      </div>
                      {booking.session && (
                        <CardTitle className="text-base mt-1" data-testid={`text-booking-date-${booking.id}`}>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatSessionDateTime(booking.session.startAt, booking.session.endAt)}
                          </div>
                        </CardTitle>
                      )}
                    </div>
                    {booking.status === "BOOKED" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-cancel-booking-${booking.id}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Credits will be restored if cancelled more than {cancellationWindowHours} hours before the session.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => cancelMutation.mutate(booking.id)}
                              data-testid={`button-confirm-cancel-${booking.id}`}
                            >
                              Cancel Booking
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </CardHeader>
                  {booking.session && (
                    <CardContent>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1 flex-wrap">
                          <User className="h-4 w-4" />
                          <span data-testid={`text-booking-instructor-${booking.id}`}>
                            {booking.session.instructorName || "Instructor TBD"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <MapPin className="h-4 w-4" />
                          <span data-testid={`text-booking-location-${booking.id}`}>
                            {booking.session.locationName || "Location TBD"}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
