import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation as useWouterLocation, useSearch, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import ScheduleOfferingsPage from "@/components/admin/cohorts-manager";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Calendar,
  Plus,
  Clock,
  MapPin,
  User,
  Car,
  Users,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle,
  XCircle,
  CalendarDays,
  Pencil,
  AlertTriangle,
  ExternalLink,
  LayoutGrid,
  Table as TableIcon,
  Package as PackageIcon,
  Boxes,
  Search,
  X,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import type { ScheduleSession, Location, Vehicle, ScheduleOffering, Package } from "@shared/schema";
import { useLocationFilter } from "@/lib/location-filter-context";
import { LocationFilterIndicator } from "@/components/admin/location-filter-indicator";
import { BulkAssignInstructorDialog } from "@/components/admin/bulk-assign-instructor-dialog";

interface Instructor {
  id: string;
  name: string;
  email: string;
  instructorType: "CLASSROOM" | "DRIVE" | "BOTH";
  instructorTypeByLocation: Record<string, "CLASSROOM" | "DRIVE" | "BOTH"> | null;
  locationScope: number[] | "ALL";
}

interface BookingEntry {
  id: number;
  status: string;
  enrollmentId: number;
  enrollment?: {
    firstName: string;
    lastName: string;
    package?: { name: string } | null;
  };
}

const sessionFormSchema = z.object({
  type: z.enum(["CLASSROOM", "DRIVE"]),
  instructorId: z.string().optional().or(z.literal("")),
  locationId: z.coerce.number().min(1, "Location is required"),
  vehicleId: z.union([z.coerce.number(), z.literal(""), z.nan()]).optional(),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
  notes: z.string().optional().or(z.literal("")),
  recurrenceWeeks: z.union([z.coerce.number().int().min(0), z.literal(""), z.nan()]).optional(),
});

type SessionFormValues = z.infer<typeof sessionFormSchema>;

