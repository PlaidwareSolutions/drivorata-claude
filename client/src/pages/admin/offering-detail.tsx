import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form } from "@/components/ui/form";
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
  ArrowLeft,
  Calendar,
  Users,
  MapPin,
  User as UserIcon,
  ExternalLink,
  ClipboardList,
  Activity,
  Package as PackageIcon,
  AlertTriangle,
  Clock,
  Pencil,
  Trash2,
  UserCog,
  ArrowRightLeft,
} from "lucide-react";
import { useState, useEffect } from "react";
import { BulkAssignInstructorDialog } from "@/components/admin/bulk-assign-instructor-dialog";
import { ChangeOfferingPackageDialog } from "@/components/admin/change-offering-package-dialog";
import { Breadcrumbs } from "@/components/breadcrumbs";
import type {
  ScheduleOffering,
  ScheduleSession,
  Enrollment,
  Location,
  Package as PackageType,
  AuditEvent,
} from "@shared/schema";
import {
  OfferingFields,
  offeringFormSchema,
  defaultOfferingFormValues,
  toDatePart,
  toTimePart,
  type OfferingFormValues,
} from "@/components/admin/cohorts-manager";

type OfferingWithPackages = ScheduleOffering;

interface Instructor {
  id: string;
  name: string;
  email: string;
}

const offeringStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  FULL: "outline",
  CANCELLED: "destructive",
  COMPLETED: "outline",
};

const sessionStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  SCHEDULED: "default",
  IN_PROGRESS: "default",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

const enrollmentStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  confirmed: "default",
  in_progress: "default",
  completed: "outline",
  pending: "secondary",
  pending_payment: "secondary",
  cancelled: "destructive",
  refunded: "destructive",
  expired: "outline",
};

