import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRoute, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form } from "@/components/ui/form";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  getEffectivePricesByLocation,
  hasMixedPrices,
  priceRangeCents,
  formatCents,
} from "@/lib/package-pricing";
import { ArrowLeft, Package as PackageIcon, Calendar, Users, Layers, Clock, Car, AlertTriangle, DollarSign, Save } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  PackageFormFields,
  PackageComponentsManager,
  packageSchema,
  defaultFormValues,
  type PackageFormValues,
} from "./packages";
import type { PackageWithDependencies as PackageType, ScheduleOffering, ScheduleSession, Enrollment } from "@shared/schema";
import ScheduleOfferingsPage from "@/components/admin/cohorts-manager";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LocationFilterIndicator } from "@/components/admin/location-filter-indicator";

type OfferingWithSeats = ScheduleOffering & { remainingSeats: number };
type EnrollmentWithBalance = Enrollment & { creditBalance: { classroom: number; drive: number } };


function formatDateTime(d: string | Date) {
  return new Date(d).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(d: string | Date) {
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

const sessionTypeLabel: Record<string, string> = {
  CLASSROOM: "Classroom",
  DRIVE: "Drive",
  BTW_OBSERVATION: "BTW Observation",
  BTW_PRACTICE: "BTW Practice",
  ROAD_TEST: "Road Test",
};

const offeringStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  FULL: "outline",
  CANCELLED: "destructive",
  COMPLETED: "outline",
};

const enrollmentStatusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  confirmed: "default",
  in_progress: "default",
  completed: "outline",
  pending: "secondary",
  pending_payment: "secondary",
  cancelled: "destructive",
};