const defaultFormValues: SessionFormValues = {
  type: "CLASSROOM",
  instructorId: "",
  locationId: "" as any,
  vehicleId: "",
  date: "",
  startTime: "",
  endTime: "",
  capacity: 20,
  notes: "",
  recurrenceWeeks: "",
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function getInstructorName(instructorId: string | null | undefined, instructors: Instructor[]): string {
  if (!instructorId) return "Unassigned";
  const inst = instructors.find((i) => i.id === instructorId);
  return inst?.name || "Unknown";
}

function getLocationName(locationId: number | null | undefined, locations: Location[]): string {
  if (!locationId) return "";
  const loc = locations.find((l) => l.id === locationId);
  return loc?.name || "";
}

function getVehicleName(vehicleId: number | null | undefined, vehicles: Vehicle[]): string {
  if (!vehicleId) return "";
  const v = vehicles.find((veh) => veh.id === vehicleId);
  return v?.name || "";
}

export default function SchedulePage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [, navigate] = useWouterLocation();
  const tenantId = currentTenant?.tenant.id;

  const { selectedLocationId } = useLocationFilter();
  const search = useSearch();
  const offeringIdFilter = useMemo(() => {
    const params = new URLSearchParams(search);
    const v = params.get("offeringId");
    return v && /^\d+$/.test(v) ? Number(v) : null;
  }, [search]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editSessionId, setEditSessionId] = useState<number | null>(null);
  const [viewBookingsSessionId, setViewBookingsSessionId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState("ALL");
  const [filterLocation, setFilterLocation] = useState("ALL");

  useEffect(() => {
    setFilterLocation(selectedLocationId !== null ? String(selectedLocationId) : "ALL");
  }, [selectedLocationId]);

  // Open the Create Session dialog automatically when the dashboard's Quick
  // Action deep-links here with ?create=1, then strip the param so reloads
  // don't re-open the dialog.
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("create") === "1") {
      setCreateDialogOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("create");
      window.history.replaceState({}, "", url.toString());
    }
  }, [search]);

  const [manageOfferingsOpen, setManageOfferingsOpen] = useState(false);
  const [offeringsCreateOnOpen, setOfferingsCreateOnOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("manageOfferings") === "1") {
      setOfferingsCreateOnOpen(params.get("new") === "1" || params.get("create") === "1");
      setManageOfferingsOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("manageOfferings");
      url.searchParams.delete("new");
      url.searchParams.delete("create");
      window.history.replaceState({}, "", url.toString());
    }
  }, [search]);
  const [filterInstructor, setFilterInstructor] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPackageId, setFilterPackageId] = useState("ALL");
  const [filterOfferingId, setFilterOfferingId] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionsViewMode, setSessionsViewMode] = useState<"cards" | "table">("cards");
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getMonday(new Date()));
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("week");
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [currentDay, setCurrentDay] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [currentMonth, setCurrentMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>("");
  const [enrollmentSearch, setEnrollmentSearch] = useState("");

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<ScheduleSession[]>({
    queryKey: ["/api/tenants", tenantId, "sessions"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/sessions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: offerings = [] } = useQuery<ScheduleOffering[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/schedule-offerings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch offerings");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: packages = [] } = useQuery<Package[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch packages");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const offeringById = useMemo(() => {
    const m = new Map<number, ScheduleOffering>();
    for (const o of offerings) m.set(o.id, o);
    return m;
  }, [offerings]);

  const packageById = useMemo(() => {
    const m = new Map<number, Package>();
    for (const p of packages) m.set(p.id, p);
    return m;
  }, [packages]);

  function getOfferingForSession(s: ScheduleSession): ScheduleOffering | null {
    return s.offeringId ? offeringById.get(s.offeringId) ?? null : null;
  }

  function getPackageForSession(s: ScheduleSession): Package | null {
    const off = getOfferingForSession(s);
    return off?.packageId ? packageById.get(off.packageId) ?? null : null;
  }

  const { data: instructors = [] } = useQuery<Instructor[]>({
    queryKey: ["/api/tenants", tenantId, "instructors"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/instructors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ["/api/tenants", tenantId, "vehicles"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/vehicles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<BookingEntry[]>({
    queryKey: ["/api/tenants", tenantId, "sessions", viewBookingsSessionId, "bookings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/sessions/${viewBookingsSessionId}/bookings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!viewBookingsSessionId,
  });

  interface EligibleEnrollment {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
    classroomHoursCompleted?: number;
    drivingHoursCompleted?: number;
    packageId?: number;
    packageSnapshotJson?: { name?: string; classroomHoursRequired?: number; driveHoursRequired?: number } | null;
    package?: { name: string; classroomHours?: number; driveHours?: number } | null;
  }

  const { data: allEnrollments = [], isLoading: enrollmentsLoading } = useQuery<EligibleEnrollment[]>({
    queryKey: ["/api/tenants", tenantId, "enrollments", "all-for-booking"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/enrollments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && addStudentOpen,
  });

  const viewBookingsSession = sessions.find((s) => s.id === viewBookingsSessionId);

  const bookableStatuses = ["confirmed", "active", "in_progress"];

  const enrollmentsWithEligibility = useMemo(() => {
    const sessionType = viewBookingsSession?.type;
    return allEnrollments
      .filter((e) => {
        if (!bookableStatuses.includes(e.status)) return false;
        const snapshot = e.packageSnapshotJson;
        const classroomRequired = snapshot?.classroomHoursRequired ?? 0;
        const driveRequired = snapshot?.driveHoursRequired ?? 0;
        const isDriveType = sessionType === "DRIVE" || sessionType === "BTW_OBSERVATION" || sessionType === "BTW_PRACTICE" || sessionType === "ROAD_TEST";
        if (sessionType === "CLASSROOM" && classroomRequired <= 0) return false;
        if (isDriveType && driveRequired <= 0) return false;
        return true;
      })
      .map((e) => {
        let blockReason: string | null = null;
        let blockType: "credits" | null = null;
        const snapshot = e.packageSnapshotJson;
        const classroomRequired = snapshot?.classroomHoursRequired ?? 0;
        const driveRequired = snapshot?.driveHoursRequired ?? 0;
        const classroomRemaining = Math.max(0, classroomRequired - (e.classroomHoursCompleted ?? 0));
        const driveRemaining = Math.max(0, driveRequired - (e.drivingHoursCompleted ?? 0));

        const isDriveType2 = sessionType === "DRIVE" || sessionType === "BTW_OBSERVATION" || sessionType === "BTW_PRACTICE" || sessionType === "ROAD_TEST";
        if (sessionType === "CLASSROOM" && classroomRemaining <= 0) {
          blockReason = "No classroom credits";
          blockType = "credits";
        } else if (isDriveType2 && driveRemaining <= 0) {
          blockReason = "No drive credits";
          blockType = "credits";
        }
        return { ...e, blockReason, blockType };
      });
  }, [allEnrollments, viewBookingsSession?.type]);

  const filteredEnrollments = useMemo(() => {
    let filtered = enrollmentsWithEligibility;
    if (enrollmentSearch.trim()) {
      const q = enrollmentSearch.toLowerCase();
      filtered = filtered.filter((e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => {
      const aBlocked = !!a.blockType;
      const bBlocked = !!b.blockType;
      if (aBlocked && !bBlocked) return 1;
      if (!aBlocked && bBlocked) return -1;
      return 0;
    });
  }, [enrollmentsWithEligibility, enrollmentSearch]);

  const { data: selectedEnrollmentBalance } = useQuery<{ classroom: number; drive: number }>({
    queryKey: ["/api/tenants", tenantId, "enrollments", selectedEnrollmentId, "credit-balance"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/enrollments/${selectedEnrollmentId}/credit-balance`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!selectedEnrollmentId,
  });

  const { data: sessionFulfillablePackages = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/tenants", tenantId, "sessions", viewBookingsSessionId, "fulfillable-packages"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/sessions/${viewBookingsSessionId}/fulfillable-packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!viewBookingsSessionId,
  });

  const adminBookingMutation = useMutation({
    mutationFn: async ({ sessionId, enrollmentId }: { sessionId: number; enrollmentId: number }) => {
      return apiRequest("POST", `/api/tenants/${tenantId}/admin-bookings`, { sessionId, enrollmentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions", viewBookingsSessionId, "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments", "all-for-booking"] });
      toast({ title: "Student booked into session" });
      setSelectedEnrollmentId("");
      setAddStudentOpen(false);
      setEnrollmentSearch("");
    },
    onError: (error: any) => {
      let msg = "Failed to book student";
      try {
        const text = error?.message || "";
        const jsonStart = text.indexOf("{");
        if (jsonStart >= 0) {
          const parsed = JSON.parse(text.slice(jsonStart));
          msg = parsed.message || msg;
        }
      } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const createForm = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: defaultFormValues,
  });

  const watchType = createForm.watch("type");
  const watchInstructorId = createForm.watch("instructorId");
  const watchLocationId = createForm.watch("locationId");

  function getEffectiveType(inst: Instructor, locationId?: string | number): "CLASSROOM" | "DRIVE" | "BOTH" {
    const locId = locationId ? String(locationId) : "";
    return (inst.instructorTypeByLocation && locId && inst.instructorTypeByLocation[locId])
      || inst.instructorType
      || "BOTH";
  }

  function instructorCanTeachType(inst: Instructor, sessionType: string): boolean {
    if (inst.locationScope === "ALL") {
      const defaultType = inst.instructorType || "BOTH";
      if (defaultType === "BOTH" || defaultType === sessionType) return true;
      if (inst.instructorTypeByLocation) {
        return Object.values(inst.instructorTypeByLocation).some(t => t === "BOTH" || t === sessionType);
      }
      return false;
    }
    const scopeIds = inst.locationScope as number[];
    return scopeIds.some(locId => {
      const eff = getEffectiveType(inst, locId);
      return eff === "BOTH" || eff === sessionType;
    });
  }

  function instructorTeachesAtLocation(inst: Instructor, locationId: number): boolean {
    if (inst.locationScope === "ALL") return true;
    return (inst.locationScope as number[]).includes(locationId);
  }

  const filteredInstructors = useMemo(() => {
    return instructors.filter(inst => instructorCanTeachType(inst, watchType));
  }, [instructors, watchType]);

  const selectedInstructor = useMemo(() => {
    if (!watchInstructorId) return null;
    return instructors.find(i => i.id === watchInstructorId) || null;
  }, [instructors, watchInstructorId]);

  const filteredLocations = useMemo(() => {
    if (!selectedInstructor) return locations;
    return locations.filter(loc => {
      if (!instructorTeachesAtLocation(selectedInstructor, loc.id)) return false;
      const eff = getEffectiveType(selectedInstructor, loc.id);
      return eff === "BOTH" || eff === watchType;
    });
  }, [locations, selectedInstructor, watchType]);

  const filteredVehicles = useMemo(() => {
    const locId = watchLocationId ? Number(watchLocationId) : null;
    const active = vehicles.filter(v => v.status === "ACTIVE");
    if (!locId) return active;
    return active.filter(v => !v.locationId || v.locationId === locId);
  }, [vehicles, watchLocationId]);

  const createMutation = useMutation({
    mutationFn: async (data: SessionFormValues) => {
      const startAt = new Date(`${data.date}T${data.startTime}`).toISOString();
      const endAt = new Date(`${data.date}T${data.endTime}`).toISOString();
      const payload: any = {
        type: data.type,
        instructorId: data.instructorId || null,
        locationId: data.locationId,
        startAt,
        endAt,
        capacity: data.capacity,
        notes: data.notes || null,
        tenantId,
        status: "SCHEDULED",
      };
      if (data.type === "DRIVE" && data.vehicleId && typeof data.vehicleId === "number" && !isNaN(data.vehicleId)) {
        payload.vehicleId = data.vehicleId;
      }
      if (data.recurrenceWeeks && typeof data.recurrenceWeeks === "number" && !isNaN(data.recurrenceWeeks) && data.recurrenceWeeks > 0) {
        payload.recurrenceWeeks = data.recurrenceWeeks;
      }
      return apiRequest("POST", `/api/tenants/${tenantId}/sessions`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      createForm.reset(defaultFormValues);
      setCreateDialogOpen(false);
      toast({ title: "Session created" });
    },
    onError: () => {
      toast({ title: "Failed to create session", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/tenants/${tenantId}/sessions/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      toast({ title: "Session cancelled" });
    },
    onError: () => {
      toast({ title: "Failed to cancel session", variant: "destructive" });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: number; status: string }) => {
      return apiRequest("PATCH", `/api/tenants/${tenantId}/bookings/${bookingId}/attendance`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions", viewBookingsSessionId, "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      toast({ title: "Attendance updated" });
    },
    onError: () => {
      toast({ title: "Failed to update attendance", variant: "destructive" });
    },
  });

  const editSession = useMemo(() => {
    if (!editSessionId) return null;
    return sessions.find(s => s.id === editSessionId) || null;
  }, [sessions, editSessionId]);

  const editHasBookings = editSession ? editSession.bookedCount > 0 : false;

  const editForm = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: defaultFormValues,
  });

  const editWatchType = editForm.watch("type");
  const editWatchInstructorId = editForm.watch("instructorId");
  const editWatchLocationId = editForm.watch("locationId");

  useEffect(() => {
    if (editSession) {
      const start = new Date(editSession.startAt);
      const end = new Date(editSession.endAt);
      const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      editForm.reset({
        type: editSession.type as "CLASSROOM" | "DRIVE",
        instructorId: editSession.instructorId || "",
        locationId: editSession.locationId || ("" as any),
        vehicleId: editSession.vehicleId || "",
        date: dateStr,
        startTime,
        endTime,
        capacity: editSession.capacity,
        notes: editSession.notes || "",
        recurrenceWeeks: "",
      });
    }
  }, [editSession]);

  const editFilteredInstructors = useMemo(() => {
    return instructors.filter(inst => instructorCanTeachType(inst, editWatchType));
  }, [instructors, editWatchType]);

  const editSelectedInstructor = useMemo(() => {
    if (!editWatchInstructorId) return null;
    return instructors.find(i => i.id === editWatchInstructorId) || null;
  }, [instructors, editWatchInstructorId]);

  const editFilteredLocations = useMemo(() => {
    if (!editSelectedInstructor) return locations;
    return locations.filter(loc => {
      if (!instructorTeachesAtLocation(editSelectedInstructor, loc.id)) return false;
      const eff = getEffectiveType(editSelectedInstructor, loc.id);
      return eff === "BOTH" || eff === editWatchType;
    });
  }, [locations, editSelectedInstructor, editWatchType]);

  const editFilteredVehicles = useMemo(() => {
    const locId = editWatchLocationId ? Number(editWatchLocationId) : null;
    const active = vehicles.filter(v => v.status === "ACTIVE");
    if (!locId) return active;
    return active.filter(v => !v.locationId || v.locationId === locId);
  }, [vehicles, editWatchLocationId]);

  const editMutation = useMutation({
    mutationFn: async (data: SessionFormValues) => {
      let payload: any;
      if (editHasBookings) {
        payload = {
          capacity: data.capacity,
          notes: data.notes || null,
        };
      } else {
        const startAt = new Date(`${data.date}T${data.startTime}`).toISOString();
        const endAt = new Date(`${data.date}T${data.endTime}`).toISOString();
        payload = {
          type: data.type,
          instructorId: data.instructorId || null,
          locationId: data.locationId,
          startAt,
          endAt,
          capacity: data.capacity,
          notes: data.notes || null,
        };
        if (data.type === "DRIVE" && data.vehicleId && typeof data.vehicleId === "number" && !isNaN(data.vehicleId)) {
          payload.vehicleId = data.vehicleId;
        } else if (data.type !== "DRIVE") {
          payload.vehicleId = null;
        }
      }
      return apiRequest("PATCH", `/api/tenants/${tenantId}/sessions/${editSessionId}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      setEditSessionId(null);
      toast({ title: "Session updated" });
    },
    onError: (error: any) => {
      const msg = error?.message || "Failed to update session";
      toast({ title: msg, variant: "destructive" });
    },
  });

  type SessionFilterKey = "package" | "cohort" | "type" | "status" | "location" | "instructor" | "search";

  const sessionMatchers = useMemo(() => ({
    package: (s: ScheduleSession) => {
      if (filterPackageId === "ALL") return true;
      const pkg = getPackageForSession(s);
      return !!pkg && String(pkg.id) === filterPackageId;
    },
    cohort: (s: ScheduleSession) => filterOfferingId === "ALL" || String(s.offeringId ?? "") === filterOfferingId,
    type: (s: ScheduleSession) => filterType === "ALL" || s.type === filterType,
    status: (s: ScheduleSession) => filterStatus === "ALL" || s.status === filterStatus,
    location: (s: ScheduleSession) => filterLocation === "ALL" || String(s.locationId ?? "") === filterLocation,
    instructor: (s: ScheduleSession) => filterInstructor === "ALL" || (s.instructorId ?? "") === filterInstructor,
    search: (s: ScheduleSession) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const off = getOfferingForSession(s);
      const pkg = getPackageForSession(s);
      const haystack = [
        off?.name,
        pkg?.name,
        getInstructorName(s.instructorId, instructors),
        s.locationId ? getLocationName(s.locationId, locations) : "",
        s.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    },
  }), [filterPackageId, filterOfferingId, filterType, filterStatus, filterLocation, filterInstructor, searchQuery, packageById, offeringById, instructors, locations]);

  function passesSession(s: ScheduleSession, except?: SessionFilterKey): boolean {
    if (offeringIdFilter !== null && s.offeringId !== offeringIdFilter) return false;
    const keys: SessionFilterKey[] = ["package", "cohort", "type", "status", "location", "instructor", "search"];
    for (const k of keys) {
      if (k === except) continue;
      if (!sessionMatchers[k](s)) return false;
    }
    return true;
  }

  const filteredSessions = useMemo(
    () => sessions.filter((s) => passesSession(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, sessionMatchers, offeringIdFilter],
  );

  // Cascading: each filter's available options reflect all OTHER active filters.
  const availablePackageIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of sessions) {
      if (!passesSession(s, "package")) continue;
      const pkg = getPackageForSession(s);
      if (pkg) ids.add(pkg.id);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sessionMatchers, offeringIdFilter, packageById, offeringById]);

  const availableOfferingIds = useMemo(() => {
    const ids = new Set<number>();
    for (const s of sessions) {
      if (!passesSession(s, "cohort")) continue;
      if (s.offeringId) ids.add(s.offeringId);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sessionMatchers, offeringIdFilter]);

  const availableLocationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (!passesSession(s, "location")) continue;
      if (s.locationId != null) ids.add(String(s.locationId));
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sessionMatchers, offeringIdFilter]);

  const availableInstructorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (!passesSession(s, "instructor")) continue;
      if (s.instructorId) ids.add(s.instructorId);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sessionMatchers, offeringIdFilter]);

  const availableTypes = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (!passesSession(s, "type")) continue;
      ids.add(s.type);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sessionMatchers, offeringIdFilter]);

  const availableStatuses = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (!passesSession(s, "status")) continue;
      ids.add(s.status);
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, sessionMatchers, offeringIdFilter]);

  // Auto-reset downstream filter if its current value is no longer reachable.
  useEffect(() => {
    if (filterPackageId !== "ALL" && !availablePackageIds.has(Number(filterPackageId))) setFilterPackageId("ALL");
  }, [availablePackageIds, filterPackageId]);
  useEffect(() => {
    if (filterOfferingId !== "ALL" && !availableOfferingIds.has(Number(filterOfferingId))) setFilterOfferingId("ALL");
  }, [availableOfferingIds, filterOfferingId]);
  useEffect(() => {
    if (filterLocation !== "ALL" && !availableLocationIds.has(filterLocation)) setFilterLocation("ALL");
  }, [availableLocationIds, filterLocation]);
  useEffect(() => {
    if (filterInstructor !== "ALL" && !availableInstructorIds.has(filterInstructor)) setFilterInstructor("ALL");
  }, [availableInstructorIds, filterInstructor]);
  useEffect(() => {
    if (filterType !== "ALL" && !availableTypes.has(filterType)) setFilterType("ALL");
  }, [availableTypes, filterType]);
  useEffect(() => {
    if (filterStatus !== "ALL" && !availableStatuses.has(filterStatus)) setFilterStatus("ALL");
  }, [availableStatuses, filterStatus]);

  const activeSessionFilterChips = useMemo(() => {
    const chips: { key: SessionFilterKey; label: string; onRemove: () => void }[] = [];
    if (searchQuery.trim()) chips.push({ key: "search", label: `“${searchQuery.trim()}”`, onRemove: () => setSearchQuery("") });
    if (filterPackageId !== "ALL") {
      const p = packageById.get(Number(filterPackageId));
      chips.push({ key: "package", label: `Package: ${p?.name ?? filterPackageId}`, onRemove: () => setFilterPackageId("ALL") });
    }
    if (filterOfferingId !== "ALL") {
      const o = offeringById.get(Number(filterOfferingId));
      chips.push({ key: "cohort", label: `Cohort: ${o?.name ?? filterOfferingId}`, onRemove: () => setFilterOfferingId("ALL") });
    }
    if (filterType !== "ALL") chips.push({ key: "type", label: `Type: ${filterType === "CLASSROOM" ? "Classroom" : "Drive"}`, onRemove: () => setFilterType("ALL") });
    if (filterStatus !== "ALL") chips.push({ key: "status", label: `Status: ${filterStatus.charAt(0) + filterStatus.slice(1).toLowerCase()}`, onRemove: () => setFilterStatus("ALL") });
    if (filterLocation !== "ALL") {
      const l = locations.find((x) => String(x.id) === filterLocation);
      chips.push({ key: "location", label: `Location: ${l?.name ?? filterLocation}`, onRemove: () => setFilterLocation("ALL") });
    }
    if (filterInstructor !== "ALL") {
      const i = instructors.find((x) => x.id === filterInstructor);
      chips.push({ key: "instructor", label: `Instructor: ${i?.name ?? filterInstructor}`, onRemove: () => setFilterInstructor("ALL") });
    }
    return chips;
  }, [searchQuery, filterPackageId, filterOfferingId, filterType, filterStatus, filterLocation, filterInstructor, packageById, offeringById, locations, instructors]);

  const activeSessionFilterCount = activeSessionFilterChips.length;

  function clearSessionFilters() {
    setFilterType("ALL");
    setFilterLocation("ALL");
    setFilterInstructor("ALL");
    setFilterStatus("ALL");
    setFilterPackageId("ALL");
    setFilterOfferingId("ALL");
    setSearchQuery("");
  }

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [currentWeekStart]);

  const weekEnd = weekDays[6];

  const calendarSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (offeringIdFilter !== null && s.offeringId !== offeringIdFilter) return false;
      const d = new Date(s.startAt);
      return d >= weekDays[0] && d <= new Date(weekEnd.getTime() + 86400000);
    });
  }, [sessions, weekDays, weekEnd, offeringIdFilter]);

  const daySessions = useMemo(() => {
    return sessions.filter((s) => {
      if (offeringIdFilter !== null && s.offeringId !== offeringIdFilter) return false;
      return isSameDay(new Date(s.startAt), currentDay);
    })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [sessions, currentDay, offeringIdFilter]);

  const monthDays = useMemo(() => {
    const { year, month } = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const offset = startDow === 0 ? 6 : startDow - 1;
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - offset);
    const days: Date[] = [];
    const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentMonth]);

  const monthSessions = useMemo(() => {
    if (monthDays.length === 0) return [];
    const start = monthDays[0];
    const end = new Date(monthDays[monthDays.length - 1].getTime() + 86400000);
    return sessions.filter((s) => {
      if (offeringIdFilter !== null && s.offeringId !== offeringIdFilter) return false;
      const d = new Date(s.startAt);
      return d >= start && d < end;
    });
  }, [sessions, monthDays, offeringIdFilter]);

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  const getTypeBadge = (type: string) => {
    if (type === "CLASSROOM") return <Badge variant="default">CLASSROOM</Badge>;
    return <Badge variant="secondary">DRIVE</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED": return <Badge variant="default">Scheduled</Badge>;
      case "IN_PROGRESS": return <Badge variant="secondary">In Progress</Badge>;
      case "COMPLETED": return <Badge variant="outline">Completed</Badge>;
      case "CANCELLED": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getBookingStatusBadge = (status: string) => {
    switch (status) {
      case "BOOKED": return <Badge variant="default">Booked</Badge>;
      case "ATTENDED": return <Badge variant="default">Attended</Badge>;
      case "NO_SHOW": return <Badge variant="destructive">No Show</Badge>;
      case "CANCELLED": return <Badge variant="outline">Cancelled</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6">
      {offeringIdFilter !== null && (
        <div
          className="flex items-center justify-between gap-3 mb-4 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-4 py-3"
          data-testid="banner-offering-filter"
        >
          <div className="flex items-center gap-2 text-sm text-blue-900 dark:text-blue-200">
            <Calendar className="h-4 w-4" />
            <span>
              Showing sessions for offering <strong>#{offeringIdFilter}</strong> only.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/calendar")}
            data-testid="button-clear-offering-filter"
          >
            Clear
          </Button>
        </div>
      )}
      <Tabs defaultValue="sessions">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">Schedule</h1>
            <LocationFilterIndicator appliesHere />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <TabsList>
              <TabsTrigger value="sessions" data-testid="tab-sessions">Sessions</TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">Calendar</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              onClick={() => { setOfferingsCreateOnOpen(false); setManageOfferingsOpen(true); }}
              data-testid="button-manage-offerings"
            >
              <Calendar className="h-4 w-4 mr-1" /> Manage Cohorts
            </Button>
            <Button
              variant="outline"
              onClick={() => setBulkAssignOpen(true)}
              data-testid="button-bulk-assign-instructor"
            >
              <Users className="h-4 w-4 mr-1" /> Bulk Assign Instructor
            </Button>
            <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) createForm.reset(defaultFormValues); }}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-session">
                  <Plus className="h-4 w-4 mr-1" /> Create Session
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Session</DialogTitle>
                </DialogHeader>
                <Form {...createForm}>
                  <form
                    onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
                    className="space-y-4"
                  >
                    <FormField
                      control={createForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select
                            onValueChange={(val) => {
                              field.onChange(val);
                              createForm.setValue("capacity", val === "DRIVE" ? 1 : 20);
                              const curInst = createForm.getValues("instructorId");
                              if (curInst) {
                                const inst = instructors.find(i => i.id === curInst);
                                if (inst && !instructorCanTeachType(inst, val)) {
                                  createForm.setValue("instructorId", "");
                                  createForm.setValue("locationId", "" as any);
                                  createForm.setValue("vehicleId", "");
                                } else if (inst) {
                                  const curLoc = createForm.getValues("locationId");
                                  if (curLoc) {
                                    const eff = getEffectiveType(inst, curLoc);
                                    if (eff !== "BOTH" && eff !== val) {
                                      createForm.setValue("locationId", "" as any);
                                      createForm.setValue("vehicleId", "");
                                    }
                                  }
                                }
                              }
                              if (val !== "DRIVE") {
                                createForm.setValue("vehicleId", "");
                              }
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-session-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="CLASSROOM">Classroom</SelectItem>
                              <SelectItem value="DRIVE">Behind-the-Wheel</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="instructorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instructor <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                          <div className="flex items-center gap-1">
                            <Select
                              onValueChange={(val) => {
                                const next = val === "__unassigned__" ? "" : val;
                                field.onChange(next);
                                const curLoc = createForm.getValues("locationId");
                                if (curLoc && next) {
                                  const inst = instructors.find(i => i.id === next);
                                  if (inst) {
                                    const teachesHere = instructorTeachesAtLocation(inst, Number(curLoc));
                                    const eff = getEffectiveType(inst, curLoc);
                                    const typeMatch = eff === "BOTH" || eff === watchType;
                                    if (!teachesHere || !typeMatch) {
                                      createForm.setValue("locationId", "" as any);
                                      createForm.setValue("vehicleId", "");
                                    }
                                  }
                                }
                                if (!next) {
                                  createForm.setValue("locationId", "" as any);
                                  createForm.setValue("vehicleId", "");
                                }
                              }}
                              value={field.value || "__unassigned__"}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-session-instructor">
                                  <SelectValue placeholder="Select instructor" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__unassigned__" data-testid="option-instructor-unassigned">— Unassigned —</SelectItem>
                                {filteredInstructors.length === 0 ? (
                                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                    No {watchType === "DRIVE" ? "behind-the-wheel" : "classroom"} instructors available
                                  </div>
                                ) : (
                                  filteredInstructors.map((inst) => (
                                    <SelectItem key={inst.id} value={inst.id} data-testid={`option-instructor-${inst.id}`}>
                                      <span className="flex items-center gap-2">
                                        <span>{inst.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {inst.instructorType === "BOTH" ? "All" : inst.instructorType === "DRIVE" ? "BTW" : "Classroom"}
                                        </span>
                                      </span>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            {field.value && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  createForm.setValue("instructorId", "");
                                  createForm.setValue("locationId", "" as any);
                                  createForm.setValue("vehicleId", "");
                                }}
                                data-testid="button-clear-instructor"
                                title="Clear instructor"
                                className="shrink-0"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="locationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <div className="flex items-center gap-1">
                            <Select
                              onValueChange={(val) => {
                                field.onChange(val);
                                const curVehicle = createForm.getValues("vehicleId");
                                if (curVehicle && typeof curVehicle === "number" && !isNaN(curVehicle)) {
                                  const veh = vehicles.find(v => v.id === curVehicle);
                                  if (veh && veh.locationId && veh.locationId !== Number(val)) {
                                    createForm.setValue("vehicleId", "");
                                  }
                                }
                              }}
                              value={field.value ? String(field.value) : ""}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-session-location">
                                  <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {filteredLocations.length === 0 ? (
                                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                    {selectedInstructor
                                      ? "No locations available for this instructor and session type"
                                      : "No locations available"}
                                  </div>
                                ) : (
                                  filteredLocations.map((loc) => (
                                    <SelectItem key={loc.id} value={String(loc.id)}>
                                      {loc.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            {field.value && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  createForm.setValue("locationId", "" as any);
                                  createForm.setValue("vehicleId", "");
                                }}
                                data-testid="button-clear-location"
                                title="Clear location"
                                className="shrink-0"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          {selectedInstructor && filteredLocations.length < locations.length && (
                            <p className="text-xs text-muted-foreground">
                              Showing locations where {selectedInstructor.name} teaches {watchType === "DRIVE" ? "behind-the-wheel" : "classroom"}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchType === "DRIVE" && (
                      <FormField
                        control={createForm.control}
                        name="vehicleId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vehicle</FormLabel>
                            <Select
                              onValueChange={(val) => field.onChange(val === "none" ? "" : val)}
                              value={field.value ? String(field.value) : "none"}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-session-vehicle">
                                  <SelectValue placeholder="Select vehicle" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No vehicle</SelectItem>
                                {filteredVehicles.map((v) => (
                                  <SelectItem key={v.id} value={String(v.id)}>
                                    {v.name}{v.locationId ? ` - ${getLocationName(v.locationId, locations)}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {watchLocationId && filteredVehicles.length < vehicles.filter(v => v.status === "ACTIVE").length && (
                              <p className="text-xs text-muted-foreground">
                                Showing vehicles at {getLocationName(Number(watchLocationId), locations)} or unassigned
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={createForm.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" data-testid="input-session-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={createForm.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time</FormLabel>
                            <FormControl>
                              <Input {...field} type="time" data-testid="input-session-start-time" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time</FormLabel>
                            <FormControl>
                              <Input {...field} type="time" data-testid="input-session-end-time" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={createForm.control}
                      name="capacity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Capacity</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" min={1} data-testid="input-session-capacity" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea {...field} placeholder="Optional notes" data-testid="input-session-notes" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="recurrenceWeeks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Repeat weekly for N weeks</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" min={0} placeholder="0" data-testid="input-session-recurrence" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-session">
                      {createMutation.isPending ? "Creating..." : "Create Session"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <TabsContent value="sessions">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions…"
                className="pl-8 w-[220px]"
                data-testid="input-session-search"
              />
            </div>
            <Select
              value={filterPackageId}
              onValueChange={(v) => { setFilterPackageId(v); setFilterOfferingId("ALL"); }}
            >
              <SelectTrigger className="w-[180px]" data-testid="filter-package">
                <SelectValue placeholder="Package" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Packages</SelectItem>
                {packages.filter((p) => availablePackageIds.has(p.id)).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterOfferingId} onValueChange={setFilterOfferingId}>
              <SelectTrigger className="w-[180px]" data-testid="filter-cohort">
                <SelectValue placeholder="Cohort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Cohorts</SelectItem>
                {offerings.filter((o) => availableOfferingIds.has(o.id)).map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]" data-testid="filter-session-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {availableTypes.has("CLASSROOM") && <SelectItem value="CLASSROOM">Classroom</SelectItem>}
                {availableTypes.has("DRIVE") && <SelectItem value="DRIVE">Drive</SelectItem>}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="filter-session-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                {availableStatuses.has("SCHEDULED") && <SelectItem value="SCHEDULED">Scheduled</SelectItem>}
                {availableStatuses.has("COMPLETED") && <SelectItem value="COMPLETED">Completed</SelectItem>}
                {availableStatuses.has("CANCELLED") && <SelectItem value="CANCELLED">Cancelled</SelectItem>}
              </SelectContent>
            </Select>
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="w-[160px]" data-testid="filter-location">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Locations</SelectItem>
                {locations.filter((loc) => availableLocationIds.has(String(loc.id))).map((loc) => (
                  <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterInstructor} onValueChange={setFilterInstructor}>
              <SelectTrigger className="w-[160px]" data-testid="filter-instructor">
                <SelectValue placeholder="Instructor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Instructors</SelectItem>
                {instructors.filter((inst) => availableInstructorIds.has(inst.id)).map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeSessionFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSessionFilters} data-testid="button-clear-session-filters">
                <XCircle className="h-4 w-4 mr-1" />
                Clear all
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
              <Button
                variant={sessionsViewMode === "cards" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSessionsViewMode("cards")}
                data-testid="button-sessions-view-cards"
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={sessionsViewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSessionsViewMode("table")}
                data-testid="button-sessions-view-table"
                title="Table view"
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-3 min-h-[28px]">
            {activeSessionFilterChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="secondary"
                className="gap-1 pl-2 pr-1 py-1"
                data-testid={`chip-active-filter-${chip.key}`}
              >
                <span className="text-xs">{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-sm hover-elevate active-elevate-2 p-0.5"
                  aria-label={`Remove ${chip.label}`}
                  data-testid={`button-remove-filter-${chip.key}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <span className="ml-auto text-xs text-muted-foreground" data-testid="text-session-filter-count">
              Showing {filteredSessions.length} of {sessions.length} sessions
            </span>
          </div>

          {sessionsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44" />
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No sessions found. Create your first session.</p>
              </CardContent>
            </Card>
          ) : sessionsViewMode === "table" ? (
            <div className="border rounded-md overflow-x-auto" data-testid="table-sessions">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Cohort</TableHead>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Booked</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map((session) => {
                    const offering = getOfferingForSession(session);
                    const pkg = getPackageForSession(session);
                    return (
                      <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                        <TableCell>{getTypeBadge(session.type)}</TableCell>
                        <TableCell>{getStatusBadge(session.status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <div>{formatDateLong(session.startAt as unknown as string)}</div>
                          <div className="text-muted-foreground text-xs">
                            {formatTime(session.startAt as unknown as string)} – {formatTime(session.endAt as unknown as string)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {pkg ? (
                            <Link
                              href={`/admin/packages/${pkg.id}`}
                              className="hover:underline"
                              data-testid={`link-session-package-${session.id}`}
                            >
                              {pkg.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {offering ? (
                            <button
                              type="button"
                              className="hover:underline text-left"
                              onClick={() => setFilterOfferingId(String(offering.id))}
                              data-testid={`link-session-cohort-${session.id}`}
                            >
                              {offering.name}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {getInstructorName(session.instructorId, instructors)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {session.locationId ? getLocationName(session.locationId, locations) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {session.type === "DRIVE" && session.vehicleId ? getVehicleName(session.vehicleId, vehicles) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {session.bookedCount}/{session.capacity}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setViewBookingsSessionId(session.id)}
                              data-testid={`button-row-view-bookings-${session.id}`}
                              title="View bookings"
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                const o = session.offeringId ? offeringById.get(session.offeringId) : undefined;
                                navigate(o?.packageId ? `/admin/packages/${o.packageId}/cohorts/${o.id}/sessions/${session.id}` : `/admin/sessions/${session.id}`);
                              }}
                              data-testid={`button-row-session-detail-${session.id}`}
                              title="Open"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            {session.status === "SCHEDULED" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setEditSessionId(session.id)}
                                data-testid={`button-row-edit-session-${session.id}`}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSessions.map((session) => (
                <Card key={session.id} data-testid={`card-session-${session.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getTypeBadge(session.type)}
                      {getStatusBadge(session.status)}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setViewBookingsSessionId(session.id)}
                        data-testid={`button-view-bookings-${session.id}`}
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const o = session.offeringId ? offeringById.get(session.offeringId) : undefined;
                          navigate(o?.packageId ? `/admin/packages/${o.packageId}/cohorts/${o.id}/sessions/${session.id}` : `/admin/sessions/${session.id}`);
                        }}
                        data-testid={`button-session-detail-${session.id}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {session.status === "SCHEDULED" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditSessionId(session.id)}
                          data-testid={`button-edit-session-${session.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {session.status === "SCHEDULED" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-cancel-session-${session.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel Session</AlertDialogTitle>
                              <AlertDialogDescription asChild>
                                <div className="space-y-2">
                                  {session.bookedCount > 0 ? (
                                    <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                                      <div className="space-y-1">
                                        <p className="font-medium text-destructive">This session has {session.bookedCount} active booking{session.bookedCount !== 1 ? "s" : ""}</p>
                                        <p className="text-sm text-muted-foreground">All bookings will be cancelled and credits will be automatically restored to students.</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <p>Are you sure you want to cancel this session? This action cannot be undone.</p>
                                  )}
                                </div>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel data-testid="button-cancel-cancel">Keep Session</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => cancelMutation.mutate(session.id)}
                                data-testid="button-confirm-cancel"
                              >
                                {session.bookedCount > 0 ? "Cancel Session & Restore Credits" : "Confirm Cancel"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {(() => {
                      const offering = getOfferingForSession(session);
                      const pkg = getPackageForSession(session);
                      if (!offering && !pkg) return null;
                      return (
                        <div className="space-y-0.5 pb-1">
                          {pkg && (
                            <p className="text-sm flex items-center gap-1">
                              <PackageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <Link
                                href={`/admin/packages/${pkg.id}`}
                                className="hover:underline truncate"
                                data-testid={`card-session-package-${session.id}`}
                              >
                                {pkg.name}
                              </Link>
                            </p>
                          )}
                          {offering && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Boxes className="h-3 w-3 shrink-0" />
                              <span className="truncate" data-testid={`card-session-cohort-${session.id}`}>{offering.name}</span>
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <p className="text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span>{formatDateLong(session.startAt as unknown as string)} {formatTime(session.startAt as unknown as string)} - {formatTime(session.endAt as unknown as string)}</span>
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      <span>{getInstructorName(session.instructorId, instructors)}</span>
                    </p>
                    {session.locationId && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{getLocationName(session.locationId, locations)}</span>
                      </p>
                    )}
                    {session.type === "DRIVE" && session.vehicleId && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Car className="h-3 w-3 shrink-0" />
                        <span>{getVehicleName(session.vehicleId, vehicles)}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{session.bookedCount}/{session.capacity} booked</span>
                      <Progress value={(session.bookedCount / session.capacity) * 100} className="flex-1 h-2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2" data-testid="button-date-picker">
                  <CalendarDays className="h-4 w-4" />
                  <span data-testid="text-period-range">
                    {calendarView === "day"
                      ? currentDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                      : calendarView === "week"
                        ? `${formatDate(weekDays[0])} - ${formatDate(weekEnd)}`
                        : new Date(currentMonth.year, currentMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" })
                    }
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                {calendarView === "month" ? (
                  <div className="p-3 space-y-3" data-testid="month-year-picker">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentMonth((m) => m.year > 2020 ? { ...m, year: m.year - 1 } : m)}
                        data-testid="button-prev-year"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <select
                        value={currentMonth.year}
                        onChange={(e) => setCurrentMonth((m) => ({ ...m, year: Number(e.target.value) }))}
                        className="appearance-none bg-transparent border border-border rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                        data-testid="select-year"
                      >
                        {Array.from({ length: 21 }, (_, i) => 2020 + i).map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentMonth((m) => m.year < 2040 ? { ...m, year: m.year + 1 } : m)}
                        data-testid="button-next-year"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: 12 }, (_, i) => (
                        <Button
                          key={i}
                          variant={currentMonth.month === i ? "default" : "ghost"}
                          size="sm"
                          onClick={() => {
                            setCurrentMonth({ year: currentMonth.year, month: i });
                            setDatePickerOpen(false);
                          }}
                          data-testid={`button-month-${i}`}
                        >
                          {new Date(2000, i).toLocaleDateString("en-US", { month: "short" })}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <CalendarPicker
                    mode="single"
                    selected={calendarView === "day" ? currentDay : currentWeekStart}
                    onSelect={(date) => {
                      if (!date) return;
                      if (calendarView === "day") {
                        const d = new Date(date);
                        d.setHours(0, 0, 0, 0);
                        setCurrentDay(d);
                      } else {
                        setCurrentWeekStart(getMonday(date));
                      }
                      setDatePickerOpen(false);
                    }}
                    data-testid="calendar-date-picker"
                  />
                )}
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (calendarView === "day") {
                    const prev = new Date(currentDay);
                    prev.setDate(prev.getDate() - 1);
                    setCurrentDay(prev);
                  } else if (calendarView === "week") {
                    const prev = new Date(currentWeekStart);
                    prev.setDate(prev.getDate() - 7);
                    setCurrentWeekStart(prev);
                  } else {
                    setCurrentMonth((m) => {
                      const newMonth = m.month - 1;
                      return newMonth < 0
                        ? { year: m.year - 1, month: 11 }
                        : { year: m.year, month: newMonth };
                    });
                  }
                }}
                data-testid="button-prev-period"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const now = new Date();
                  now.setHours(0,0,0,0);
                  setCurrentDay(now);
                  setCurrentWeekStart(getMonday(now));
                  setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() });
                }}
                data-testid="button-today"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (calendarView === "day") {
                    const next = new Date(currentDay);
                    next.setDate(next.getDate() + 1);
                    setCurrentDay(next);
                  } else if (calendarView === "week") {
                    const next = new Date(currentWeekStart);
                    next.setDate(next.getDate() + 7);
                    setCurrentWeekStart(next);
                  } else {
                    setCurrentMonth((m) => {
                      const newMonth = m.month + 1;
                      return newMonth > 11
                        ? { year: m.year + 1, month: 0 }
                        : { year: m.year, month: newMonth };
                    });
                  }
                }}
                data-testid="button-next-period"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center border rounded-md overflow-visible">
              {(["day", "week", "month"] as const).map((view) => (
                <Button
                  key={view}
                  variant={calendarView === view ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none first:rounded-l-md last:rounded-r-md"
                  onClick={() => setCalendarView(view)}
                  data-testid={`button-view-${view}`}
                >
                  {view.charAt(0).toUpperCase() + view.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {calendarView === "day" && (
            <div className="space-y-2" data-testid="calendar-day-view">
              {daySessions.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sessions scheduled for this day.</p>
                  </CardContent>
                </Card>
              ) : (
                daySessions.map((session) => (
                  <Card
                    key={session.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => setViewBookingsSessionId(session.id)}
                    data-testid={`day-session-${session.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {formatTime(session.startAt as unknown as string)} - {formatTime(session.endAt as unknown as string)}
                            </span>
                            {getTypeBadge(session.type)}
                            {getStatusBadge(session.status)}
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3 shrink-0" />
                            {getInstructorName(session.instructorId, instructors)}
                          </p>
                          {session.locationId && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {getLocationName(session.locationId, locations)}
                            </p>
                          )}
                          {session.type === "DRIVE" && session.vehicleId && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Car className="h-3 w-3 shrink-0" />
                              {getVehicleName(session.vehicleId, vehicles)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{session.bookedCount}/{session.capacity}</span>
                          <Progress value={(session.bookedCount / session.capacity) * 100} className="w-16 h-2" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {calendarView === "week" && (
            <div className="flex flex-col gap-px" style={{ height: "calc(100vh - 220px)" }} data-testid="calendar-week-view">
              {weekDays.map((day) => {
                const sessionsForDay = calendarSessions.filter((s) =>
                  isSameDay(new Date(s.startAt), day)
                );
                const isToday = isSameDay(day, new Date());
                const dayLabel = day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <div
                    key={day.toISOString()}
                    className={`border rounded-md p-3 flex-1 flex flex-col overflow-hidden ${isToday ? "border-primary" : "border-border"}`}
                    data-testid={`calendar-day-${day.toISOString().split("T")[0]}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`text-sm ${isToday ? "font-bold" : "text-muted-foreground"}`}
                        onClick={() => { setCurrentDay(new Date(day)); setCalendarView("day"); }}
                        data-testid={`week-day-link-${day.toISOString().split("T")[0]}`}
                      >
                        {dayLabel}
                      </Button>
                      {sessionsForDay.length > 0 && (
                        <span className="text-xs text-muted-foreground">{sessionsForDay.length} session{sessionsForDay.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    {sessionsForDay.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-2">No sessions</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 flex-1 overflow-y-auto">
                        {sessionsForDay
                          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                          .map((session) => (
                            <div
                              key={session.id}
                              onClick={() => setViewBookingsSessionId(session.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === "Enter") setViewBookingsSessionId(session.id); }}
                              className={`rounded-md px-3 py-2 text-xs cursor-pointer hover-elevate flex items-center gap-2 ${
                                session.type === "CLASSROOM"
                                  ? "bg-primary/10 dark:bg-primary/20 text-primary border border-primary/20"
                                  : "bg-secondary text-secondary-foreground"
                              }`}
                              data-testid={`calendar-session-${session.id}`}
                            >
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="font-medium">{formatTime(session.startAt as unknown as string)} - {formatTime(session.endAt as unknown as string)}</span>
                              <span className="truncate">{getInstructorName(session.instructorId, instructors)}</span>
                              {session.locationId && (
                                <span className="truncate text-muted-foreground">{getLocationName(session.locationId, locations)}</span>
                              )}
                              <Badge variant={session.type === "CLASSROOM" ? "default" : "secondary"} className="shrink-0">{session.type}</Badge>
                              <span className="text-muted-foreground shrink-0">{session.bookedCount}/{session.capacity}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {calendarView === "month" && (() => {
            const weekCount = Math.ceil(monthDays.length / 7);
            return (
              <div data-testid="calendar-month-view" className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
                <div className="grid grid-cols-7 gap-px border-b">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px flex-1" style={{ gridTemplateRows: `repeat(${weekCount}, 1fr)` }}>
                  {monthDays.map((day) => {
                    const sessionsForDay = monthSessions.filter((s) =>
                      isSameDay(new Date(s.startAt), day)
                    );
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = day.getMonth() === currentMonth.month;
                    const classroomCount = sessionsForDay.filter((s) => s.type === "CLASSROOM").length;
                    const driveCount = sessionsForDay.filter((s) => s.type === "DRIVE").length;
                    return (
                      <div
                        key={day.toISOString()}
                        className={`border p-1 flex flex-col ${
                          isToday ? "border-primary" : "border-border"
                        } ${!isCurrentMonth ? "opacity-40" : ""}`}
                        data-testid={`month-day-${day.toISOString().split("T")[0]}`}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`text-xs w-full ${isToday ? "font-bold" : "text-muted-foreground"}`}
                          onClick={() => { setCurrentDay(new Date(day)); setCalendarView("day"); }}
                          data-testid={`month-day-link-${day.toISOString().split("T")[0]}`}
                        >
                          {day.getDate()}
                        </Button>
                        {sessionsForDay.length > 0 && (
                          <div className="space-y-0.5 mt-0.5 flex-1 overflow-y-auto">
                            {sessionsForDay.length <= 3 ? (
                              sessionsForDay
                                .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                                .map((session) => (
                                  <div
                                    key={session.id}
                                    onClick={() => setViewBookingsSessionId(session.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === "Enter") setViewBookingsSessionId(session.id); }}
                                    className={`w-full text-left rounded-md px-1 py-0.5 text-[10px] leading-tight cursor-pointer truncate hover-elevate ${
                                      session.type === "CLASSROOM"
                                        ? "bg-primary/10 text-primary dark:bg-primary/20"
                                        : "bg-secondary text-secondary-foreground"
                                    }`}
                                    data-testid={`month-session-${session.id}`}
                                  >
                                    {formatTime(session.startAt as unknown as string)} {session.type === "CLASSROOM" ? "C" : "D"}
                                  </div>
                                ))
                            ) : (
                              <div
                                onClick={() => { setCurrentDay(new Date(day)); setCalendarView("day"); }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === "Enter") { setCurrentDay(new Date(day)); setCalendarView("day"); } }}
                                className="w-full text-left px-1 py-0.5 text-[10px] leading-tight space-y-0.5 cursor-pointer hover-elevate rounded-md"
                                data-testid={`month-day-summary-${day.toISOString().split("T")[0]}`}
                              >
                                {classroomCount > 0 && (
                                  <div className="bg-primary/10 dark:bg-primary/20 text-primary rounded-md px-1 truncate">
                                    {classroomCount} classroom
                                  </div>
                                )}
                                {driveCount > 0 && (
                                  <div className="bg-secondary text-secondary-foreground rounded-md px-1 truncate">
                                    {driveCount} drive
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={!!editSessionId} onOpenChange={(open) => { if (!open) setEditSessionId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
          </DialogHeader>
          {editSession && (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit((data) => editMutation.mutate(data))} className="space-y-4">
                {editHasBookings && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted border">
                    <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">This session has {editSession.bookedCount} booking{editSession.bookedCount !== 1 ? "s" : ""}</p>
                      <p className="text-xs text-muted-foreground">Only notes and capacity (increase) can be changed while bookings exist.</p>
                    </div>
                  </div>
                )}
                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          editForm.setValue("instructorId", "");
                          editForm.setValue("locationId", "" as any);
                          editForm.setValue("vehicleId", "");
                        }}
                        disabled={editHasBookings}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="edit-session-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="CLASSROOM">Classroom</SelectItem>
                          <SelectItem value="DRIVE">Drive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="instructorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructor <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <div className="flex items-center gap-1">
                        <Select
                          value={field.value || "__unassigned__"}
                          onValueChange={(val) => {
                            const next = val === "__unassigned__" ? "" : val;
                            field.onChange(next);
                            editForm.setValue("locationId", "" as any);
                            editForm.setValue("vehicleId", "");
                          }}
                          disabled={editHasBookings}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="edit-session-instructor">
                              <SelectValue placeholder="Select instructor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__unassigned__" data-testid="edit-option-instructor-unassigned">— Unassigned —</SelectItem>
                            {editFilteredInstructors.map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value && !editHasBookings && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              field.onChange("");
                              editForm.setValue("locationId", "" as any);
                              editForm.setValue("vehicleId", "");
                            }}
                            data-testid="edit-clear-instructor"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <div className="flex items-center gap-1">
                        <Select
                          value={field.value ? String(field.value) : ""}
                          onValueChange={(val) => {
                            field.onChange(Number(val));
                            editForm.setValue("vehicleId", "");
                          }}
                          disabled={editHasBookings}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="edit-session-location">
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {editFilteredLocations.map((loc) => (
                              <SelectItem key={loc.id} value={String(loc.id)}>
                                {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.value && !editHasBookings && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              field.onChange("" as any);
                              editForm.setValue("vehicleId", "");
                            }}
                            data-testid="edit-clear-location"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {editWatchType === "DRIVE" && (
                  <FormField
                    control={editForm.control}
                    name="vehicleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle</FormLabel>
                        <Select
                          value={field.value ? String(field.value) : ""}
                          onValueChange={(val) => field.onChange(val ? Number(val) : "")}
                          disabled={editHasBookings}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="edit-session-vehicle">
                              <SelectValue placeholder="Select vehicle" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {editFilteredVehicles.map((v) => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                {v.name} ({v.year} {v.make} {v.model})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className="grid grid-cols-3 gap-2">
                  <FormField
                    control={editForm.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" disabled={editHasBookings} data-testid="edit-session-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={editHasBookings} data-testid="edit-session-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" disabled={editHasBookings} data-testid="edit-session-end" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={editForm.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity {editHasBookings ? `(min: ${editSession.bookedCount})` : ""}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min={editHasBookings ? editSession.bookedCount : 1}
                          data-testid="edit-session-capacity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Optional notes" data-testid="edit-session-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={editMutation.isPending} data-testid="button-save-session">
                  {editMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewBookingsSessionId} onOpenChange={(open) => { if (!open) { setViewBookingsSessionId(null); setAddStudentOpen(false); setSelectedEnrollmentId(""); setEnrollmentSearch(""); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Session Bookings</DialogTitle>
          </DialogHeader>
          {viewBookingsSession && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {getTypeBadge(viewBookingsSession.type)}
                {getStatusBadge(viewBookingsSession.status)}
              </div>
              <p className="text-sm">
                {formatDateLong(viewBookingsSession.startAt as unknown as string)} {formatTime(viewBookingsSession.startAt as unknown as string)} - {formatTime(viewBookingsSession.endAt as unknown as string)}
              </p>
              <p className="text-sm text-muted-foreground">
                {getInstructorName(viewBookingsSession.instructorId, instructors)}
                {viewBookingsSession.locationId ? ` at ${getLocationName(viewBookingsSession.locationId, locations)}` : ""}
              </p>
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5" data-testid="session-fulfillable-packages">
                <p className="font-medium text-sm">Fulfillable packages</p>
                {sessionFulfillablePackages.length === 0 ? (
                  <p className="text-muted-foreground">No packages currently track this session for credit progress.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {sessionFulfillablePackages.map((p) => (
                      <Link key={p.id} href={`/admin/packages/${p.id}`}>
                        <Badge variant="outline" className="hover-elevate cursor-pointer" data-testid={`badge-session-fulfillable-${p.id}`}>{p.name}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <h3 className="text-sm font-medium">Bookings ({viewBookingsSession.bookedCount}/{viewBookingsSession.capacity})</h3>
                  {viewBookingsSession.status === "SCHEDULED" && viewBookingsSession.bookedCount < viewBookingsSession.capacity && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddStudentOpen(!addStudentOpen)}
                      data-testid="button-add-student"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Student
                    </Button>
                  )}
                </div>
                {addStudentOpen && (
                  <div className="border rounded-md p-3 mb-3 space-y-3" data-testid="add-student-panel">
                    <Input
                      placeholder="Search by name or email..."
                      value={enrollmentSearch}
                      onChange={(e) => setEnrollmentSearch(e.target.value)}
                      data-testid="input-enrollment-search"
                    />
                    {enrollmentsLoading ? (
                      <div className="space-y-2">
                        {[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
                      </div>
                    ) : filteredEnrollments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No eligible students found.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {filteredEnrollments.map((enrollment) => {
                          const alreadyBooked = bookings.some(
                            (b) => b.enrollmentId === enrollment.id && b.status === "BOOKED"
                          );
                          const isCreditBlock = enrollment.blockType === "credits";
                          const isBlocked = isCreditBlock || alreadyBooked;
                          const snapshot = enrollment.packageSnapshotJson;
                          const pkgName = snapshot?.name || enrollment.package?.name;
                          const classroomReq = snapshot?.classroomHoursRequired ?? 0;
                          const driveReq = snapshot?.driveHoursRequired ?? 0;
                          const classroomRem = Math.max(0, classroomReq - (enrollment.classroomHoursCompleted ?? 0));
                          const driveRem = Math.max(0, driveReq - (enrollment.drivingHoursCompleted ?? 0));
                          return (
                            <div
                              key={enrollment.id}
                              className={`flex items-center justify-between gap-2 flex-wrap p-2 rounded-md border ${
                                isBlocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                              } ${
                                !isBlocked && selectedEnrollmentId === String(enrollment.id) ? "border-primary bg-primary/5" : ""
                              } ${!isBlocked ? "hover-elevate" : ""}`}
                              onClick={() => {
                                if (!isBlocked) {
                                  setSelectedEnrollmentId(
                                    selectedEnrollmentId === String(enrollment.id) ? "" : String(enrollment.id)
                                  );
                                }
                              }}
                              data-testid={`enrollment-option-${enrollment.id}`}
                            >
                              <div className="min-w-0">
                                <p className={`text-sm font-medium ${isBlocked ? "text-muted-foreground" : ""}`}>
                                  {enrollment.firstName} {enrollment.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {enrollment.email}
                                </p>
                                {pkgName && (
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {pkgName}
                                    {(classroomReq > 0 || driveReq > 0) && (
                                      <span className="ml-1">
                                        {classroomReq > 0 && (
                                          <span title="Classroom credits remaining">
                                            {" \u2022 "}{classroomRem}/{classroomReq} classroom
                                          </span>
                                        )}
                                        {driveReq > 0 && (
                                          <span title="Drive credits remaining">
                                            {" \u2022 "}{driveRem}/{driveReq} drive
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap shrink-0">
                                {alreadyBooked ? (
                                  <Badge variant="outline">Already booked</Badge>
                                ) : isCreditBlock ? (
                                  <>
                                    <Badge variant="secondary">{enrollment.status}</Badge>
                                    <span className="text-xs text-destructive" data-testid={`text-block-reason-${enrollment.id}`}>
                                      {enrollment.blockReason}
                                    </span>
                                  </>
                                ) : (
                                  <Badge variant="secondary">{enrollment.status}</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {selectedEnrollmentId && selectedEnrollmentBalance && (() => {
                      const sess = sessions.find(s => s.id === viewBookingsSessionId);
                      const sessType = sess?.type;
                      const isClassroom = sessType === "CLASSROOM";
                      const isDrive = sessType === "DRIVE" || sessType === "BTW_OBSERVATION" || sessType === "BTW_PRACTICE" || sessType === "ROAD_TEST";
                      const balKey = isClassroom ? "classroom" : isDrive ? "drive" : null;
                      const currentBalance = balKey ? selectedEnrollmentBalance[balKey] : 0;
                      const afterBalance = currentBalance - 1;
                      const insufficient = balKey && currentBalance <= 0;
                      const fulfillsThis = sessionFulfillablePackages.length > 0;
                      return (
                        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5" data-testid="credit-impact-preview">
                          <p className="font-medium flex items-center gap-1.5">
                            Credit impact
                            {insufficient && <Badge variant="destructive" className="text-xs">No credits</Badge>}
                          </p>
                          {balKey ? (
                            <p className="text-xs text-muted-foreground" data-testid="text-credit-impact">
                              {balKey === "classroom" ? "Classroom" : "Drive"} credits: <span className="font-mono">{currentBalance}</span> &rarr; <span className={`font-mono ${insufficient ? "text-destructive" : ""}`}>{afterBalance}</span> after booking
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">This session type does not deduct credits.</p>
                          )}
                          {!fulfillsThis && balKey && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
                              <span>&#9888;</span>
                              <span>This session is not currently linked to any package - booking will still deduct credits but won't track package progress.</span>
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAddStudentOpen(false); setSelectedEnrollmentId(""); setEnrollmentSearch(""); }}
                        data-testid="button-cancel-add-student"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={!selectedEnrollmentId || adminBookingMutation.isPending}
                        onClick={() => {
                          if (selectedEnrollmentId && viewBookingsSessionId) {
                            adminBookingMutation.mutate({
                              sessionId: viewBookingsSessionId,
                              enrollmentId: parseInt(selectedEnrollmentId),
                            });
                          }
                        }}
                        data-testid="button-confirm-add-student"
                      >
                        {adminBookingMutation.isPending ? "Booking..." : "Book Student"}
                      </Button>
                    </div>
                  </div>
                )}
                {bookingsLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookings yet.</p>
                ) : (
                  <div className="space-y-2">
                    {bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-center justify-between gap-2 flex-wrap border rounded-md p-2"
                        data-testid={`booking-${booking.id}`}
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {booking.enrollment?.firstName} {booking.enrollment?.lastName}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getBookingStatusBadge(booking.status)}
                            {booking.enrollment?.package && (
                              <span className="text-xs text-muted-foreground">
                                {booking.enrollment.package.name}
                              </span>
                            )}
                          </div>
                        </div>
                        {(booking.status === "BOOKED" || booking.status === "ATTENDED" || booking.status === "NO_SHOW") && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <Button
                              size="icon"
                              variant={booking.status === "ATTENDED" ? "default" : "ghost"}
                              onClick={() => attendanceMutation.mutate({ bookingId: booking.id, status: "ATTENDED" })}
                              disabled={attendanceMutation.isPending}
                              data-testid={`button-attended-${booking.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant={booking.status === "NO_SHOW" ? "destructive" : "ghost"}
                              onClick={() => attendanceMutation.mutate({ bookingId: booking.id, status: "NO_SHOW" })}
                              disabled={attendanceMutation.isPending}
                              data-testid={`button-noshow-${booking.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BulkAssignInstructorDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        tenantId={tenantId!}
        sessions={sessions}
        instructors={instructors}
        locations={locations}
        offerings={offerings.map((o) => ({ id: o.id, name: o.name }))}
        defaults={{
          offeringId: offeringIdFilter ?? null,
          locationId: filterLocation !== "ALL" ? parseInt(filterLocation) : null,
        }}
      />

      <Sheet
        open={manageOfferingsOpen}
        onOpenChange={(open) => {
          setManageOfferingsOpen(open);
          if (!open) setOfferingsCreateOnOpen(false);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl overflow-y-auto"
          data-testid="sheet-manage-offerings"
        >
          <SheetHeader>
            <SheetTitle>Manage cohorts</SheetTitle>
            <SheetDescription>
              Create, edit, and publish the cohorts that fulfill packages across this school.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {manageOfferingsOpen && (
              <ScheduleOfferingsPage embedded initialCreateOpen={offeringsCreateOnOpen} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}