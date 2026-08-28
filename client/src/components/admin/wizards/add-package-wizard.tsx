import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, X, Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WizardShell, type WizardStep } from "./wizard-shell";
import { buildOccurrences, type Occurrence } from "@shared/recurrence";
import { CohortImportDialog, downloadCohortTemplate, type ImportedCohort } from "./cohort-excel-import";
import {
  PackageFormFields,
  packageSchema,
  defaultFormValues,
  type PackageFormValues,
} from "@/pages/admin/packages";
import type { PackageWithDependencies as PackageType, ScheduleOffering } from "@shared/schema";

interface LocationItem { id: number; name: string }
interface InstructorItem { id: string; name: string; email?: string }

interface RecurrenceDraft {
  enabled: boolean;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  skipDates: string[];
}

interface CohortDraft {
  // Existing offeringId once persisted server-side via Resume flow.
  offeringId?: number;
  name: string;
  description: string;
  locationId: number | null;
  instructorId: string | null;
  capacity: number;
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
  status: "DRAFT" | "PUBLISHED";
  notes: string;
  // Number of sessions already created server-side for this cohort.
  existingSessionCount?: number;
  recurrence: RecurrenceDraft;
}

interface CohortPayloadOffering {
  name: string;
  description: string | null;
  locationId: number | null;
  instructorId: string | null;
  capacity: number;
  startsAt: string;
  endsAt: string;
  status: "DRAFT" | "PUBLISHED";
  notes: string | null;
}
interface CohortPayloadRecurrence {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  skipDates: string[];
}
interface CohortPayload {
  offering: CohortPayloadOffering;
  recurrence?: CohortPayloadRecurrence;
}
type CreatePackagePayload = Omit<PackageFormValues, "price" | "locationPriceOverrides"> & {
  price: number;
  cohorts: CohortPayload[];
  locationPriceOverrides: Record<string, number | null>;
};