export default function PackageDetailPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const [, params] = useRoute("/admin/packages/:id");
  const [, setLocation] = useLocation();
  const packageId = params?.id ? parseInt(params.id) : undefined;

  const [tabValue, setTabValue] = useState<string>("overview");
  const [offeringsCreateOnOpen, setOfferingsCreateOnOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const wantsCreate = url.searchParams.get("create") === "1" || url.searchParams.get("new") === "1";
    const hashAnchor = url.hash === "#schedule-offerings" || url.hash === "#cohorts";
    if (wantsCreate || hashAnchor) {
      setTabValue("offerings");
      if (wantsCreate) setOfferingsCreateOnOpen(true);
      url.searchParams.delete("create");
      url.searchParams.delete("new");
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const { data: pkg, isLoading: pkgLoading } = useQuery<PackageType>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "single"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const all: PackageType[] = await res.json();
      const found = all.find((p) => p.id === packageId);
      if (!found) throw new Error("Package not found");
      return found;
    },
    enabled: !!tenantId && !!packageId,
  });

  // Must be declared before the guard effect below to avoid temporal dead zone crash
  const editForm = useForm<PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: defaultFormValues,
  });

  // Reflect the live form kind so tabs update as soon as the radio changes
  const liveKind = useWatch({ control: editForm.control, name: "kind" });
  const isCohortBased = liveKind === "COHORT_BASED" || (!liveKind && pkg?.kind === "COHORT_BASED");

  // If kind is switched away from COHORT_BASED (in form or on load), reset cohort/session tabs
  useEffect(() => {
    if (!isCohortBased && (tabValue === "offerings" || tabValue === "sessions")) {
      setTabValue("overview");
    }
  }, [isCohortBased, tabValue]);

  const { data: offerings = [], isLoading: offeringsLoading } = useQuery<OfferingWithSeats[]>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "offerings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages/${packageId}/offerings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!packageId,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<ScheduleSession[]>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "sessions"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages/${packageId}/sessions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!packageId,
  });

  const { data: enrollmentsList = [], isLoading: enrollmentsLoading } = useQuery<EnrollmentWithBalance[]>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "enrollments"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages/${packageId}/enrollments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!packageId,
  });

  const [finFrom, setFinFrom] = useState<string>("");
  const [finTo, setFinTo] = useState<string>("");

  const finQs = new URLSearchParams();
  if (finFrom) finQs.set("from", new Date(finFrom).toISOString());
  if (finTo) {
    const t = new Date(finTo);
    t.setHours(23, 59, 59, 999);
    finQs.set("to", t.toISOString());
  }
  const finQsStr = finQs.toString();

  const { data: financials, isLoading: financialsLoading } = useQuery<{
    totalRevenueCents: number;
    paidCount: number;
    pendingCount: number;
    failedCount: number;
    refundedCount: number;
    refundedTotalCents: number;
    avgTicketCents: number;
    outstandingBalanceCents: number;
    enrollmentCount: number;
  }>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "financials", finQsStr],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages/${packageId}/financials${finQsStr ? `?${finQsStr}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!packageId,
  });

  const { data: revenueSeries = [], isLoading: revenueSeriesLoading } = useQuery<{ month: string; revenueCents: number }[]>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "revenue-series", finQsStr],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages/${packageId}/revenue-series${finQsStr ? `?${finQsStr}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!packageId,
  });

  const { data: locations = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: allPackages = [] } = useQuery<PackageType[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: pkgLocations } = useQuery<{
    locationIds: number[];
    priceOverrides?: Record<string, number | null>;
  }>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages/${packageId}/locations`, { credentials: "include" });
      if (!res.ok) return { locationIds: [], priceOverrides: {} };
      return res.json();
    },
    enabled: !!tenantId && !!packageId,
  });

  useEffect(() => {
    if (pkg) {
      // Hydrate per-location overrides into the form (cents → dollars),
      // mirroring the list-page dialog so the two pages stay consistent.
      const overrideDollars: Record<string, number | null> = {};
      const rawOverrides = pkgLocations?.priceOverrides ?? {};
      for (const [lid, cents] of Object.entries(rawOverrides)) {
        if (cents == null) continue;
        const n = Number(cents);
        if (Number.isFinite(n) && n >= 0) overrideDollars[lid] = n / 100;
      }
      editForm.reset({
        name: pkg.name,
        description: pkg.description ?? "",
        price: pkg.price / 100,
        kind: (pkg.kind ?? "COHORT_BASED") as PackageFormValues["kind"],
        sellableStandalone: pkg.sellableStandalone ?? true,
        availableAsUpsell: pkg.availableAsUpsell ?? false,
        audience: (pkg.audience ?? "BOTH") as PackageFormValues["audience"],
        tier: (pkg.tier ?? "PRIMARY") as PackageFormValues["tier"],
        language: (pkg.language ?? "ENGLISH") as PackageFormValues["language"],
        imageUrl: pkg.imageUrl ?? "",
        upsellParentPackageIds: Array.isArray(pkg.upsellParentPackageIds)
          ? pkg.upsellParentPackageIds
          : [],
        classroomHoursRequired: pkg.classroomHoursRequired ?? 0,
        driveHoursRequired: pkg.driveHoursRequired ?? 0,
        requiresPermit: pkg.requiresPermit ?? false,
        ageMin: pkg.ageMin ?? null,
        ageMax: pkg.ageMax ?? null,
        creditClassroom: pkg.creditClassroom ?? 0,
        creditDrive: pkg.creditDrive ?? 0,
        active: pkg.active ?? true,
        locationScopeMode: pkg.locationScopeMode ?? "ALL_LOCATIONS",
        locationIds: pkgLocations?.locationIds ?? [],
        locationPriceOverrides: overrideDollars,
      });
    }
  }, [pkg, editForm, pkgLocations]);

  const editMutation = useMutation({
    mutationFn: async (data: PackageFormValues) => {
      const linkedIds =
        data.locationScopeMode === "SPECIFIC_LOCATIONS" ? (data.locationIds ?? []) : [];
      // Convert dollars → cents and drop overrides for locations that aren't
      // actually linked. Mirrors the list-page dialog (`buildPayload`).
      const overridesCents: Record<string, number | null> = {};
      if (data.locationScopeMode === "SPECIFIC_LOCATIONS" && data.locationPriceOverrides) {
        const linked = new Set(linkedIds.map(String));
        for (const [lid, dollars] of Object.entries(data.locationPriceOverrides)) {
          if (!linked.has(lid)) continue;
          if (dollars == null) continue;
          const n = Number(dollars);
          if (!Number.isFinite(n) || n < 0) continue;
          overridesCents[lid] = Math.round(n * 100);
        }
      }
      return apiRequest("PATCH", `/api/tenants/${tenantId}/packages/${packageId}`, {
        ...data,
        price: Math.round(data.price * 100),
        ageMin: data.ageMin || null,
        ageMax: data.ageMax || null,
        locationIds: linkedIds,
        locationPriceOverrides: overridesCents,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages", packageId, "single"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "package-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages", packageId, "locations"] });
      toast({ title: "Package updated" });
    },
    onError: () => toast({ title: "Failed to update package", variant: "destructive" }),
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  if (pkgLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="p-6">
        <Link href="/admin/packages">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-packages">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Packages
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <PackageIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Package not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeEnrollments = enrollmentsList.filter((e) => ["confirmed", "active", "in_progress"].includes(e.status));
  const upcomingSessionsCount = sessions.filter((s) => new Date(s.startAt as unknown as string) >= new Date() && s.status === "SCHEDULED").length;

  return (
    <div className="p-6">
      <Breadcrumbs
        items={[
          { label: "Packages", href: "/admin/packages" },
          { label: pkg.name },
        ]}
      />
      <Link href="/admin/packages">
        <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-packages">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Packages
        </Button>
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {pkg.imageUrl && (
            <img
              src={pkg.imageUrl}
              alt={pkg.name}
              className="h-20 w-20 rounded object-cover shrink-0 border"
              data-testid="img-package-detail"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-package-detail-title">{pkg.name}</h1>
              <Badge variant={pkg.active ? "default" : "secondary"}>{pkg.active ? "Active" : "Inactive"}</Badge>
              {pkg.availableAsUpsell && <Badge variant="outline">Upsell</Badge>}
              <Badge variant="outline" data-testid="badge-package-detail-language">
                {(pkg.language ?? "ENGLISH") === "SPANISH" ? "Spanish" : "English"}
              </Badge>
              <LocationFilterIndicator appliesHere />
            </div>
            {pkg.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{pkg.description}</p>}
          </div>
        </div>
      </div>

      {(() => {
        const priceRows = getEffectivePricesByLocation({
          pkg,
          locations,
          packageLocationIds: pkgLocations?.locationIds ?? [],
          overrides: pkgLocations?.priceOverrides ?? {},
        });
        const mixed = hasMixedPrices(priceRows);
        const range = priceRangeCents(priceRows);
        const priceLabel = mixed && range
          ? `${formatCents(range.minCents)} – ${formatCents(range.maxCents)}`
          : formatCents(pkg.price);
        const card = (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Price</p>
              <p
                className="text-xl font-semibold"
                data-testid="text-pkg-price"
                title={mixed ? "Varies by location" : undefined}
              >
                {priceLabel}
              </p>
            </CardContent>
          </Card>
        );
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {mixed ? (
              <HoverCard>
                <HoverCardTrigger asChild>
                  <div data-testid="hover-pkg-price-trigger">{card}</div>
                </HoverCardTrigger>
                <HoverCardContent className="w-64" data-testid="hover-pkg-price-content">
                  <p className="text-xs font-medium mb-2">Price by location</p>
                  <div className="space-y-1">
                    {priceRows.map((r) => (
                      <div
                        key={r.locationId}
                        className="flex items-baseline justify-between gap-2 text-sm"
                        data-testid={`pkg-price-row-${r.locationId}`}
                      >
                        <span className="text-muted-foreground truncate">{r.name}</span>
                        <span className="font-semibold tabular-nums">{formatCents(r.cents)}</span>
                      </div>
                    ))}
                  </div>
                </HoverCardContent>
              </HoverCard>
            ) : (
              card
            )}
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Cohorts</p>
                <p className="text-xl font-semibold" data-testid="text-pkg-offerings-count">{offerings.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Upcoming sessions</p>
                <p className="text-xl font-semibold" data-testid="text-pkg-sessions-count">{upcomingSessionsCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Active enrollments</p>
                <p className="text-xl font-semibold" data-testid="text-pkg-enrollments-count">{activeEnrollments.length}</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
        <TabsList data-testid="tabs-package-detail">
          <TabsTrigger value="overview" data-testid="tab-overview"><Layers className="h-4 w-4 mr-1" />Overview</TabsTrigger>
          {isCohortBased && (
            <TabsTrigger value="offerings" data-testid="tab-offerings"><Calendar className="h-4 w-4 mr-1" />Cohorts ({offerings.length})</TabsTrigger>
          )}
          {isCohortBased && (
            <TabsTrigger value="sessions" data-testid="tab-sessions"><Clock className="h-4 w-4 mr-1" />Sessions ({sessions.length})</TabsTrigger>
          )}
          <TabsTrigger value="enrollments" data-testid="tab-enrollments"><Users className="h-4 w-4 mr-1" />Enrollments ({enrollmentsList.length})</TabsTrigger>
          <TabsTrigger value="financials" data-testid="tab-financials"><DollarSign className="h-4 w-4 mr-1" />Financials</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Form {...editForm}>
            <form
              id="package-detail-edit-form"
              onSubmit={editForm.handleSubmit((data) => editMutation.mutate(data))}
            >
              <div
                className="sticky top-0 z-20 -mx-6 px-6 py-3 mb-4 bg-background/95 backdrop-blur border-b flex items-center justify-between gap-3"
                data-testid="bar-package-detail-save"
              >
                <div className="text-sm text-muted-foreground">
                  {editForm.formState.isDirty
                    ? "You have unsaved changes."
                    : "All changes saved."}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!editForm.formState.isDirty || editMutation.isPending}
                    onClick={() => {
                      if (pkg) editForm.reset(editForm.getValues());
                      // Force re-hydrate by toggling pkg-driven effect via reset
                      window.location.reload();
                    }}
                    data-testid="button-discard-package-detail"
                  >
                    Discard
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={editMutation.isPending || !editForm.formState.isDirty}
                    data-testid="button-save-package-detail"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {editMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Package configuration</CardTitle>
                  <CardDescription>Basics, pricing, audience, sales channels and availability.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PackageFormFields form={editForm} locations={locations} allPackages={allPackages} selfPackageId={packageId} sectioned />
                </CardContent>
              </Card>
            </form>

            {tenantId && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Components</CardTitle>
                  <CardDescription>What's bundled in this package.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PackageComponentsManager tenantId={tenantId} packageId={pkg.id} />
                </CardContent>
              </Card>
            )}

            <div
              className="mt-4 flex items-center justify-end gap-2"
              data-testid="bar-package-detail-save-bottom"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!editForm.formState.isDirty || editMutation.isPending}
                onClick={() => window.location.reload()}
                data-testid="button-discard-package-detail-bottom"
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={editMutation.isPending || !editForm.formState.isDirty}
                onClick={editForm.handleSubmit((data) => editMutation.mutate(data))}
                data-testid="button-save-package-detail-bottom"
              >
                <Save className="h-4 w-4 mr-1" />
                {editMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </Form>
        </TabsContent>

        <TabsContent value="offerings" className="mt-4">
          {pkg.kind === "COHORT_BASED"
            && pkg.active
            && offerings.length > 0
            && offerings.every((o) => o.status !== "PUBLISHED") && (
            <div
              className="mb-3 flex items-start gap-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              data-testid="warning-no-published-cohorts"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />
              <div>
                <div className="font-medium">No published cohorts</div>
                <div className="text-xs">
                  This Cohort package has cohorts but none are PUBLISHED, so it won't appear bookable on the storefront. Publish at least one cohort or add a new one.
                </div>
              </div>
            </div>
          )}
          {pkg.kind === "COHORT_BASED" && pkg.active && offerings.length === 0 && (
            <div
              className="mb-3 flex items-start gap-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              data-testid="warning-no-cohorts"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />
              <div>
                <div className="font-medium">No cohorts yet</div>
                <div className="text-xs">
                  This Cohort package has no cohorts yet, so it won't appear bookable on the storefront.
                </div>
              </div>
            </div>
          )}
          <div id="schedule-offerings" data-testid="section-schedule-offerings">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">Cohorts</h2>
              <p className="text-sm text-muted-foreground">
                Cohorts (sessions/courses) for this package. Add, edit, or generate sessions inline.
              </p>
            </div>
            <ScheduleOfferingsPage
              embedded
              lockedPackageId={pkg.id}
              initialCreateOpen={offeringsCreateOnOpen}
            />
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions for this package</CardTitle>
              <CardDescription>Classroom sessions from linked cohorts plus drive sessions students on this package can book.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {sessionsLoading ? (
                <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : sessions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No sessions yet for this package.</p>
                  <Link href="/admin/calendar">
                    <Button variant="outline" size="sm" className="mt-3" data-testid="button-go-schedule">Open schedule to add sessions</Button>
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-package-sessions">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">When</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Booked</th>
                        <th className="px-4 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.slice(0, 100).map((s) => (
                        <tr key={s.id} className="border-b last:border-b-0" data-testid={`row-session-${s.id}`}>
                          <td className="px-4 py-2"><Badge variant="outline">{sessionTypeLabel[s.type] || s.type}</Badge></td>
                          <td className="px-4 py-2 text-muted-foreground">{formatDateTime(s.startAt as unknown as string)}</td>
                          <td className="px-4 py-2"><Badge variant={s.status === "CANCELLED" ? "destructive" : "secondary"}>{s.status}</Badge></td>
                          <td className="px-4 py-2 text-muted-foreground">{s.bookedCount}/{s.capacity}</td>
                          <td className="px-4 py-2 text-right">
                            <Link href={`/admin/sessions/${s.id}`}>
                              <Button variant="ghost" size="sm" data-testid={`link-session-${s.id}`}>View</Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sessions.length > 100 && (
                    <p className="text-xs text-muted-foreground p-3 text-center">Showing first 100 of {sessions.length} sessions.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Students on this package</CardTitle>
              <CardDescription>Live enrollments with current credit balances.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {enrollmentsLoading ? (
                <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : enrollmentsList.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No enrollments on this package yet.</p>
                  <Link href="/admin/enrollments">
                    <Button variant="outline" size="sm" className="mt-3" data-testid="button-go-enrollments">Manage enrollments</Button>
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-package-enrollments">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Student</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Classroom credits</th>
                        <th className="px-4 py-2 font-medium">Drive credits</th>
                        <th className="px-4 py-2 font-medium">Enrolled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollmentsList.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b last:border-b-0 hover-elevate cursor-pointer"
                          data-testid={`row-enrollment-${e.id}`}
                          onClick={() => setLocation(`/admin/enrollments?focusId=${e.id}`)}
                        >
                          <td className="px-4 py-2">
                            <div className="font-medium">{e.firstName} {e.lastName}</div>
                            <div className="text-xs text-muted-foreground">{e.email}</div>
                          </td>
                          <td className="px-4 py-2"><Badge variant={enrollmentStatusVariant[e.status] || "outline"}>{e.status.replace(/_/g, " ")}</Badge></td>
                          <td className="px-4 py-2 text-muted-foreground">{e.creditBalance.classroom}</td>
                          <td className="px-4 py-2 text-muted-foreground">{e.creditBalance.drive}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{e.createdAt ? formatShortDate(e.createdAt as unknown as string) : "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financials" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue & payments</CardTitle>
              <CardDescription>Money tied to this package across all enrollments. Filter by payment date.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label htmlFor="fin-from" className="text-xs">From</Label>
                  <Input id="fin-from" type="date" value={finFrom} onChange={(e) => setFinFrom(e.target.value)} className="w-44" data-testid="input-financials-from" />
                </div>
                <div>
                  <Label htmlFor="fin-to" className="text-xs">To</Label>
                  <Input id="fin-to" type="date" value={finTo} onChange={(e) => setFinTo(e.target.value)} className="w-44" data-testid="input-financials-to" />
                </div>
                {(finFrom || finTo) && (
                  <Button variant="ghost" size="sm" onClick={() => { setFinFrom(""); setFinTo(""); }} data-testid="button-financials-clear">Clear</Button>
                )}
              </div>

              {financialsLoading || !financials ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Total revenue</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-revenue">${(financials.totalRevenueCents / 100).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Avg ticket</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-avg-ticket">${(financials.avgTicketCents / 100).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Paid customers</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-paid-count">{financials.paidCount}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Outstanding balance</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-outstanding">${(financials.outstandingBalanceCents / 100).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Pending payments</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-pending-count">{financials.pendingCount}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Failed payments</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-failed-count">{financials.failedCount}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Refunds</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-refund-count">{financials.refundedCount}</p>
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-fin-refund-total">${(financials.refundedTotalCents / 100).toFixed(2)} refunded</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Total enrollments</p>
                      <p className="text-xl font-semibold" data-testid="text-fin-enrollment-count">{financials.enrollmentCount}</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue trend</CardTitle>
              <CardDescription>Completed revenue grouped by month{finFrom || finTo ? " (filtered by date range above)" : ""}.</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueSeriesLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : revenueSeries.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground" data-testid="text-revenue-trend-empty">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No completed revenue in this range yet.</p>
                </div>
              ) : (
                <div className="h-64 w-full" data-testid="chart-revenue-trend">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueSeries.map(r => ({
                      monthLabel: new Date(r.month + "-01T00:00:00").toLocaleDateString([], { month: "short", year: "numeric" }),
                      amount: r.revenueCents / 100,
                    }))} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} width={60} />
                      <Tooltip
                        formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
                        labelFormatter={(label) => label as string}
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                      />
                      <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
