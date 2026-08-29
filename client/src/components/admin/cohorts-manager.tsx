import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  FormDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus, MapPin, User, Users, Trash2, ListChecks, ClipboardList, Wand2, ExternalLink, AlertTriangle, LayoutGrid, Table as TableIcon, X, Eye, Search, ArrowRightLeft, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChangeOfferingPackageDialog, BulkMovePackageDialog } from "@/components/admin/change-offering-package-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import type { ScheduleOffering, Location, Package as PackageType, OfferingWaitlist } from "@shared/schema";
import { useLocationFilter } from "@/lib/location-filter-context";

interface OfferingWithPackages extends ScheduleOffering {
  sessionCount?: number;
  pendingInterestCount?: number;
}

interface GeneratorInstructor {
  id: string;
  name: string;
  email: string;
  instructorType?: "CLASSROOM" | "DRIVE" | "BOTH";
}

interface Instructor {
  id: string;
  name: string;
  email: string;
}

export const offeringFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  locationId: z.coerce.number().nullable().optional(),
  instructorId: z.string().nullable().optional(),
  capacity: z.coerce.number().int().min(1).default(20),
  startsDate: z.string().min(1, "Start date is required"),
  startsTime: z.string().min(1, "Start time is required"),
  endsDate: z.string().min(1, "End date is required"),
  endsTime: z.string().min(1, "End time is required"),
  status: z.enum(["DRAFT", "PUBLISHED", "FULL", "CANCELLED", "COMPLETED"]).default("DRAFT"),
  notes: z.string().optional(),
  packageId: z.coerce.number({ invalid_type_error: "Package is required" }).int().positive("Package is required"),
});

export type OfferingFormValues = z.infer<typeof offeringFormSchema>;

export const defaultOfferingFormValues: OfferingFormValues = {
  name: "",
  description: "",
  locationId: null,
  instructorId: null,
  capacity: 20,
  startsDate: "",
  startsTime: "09:00",
  endsDate: "",
  endsTime: "17:00",
  status: "DRAFT",
  notes: "",
  packageId: 0,
};

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  PUBLISHED: "default",
  FULL: "secondary",
  CANCELLED: "destructive",
  COMPLETED: "secondary",
};