function formatShortDate(d: string | Date) {
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: string | Date) {
  return new Date(d).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function humanizeAction(action: string): string {
  return action
    .replace(/^offering\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function OfferingDetailPage() {
  const { currentTenant, hasAnyRole } = useTenant();
  const tenantId = currentTenant?.tenantId;
  const [, nestedParams] = useRoute("/admin/packages/:id/cohorts/:cid");
  const [, legacyParams] = useRoute("/admin/schedule-offerings/:oid");
  const oidRaw = nestedParams?.cid ?? legacyParams?.oid;
  const pkgIdRaw = nestedParams?.id;
  const oid = oidRaw ? parseInt(oidRaw) : 0;
  const pkgIdFromUrl = pkgIdRaw ? parseInt(pkgIdRaw) : 0;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const canEdit = hasAnyRole("tenant_admin", "office_manager", "platform_admin");
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [changePkgOpen, setChangePkgOpen] = useState(false);
  const [tabValue, setTabValue] = useState<string>("overview");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#sessions") setTabValue("sessions");
  }, []);

  const offeringQuery = useQuery<OfferingWithPackages>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings", oid],
    enabled: !!tenantId && !!oid,
  });

  const sessionsQuery = useQuery<ScheduleSession[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings", oid, "sessions"],
    enabled: !!tenantId && !!oid,
  });

  const rosterQuery = useQuery<Enrollment[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings", oid, "enrollments"],
    enabled: !!tenantId && !!oid,
  });

  const auditQuery = useQuery<AuditEvent[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings", oid, "audit"],
    enabled: !!tenantId && !!oid,
  });

  const locationsQuery = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    enabled: !!tenantId,
  });

  const instructorsQuery = useQuery<Instructor[]>({
    queryKey: ["/api/tenants", tenantId, "instructors"],
    enabled: !!tenantId,
  });

  const packagesQuery = useQuery<PackageType[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    enabled: !!tenantId,
  });

  const editForm = useForm<OfferingFormValues>({
    resolver: zodResolver(offeringFormSchema),
    defaultValues: defaultOfferingFormValues,
  });

  useEffect(() => {
    const o = offeringQuery.data;
    if (o) {
      editForm.reset({
        name: o.name,
        description: o.description ?? "",
        locationId: o.locationId ?? null,
        instructorId: o.instructorId ?? null,
        capacity: o.capacity ?? 20,
        startsDate: toDatePart(o.startsAt),
        startsTime: toTimePart(o.startsAt),
        endsDate: toDatePart(o.endsAt),
        endsTime: toTimePart(o.endsAt),
        status: o.status as any,
        notes: o.notes ?? "",
        packageId: o.packageId,
      });
    }
  }, [offeringQuery.data, editForm]);

  const editMut = useMutation({
    mutationFn: async (data: OfferingFormValues) => {
      const startsAt = new Date(`${data.startsDate}T${data.startsTime}`).toISOString();
      const endsAt = new Date(`${data.endsDate}T${data.endsTime}`).toISOString();
      const payload = {
        name: data.name,
        description: data.description || null,
        locationId: data.locationId || null,
        instructorId: data.instructorId || null,
        capacity: data.capacity,
        startsAt,
        endsAt,
        status: data.status,
        notes: data.notes || null,
        packageId: data.packageId,
      };
      return apiRequest("PATCH", `/api/tenants/${tenantId}/schedule-offerings/${oid}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings", oid] });
      toast({ title: "Cohort updated" });
    },
    onError: () => toast({ title: "Failed to update cohort", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `/api/tenants/${tenantId}/schedule-offerings/${oid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      toast({ title: "Cohort deleted" });
      navigate("/admin/calendar?manageOfferings=1");
    },
    onError: () => toast({ title: "Failed to delete cohort", variant: "destructive" }),
  });

  if (offeringQuery.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-12 w-2/3" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!offeringQuery.data) {
    const fallbackPkgHref = pkgIdFromUrl
      ? `/admin/packages/${pkgIdFromUrl}#cohorts`
      : "/admin/calendar?manageOfferings=1";
    return (
      <div className="p-6">
        <Link href={fallbackPkgHref}>
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-offerings">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Cohorts
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Cohort not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const offering = offeringQuery.data;
  const sessions = sessionsQuery.data || [];
  const roster = rosterQuery.data || [];
  const auditEvents = auditQuery.data || [];
  const locations = locationsQuery.data || [];
  const instructors = instructorsQuery.data || [];
  const packages = packagesQuery.data || [];

  const location = locations.find((l) => l.id === offering.locationId);
  const instructor = instructors.find((i) => i.id === offering.instructorId);
  const linkedPackages = packages.filter((p) => p.id === offering.packageId);

  const activeSessions = sessions.filter((s) => s.status !== "CANCELLED");
  const remainingSeats = Math.max(0, offering.capacity - offering.enrolledCount);
  const activeRoster = roster.filter((e) => e.status !== "cancelled" && e.status !== "refunded");
  const waitlisted = roster.filter((e) => e.isWaitlisted);
  const noSessionsWarning = offering.status === "PUBLISHED" && activeSessions.length === 0;

  const parentPkg = packages.find((p) => p.id === offering.packageId);
  const parentPkgId = offering.packageId;
  const backHref = parentPkgId
    ? `/admin/packages/${parentPkgId}#cohorts`
    : "/admin/calendar?manageOfferings=1";

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <Breadcrumbs
          items={[
            { label: "Packages", href: "/admin/packages" },
            parentPkg
              ? { label: parentPkg.name, href: `/admin/packages/${parentPkg.id}` }
              : { label: "Package", href: "/admin/packages" },
            { label: offering.name },
          ]}
        />
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back-offerings">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Cohorts
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold" data-testid="text-offering-name">{offering.name}</h1>
              <Badge variant={offeringStatusVariant[offering.status] || "outline"} data-testid="badge-offering-status">
                {offering.status}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" />{formatShortDate(offering.startsAt)} – {formatShortDate(offering.endsAt)}</span>
              {location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{location.name}</span>}
              {instructor && <span className="inline-flex items-center gap-1"><UserIcon className="h-4 w-4" />{instructor.name}</span>}
            </div>
            {offering.description && (
              <p className="text-sm text-muted-foreground max-w-3xl" data-testid="text-offering-description">
                {offering.description}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {activeSessions.length > 0 && (
              <Link href={`/admin/calendar?offeringId=${offering.id}`}>
                <Button variant="outline" size="sm" data-testid="link-view-on-calendar">
                  <ExternalLink className="h-4 w-4 mr-1" /> View on Calendar
                </Button>
              </Link>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setChangePkgOpen(true)}
                data-testid="button-change-package"
              >
                <ArrowRightLeft className="h-4 w-4 mr-1" /> Change package
              </Button>
            )}
            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-delete-offering">
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this offering?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the cohort. Existing sessions and enrollments may need to be cleaned up separately. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMut.mutate()}
                      data-testid="button-confirm-delete"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {noSessionsWarning && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">This published cohort has no sessions yet.</p>
              <p className="text-amber-800 dark:text-amber-300/80">Use Add more sessions on the Cohorts page to create the recurring schedule.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Capacity</p>
            <p className="text-2xl font-semibold" data-testid="stat-capacity">{offering.enrolledCount}/{offering.capacity}</p>
            <p className="text-xs text-muted-foreground mt-1">{remainingSeats} open</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Sessions</p>
            <p className="text-2xl font-semibold" data-testid="stat-sessions">{activeSessions.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{sessions.length - activeSessions.length} cancelled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Roster</p>
            <p className="text-2xl font-semibold" data-testid="stat-roster">{activeRoster.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{waitlisted.length} waitlisted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Packages</p>
            <p className="text-2xl font-semibold" data-testid="stat-packages">{linkedPackages.length}</p>
            <p className="text-xs text-muted-foreground mt-1">eligible to book</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview"><ClipboardList className="h-4 w-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="sessions" data-testid="tab-sessions"><Calendar className="h-4 w-4 mr-1" />Sessions ({activeSessions.length})</TabsTrigger>
          <TabsTrigger value="roster" data-testid="tab-roster"><Users className="h-4 w-4 mr-1" />Roster ({activeRoster.length})</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity"><Activity className="h-4 w-4 mr-1" />Activity</TabsTrigger>
          {canEdit && (
            <TabsTrigger value="edit" data-testid="tab-edit"><Pencil className="h-4 w-4 mr-1" />Edit</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Starts</p>
                <p data-testid="text-starts-at">{formatDateTime(offering.startsAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ends</p>
                <p data-testid="text-ends-at">{formatDateTime(offering.endsAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p data-testid="text-location">{location?.name || <span className="text-muted-foreground">—</span>}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Instructor</p>
                <p data-testid="text-instructor">{instructor?.name || <span className="text-muted-foreground">—</span>}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap" data-testid="text-notes">{offering.notes || <span className="text-muted-foreground">—</span>}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><PackageIcon className="h-4 w-4" />Eligible packages</CardTitle>
              <CardDescription>Students enrolled in these packages can book this cohort.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {linkedPackages.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">No packages linked to this offering.</p>
              ) : (
                <div className="divide-y">
                  {linkedPackages.map((p) => (
                    <Link key={p.id} href={`/admin/packages/${p.id}`}>
                      <div className="px-6 py-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer" data-testid={`row-package-${p.id}`}>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          {p.description && <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>}
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">Sessions in this cohort</CardTitle>
                <CardDescription>Generated classroom sessions from this offering's recurring pattern.</CardDescription>
              </div>
              {canEdit && sessions.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkAssignOpen(true)}
                  data-testid="button-bulk-assign-instructor"
                >
                  <UserCog className="h-4 w-4 mr-1" /> Bulk Assign Instructor
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {sessionsQuery.isLoading ? (
                <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : sessions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No sessions yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Seats</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow key={s.id} data-testid={`row-session-${s.id}`}>
                        <TableCell className="font-medium">{formatDateTime(s.startAt)}</TableCell>
                        <TableCell><Badge variant={sessionStatusVariant[s.status] || "outline"}>{s.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{s.bookedCount}/{s.capacity}</TableCell>
                        <TableCell className="text-right">
                          <Link href={parentPkgId ? `/admin/packages/${parentPkgId}/cohorts/${oid}/sessions/${s.id}` : `/admin/sessions/${s.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`link-session-${s.id}`}>View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roster" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roster</CardTitle>
              <CardDescription>Students enrolled in this cohort.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rosterQuery.isLoading ? (
                <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : roster.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No enrollments yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enrolled</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.map((e) => (
                      <TableRow key={e.id} data-testid={`row-enrollment-${e.id}`}>
                        <TableCell className="font-medium">
                          {e.firstName} {e.lastName}
                          {e.isWaitlisted && <Badge variant="outline" className="ml-2">Waitlist</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{e.email}</TableCell>
                        <TableCell><Badge variant={enrollmentStatusVariant[e.status] || "outline"}>{e.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-xs">{e.createdAt ? formatShortDate(e.createdAt as unknown as string) : "—"}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/admin/enrollments?id=${e.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`link-enrollment-${e.id}`}>View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
              <CardDescription>Audit history for this offering.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {auditQuery.isLoading ? (
                <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : auditEvents.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity recorded yet.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {auditEvents.map((ev) => {
                    const details = (ev.details as any) || {};
                    return (
                      <div key={ev.id} className="px-6 py-3 flex items-start justify-between gap-3" data-testid={`row-audit-${ev.id}`}>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{humanizeAction(ev.action)}</p>
                          {details.count != null && (
                            <p className="text-xs text-muted-foreground">{details.count} session{details.count === 1 ? "" : "s"} created</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">{ev.createdAt ? formatDateTime(ev.createdAt as unknown as string) : "—"}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canEdit && (
          <TabsContent value="edit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Edit Cohort</CardTitle>
                <CardDescription>Update this cohort's details, schedule, capacity, and linked packages.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...editForm}>
                  <form
                    onSubmit={editForm.handleSubmit((data) => editMut.mutate(data))}
                    className="space-y-4"
                  >
                    <OfferingFields
                      form={editForm}
                      locations={locationsQuery.data ?? []}
                      instructors={instructorsQuery.data ?? []}
                      packages={packagesQuery.data ?? []}
                    />
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => offeringQuery.data && editForm.reset()}
                        data-testid="button-reset-edit"
                      >
                        Reset
                      </Button>
                      <Button
                        type="submit"
                        disabled={editMut.isPending}
                        data-testid="button-save-edit"
                      >
                        {editMut.isPending ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {canEdit && tenantId && offering && (
        <ChangeOfferingPackageDialog
          open={changePkgOpen}
          onOpenChange={setChangePkgOpen}
          tenantId={tenantId}
          offering={offering}
          packages={packages}
          onChanged={(newPkgId) => {
            navigate(`/admin/packages/${newPkgId}/cohorts/${oid}`, { replace: true });
          }}
        />
      )}
      <BulkAssignInstructorDialog
        open={bulkAssignOpen}
        onOpenChange={setBulkAssignOpen}
        tenantId={tenantId!}
        sessions={sessions}
        instructors={instructors}
        locations={locations}
        hideOfferingFilter
        defaults={{ offeringId: oid }}
        invalidateKeys={[
          ["/api/tenants", tenantId, "schedule-offerings", oid, "sessions"],
          ["/api/tenants", tenantId, "schedule-offerings", oid, "audit"],
        ]}
      />
    </div>
  );
}
