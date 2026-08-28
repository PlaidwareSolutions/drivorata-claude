import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Info,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Package as PackageType, ScheduleOffering } from "@shared/schema";

interface MoveImpact {
  offeringId: number;
  currentPackageId: number;
  bookedSessionCount: number;
  confirmedEnrollmentCount: number;
  enrolleeAges: number[];
}

function ageMismatchCount(ages: number[], pkg: PackageType | undefined): number {
  if (!pkg) return 0;
  const min = pkg.ageMin ?? null;
  const max = pkg.ageMax ?? null;
  if (min === null && max === null) return 0;
  let n = 0;
  for (const a of ages) {
    if ((min !== null && a < min) || (max !== null && a > max)) n++;
  }
  return n;
}

function audienceLabel(a: PackageType["audience"]): string {
  if (a === "TEENS") return "Teens";
  if (a === "ADULTS") return "Adults";
  return "All ages";
}

function audienceBadgeClass(a: PackageType["audience"]): string {
  if (a === "TEENS") return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
  if (a === "ADULTS") return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

interface PackageComboboxProps {
  packages: PackageType[];
  value: string;
  onChange: (value: string) => void;
  excludeId?: number | null;
  testIdTrigger: string;
  testIdOptionPrefix: string;
  placeholder?: string;
  disabled?: boolean;
}

function PackageCombobox({
  packages,
  value,
  onChange,
  excludeId,
  testIdTrigger,
  testIdOptionPrefix,
  placeholder = "Pick a package…",
  disabled,
}: PackageComboboxProps) {
  const sorted = useMemo(() => {
    const eligible = packages.filter(
      (p) => p.active !== false && (excludeId == null || p.id !== excludeId),
    );
    return [...eligible].sort((a, b) => {
      const ta = a.tier === "AUXILIARY" ? 1 : 0;
      const tb = b.tier === "AUXILIARY" ? 1 : 0;
      if (ta !== tb) return ta - tb;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [packages, excludeId]);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full" data-testid={testIdTrigger}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {sorted.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No eligible packages.
          </div>
        ) : (
          sorted.map((p) => (
            <SelectItem
              key={p.id}
              value={String(p.id)}
              data-testid={`${testIdOptionPrefix}-${p.id}`}
            >
              <span className="inline-flex items-center gap-2 pr-2">
                <span className="truncate">{p.name}</span>
                <Badge
                  variant="secondary"
                  className={cn("text-[10px]", audienceBadgeClass(p.audience))}
                >
                  {audienceLabel(p.audience)}
                </Badge>
                {p.tier === "AUXILIARY" ? (
                  <Badge variant="outline" className="text-[10px]">
                    Aux
                  </Badge>
                ) : null}
                {p.ageMin != null || p.ageMax != null ? (
                  <span className="text-[10px] text-muted-foreground">
                    {p.ageMin ?? "—"}–{p.ageMax ?? "—"}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

export interface ChangeOfferingPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  offering: Pick<ScheduleOffering, "id" | "name" | "packageId"> | null;
  packages: PackageType[];
  onChanged?: (newPackageId: number) => void;
}

export function ChangeOfferingPackageDialog({
  open,
  onOpenChange,
  tenantId,
  offering,
  packages,
  onChanged,
}: ChangeOfferingPackageDialogProps) {
  const { toast } = useToast();
  const [targetId, setTargetId] = useState<string>("");

  useEffect(() => {
    if (open) setTargetId("");
  }, [open, offering?.id]);

  const cohortPackages = useMemo(
    () => packages.filter((p) => p.kind === "COHORT_BASED"),
    [packages],
  );
  const currentPkg = offering ? packages.find((p) => p.id === offering.packageId) : undefined;
  const targetPkg = targetId ? cohortPackages.find((p) => p.id === Number(targetId)) : undefined;

  const { data: impact, isLoading: impactLoading } = useQuery<MoveImpact>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings", offering?.id, "move-impact"],
    queryFn: async () => {
      const res = await fetch(
        `/api/tenants/${tenantId}/schedule-offerings/${offering!.id}/move-impact`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load impact");
      return res.json();
    },
    enabled: open && !!offering,
  });

  const previewMismatchCount = impact ? ageMismatchCount(impact.enrolleeAges, targetPkg) : 0;
  const hasSnapshotImpact = !!impact && (impact.bookedSessionCount > 0 || impact.confirmedEnrollmentCount > 0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!offering || !targetPkg) throw new Error("Pick a target package");
      const res = await fetch(`/api/tenants/${tenantId}/schedule-offerings/${offering.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: targetPkg.id }),
      });
      if (!res.ok) {
        let body: any = null;
        try { body = await res.json(); } catch { /* noop */ }
        const err = new Error(body?.message || "Failed to change package") as Error & {
          status?: number;
          code?: string;
          conflictingEnrollmentIds?: number[];
        };
        err.status = res.status;
        err.code = body?.code;
        err.conflictingEnrollmentIds = body?.conflictingEnrollmentIds;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      if (offering) {
        queryClient.invalidateQueries({
          queryKey: ["/api/tenants", tenantId, "schedule-offerings", offering.id],
        });
        queryClient.invalidateQueries({
          queryKey: ["/api/tenants", tenantId, "schedule-offerings", offering.id, "audit"],
        });
      }
      toast({ title: "Package changed", description: `Cohort moved to "${targetPkg?.name}".` });
      onOpenChange(false);
      if (targetPkg) onChanged?.(targetPkg.id);
    },
    onError: (err: Error & { status?: number; code?: string; conflictingEnrollmentIds?: number[] }) => {
      if (err.status === 409 && err.code === "OFFERING_PACKAGE_AUDIENCE_MISMATCH") {
        const n = err.conflictingEnrollmentIds?.length ?? 0;
        toast({
          title: "Audience mismatch",
          description:
            err.message ||
            `Target package's age range excludes ${n} existing enrollee${n === 1 ? "" : "s"}. Resolve those bookings first.`,
          variant: "destructive",
        });
      } else {
        toast({ title: err.message || "Failed to change package", variant: "destructive" });
      }
    },
  });

  const saveDisabled =
    !targetId ||
    !targetPkg ||
    mutation.isPending ||
    (!!targetPkg && previewMismatchCount > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent data-testid="dialog-change-offering-package">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> Change package
          </DialogTitle>
          <DialogDescription>
            Re-parent <span className="font-medium">{offering?.name}</span> to a different package.
            Sessions, bookings, and enrollments stay with the cohort.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm">
            <p className="text-muted-foreground">Current package</p>
            <p className="font-medium" data-testid="text-current-package">
              {currentPkg?.name ?? "—"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Target package</label>
            <PackageCombobox
              packages={cohortPackages}
              value={targetId}
              onChange={setTargetId}
              excludeId={offering?.packageId ?? null}
              testIdTrigger="select-target-package"
              testIdOptionPrefix="option-target-package"
            />
            <p className="text-xs text-muted-foreground">
              Only Cohort packages are shown — Non-cohort packages can't hold a
              cohort.
            </p>
          </div>

          <div className="rounded border p-3 bg-muted/30 text-sm space-y-2" data-testid="panel-move-impact">
            <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Impact</p>
            {impactLoading || !impact ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span data-testid="text-impact-booked-sessions">
                    {impact.bookedSessionCount} booked session{impact.bookedSessionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span data-testid="text-impact-enrollments">
                    {impact.confirmedEnrollmentCount} active enrollment
                    {impact.confirmedEnrollmentCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {hasSnapshotImpact && (
            <div
              className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 p-3 text-sm flex items-start gap-2"
              data-testid="warning-snapshot"
            >
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Existing bookings keep their original pricing</p>
                <p>
                  Sessions, bookings, and enrollment price snapshots stay with the cohort and will
                  not change. New bookings and receipts will use the target package's terms going
                  forward.
                </p>
              </div>
            </div>
          )}

          {targetPkg && previewMismatchCount > 0 && (
            <div
              className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 p-3 text-sm flex items-start gap-2"
              data-testid="warning-audience-mismatch"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Audience mismatch — move blocked</p>
                <p>
                  {previewMismatchCount} active enrollee{previewMismatchCount === 1 ? "" : "s"} fall outside
                  this package's age range ({targetPkg.ageMin ?? "—"}–{targetPkg.ageMax ?? "—"}). Resolve
                  those enrollments before moving the cohort.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel-change-package"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={saveDisabled}
            data-testid="button-confirm-change-package"
          >
            {mutation.isPending ? "Moving…" : "Move to package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface BulkMovePackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  offerings: Pick<ScheduleOffering, "id" | "name" | "packageId">[];
  packages: PackageType[];
  onDone?: () => void;
}

export function BulkMovePackageDialog({
  open,
  onOpenChange,
  tenantId,
  offerings,
  packages,
  onDone,
}: BulkMovePackageDialogProps) {
  const { toast } = useToast();
  const [targetId, setTargetId] = useState<string>("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) setTargetId("");
  }, [open]);

  const impactQueries = useQueries({
    queries: offerings.map((o) => ({
      queryKey: ["/api/tenants", tenantId, "schedule-offerings", o.id, "move-impact"] as const,
      queryFn: async (): Promise<MoveImpact> => {
        const res = await fetch(
          `/api/tenants/${tenantId}/schedule-offerings/${o.id}/move-impact`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error("Failed to load impact");
        return res.json();
      },
      enabled: open,
    })),
  });

  const impactByOfferingId = useMemo(() => {
    const map = new Map<number, MoveImpact>();
    impactQueries.forEach((q, i) => {
      if (q.data) map.set(offerings[i].id, q.data);
    });
    return map;
  }, [impactQueries, offerings]);

  const cohortPackages = useMemo(
    () => packages.filter((p) => p.kind === "COHORT_BASED"),
    [packages],
  );
  const targetPkg = targetId ? cohortPackages.find((p) => p.id === Number(targetId)) : undefined;

  const perOffering = offerings.map((o) => {
    const impact = impactByOfferingId.get(o.id);
    const mismatch = impact && targetPkg ? ageMismatchCount(impact.enrolleeAges, targetPkg) : 0;
    const sameAsTarget = targetPkg ? o.packageId === targetPkg.id : false;
    return { offering: o, impact, mismatch, sameAsTarget };
  });

  const totalMismatchCohorts = perOffering.filter((p) => p.mismatch > 0).length;
  const totalSnapshotCohorts = perOffering.filter(
    (p) => p.impact && (p.impact.bookedSessionCount > 0 || p.impact.confirmedEnrollmentCount > 0),
  ).length;
  const totalSameTarget = perOffering.filter((p) => p.sameAsTarget).length;
  const movableCount = perOffering.filter((p) => !p.sameAsTarget && p.mismatch === 0).length;

  async function run() {
    if (!targetId || !targetPkg) return;
    setRunning(true);
    let moved = 0;
    let skipped = 0;
    const failures: { id: number; message: string }[] = [];
    for (const row of perOffering) {
      const o = row.offering;
      if (row.sameAsTarget) {
        skipped++;
        continue;
      }
      if (row.mismatch > 0) {
        failures.push({ id: o.id, message: `${row.mismatch} enrollee(s) outside target age range` });
        continue;
      }
      try {
        const res = await fetch(`/api/tenants/${tenantId}/schedule-offerings/${o.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageId: targetPkg.id }),
        });
        if (!res.ok) {
          let body: any = null;
          try { body = await res.json(); } catch { /* noop */ }
          failures.push({ id: o.id, message: body?.message || `HTTP ${res.status}` });
        } else {
          moved++;
        }
      } catch (e: any) {
        failures.push({ id: o.id, message: e?.message || "Network error" });
      }
    }
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
    if (failures.length === 0) {
      toast({ title: "Cohorts moved", description: `${moved} moved${skipped ? `, ${skipped} already on target` : ""}.` });
    } else {
      toast({
        title: `${moved} moved, ${failures.length} blocked`,
        description: failures.slice(0, 3).map((f) => `#${f.id}: ${f.message}`).join("\n"),
        variant: moved === 0 ? "destructive" : "default",
      });
    }
    onOpenChange(false);
    onDone?.();
  }

  const saveDisabled = !targetId || !targetPkg || running || movableCount === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent data-testid="dialog-bulk-move-package" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {offerings.length} cohort{offerings.length === 1 ? "" : "s"} to package…</DialogTitle>
          <DialogDescription>
            All selected cohorts will be re-parented to the chosen package. Cohorts with active
            enrollees outside the target package's age range will be skipped with an error.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Target package</label>
            <PackageCombobox
              packages={cohortPackages}
              value={targetId}
              onChange={setTargetId}
              testIdTrigger="select-bulk-target-package"
              testIdOptionPrefix="option-bulk-target-package"
            />
            <p className="text-xs text-muted-foreground">
              Only Cohort packages are shown.
            </p>
          </div>

          <div className="text-sm space-y-1">
            <p className="text-muted-foreground">Selected cohorts ({offerings.length})</p>
            <ul className="text-xs max-h-40 overflow-y-auto rounded border divide-y">
              {perOffering.map(({ offering: o, impact, mismatch, sameAsTarget }) => (
                <li
                  key={o.id}
                  className="px-2 py-1.5 flex items-center justify-between gap-2"
                  data-testid={`text-bulk-cohort-${o.id}`}
                >
                  <span className="truncate">{o.name}</span>
                  <span className="inline-flex items-center gap-1 flex-shrink-0">
                    {impact && (impact.bookedSessionCount > 0 || impact.confirmedEnrollmentCount > 0) ? (
                      <Badge variant="outline" className="text-[10px]">
                        {impact.bookedSessionCount}b · {impact.confirmedEnrollmentCount}e
                      </Badge>
                    ) : null}
                    {sameAsTarget ? (
                      <Badge variant="secondary" className="text-[10px]">already on target</Badge>
                    ) : mismatch > 0 ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px]"
                        data-testid={`badge-bulk-mismatch-${o.id}`}
                      >
                        {mismatch} out of range
                      </Badge>
                    ) : targetPkg ? (
                      <Badge variant="secondary" className="text-[10px]">will move</Badge>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {targetPkg && totalSnapshotCohorts > 0 && (
            <div
              className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 p-3 text-sm flex items-start gap-2"
              data-testid="warning-bulk-snapshot"
            >
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  {totalSnapshotCohorts} cohort{totalSnapshotCohorts === 1 ? "" : "s"} have existing
                  bookings or enrollments
                </p>
                <p>
                  Their session bookings and price snapshots will stay with the cohort. New bookings
                  will use the target package's terms.
                </p>
              </div>
            </div>
          )}

          {targetPkg && totalMismatchCohorts > 0 && (
            <div
              className="rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 p-3 text-sm flex items-start gap-2"
              data-testid="warning-bulk-mismatch"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  {totalMismatchCohorts} cohort{totalMismatchCohorts === 1 ? "" : "s"} will be
                  skipped
                </p>
                <p>
                  Active enrollees fall outside the target package's age range
                  ({targetPkg.ageMin ?? "—"}–{targetPkg.ageMax ?? "—"}). Only the remaining{" "}
                  {movableCount} cohort{movableCount === 1 ? "" : "s"} will move.
                </p>
              </div>
            </div>
          )}

          {targetPkg && totalSameTarget > 0 && totalMismatchCohorts === 0 && (
            <p className="text-xs text-muted-foreground">
              {totalSameTarget} cohort{totalSameTarget === 1 ? " is" : "s are"} already on the target
              package and will be skipped.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running}
            data-testid="button-cancel-bulk-move"
          >
            Cancel
          </Button>
          <Button
            onClick={run}
            disabled={saveDisabled}
            data-testid="button-confirm-bulk-move"
          >
            {running ? "Moving…" : `Move ${movableCount || ""} cohort${movableCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