const FULL_STEPS: WizardStep[] = [
  { key: "package", title: "Package" },
  { key: "cohorts", title: "Cohorts" },
  { key: "sessions", title: "Sessions" },
  { key: "review", title: "Review" },
];
const SIMPLE_STEPS: WizardStep[] = [
  { key: "package", title: "Package" },
  { key: "review", title: "Review" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RECURRENCE_PRESETS: { label: string; key: string; days: number[] }[] = [
  { label: "M-F", key: "m-f", days: [1, 2, 3, 4, 5] },
  { label: "Mon-Thu", key: "mon-thu", days: [1, 2, 3, 4] },
  { label: "M/W/F", key: "mwf", days: [1, 3, 5] },
  { label: "T/Th", key: "tth", days: [2, 4] },
  { label: "Weekends", key: "weekends", days: [0, 6] },
  { label: "Daily", key: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
];

function emptyCohort(): CohortDraft {
  return {
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
    recurrence: {
      enabled: false,
      daysOfWeek: [],
      startTime: "09:00",
      endTime: "12:00",
      startDate: "",
      endDate: "",
      skipDates: [],
    },
  };
}

function isoDatePart(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isoTimePart(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

interface AddPackageWizardProps {
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional existing package to resume editing/setup from. */
  existingPackageId?: number | null;
}

export function AddPackageWizard({ tenantId, open, onOpenChange, existingPackageId = null }: AddPackageWizardProps) {
  const { toast } = useToast();
  const [stepIdx, setStepIdx] = useState(0);
  const [cohorts, setCohorts] = useState<CohortDraft[]>([]);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [hydratedExisting, setHydratedExisting] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const draftKey = `add-package-draft:${tenantId}`;

  const { data: locations = [] } = useQuery<LocationItem[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: instructors = [] } = useQuery<InstructorItem[]>({
    queryKey: ["/api/tenants", tenantId, "instructors"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/instructors`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: allPackages = [] } = useQuery<PackageType[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });

  // Server-backed resume: when an existing package id is provided, fetch
  // its package + offerings + per-offering session counts so the wizard
  // can jump to the next unfinished step.
  const { data: existingPkg } = useQuery<PackageType>({
    queryKey: ["/api/tenants", tenantId, "packages", existingPackageId, "for-wizard"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/packages/${existingPackageId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId && !!existingPackageId,
  });
  const { data: existingOfferings = [] } = useQuery<ScheduleOffering[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings", "for-wizard", existingPackageId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/schedule-offerings`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId && !!existingPackageId,
  });

  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: defaultFormValues,
  });

  // Hydrate from existing package + offerings (server-backed resume).
  useEffect(() => {
    if (!open || !existingPackageId || !existingPkg) return;
    if (hydratedExisting === existingPackageId) return;
    const pkgValues: Partial<PackageFormValues> = {
      name: existingPkg.name,
      description: existingPkg.description ?? "",
      price: ((existingPkg.price ?? 0) / 100) as unknown as number,
      kind: (existingPkg.kind ?? "COHORT_BASED") as PackageFormValues["kind"],
      sellableStandalone: existingPkg.sellableStandalone ?? true,
      availableAsUpsell: existingPkg.availableAsUpsell ?? false,
      audience: (existingPkg.audience ?? "BOTH") as PackageFormValues["audience"],
      tier: (existingPkg.tier ?? "PRIMARY") as PackageFormValues["tier"],
      language: (existingPkg.language ?? "ENGLISH") as PackageFormValues["language"],
      imageUrl: existingPkg.imageUrl ?? "",
      upsellParentPackageIds: Array.isArray(existingPkg.upsellParentPackageIds)
        ? existingPkg.upsellParentPackageIds
        : [],
      classroomHoursRequired: existingPkg.classroomHoursRequired ?? 0,
      driveHoursRequired: existingPkg.driveHoursRequired ?? 0,
      creditClassroom: existingPkg.creditClassroom ?? 0,
      creditDrive: existingPkg.creditDrive ?? 0,
      ageMin: existingPkg.ageMin ?? null,
      ageMax: existingPkg.ageMax ?? null,
      requiresPermit: !!existingPkg.requiresPermit,
      locationScopeMode: (existingPkg.locationScopeMode ?? "ALL_LOCATIONS") as PackageFormValues["locationScopeMode"],
    };
    form.reset({ ...defaultFormValues, ...pkgValues });

    const myOfferings = existingOfferings.filter((o) => o.packageId === existingPackageId);
    Promise.all(
      myOfferings.map(async (o) => {
        try {
          const r = await fetch(`/api/tenants/${tenantId}/schedule-offerings/${o.id}/sessions`, { credentials: "include" });
          const sessions = r.ok ? ((await r.json()) as { id: number }[]) : [];
          return { offering: o, sessionCount: sessions.length };
        } catch {
          return { offering: o, sessionCount: 0 };
        }
      }),
    ).then((rows) => {
      const mapped: CohortDraft[] = rows.map(({ offering: o, sessionCount }) => ({
        offeringId: o.id,
        name: o.name,
        description: o.description ?? "",
        locationId: o.locationId ?? null,
        instructorId: o.instructorId ?? null,
        capacity: o.capacity,
        startsDate: isoDatePart(new Date(o.startsAt)),
        startsTime: isoTimePart(new Date(o.startsAt)),
        endsDate: isoDatePart(new Date(o.endsAt)),
        endsTime: isoTimePart(new Date(o.endsAt)),
        status: (o.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT") as "DRAFT" | "PUBLISHED",
        notes: o.notes ?? "",
        existingSessionCount: sessionCount,
        recurrence: { enabled: false, daysOfWeek: [], startTime: "09:00", endTime: "12:00", startDate: "", endDate: "", skipDates: [] },
      }));
      setCohorts(mapped);
      // Jump to the next unfinished step.
      let next = 1;
      if (mapped.length === 0) next = 1;
      else if (mapped.some((c) => (c.existingSessionCount ?? 0) === 0)) next = 2;
      else next = 3;
      setStepIdx(next);
      setHydratedExisting(existingPackageId);
    });
  }, [open, existingPackageId, existingPkg, existingOfferings, tenantId, form, hydratedExisting]);

  // Local-storage resume (only when not editing an existing package).
  useEffect(() => {
    if (!open || resumeChecked || existingPackageId) return;
    setResumeChecked(true);
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { pkg?: PackageFormValues; cohorts?: CohortDraft[]; stepIdx?: number };
        if (window.confirm("Resume your in-progress package draft?")) {
          if (parsed.pkg) form.reset(parsed.pkg);
          if (Array.isArray(parsed.cohorts)) setCohorts(parsed.cohorts);
          setStepIdx(typeof parsed.stepIdx === "number" ? parsed.stepIdx : 0);
        } else {
          localStorage.removeItem(draftKey);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [open, resumeChecked, draftKey, form, existingPackageId]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setResumeChecked(false);
      setHydratedExisting(null);
    }
  }, [open]);

  const saveDraftMut = useMutation({
    mutationFn: async () => {
      // Existing package: persist any not-yet-saved cohorts server-side.
      if (existingPackageId) {
        if (form.formState.isDirty) {
          const v = packageSchema.parse(form.getValues());
          await apiRequest("PATCH", `/api/tenants/${tenantId}/packages/${existingPackageId}`, {
            ...v,
            price: Math.round((v.price ?? 0) * 100),
          });
        }
        for (let i = 0; i < cohorts.length; i++) {
          const c = cohorts[i];
          if (c.offeringId) {
            if ((c.existingSessionCount ?? 0) === 0 && c.recurrence.enabled) {
              const occs = occurrencesPerCohort[i] ?? [];
              if (occs.length > 0) {
                await apiRequest(
                  "POST",
                  `/api/tenants/${tenantId}/schedule-offerings/${c.offeringId}/generate-sessions`,
                  {
                    instructorId: c.instructorId,
                    locationId: c.locationId,
                    capacity: c.capacity,
                    notes: c.notes || null,
                    occurrences: occs.map((o) => ({ startAt: o.startAt.toISOString(), endAt: o.endAt.toISOString() })),
                  },
                );
              }
            }
            continue;
          }
          if (!cohortValid(c)) continue;
          await addCohortToExistingPackage(existingPackageId, c, i);
        }
        return { kind: "existing" as const };
      }
      // New package: if the package itself is valid, persist the package
      // (and any saved cohorts) server-side so the admin can resume from
      // the package row later.
      const pkgValues = form.getValues();
      if (pkgValues.name && pkgValues.price >= 0) {
        const validCohorts = cohorts.filter(cohortValid);
        const payload: CreatePackagePayload = buildCreatePayload();
        // Replace cohorts with only the valid subset so an in-progress
        // cohort doesn't fail validation.
        payload.cohorts = validCohorts.map((c, i) => {
          const occs = occurrencesPerCohort[cohorts.indexOf(c)] ?? [];
          return {
            offering: {
              name: c.name,
              description: c.description || null,
              locationId: c.locationId,
              instructorId: c.instructorId,
              capacity: c.capacity,
              startsAt: new Date(`${c.startsDate}T${c.startsTime}`).toISOString(),
              endsAt: new Date(`${c.endsDate}T${c.endsTime}`).toISOString(),
              status: c.status,
              notes: c.notes || null,
            },
            recurrence: c.recurrence.enabled
              ? {
                  daysOfWeek: c.recurrence.daysOfWeek,
                  startTime: c.recurrence.startTime,
                  endTime: c.recurrence.endTime,
                  startDate: c.recurrence.startDate,
                  endDate: c.recurrence.endDate,
                  skipDates: c.recurrence.skipDates,
                }
              : undefined,
          };
        });
        await apiRequest("POST", `/api/tenants/${tenantId}/packages`, payload);
        return { kind: "new" as const };
      }
      // Fall back to local-storage if package isn't valid yet.
      try {
        localStorage.setItem(draftKey, JSON.stringify({ pkg: pkgValues, cohorts, stepIdx }));
      } catch { /* noop */ }
      return { kind: "local" as const };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "package-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      if (result.kind === "local") {
        toast({ title: "Draft saved", description: "Reopen Add Package to resume." });
      } else {
        clearDraft();
        toast({ title: "Saved", description: "Resume setup from the package row anytime." });
      }
      onOpenChange(false);
    },
    onError: () => toast({ title: "Failed to save draft", variant: "destructive" }),
  });

  function saveDraftAndExit() {
    saveDraftMut.mutate();
  }

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* noop */ }
  }

  function addCohort() {
    setCohorts((prev) => [...prev, emptyCohort()]);
  }
  function importCohorts(rows: ImportedCohort[]) {
    const drafts: CohortDraft[] = rows.map((r) => ({
      name: r.name,
      description: "",
      locationId: r.locationId,
      instructorId: r.instructorId,
      capacity: r.capacity,
      startsDate: r.startsDate,
      startsTime: r.startsTime,
      endsDate: r.endsDate,
      endsTime: r.endsTime,
      status: "DRAFT",
      notes: r.notes,
      recurrence: {
        enabled: true,
        daysOfWeek: r.daysOfWeek,
        startTime: r.startsTime,
        endTime: r.endsTime,
        startDate: r.startsDate,
        endDate: r.endsDate,
        skipDates: [],
      },
    }));
    setCohorts((prev) => [...prev, ...drafts]);
    toast({ title: `Imported ${drafts.length} cohort${drafts.length === 1 ? "" : "s"}` });
  }
  function removeCohort(idx: number) {
    setCohorts((prev) => prev.filter((_, i) => i !== idx));
  }
  function patchCohort(idx: number, patch: Partial<CohortDraft>) {
    setCohorts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function patchRecurrence(idx: number, patch: Partial<RecurrenceDraft>) {
    setCohorts((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, recurrence: { ...c.recurrence, ...patch } } : c)),
    );
  }

  // Per-cohort planned occurrences (with skip-dates filtered out).
  const occurrencesPerCohort: Occurrence[][] = useMemo(() => {
    return cohorts.map((c) => {
      if (!c.recurrence.enabled) return [];
      if (
        c.recurrence.daysOfWeek.length === 0 ||
        !c.recurrence.startDate ||
        !c.recurrence.endDate ||
        !c.recurrence.startTime ||
        !c.recurrence.endTime
      ) {
        return [];
      }
      try {
        const occs = buildOccurrences({
          daysOfWeek: c.recurrence.daysOfWeek,
          startTime: c.recurrence.startTime,
          endTime: c.recurrence.endTime,
          startDate: c.recurrence.startDate,
          endDate: c.recurrence.endDate,
        });
        const skip = new Set(c.recurrence.skipDates);
        return occs.filter((o) => !skip.has(isoDatePart(o.startAt)));
      } catch {
        return [];
      }
    });
  }, [cohorts]);

  function cohortValid(c: CohortDraft): boolean {
    return !!(c.name && c.startsDate && c.endsDate && c.capacity > 0);
  }

  const stepValid: Record<number, boolean> = {
    0: form.formState.isValid || !!form.getValues().name,
    1: cohorts.every(cohortValid),
    2: occurrencesPerCohort.every((o, i) => !cohorts[i].recurrence.enabled || o.length <= 200),
    3: true,
  };

  // Build the create-package payload.
  function buildCreatePayload(): CreatePackagePayload {
    // Run the raw form values through the package zod schema so that
    // numeric inputs (which react-hook-form keeps as strings until
    // submit) are coerced to numbers before they hit the API.
    const pkg = packageSchema.parse(form.getValues());
    const overridesRaw = (pkg.locationPriceOverrides ?? {}) as Record<string, number | null | string | undefined>;
    const overridesCents: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(overridesRaw)) {
      if (v === null || v === undefined || v === "") {
        overridesCents[k] = null;
      } else {
        overridesCents[k] = Math.round(Number(v) * 100);
      }
    }
    return {
      ...pkg,
      price: Math.round(Number(pkg.price) * 100),
      locationPriceOverrides: overridesCents,
      // SIMPLE packages have no cohorts; we always send an empty array so a
      // toggled-mid-flow draft never carries stale cohort data through.
      cohorts: pkg.kind === "SIMPLE" ? [] : cohorts.map((c) => ({
        offering: {
          name: c.name,
          description: c.description || null,
          locationId: c.locationId,
          instructorId: c.instructorId,
          capacity: c.capacity,
          startsAt: new Date(`${c.startsDate}T${c.startsTime}`).toISOString(),
          endsAt: new Date(`${c.endsDate}T${c.endsTime}`).toISOString(),
          status: c.status,
          notes: c.notes || null,
        },
        recurrence: c.recurrence.enabled
          ? {
              daysOfWeek: c.recurrence.daysOfWeek,
              startTime: c.recurrence.startTime,
              endTime: c.recurrence.endTime,
              startDate: c.recurrence.startDate,
              endDate: c.recurrence.endDate,
              skipDates: c.recurrence.skipDates,
            }
          : undefined,
      })),
    };
  }

  // Add a single cohort (and its sessions) to an already-persisted package.
  async function addCohortToExistingPackage(packageId: number, c: CohortDraft, idx: number) {
    const offeringRes = await apiRequest("POST", `/api/tenants/${tenantId}/schedule-offerings`, {
      packageId,
      name: c.name,
      description: c.description || null,
      locationId: c.locationId,
      instructorId: c.instructorId,
      capacity: c.capacity,
      startsAt: new Date(`${c.startsDate}T${c.startsTime}`).toISOString(),
      endsAt: new Date(`${c.endsDate}T${c.endsTime}`).toISOString(),
      status: c.status,
      notes: c.notes || null,
    });
    const created = (await offeringRes.json()) as { id: number };
    if (c.recurrence.enabled) {
      const occs = occurrencesPerCohort[idx] ?? [];
      if (occs.length > 0) {
        await apiRequest(
          "POST",
          `/api/tenants/${tenantId}/schedule-offerings/${created.id}/generate-sessions`,
          {
            instructorId: c.instructorId,
            locationId: c.locationId,
            capacity: c.capacity,
            notes: c.notes || null,
            occurrences: occs.map((o) => ({ startAt: o.startAt.toISOString(), endAt: o.endAt.toISOString() })),
          },
        );
      }
    }
  }

  const submitMut = useMutation({
    mutationFn: async () => {
      if (existingPackageId) {
        // Persist any package-field edits first.
        if (form.formState.isDirty) {
          const v = packageSchema.parse(form.getValues());
          await apiRequest("PATCH", `/api/tenants/${tenantId}/packages/${existingPackageId}`, {
            ...v,
            price: Math.round((v.price ?? 0) * 100),
          });
        }
        for (let i = 0; i < cohorts.length; i++) {
          const c = cohorts[i];
          try {
            if (c.offeringId) {
              if ((c.existingSessionCount ?? 0) === 0 && c.recurrence.enabled) {
                const occs = occurrencesPerCohort[i] ?? [];
                if (occs.length > 0) {
                  await apiRequest(
                    "POST",
                    `/api/tenants/${tenantId}/schedule-offerings/${c.offeringId}/generate-sessions`,
                    {
                      instructorId: c.instructorId,
                      locationId: c.locationId,
                      capacity: c.capacity,
                      notes: c.notes || null,
                      occurrences: occs.map((o) => ({ startAt: o.startAt.toISOString(), endAt: o.endAt.toISOString() })),
                    },
                  );
                }
              }
              continue;
            }
            await addCohortToExistingPackage(existingPackageId, c, i);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Cohort #${i + 1} "${c.name}": ${msg}`);
          }
        }
        return;
      }
      const payload = buildCreatePayload();
      await apiRequest("POST", `/api/tenants/${tenantId}/packages`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "package-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      toast({ title: existingPackageId ? "Package updated" : "Package created" });
      clearDraft();
      form.reset(defaultFormValues);
      setCohorts([]);
      setStepIdx(0);
      onOpenChange(false);
    },
    onError: (err) => {
      const description = err instanceof Error ? err.message : String(err);
      console.error("[add-package-wizard] save failed:", err);
      toast({
        title: "Failed to save package",
        description,
        variant: "destructive",
      });
    },
  });

  const kindWatch = form.watch("kind");
  const isSimple = kindWatch === "SIMPLE";
  const STEPS = isSimple ? SIMPLE_STEPS : FULL_STEPS;
  const isDirty = !!form.formState.isDirty || cohorts.length > 0;
  // Build step-validity index dynamically: SIMPLE skips Cohorts/Sessions and
  // jumps straight to Review.
  const dynamicStepValid: Record<number, boolean> = isSimple
    ? { 0: form.formState.isValid || !!form.getValues().name, 1: true }
    : stepValid;
  const canGoNext = dynamicStepValid[stepIdx] ?? true;
  const lastIdx = STEPS.length - 1;

  // Clamp stepIdx when toggling kind mid-flow (FULL has 4 steps, SIMPLE has 2).
  useEffect(() => {
    if (stepIdx > lastIdx) setStepIdx(lastIdx);
  }, [lastIdx, stepIdx]);

  return (
    <WizardShell
      open={open}
      onOpenChange={onOpenChange}
      title={existingPackageId ? "Resume Package Setup" : "Add Package"}
      description={isSimple
        ? "Create a non-cohort package (no cohorts/sessions)."
        : "Create a package and (optionally) add cohorts and sessions in one flow."}
      steps={STEPS}
      currentStepIndex={stepIdx}
      onBack={() => setStepIdx((i) => Math.max(0, i - 1))}
      onNext={() => setStepIdx((i) => Math.min(lastIdx, i + 1))}
      onSubmit={() => submitMut.mutate()}
      canGoBack={stepIdx > 0}
      canGoNext={canGoNext}
      isSubmitting={submitMut.isPending}
      submitLabel={
        existingPackageId
          ? (isSimple ? "Save Package" : "Save Cohorts")
          : "Create Package"
      }
      testIdPrefix="add-package-wizard"
      isDirty={isDirty}
    >
      <div className="space-y-4">
        {stepIdx === 0 && (
          <Form {...form}>
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <PackageFormFields
                form={form}
                locations={locations}
                allPackages={allPackages.map((p) => ({ id: p.id, name: p.name }))}
                selfPackageId={existingPackageId ?? null}
              />
            </form>
          </Form>
        )}

        {!isSimple && stepIdx === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                Add 0 or more cohorts (classroom offerings) for this package.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadCohortTemplate(form.getValues("name") || "Package")}
                  data-testid="button-download-cohort-template"
                  title="Download an Excel template with one sample row"
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Template
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setImportOpen(true)}
                  disabled={!form.getValues("name")}
                  data-testid="button-import-cohorts"
                  title={form.getValues("name") ? "Import cohorts from an Excel file" : "Set the package name on Step 1 first"}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" /> Import from Excel
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={addCohort} data-testid="button-add-cohort">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Cohort
                </Button>
              </div>
            </div>
            {cohorts.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No cohorts yet. You can also add them later from Cohorts.</p>
            )}
            {cohorts.map((c, idx) => (
              <Card key={idx} data-testid={`card-cohort-${idx}`}>
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">
                      Cohort {idx + 1}
                      {c.offeringId && <span className="ml-1 text-[10px] text-muted-foreground">(saved)</span>}
                    </Badge>
                    {!c.offeringId && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeCohort(idx)} data-testid={`button-remove-cohort-${idx}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={c.name}
                      onChange={(e) => patchCohort(idx, { name: e.target.value })}
                      placeholder="e.g. Summer Teen Session A"
                      data-testid={`input-cohort-name-${idx}`}
                      disabled={!!c.offeringId}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Starts date</Label>
                      <Input type="date" value={c.startsDate} onChange={(e) => patchCohort(idx, { startsDate: e.target.value })} data-testid={`input-cohort-starts-${idx}`} disabled={!!c.offeringId} />
                    </div>
                    <div className="space-y-1">
                      <Label>Start time</Label>
                      <Input type="time" value={c.startsTime} onChange={(e) => patchCohort(idx, { startsTime: e.target.value })} disabled={!!c.offeringId} />
                    </div>
                    <div className="space-y-1">
                      <Label>Ends date</Label>
                      <Input type="date" value={c.endsDate} onChange={(e) => patchCohort(idx, { endsDate: e.target.value })} data-testid={`input-cohort-ends-${idx}`} disabled={!!c.offeringId} />
                    </div>
                    <div className="space-y-1">
                      <Label>End time</Label>
                      <Input type="time" value={c.endsTime} onChange={(e) => patchCohort(idx, { endsTime: e.target.value })} disabled={!!c.offeringId} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Location</Label>
                      <Select value={c.locationId ? String(c.locationId) : "none"} onValueChange={(v) => patchCohort(idx, { locationId: v === "none" ? null : Number(v) })} disabled={!!c.offeringId}>
                        <SelectTrigger data-testid={`select-cohort-location-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {locations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Instructor</Label>
                      <Select value={c.instructorId || "none"} onValueChange={(v) => patchCohort(idx, { instructorId: v === "none" ? null : v })} disabled={!!c.offeringId}>
                        <SelectTrigger data-testid={`select-cohort-instructor-${idx}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {instructors.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Capacity</Label>
                      <Input type="number" min={1} value={c.capacity} onChange={(e) => patchCohort(idx, { capacity: Number(e.target.value) || 1 })} disabled={!!c.offeringId} />
                    </div>
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select value={c.status} onValueChange={(v) => patchCohort(idx, { status: v as "DRAFT" | "PUBLISHED" })} disabled={!!c.offeringId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DRAFT">Draft</SelectItem>
                          <SelectItem value="PUBLISHED">Published</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {c.offeringId && (c.existingSessionCount ?? 0) > 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      This cohort is already saved with {c.existingSessionCount} session{c.existingSessionCount === 1 ? "" : "s"}.
                    </p>
                  ) : (
                    <div className="rounded border p-2 space-y-2">
                      {c.offeringId && (
                        <p className="text-[11px] text-muted-foreground italic">
                          Saved cohort with no sessions yet — configure recurrence to add sessions.
                        </p>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={c.recurrence.enabled}
                          onCheckedChange={(v) => patchRecurrence(idx, { enabled: v === true })}
                          data-testid={`checkbox-recurrence-${idx}`}
                        />
                        <span>Generate recurring sessions</span>
                      </label>
                      {c.recurrence.enabled && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {RECURRENCE_PRESETS.map((p) => (
                              <Button
                                key={p.key}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => patchRecurrence(idx, { daysOfWeek: p.days })}
                                data-testid={`button-preset-${idx}-${p.key}`}
                              >
                                {p.label}
                              </Button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {DAY_LABELS.map((lbl, dow) => {
                              const checked = c.recurrence.daysOfWeek.includes(dow);
                              return (
                                <Button
                                  key={dow}
                                  type="button"
                                  size="sm"
                                  variant={checked ? "default" : "outline"}
                                  onClick={() => {
                                    const next = checked
                                      ? c.recurrence.daysOfWeek.filter((d) => d !== dow)
                                      : [...c.recurrence.daysOfWeek, dow];
                                    patchRecurrence(idx, { daysOfWeek: next });
                                  }}
                                  data-testid={`button-day-${idx}-${dow}`}
                                >
                                  {lbl}
                                </Button>
                              );
                            })}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Recurrence start date</Label>
                              <Input type="date" value={c.recurrence.startDate} onChange={(e) => patchRecurrence(idx, { startDate: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Recurrence end date</Label>
                              <Input type="date" value={c.recurrence.endDate} onChange={(e) => patchRecurrence(idx, { endDate: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Session start time</Label>
                              <Input type="time" value={c.recurrence.startTime} onChange={(e) => patchRecurrence(idx, { startTime: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Session end time</Label>
                              <Input type="time" value={c.recurrence.endTime} onChange={(e) => patchRecurrence(idx, { endTime: e.target.value })} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Skip dates (no class)</Label>
                            <div className="flex items-center gap-1 flex-wrap">
                              {c.recurrence.skipDates.map((d) => (
                                <Badge key={d} variant="secondary" className="gap-1" data-testid={`badge-skip-${idx}-${d}`}>
                                  {d}
                                  <button
                                    type="button"
                                    onClick={() => patchRecurrence(idx, { skipDates: c.recurrence.skipDates.filter((x) => x !== d) })}
                                    aria-label={`Remove skip date ${d}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                              <Input
                                type="date"
                                className="h-7 w-[140px]"
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  if (!c.recurrence.skipDates.includes(v)) {
                                    patchRecurrence(idx, { skipDates: [...c.recurrence.skipDates, v].sort() });
                                  }
                                  e.target.value = "";
                                }}
                                data-testid={`input-skip-date-${idx}`}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isSimple && stepIdx === 2 && (
          <div className="space-y-3">
            {cohorts.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No cohorts to preview.</p>
            )}
            {cohorts.map((c, idx) => {
              const occs = occurrencesPerCohort[idx];
              const tooMany = c.recurrence.enabled && occs.length > 200;
              return (
                <Card key={idx} data-testid={`card-session-preview-${idx}`}>
                  <CardContent className="p-3 space-y-2 text-sm">
                    <div className="font-medium">{c.name || `Cohort ${idx + 1}`}</div>
                    {c.offeringId && (c.existingSessionCount ?? 0) > 0 ? (
                      <p className="text-muted-foreground text-xs">
                        Already has {c.existingSessionCount} saved session{c.existingSessionCount === 1 ? "" : "s"}.
                      </p>
                    ) : !c.recurrence.enabled ? (
                      <p className="text-muted-foreground text-xs">No recurring sessions configured.</p>
                    ) : tooMany ? (
                      <p className="text-destructive text-xs inline-flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> {occs.length} sessions exceeds the 200-session limit. Narrow the date range.
                      </p>
                    ) : (
                      <>
                        <p className="text-muted-foreground text-xs" data-testid={`text-session-count-${idx}`}>
                          Will create {occs.length} session{occs.length === 1 ? "" : "s"}.
                        </p>
                        <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto border rounded p-2" data-testid={`list-sessions-${idx}`}>
                          {occs.slice(0, 50).map((o) => (
                            <li key={o.startAt.toISOString()} data-testid={`row-session-${idx}-${o.startAt.toISOString()}`}>
                              {isoDatePart(o.startAt)} · {isoTimePart(o.startAt)}–{isoTimePart(o.endAt)}
                            </li>
                          ))}
                          {occs.length > 50 && (
                            <li className="italic text-muted-foreground">…and {occs.length - 50} more</li>
                          )}
                        </ul>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {((isSimple && stepIdx === 1) || (!isSimple && stepIdx === 3)) && (
          <div className="space-y-3 text-sm">
            <Card>
              <CardContent className="p-3 space-y-1">
                <div className="font-medium">Package</div>
                <div className="text-muted-foreground text-xs">
                  {form.getValues().name || "(unnamed)"} — ${form.getValues().price}
                  {" · "}
                  {isSimple ? "Non-cohort" : "Cohort"}
                </div>
                <div className="text-muted-foreground text-xs">
                  Sellable on its own: {form.getValues().sellableStandalone ? "Yes" : "No"} ·
                  {" "}Available as upsell: {form.getValues().availableAsUpsell ? "Yes" : "No"}
                </div>
              </CardContent>
            </Card>
            {!isSimple && (
              <Card>
                <CardContent className="p-3 space-y-1">
                  <div className="font-medium">Cohorts ({cohorts.length})</div>
                  {cohorts.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No cohorts.</p>
                  ) : (
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {cohorts.map((c, i) => (
                        <li key={i} data-testid={`text-review-cohort-${i}`}>
                          {c.name} — {c.startsDate} → {c.endsDate}, capacity {c.capacity}
                          {c.recurrence.enabled && ` · ${occurrencesPerCohort[i].length} sessions`}
                          {c.offeringId && ` · saved (${c.existingSessionCount ?? 0} sessions)`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {cohorts.length > 0 && cohorts.every((c) => c.status !== "PUBLISHED") && (
                    <p
                      className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"
                      data-testid="text-zero-published-warning"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> No cohort is set to PUBLISHED yet — buyers will not see this package on the storefront until you publish at least one cohort.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={saveDraftAndExit}
            disabled={saveDraftMut.isPending}
            data-testid="button-save-and-exit"
          >
            {saveDraftMut.isPending ? "Saving…" : "Save & Exit"}
          </Button>
        </div>
      </div>
      <CohortImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        packageName={form.getValues("name") || ""}
        locations={locations}
        instructors={instructors.map((i) => ({ id: i.id, name: i.name }))}
        onImport={importCohorts}
      />
    </WizardShell>
  );
}

export function hasAddPackageDraft(tenantId: number): boolean {
  try {
    return !!localStorage.getItem(`add-package-draft:${tenantId}`);
  } catch {
    return false;
  }
}
