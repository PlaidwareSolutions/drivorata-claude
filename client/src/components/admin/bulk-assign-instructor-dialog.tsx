import { useState, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ScheduleSession, Location } from "@shared/schema";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";

interface InstructorOption {
  id: string;
  name: string;
}

interface OfferingOption {
  id: number;
  name: string;
}

export interface BulkAssignDefaults {
  offeringId?: number | null;
  recurrenceGroupId?: string | null;
  locationId?: number | null;
  unassignedOnly?: boolean;
  fromDate?: string;
  toDate?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  sessions: ScheduleSession[];
  instructors: InstructorOption[];
  locations: Location[];
  offerings?: OfferingOption[];
  defaults?: BulkAssignDefaults;
  hideOfferingFilter?: boolean;
  invalidateKeys?: Array<readonly unknown[]>;
}

const UNASSIGN_VALUE = "__UNASSIGN__";
const ANY_VALUE = "__ANY__";

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BulkAssignInstructorDialog({
  open,
  onOpenChange,
  tenantId,
  sessions,
  instructors,
  locations,
  offerings = [],
  defaults,
  hideOfferingFilter,
  invalidateKeys,
}: Props) {
  const { toast } = useToast();

  const [filterOffering, setFilterOffering] = useState<string>(ANY_VALUE);
  const [filterRecurrence, setFilterRecurrence] = useState<string>(ANY_VALUE);
  const [filterLocation, setFilterLocation] = useState<string>(ANY_VALUE);
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [unassignedOnly, setUnassignedOnly] = useState<boolean>(false);
  const [pickedInstructor, setPickedInstructor] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastResult, setLastResult] = useState<{
    updated: number;
    skipped: { sessionId: number; reason: string }[];
  } | null>(null);

  // Reset / preset filters when opening (only on open transition to avoid
  // re-running when parent re-creates the `defaults` object reference).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setFilterOffering(defaults?.offeringId != null ? String(defaults.offeringId) : ANY_VALUE);
      setFilterRecurrence(defaults?.recurrenceGroupId ?? ANY_VALUE);
      setFilterLocation(defaults?.locationId != null ? String(defaults.locationId) : ANY_VALUE);
      setFilterFrom(defaults?.fromDate ?? "");
      setFilterTo(defaults?.toDate ?? "");
      setUnassignedOnly(defaults?.unassignedOnly ?? false);
      setPickedInstructor("");
      setLastResult(null);
    }
  }, [open]);

  const recurrenceGroups = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.recurrenceGroupId) set.add(s.recurrenceGroupId);
    }
    return Array.from(set);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const fromMs = filterFrom ? new Date(`${filterFrom}T00:00:00`).getTime() : null;
    const toMs = filterTo ? new Date(`${filterTo}T23:59:59`).getTime() : null;
    const offeringIdNum = filterOffering !== ANY_VALUE ? parseInt(filterOffering) : null;
    const locationIdNum = filterLocation !== ANY_VALUE ? parseInt(filterLocation) : null;
    return sessions
      .filter((s) => s.status === "SCHEDULED")
      .filter((s) => (offeringIdNum != null ? s.offeringId === offeringIdNum : true))
      .filter((s) =>
        filterRecurrence !== ANY_VALUE ? s.recurrenceGroupId === filterRecurrence : true,
      )
      .filter((s) => (locationIdNum != null ? s.locationId === locationIdNum : true))
      .filter((s) => (unassignedOnly ? !s.instructorId : true))
      .filter((s) => {
        const ms = new Date(s.startAt).getTime();
        if (fromMs != null && ms < fromMs) return false;
        if (toMs != null && ms > toMs) return false;
        return true;
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [sessions, filterOffering, filterRecurrence, filterLocation, filterFrom, filterTo, unassignedOnly]);

  // Auto-select all filtered sessions when filters change (until user explicitly toggles)
  useEffect(() => {
    setSelectedIds(new Set(filteredSessions.map((s) => s.id)));
  }, [filteredSessions]);

  const allSelected = filteredSessions.length > 0 && filteredSessions.every((s) => selectedIds.has(s.id));
  const someSelected = filteredSessions.some((s) => selectedIds.has(s.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map((s) => s.id)));
    }
  }
  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!pickedInstructor) throw new Error("Pick an instructor (or Unassign) first");
      if (selectedIds.size === 0) throw new Error("Select at least one session");
      const body = {
        sessionIds: Array.from(selectedIds),
        instructorId: pickedInstructor === UNASSIGN_VALUE ? null : pickedInstructor,
      };
      const res = await apiRequest(
        "POST",
        `/api/tenants/${tenantId}/sessions/bulk-assign-instructor`,
        body,
      );
      return (await res.json()) as {
        updated: number;
        skipped: { sessionId: number; reason: string }[];
      };
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key as unknown[] });
        }
      }
      const skipMsg = data.skipped.length > 0 ? `, ${data.skipped.length} skipped` : "";
      toast({
        title: `${data.updated} session${data.updated !== 1 ? "s" : ""} updated${skipMsg}`,
      });
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Bulk assign failed", variant: "destructive" });
    },
  });

  const targetLabel =
    pickedInstructor === UNASSIGN_VALUE
      ? "Unassigned"
      : instructors.find((i) => i.id === pickedInstructor)?.name || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk-assign instructor</DialogTitle>
          <DialogDescription>
            Pick a set of scheduled sessions and assign (or swap) an instructor in one step. Per-session
            conflicts are checked on the server; conflicting sessions are skipped and reported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!hideOfferingFilter && offerings.length > 0 && (
              <div>
                <Label className="text-xs">Cohort</Label>
                <Select value={filterOffering} onValueChange={setFilterOffering}>
                  <SelectTrigger data-testid="bulk-filter-offering"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_VALUE}>Any cohort</SelectItem>
                    {offerings.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Location</Label>
              <Select value={filterLocation} onValueChange={setFilterLocation}>
                <SelectTrigger data-testid="bulk-filter-location"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_VALUE}>Any location</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {recurrenceGroups.length > 0 && (
              <div>
                <Label className="text-xs">Recurrence group</Label>
                <Select value={filterRecurrence} onValueChange={setFilterRecurrence}>
                  <SelectTrigger data-testid="bulk-filter-recurrence"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_VALUE}>Any group</SelectItem>
                    {recurrenceGroups.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g.slice(0, 8)}…
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} data-testid="bulk-filter-from" />
              </div>
              <div className="flex-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} data-testid="bulk-filter-to" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="bulk-unassigned-only"
              checked={unassignedOnly}
              onCheckedChange={(v) => setUnassignedOnly(v === true)}
              data-testid="bulk-filter-unassigned-only"
            />
            <Label htmlFor="bulk-unassigned-only" className="text-sm font-normal">
              Unassigned sessions only
            </Label>
          </div>

          <div className="rounded-md border">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  data-testid="bulk-toggle-all"
                />
                <span className="text-sm font-medium">
                  {selectedIds.size} of {filteredSessions.length} selected
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{filteredSessions.length} matching sessions</span>
            </div>
            <ScrollArea className="h-64">
              {filteredSessions.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No scheduled sessions match these filters.
                </div>
              ) : (
                <ul className="divide-y">
                  {filteredSessions.map((s) => {
                    const loc = locations.find((l) => l.id === s.locationId);
                    const instName =
                      instructors.find((i) => i.id === s.instructorId)?.name ||
                      (s.instructorId ? "Unknown" : "Unassigned");
                    return (
                      <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <Checkbox
                          checked={selectedIds.has(s.id)}
                          onCheckedChange={() => toggleOne(s.id)}
                          data-testid={`bulk-row-checkbox-${s.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate" data-testid={`bulk-row-when-${s.id}`}>
                            {formatWhen(new Date(s.startAt))}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            <Badge variant="outline" className="mr-1">{s.type}</Badge>
                            {loc?.name || "No location"} · {instName}
                            {s.recurrenceGroupId && (
                              <span className="ml-1 text-muted-foreground/70">· grp {s.recurrenceGroupId.slice(0, 6)}</span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>

          <div>
            <Label className="text-xs">Assign instructor</Label>
            <Select value={pickedInstructor} onValueChange={setPickedInstructor}>
              <SelectTrigger data-testid="bulk-pick-instructor">
                <SelectValue placeholder="Pick an instructor or Unassign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGN_VALUE}>— Unassign —</SelectItem>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {lastResult && (
            <div className="rounded-md border p-3 space-y-2 text-sm" data-testid="bulk-result">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {lastResult.updated} session{lastResult.updated !== 1 ? "s" : ""} updated
              </div>
              {lastResult.skipped.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    {lastResult.skipped.length} skipped
                  </div>
                  <ul className="text-xs text-muted-foreground max-h-32 overflow-auto pl-5 list-disc">
                    {lastResult.skipped.map((sk) => (
                      <li key={sk.sessionId} data-testid={`bulk-skipped-${sk.sessionId}`}>
                        Session #{sk.sessionId}: {sk.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="bulk-cancel">
            Close
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!pickedInstructor || selectedIds.size === 0 || mutation.isPending}
            data-testid="bulk-submit"
          >
            <Users className="h-4 w-4 mr-1" />
            {mutation.isPending
              ? "Assigning…"
              : `Assign ${targetLabel} to ${selectedIds.size} session${selectedIds.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