function formatDateTime(d: string | Date): string {
  const date = new Date(d);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function toDatePart(d: string | Date): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function toTimePart(d: string | Date): string {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}

interface CohortRowActionsMenuProps {
  offering: OfferingWithPackages;
  triggerTestId: string;
  onGenerate: () => void;
  onChangePackage: () => void;
  onWaitlist: () => void;
  onDelete: () => void;
  generateTestId: string;
  changePackageTestId: string;
  waitlistTestId: string;
  deleteTestId: string;
}

function CohortRowActionsMenu({
  offering,
  triggerTestId,
  onGenerate,
  onChangePackage,
  onWaitlist,
  onDelete,
  generateTestId,
  changePackageTestId,
  waitlistTestId,
  deleteTestId,
}: CohortRowActionsMenuProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const cohortHasEnded = !!offering.endsAt && new Date(offering.endsAt).getTime() < Date.now();

  const generateItem = (
    <DropdownMenuItem
      data-testid={generateTestId}
      disabled={cohortHasEnded}
      onSelect={(e) => {
        if (cohortHasEnded) {
          e.preventDefault();
          return;
        }
        onGenerate();
      }}
      className="flex-col items-start gap-0"
    >
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4" />
        <span>Add more sessions</span>
      </div>
      {cohortHasEnded && (
        <span className="pl-6 text-[11px] text-muted-foreground">(cohort has ended)</span>
      )}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" data-testid={triggerTestId} title="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {cohortHasEnded ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>{generateItem}</div>
                </TooltipTrigger>
                <TooltipContent side="left">Cohort has ended</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            generateItem
          )}
          <DropdownMenuItem data-testid={changePackageTestId} onSelect={onChangePackage}>
            <ArrowRightLeft className="h-4 w-4" />
            <span>Change package</span>
          </DropdownMenuItem>
          <DropdownMenuItem data-testid={waitlistTestId} onSelect={onWaitlist}>
            <ClipboardList className="h-4 w-4" />
            <span>Manage waitlist</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid={deleteTestId}
            onSelect={(e) => {
              e.preventDefault();
              setConfirmDeleteOpen(true);
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete cohort</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cohort</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{offering.name}"? This removes the cohort definition. Any sessions linked to it will keep running independently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface ScheduleOfferingsPageProps {
  embedded?: boolean;
  lockedPackageId?: number;
  initialCreateOpen?: boolean;
  hidePageHeader?: boolean;
}

export default function ScheduleOfferingsPage({
  embedded = false,
  lockedPackageId,
  initialCreateOpen = false,
  hidePageHeader = false,
}: ScheduleOfferingsPageProps = {}) {
  const { currentTenant, hasAnyRole } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const canEdit = hasAnyRole("tenant_admin", "office_manager", "platform_admin");
  const [createOpen, setCreateOpen] = useState(initialCreateOpen && canEdit);
  const [waitlistFor, setWaitlistFor] = useState<OfferingWithPackages | null>(null);
  const [generatingFor, setGeneratingFor] = useState<OfferingWithPackages | null>(null);
  const [changePkgFor, setChangePkgFor] = useState<OfferingWithPackages | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const search = useSearch();
  const [, setLocation] = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(search), [search]);
  const [hasConsumedNewParam, setHasConsumedNewParam] = useState(false);
  const [viewMode, setViewMode] = useState<"tiles" | "table">("table");
  const { selectedLocationId: headerLocationId, setSelectedLocationId: setHeaderLocationId } = useLocationFilter();
  const [locationFilter, setLocationFilter] = useState<string>(
    headerLocationId !== null ? String(headerLocationId) : "all",
  );

  // header → local
  useEffect(() => {
    const next = headerLocationId !== null ? String(headerLocationId) : "all";
    setLocationFilter((prev) => (prev === next ? prev : next));
  }, [headerLocationId]);

  // local → header (only sync numeric location ids; "none" is a local-only concept)
  function updateLocationFilter(next: string) {
    setLocationFilter(next);
    if (next === "all") {
      if (headerLocationId !== null) setHeaderLocationId(null);
    } else if (next !== "none") {
      const parsed = parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed !== headerLocationId) setHeaderLocationId(parsed);
    } else if (headerLocationId !== null) {
      setHeaderLocationId(null);
    }
  }
  const [instructorFilter, setInstructorFilter] = useState<string>("all");
  const [audienceFilter, setAudienceFilter] = useState<"all" | "teen" | "adult" | "other">("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [packageFilter, setPackageFilter] = useState<string>(lockedPackageId ? String(lockedPackageId) : "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (lockedPackageId) setPackageFilter(String(lockedPackageId));
  }, [lockedPackageId]);

  const { data: offerings = [], isLoading } = useQuery<OfferingWithPackages[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/schedule-offerings`, { credentials: "include" });
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

  const { data: instructors = [] } = useQuery<GeneratorInstructor[]>({
    queryKey: ["/api/tenants", tenantId, "instructors"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/instructors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: packages = [] } = useQuery<PackageType[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const createForm = useForm<OfferingFormValues>({ resolver: zodResolver(offeringFormSchema), defaultValues: defaultOfferingFormValues });

  useEffect(() => {
    if (embedded) return;
    if (hasConsumedNewParam) return;
    const newFlag = urlParams.get("new") === "1" || urlParams.get("create") === "1";
    const pkgParam = urlParams.get("packageId");
    if (newFlag) {
      const pkgId = pkgParam ? parseInt(pkgParam) : null;
      createForm.reset({ ...defaultOfferingFormValues, packageId: (pkgId && !Number.isNaN(pkgId) ? pkgId : 0) });
      setCreateOpen(true);
      setHasConsumedNewParam(true);
      const next = new URLSearchParams(urlParams);
      next.delete("new");
      next.delete("create");
      next.delete("packageId");
      const qs = next.toString();
      setLocation(`/admin/packages${qs ? `?${qs}` : ""}`, { replace: true });
    }
  }, [embedded, urlParams, createForm, hasConsumedNewParam, setLocation]);

  useEffect(() => {
    if (embedded) return;
    const offeringIdParam = urlParams.get("offeringId");
    if (offeringIdParam) {
      const id = parseInt(offeringIdParam);
      if (!Number.isNaN(id)) {
        const target = offerings.find((x) => x.id === id);
        if (target?.packageId) {
          setLocation(`/admin/packages/${target.packageId}/cohorts/${id}`, { replace: true });
        } else {
          setLocation(`/admin/packages`, { replace: true });
        }
      }
    }
  }, [embedded, urlParams, setLocation]);

  useEffect(() => {
    if (initialCreateOpen && canEdit) {
      createForm.reset({
        ...defaultOfferingFormValues,
        packageId: lockedPackageId ?? 0,
      });
      setCreateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCreateOpen]);

  function buildPayload(data: OfferingFormValues) {
    const startsAt = new Date(`${data.startsDate}T${data.startsTime}`).toISOString();
    const endsAt = new Date(`${data.endsDate}T${data.endsTime}`).toISOString();
    return {
      name: data.name,
      description: data.description || null,
      locationId: data.locationId || null,
      instructorId: data.instructorId || null,
      capacity: data.capacity,
      startsAt,
      endsAt,
      status: data.status,
      notes: data.notes || null,
      packageId: lockedPackageId ?? data.packageId,
    };
  }

  const createMut = useMutation({
    mutationFn: async (data: OfferingFormValues) =>
      apiRequest("POST", `/api/tenants/${tenantId}/schedule-offerings`, buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      createForm.reset(defaultOfferingFormValues);
      setCreateOpen(false);
      toast({ title: "Cohort created" });
    },
    onError: () => toast({ title: "Failed to create cohort", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tenants/${tenantId}/schedule-offerings/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to delete cohort";
        let sessionIdsWithBookings: number[] | undefined;
        try {
          const body = await res.json();
          if (typeof body?.message === "string") message = body.message;
          if (Array.isArray(body?.sessionIdsWithBookings)) sessionIdsWithBookings = body.sessionIdsWithBookings;
        } catch { /* noop */ }
        const err = new Error(message) as Error & { status?: number; sessionIdsWithBookings?: number[] };
        err.status = res.status;
        err.sessionIdsWithBookings = sessionIdsWithBookings;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      toast({ title: "Cohort deleted" });
    },
    onError: (err: Error & { status?: number; sessionIdsWithBookings?: number[] }) => {
      if (err.status === 409) {
        const ids = err.sessionIdsWithBookings ?? [];
        toast({
          title: "Cannot delete cohort",
          description: ids.length > 0
            ? `${err.message} (${ids.length} session${ids.length === 1 ? "" : "s"} with active bookings)`
            : err.message,
          variant: "destructive",
        });
      } else {
        toast({ title: err.message || "Failed to delete cohort", variant: "destructive" });
      }
    },
  });

  const offeringAudience = (o: OfferingWithPackages): "teen" | "adult" | "other" => {
    const linked = packages.filter((p) => p.id === o.packageId);
    if (linked.length === 0) return "other";
    let hasTeen = false;
    let hasAdult = false;
    for (const p of linked) {
      const minA = p.ageMin ?? null;
      const maxA = p.ageMax ?? null;
      if (minA !== null && minA < 18) hasTeen = true;
      if (minA !== null && minA >= 18) hasAdult = true;
      if (minA === null && maxA !== null && maxA < 18) hasTeen = true;
    }
    if (hasTeen && !hasAdult) return "teen";
    if (hasAdult && !hasTeen) return "adult";
    return "other";
  };

  const monthKeyOf = (o: OfferingWithPackages): string => {
    const d = new Date(o.startsAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  type OfferingFilterKey = "search" | "package" | "location" | "instructor" | "status" | "audience" | "month";

  const offeringMatchers = useMemo(() => ({
    search: (o: OfferingWithPackages) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const pkg = packages.find((p) => p.id === o.packageId);
      const loc = locations.find((l) => l.id === o.locationId);
      const inst = instructors.find((i) => i.id === o.instructorId);
      const haystack = [o.name, o.notes, pkg?.name, loc?.name, inst?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    },
    package: (o: OfferingWithPackages) => {
      if (lockedPackageId) return o.packageId === lockedPackageId;
      return packageFilter === "all" || String(o.packageId) === packageFilter;
    },
    location: (o: OfferingWithPackages) => locationFilter === "all" || String(o.locationId ?? "none") === locationFilter,
    instructor: (o: OfferingWithPackages) => instructorFilter === "all" || String(o.instructorId ?? "none") === instructorFilter,
    status: (o: OfferingWithPackages) => statusFilter === "all" || o.status === statusFilter,
    audience: (o: OfferingWithPackages) => audienceFilter === "all" || offeringAudience(o) === audienceFilter,
    month: (o: OfferingWithPackages) => monthFilter === "all" || monthKeyOf(o) === monthFilter,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [searchQuery, packageFilter, locationFilter, instructorFilter, statusFilter, audienceFilter, monthFilter, packages, locations, instructors]);

  function passesOffering(o: OfferingWithPackages, except?: OfferingFilterKey): boolean {
    const keys: OfferingFilterKey[] = ["search", "package", "location", "instructor", "status", "audience", "month"];
    for (const k of keys) {
      if (k === except) continue;
      if (!offeringMatchers[k](o)) return false;
    }
    return true;
  }

  const filteredOfferings = useMemo(
    () => offerings.filter((o) => passesOffering(o)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offerings, offeringMatchers],
  );

  // Cascading available option sets — each computed against all OTHER active filters.
  const availablePackageIds = useMemo(() => {
    const s = new Set<number>();
    for (const o of offerings) if (passesOffering(o, "package") && o.packageId) s.add(o.packageId);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, offeringMatchers]);

  const availableLocationKeys = useMemo(() => {
    const s = new Set<string>();
    for (const o of offerings) if (passesOffering(o, "location")) s.add(String(o.locationId ?? "none"));
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, offeringMatchers]);

  const availableInstructorKeys = useMemo(() => {
    const s = new Set<string>();
    for (const o of offerings) if (passesOffering(o, "instructor")) s.add(String(o.instructorId ?? "none"));
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, offeringMatchers]);

  const availableStatuses = useMemo(() => {
    const s = new Set<string>();
    for (const o of offerings) if (passesOffering(o, "status")) s.add(o.status);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, offeringMatchers]);

  const availableAudiences = useMemo(() => {
    const s = new Set<string>();
    for (const o of offerings) if (passesOffering(o, "audience")) s.add(offeringAudience(o));
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, offeringMatchers]);

  const availableMonths = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of offerings) {
      if (!passesOffering(o, "month")) continue;
      const d = new Date(o.startsAt);
      const key = monthKeyOf(o);
      const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
      if (!seen.has(key)) seen.set(key, label);
    }
    return Array.from(seen.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, label]) => ({ key, label }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerings, offeringMatchers]);

  // Auto-reset downstream filters that become unreachable.
  useEffect(() => {
    if (packageFilter !== "all" && !availablePackageIds.has(Number(packageFilter))) setPackageFilter("all");
  }, [availablePackageIds, packageFilter]);
  useEffect(() => {
    if (isLoading) return;
    if (locationFilter !== "all" && !availableLocationKeys.has(locationFilter)) updateLocationFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableLocationKeys, locationFilter, isLoading]);
  useEffect(() => {
    if (instructorFilter !== "all" && !availableInstructorKeys.has(instructorFilter)) setInstructorFilter("all");
  }, [availableInstructorKeys, instructorFilter]);
  useEffect(() => {
    if (statusFilter !== "all" && !availableStatuses.has(statusFilter)) setStatusFilter("all");
  }, [availableStatuses, statusFilter]);
  useEffect(() => {
    if (audienceFilter !== "all" && !availableAudiences.has(audienceFilter)) setAudienceFilter("all");
  }, [availableAudiences, audienceFilter]);
  useEffect(() => {
    if (monthFilter !== "all" && !availableMonths.some((m) => m.key === monthFilter)) setMonthFilter("all");
  }, [availableMonths, monthFilter]);

  const STATUS_LABELS: Record<string, string> = {
    DRAFT: "Draft", PUBLISHED: "Published", FULL: "Full", CANCELLED: "Cancelled", COMPLETED: "Completed",
  };
  const AUDIENCE_LABELS: Record<string, string> = { teen: "Teen", adult: "Adult", other: "Other" };

  const activeOfferingFilterChips = useMemo(() => {
    const chips: { key: OfferingFilterKey; label: string; onRemove: () => void }[] = [];
    if (searchQuery.trim()) chips.push({ key: "search", label: `“${searchQuery.trim()}”`, onRemove: () => setSearchQuery("") });
    if (!lockedPackageId && packageFilter !== "all") {
      const p = packages.find((x) => String(x.id) === packageFilter);
      chips.push({ key: "package", label: `Package: ${p?.name ?? packageFilter}`, onRemove: () => setPackageFilter("all") });
    }
    if (locationFilter !== "all") {
      const l = locations.find((x) => String(x.id) === locationFilter);
      const label = locationFilter === "none" ? "No location" : l?.name ?? locationFilter;
      chips.push({ key: "location", label: `Location: ${label}`, onRemove: () => updateLocationFilter("all") });
    }
    if (instructorFilter !== "all") {
      const i = instructors.find((x) => x.id === instructorFilter);
      const label = instructorFilter === "none" ? "Unassigned" : i?.name ?? instructorFilter;
      chips.push({ key: "instructor", label: `Instructor: ${label}`, onRemove: () => setInstructorFilter("all") });
    }
    if (statusFilter !== "all") chips.push({ key: "status", label: `Status: ${STATUS_LABELS[statusFilter] ?? statusFilter}`, onRemove: () => setStatusFilter("all") });
    if (audienceFilter !== "all") chips.push({ key: "audience", label: `Audience: ${AUDIENCE_LABELS[audienceFilter] ?? audienceFilter}`, onRemove: () => setAudienceFilter("all") });
    if (monthFilter !== "all") {
      const m = availableMonths.find((x) => x.key === monthFilter);
      chips.push({ key: "month", label: `Month: ${m?.label ?? monthFilter}`, onRemove: () => setMonthFilter("all") });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, packageFilter, locationFilter, instructorFilter, statusFilter, audienceFilter, monthFilter, packages, locations, instructors, availableMonths]);

  const hasActiveFilters = activeOfferingFilterChips.length > 0;

  const clearFilters = () => {
    updateLocationFilter("all");
    setInstructorFilter("all");
    setAudienceFilter("all");
    setMonthFilter("all");
    if (!lockedPackageId) setPackageFilter("all");
    setStatusFilter("all");
    setSearchQuery("");
  };

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  return (
    <div className={embedded ? "" : "p-6"}>
      {!hidePageHeader && (
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          {!embedded ? (
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Cohorts</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Named in-class cohorts (sessions/courses) that one or more packages can fulfill.
              </p>
            </div>
          ) : <div />}
          {canEdit && (
            <Dialog open={createOpen} onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) createForm.reset(defaultOfferingFormValues);
              else if (lockedPackageId) createForm.setValue("packageId", lockedPackageId);
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-offering">
                  <Plus className="h-4 w-4 mr-1" /> Add Cohort
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Cohort</DialogTitle>
                </DialogHeader>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit((d) => createMut.mutate(d))} className="space-y-4">
                    <OfferingFields form={createForm} locations={locations} instructors={instructors} packages={packages} lockedPackageId={lockedPackageId} />
                    <Button type="submit" disabled={createMut.isPending} data-testid="button-submit-offering">
                      {createMut.isPending ? "Creating…" : "Create Cohort"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {waitlistFor && tenantId && (
        <WaitlistDialog
          tenantId={tenantId}
          offering={waitlistFor}
          onClose={() => setWaitlistFor(null)}
        />
      )}

      {generatingFor && tenantId && (
        <GenerateSessionsDialog
          tenantId={tenantId}
          offering={generatingFor}
          locations={locations}
          instructors={instructors}
          onClose={() => setGeneratingFor(null)}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cohorts…"
            className="pl-8 w-[220px]"
            data-testid="input-offering-search"
          />
        </div>
        {!lockedPackageId && (
          <Select value={packageFilter} onValueChange={setPackageFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-filter-package">
              <SelectValue placeholder="Package" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Packages</SelectItem>
              {packages.filter((p) => availablePackageIds.has(p.id)).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={locationFilter} onValueChange={updateLocationFilter}>
          <SelectTrigger className="w-[170px]" data-testid="select-filter-location">
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {availableLocationKeys.has("none") && <SelectItem value="none">— No location —</SelectItem>}
            {locations.filter((l) => availableLocationKeys.has(String(l.id))).map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={instructorFilter} onValueChange={setInstructorFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-instructor">
            <SelectValue placeholder="Instructor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Instructors</SelectItem>
            {availableInstructorKeys.has("none") && <SelectItem value="none">— Unassigned —</SelectItem>}
            {instructors.filter((i) => availableInstructorKeys.has(i.id)).map((i) => (
              <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(["DRAFT","PUBLISHED","FULL","CANCELLED","COMPLETED"] as const).filter((s) => availableStatuses.has(s)).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={audienceFilter} onValueChange={(v) => setAudienceFilter(v as typeof audienceFilter)}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-audience">
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Audiences</SelectItem>
            {(["teen","adult","other"] as const).filter((a) => availableAudiences.has(a)).map((a) => (
              <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[170px]" data-testid="select-filter-month">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {availableMonths.map((m) => (
              <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="h-4 w-4 mr-1" /> Clear all
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
          <Button
            variant={viewMode === "tiles" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("tiles")}
            data-testid="button-view-tiles"
            title="Tile view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            data-testid="button-view-table"
            title="Table view"
          >
            <TableIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {canEdit && selectedIds.length > 0 && viewMode === "table" && (
        <div
          className="flex items-center gap-2 mb-2 p-2 rounded border bg-muted/40"
          data-testid="bar-bulk-actions"
        >
          <span className="text-sm font-medium" data-testid="text-bulk-selected-count">
            {selectedIds.length} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkMoveOpen(true)}
            data-testid="button-bulk-move-package"
          >
            <ArrowRightLeft className="h-4 w-4 mr-1" /> Move to package…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds([])}
            data-testid="button-bulk-clear"
          >
            Clear
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-3 min-h-[28px]">
        {activeOfferingFilterChips.map((chip) => (
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
        <span className="ml-auto text-xs text-muted-foreground" data-testid="text-offering-filter-count">
          Showing {filteredOfferings.length} of {offerings.length} cohorts
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : offerings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No cohorts yet. Create your first cohort.</p>
          </CardContent>
        </Card>
      ) : filteredOfferings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-offerings-match">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No offerings match the current filters.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters} data-testid="button-clear-filters-empty">
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "table" ? (
        <div className="border rounded-md overflow-x-auto" data-testid="table-offerings">
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={filteredOfferings.length > 0 && filteredOfferings.every((o) => selectedIds.includes(o.id))}
                      onCheckedChange={(v) => {
                        if (v) {
                          setSelectedIds(Array.from(new Set([...selectedIds, ...filteredOfferings.map((o) => o.id)])));
                        } else {
                          const visible = new Set(filteredOfferings.map((o) => o.id));
                          setSelectedIds(selectedIds.filter((id) => !visible.has(id)));
                        }
                      }}
                      data-testid="checkbox-select-all-offerings"
                    />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                {!lockedPackageId && <TableHead>Package</TableHead>}
                <TableHead>Location</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Sessions</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOfferings.map((o) => {
                const loc = locations.find((l) => l.id === o.locationId);
                const inst = instructors.find((i) => i.id === o.instructorId);
                const aud = offeringAudience(o);
                const parentPkg = packages.find((p) => p.id === o.packageId);
                return (
                  <TableRow key={o.id} data-testid={`row-offering-${o.id}`}>
                    {canEdit && (
                      <TableCell className="w-8">
                        <Checkbox
                          checked={selectedIds.includes(o.id)}
                          onCheckedChange={(v) => {
                            setSelectedIds((prev) => v ? Array.from(new Set([...prev, o.id])) : prev.filter((x) => x !== o.id));
                          }}
                          data-testid={`checkbox-select-offering-${o.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      <Link href={o.packageId ? `/admin/packages/${o.packageId}/cohorts/${o.id}` : `/admin/packages`} className="text-primary hover:underline" data-testid={`link-offering-name-${o.id}`}>
                        {o.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant[o.status] || "outline"}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(o.startsAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(o.endsAt)}</TableCell>
                    {!lockedPackageId && (
                      <TableCell>
                        {parentPkg ? (
                          <Link
                            href={`/admin/packages/${parentPkg.id}`}
                            className="text-primary hover:underline"
                            data-testid={`link-offering-package-${o.id}`}
                          >
                            {parentPkg.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>{loc?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{inst?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><span className="capitalize">{aud}</span></TableCell>
                    <TableCell className="whitespace-nowrap">{o.enrolledCount}/{o.capacity}</TableCell>
                    <TableCell className="whitespace-nowrap" data-testid={`text-session-count-row-${o.id}`}>
                      {(o.sessionCount ?? 0) === 0 ? (
                        <span className="text-amber-700 dark:text-amber-300">0</span>
                      ) : (
                        <Link href={`/admin/calendar?offeringId=${o.id}`} className="text-primary hover:underline">
                          {o.sessionCount}
                        </Link>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <CohortRowActionsMenu
                          offering={o}
                          triggerTestId={`button-cohort-actions-row-${o.id}`}
                          onGenerate={() => setGeneratingFor(o)}
                          onChangePackage={() => setChangePkgFor(o)}
                          onWaitlist={() => setWaitlistFor(o)}
                          onDelete={() => deleteMut.mutate(o.id)}
                          generateTestId={`button-generate-sessions-row-${o.id}`}
                          changePackageTestId={`button-change-package-row-${o.id}`}
                          waitlistTestId={`button-waitlist-row-${o.id}`}
                          deleteTestId={`button-delete-offering-row-${o.id}`}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOfferings.map((o) => {
            const loc = locations.find((l) => l.id === o.locationId);
            const inst = instructors.find((i) => i.id === o.instructorId);
            const linkedPkgs = packages.filter((p) => p.id === o.packageId);
            return (
              <Card key={o.id} data-testid={`card-offering-${o.id}`}>
                <CardHeader className="space-y-2 pb-2">
                  <CardTitle className="text-base">
                    <Link href={o.packageId ? `/admin/packages/${o.packageId}/cohorts/${o.id}` : `/admin/packages`} className="hover:underline" data-testid={`link-offering-card-${o.id}`}>
                      {o.name}
                    </Link>
                  </CardTitle>
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <Badge variant={statusBadgeVariant[o.status] || "outline"}>{o.status}</Badge>
                    <Link href={o.packageId ? `/admin/packages/${o.packageId}/cohorts/${o.id}` : `/admin/packages`}>
                      <Button size="icon" variant="ghost" data-testid={`button-view-offering-${o.id}`} title="View details">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    {canEdit && (
                      <CohortRowActionsMenu
                        offering={o}
                        triggerTestId={`button-cohort-actions-${o.id}`}
                        onGenerate={() => setGeneratingFor(o)}
                        onChangePackage={() => setChangePkgFor(o)}
                        onWaitlist={() => setWaitlistFor(o)}
                        onDelete={() => deleteMut.mutate(o.id)}
                        generateTestId={`button-generate-sessions-${o.id}`}
                        changePackageTestId={`button-change-package-${o.id}`}
                        waitlistTestId={`button-waitlist-${o.id}`}
                        deleteTestId={`button-delete-offering-${o.id}`}
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {o.description && <p className="text-muted-foreground line-clamp-2">{o.description}</p>}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDateTime(o.startsAt)} → {formatDateTime(o.endsAt)}</span>
                  </div>
                  {loc && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{loc.name}</span>
                    </div>
                  )}
                  {inst && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      <span>{inst.name}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
                    <Users className="h-3.5 w-3.5" />
                    <span>{o.enrolledCount}/{o.capacity} enrolled</span>
                    {(o.pendingInterestCount ?? 0) > 0 && (
                      <Link
                        href="/admin/enrollments"
                        title={`${o.pendingInterestCount} shopper(s) with pending cash payments for this cohort. Pending intent does not hold seats.`}
                        className="inline-flex items-center"
                        data-testid={`link-pending-interest-${o.id}`}
                      >
                        <Badge
                          variant="outline"
                          className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-[10px] px-1.5 py-0"
                          data-testid={`chip-pending-interest-${o.id}`}
                        >
                          +{o.pendingInterestCount} pending interest
                        </Badge>
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span data-testid={`text-session-count-${o.id}`}>
                        {(o.sessionCount ?? 0)} session{(o.sessionCount ?? 0) === 1 ? "" : "s"} scheduled
                      </span>
                    </div>
                    {(o.sessionCount ?? 0) > 0 && (
                      <Link
                        href={`/admin/calendar?offeringId=${o.id}`}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        data-testid={`link-view-on-calendar-${o.id}`}
                      >
                        View on Calendar <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  {(o.sessionCount ?? 0) === 0 && (
                    <div
                      className="mt-1 p-3 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs space-y-2"
                      data-testid={`warning-no-sessions-${o.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                          {o.status === "PUBLISHED"
                            ? "Published, but no sessions exist yet."
                            : "No sessions scheduled for this cohort yet."}
                        </span>
                      </div>
                      {canEdit && (
                        <Button
                          size="sm"
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => setGeneratingFor(o)}
                          data-testid={`button-generate-cta-${o.id}`}
                        >
                          <Wand2 className="h-3.5 w-3.5 mr-1" /> Add more sessions
                        </Button>
                      )}
                    </div>
                  )}
                  {linkedPkgs.length > 0 && !lockedPackageId && (
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                      {linkedPkgs.map((p) => (
                        <Link key={p.id} href={`/admin/packages/${p.id}`} data-testid={`link-card-offering-package-${o.id}-${p.id}`}>
                          <Badge variant="outline" className="text-xs hover-elevate cursor-pointer">{p.name}</Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canEdit && tenantId && (
        <>
          <ChangeOfferingPackageDialog
            open={!!changePkgFor}
            onOpenChange={(o) => { if (!o) setChangePkgFor(null); }}
            tenantId={tenantId}
            offering={changePkgFor}
            packages={packages}
          />
          <BulkMovePackageDialog
            open={bulkMoveOpen}
            onOpenChange={setBulkMoveOpen}
            tenantId={tenantId}
            offerings={offerings.filter((o) => selectedIds.includes(o.id))}
            packages={packages}
            onDone={() => setSelectedIds([])}
          />
        </>
      )}
    </div>
  );
}

export function OfferingFields({
  form,
  locations,
  instructors,
  packages,
  lockedPackageId,
}: {
  form: ReturnType<typeof useForm<OfferingFormValues>>;
  locations: Location[];
  instructors: Instructor[];
  packages: PackageType[];
  lockedPackageId?: number;
}) {
  const eligiblePackages = packages.filter((p) => p.sellableStandalone !== false);
  const lockedPkg = lockedPackageId ? packages.find((p) => p.id === lockedPackageId) : undefined;
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cohort Name</FormLabel>
            <FormControl><Input {...field} placeholder="e.g. Summer Teen Session A" data-testid="input-offering-name" /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl><Textarea {...field} value={field.value ?? ""} data-testid="input-offering-description" /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="startsDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Starts</FormLabel>
              <FormControl><Input type="date" {...field} data-testid="input-starts-date" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="startsTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start time</FormLabel>
              <FormControl><Input type="time" {...field} data-testid="input-starts-time" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="endsDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ends</FormLabel>
              <FormControl><Input type="date" {...field} data-testid="input-ends-date" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="endsTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>End time</FormLabel>
              <FormControl><Input type="time" {...field} data-testid="input-ends-time" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="locationId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <Select onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))} value={field.value ? String(field.value) : "none"}>
                <FormControl><SelectTrigger data-testid="select-location"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="instructorId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructor</FormLabel>
              <Select onValueChange={(v) => field.onChange(v === "none" ? null : v)} value={field.value || "none"}>
                <FormControl><SelectTrigger data-testid="select-instructor"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="capacity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Capacity</FormLabel>
              <FormControl><Input type="number" min={1} {...field} data-testid="input-capacity" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="FULL">Full</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="packageId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Package</FormLabel>
            <FormDescription>This cohort belongs to one package. Students who buy that package can enroll.</FormDescription>
            {lockedPackageId ? (
              <>
                <div
                  className="rounded-md border bg-muted px-3 py-2 text-sm"
                  data-testid="text-locked-package"
                >
                  {lockedPkg?.name ?? `Package #${lockedPackageId}`}
                </div>
                <input type="hidden" value={lockedPackageId} readOnly />
              </>
            ) : (
              <Select
                onValueChange={(v) => field.onChange(Number(v))}
                value={field.value ? String(field.value) : ""}
              >
                <FormControl>
                  <SelectTrigger data-testid="select-package">
                    <SelectValue placeholder="Select a package" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {eligiblePackages.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground italic">No non-add-on packages found.</div>
                  ) : eligiblePackages.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)} data-testid={`option-pkg-${p.id}`}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl><Textarea {...field} value={field.value ?? ""} placeholder="Internal notes" data-testid="input-notes" /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function WaitlistDialog({
  tenantId,
  offering,
  onClose,
}: {
  tenantId: number;
  offering: OfferingWithPackages;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const { data: list = [], isLoading } = useQuery<OfferingWaitlist[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings", offering.id, "waitlist"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/schedule-offerings/${offering.id}/waitlist`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const addMut = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/tenants/${tenantId}/schedule-offerings/${offering.id}/waitlist`, {
        firstName: first,
        lastName: last,
        email,
        phone: phone || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings", offering.id, "waitlist"] });
      setFirst(""); setLast(""); setEmail(""); setPhone("");
      toast({ title: "Added to waitlist" });
    },
    onError: () => toast({ title: "Failed to add", variant: "destructive" }),
  });

  const removeMut = useMutation({
    mutationFn: async (wid: number) =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/schedule-offerings/${offering.id}/waitlist/${wid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings", offering.id, "waitlist"] });
      toast({ title: "Removed" });
    },
  });

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Waitlist — {offering.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading ? <Skeleton className="h-20" /> : list.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No one on the waitlist.</p>
          ) : (
            <div className="space-y-2">
              {list.map((w) => (
                <div key={w.id} className="flex items-center gap-2 p-2 border rounded" data-testid={`row-waitlist-${w.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{w.firstName} {w.lastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{w.email}{w.phone ? ` · ${w.phone}` : ""}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeMut.mutate(w.id)} data-testid={`button-remove-waitlist-${w.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium">Add to waitlist</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} data-testid="input-waitlist-first" />
              <Input placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} data-testid="input-waitlist-last" />
              <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-waitlist-email" />
              <Input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-waitlist-phone" />
            </div>
            <Button
              size="sm"
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || !first || !last || !email}
              data-testid="button-add-waitlist"
            >
              <Plus className="h-4 w-4 mr-1" />
              {addMut.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface PreviewOccurrence {
  startAt: string;
  endAt: string;
  conflict: boolean;
  availabilityWarning: boolean;
}

function GenerateSessionsDialog({
  tenantId,
  offering,
  locations,
  instructors,
  onClose,
}: {
  tenantId: number;
  offering: OfferingWithPackages;
  locations: Location[];
  instructors: GeneratorInstructor[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const offeringStart = useMemo(() => toDatePart(offering.startsAt), [offering.startsAt]);
  const offeringEnd = useMemo(() => toDatePart(offering.endsAt), [offering.endsAt]);
  const offeringStartTime = useMemo(() => toTimePart(offering.startsAt), [offering.startsAt]);
  const offeringEndTime = useMemo(() => toTimePart(offering.endsAt), [offering.endsAt]);

  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3]);
  const [startDate, setStartDate] = useState(offeringStart);
  const [endDate, setEndDate] = useState(offeringEnd);
  const [startTime, setStartTime] = useState(offeringStartTime);
  const [endTime, setEndTime] = useState(offeringEndTime);
  const [instructorId, setInstructorId] = useState(offering.instructorId ?? "");
  const [locationId, setLocationId] = useState<number | null>(offering.locationId ?? null);
  const [capacity, setCapacity] = useState(offering.capacity ?? 20);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<{ occurrences: PreviewOccurrence[]; summary: { total: number; conflicts: number; availabilityWarnings: number } } | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  function toggleDay(d: number) {
    setDaysOfWeek((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  function invalidatePreview() {
    setPreview(null);
    setSkipped(new Set());
  }

  type PreviewResponse = {
    occurrences: PreviewOccurrence[];
    summary: { total: number; conflicts: number; availabilityWarnings: number };
  };
  type CommitResponse = { created: number; recurrenceGroupId: string };

  const previewMut = useMutation<PreviewResponse, Error>({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/tenants/${tenantId}/schedule-offerings/${offering.id}/preview-sessions`,
        {
          daysOfWeek,
          startTime,
          endTime,
          startDate,
          endDate,
          instructorId: instructorId || null,
          locationId,
          capacity,
          notes: notes || null,
        },
      );
      return (await res.json()) as PreviewResponse;
    },
    onSuccess: (data) => {
      setPreview(data);
      const auto = new Set<string>();
      for (const o of data.occurrences) {
        if (o.conflict) auto.add(o.startAt);
      }
      setSkipped(auto);
    },
    onError: (err) => toast({ title: err?.message || "Failed to preview", variant: "destructive" }),
  });

  const commitMut = useMutation<CommitResponse, Error>({
    mutationFn: async () => {
      const occurrences = (preview?.occurrences ?? [])
        .filter((o) => !skipped.has(o.startAt))
        .map((o) => ({ startAt: o.startAt, endAt: o.endAt }));
      const res = await apiRequest(
        "POST",
        `/api/tenants/${tenantId}/schedule-offerings/${offering.id}/generate-sessions`,
        {
          instructorId: instructorId || null,
          locationId,
          capacity,
          notes: notes || null,
          occurrences,
        },
      );
      return (await res.json()) as CommitResponse;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      toast({ title: `Created ${data.created} session${data.created === 1 ? "" : "s"}` });
      onClose();
    },
    onError: (err) => toast({ title: err?.message || "Failed to generate", variant: "destructive" }),
  });

  const eligibleInstructors = instructors.filter((i) =>
    !i.instructorType || i.instructorType === "BOTH" || i.instructorType === "CLASSROOM",
  );
  const selectableCount = (preview?.occurrences ?? []).filter((o) => !skipped.has(o.startAt)).length;
  const formInvalid = daysOfWeek.length === 0 || !startDate || !endDate || !startTime || !endTime;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" /> Add more sessions — {offering.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Pattern */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Pattern</h3>
            <p className="text-xs text-muted-foreground">
              Generates classroom sessions for this cohort. Drive sessions are scheduled individually.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Start date</label>
                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); invalidatePreview(); }} data-testid="input-gen-start-date" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">End date</label>
                <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); invalidatePreview(); }} data-testid="input-gen-end-date" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium mb-1 block">Start</label>
                  <Input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); invalidatePreview(); }} data-testid="input-gen-start-time" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">End</label>
                  <Input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); invalidatePreview(); }} data-testid="input-gen-end-time" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Repeat on</label>
              <div className="flex gap-1 flex-wrap">
                {WEEKDAY_LABELS.map((lbl, idx) => {
                  const active = daysOfWeek.includes(idx);
                  return (
                    <Button
                      key={idx}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => { toggleDay(idx); invalidatePreview(); }}
                      data-testid={`button-dow-${idx}`}
                    >
                      {lbl}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Resources */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Resources</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Instructor <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Select value={instructorId || "none"} onValueChange={(v) => { setInstructorId(v === "none" ? "" : v); invalidatePreview(); }}>
                  <SelectTrigger data-testid="select-gen-instructor"><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {eligibleInstructors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Location</label>
                <Select value={locationId ? String(locationId) : "none"} onValueChange={(v) => { setLocationId(v === "none" ? null : Number(v)); invalidatePreview(); }}>
                  <SelectTrigger data-testid="select-gen-location"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Capacity</label>
                <Input type="number" min={1} value={capacity} onChange={(e) => { setCapacity(parseInt(e.target.value) || 1); invalidatePreview(); }} data-testid="input-gen-capacity" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Notes (optional)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-gen-notes" />
            </div>
          </div>

          {/* Preview & Confirm */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Preview</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => previewMut.mutate()}
                disabled={previewMut.isPending || formInvalid}
                data-testid="button-preview-sessions"
              >
                {previewMut.isPending ? "Building preview…" : preview ? "Refresh preview" : "Build preview"}
              </Button>
            </div>

            {preview && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline" data-testid="badge-summary-total">{preview.summary.total} total</Badge>
                  {preview.summary.conflicts > 0 && (
                    <Badge variant="destructive" data-testid="badge-summary-conflicts">{preview.summary.conflicts} conflict{preview.summary.conflicts === 1 ? "" : "s"}</Badge>
                  )}
                  {preview.summary.availabilityWarnings > 0 && (
                    <Badge className="bg-amber-500 text-white hover:bg-amber-600" data-testid="badge-summary-warnings">
                      {preview.summary.availabilityWarnings} availability warning{preview.summary.availabilityWarnings === 1 ? "" : "s"}
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto" data-testid="text-selected-count">
                    {selectableCount} selected to create
                  </span>
                </div>

                {preview.occurrences.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic p-3 border rounded">
                    No occurrences match this pattern. Try widening the date range or selecting more weekdays.
                  </p>
                ) : (
                  <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                    {preview.occurrences.map((occ) => {
                      const d = new Date(occ.startAt);
                      const e = new Date(occ.endAt);
                      const isSkipped = skipped.has(occ.startAt);
                      return (
                        <label
                          key={occ.startAt}
                          className={`flex items-center gap-3 p-2 text-sm cursor-pointer ${isSkipped ? "opacity-50" : ""}`}
                          data-testid={`row-occurrence-${occ.startAt}`}
                        >
                          <Checkbox
                            checked={!isSkipped}
                            disabled={occ.conflict}
                            onCheckedChange={(v) => {
                              setSkipped((prev) => {
                                const next = new Set(prev);
                                if (v === true) next.delete(occ.startAt);
                                else next.add(occ.startAt);
                                return next;
                              });
                            }}
                            data-testid={`checkbox-occurrence-${occ.startAt}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">
                              {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – {e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                          {occ.conflict && (
                            <Badge variant="destructive" className="text-xs">Conflict</Badge>
                          )}
                          {!occ.conflict && occ.availabilityWarning && (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-xs">Outside availability</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-generate">Cancel</Button>
            <Button
              onClick={() => commitMut.mutate()}
              disabled={!preview || selectableCount === 0 || commitMut.isPending}
              data-testid="button-confirm-generate"
            >
              {commitMut.isPending ? "Creating…" : `Create ${selectableCount} session${selectableCount === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
