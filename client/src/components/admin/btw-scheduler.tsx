import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Calendar, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Props {
  tenantId: number;
  enrollmentId: number;
}

const COMPONENT_LABELS: Record<string, string> = {
  IN_CLASS: "In-Class (Texas TDLR Approved)",
  ONLINE_PERMIT: "Online Permit",
  STUDY_GUIDE: "Study Guide",
  BTW_OBSERVATION: "BTW Observation",
  BTW_PRACTICE: "BTW Practice",
  ROAD_TEST: "Road Test",
};

export function BtwScheduler({ tenantId, enrollmentId }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [componentType, setComponentType] = useState<string>("BTW_PRACTICE");
  const [instructorId, setInstructorId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [notes, setNotes] = useState("");

  const { data: comps } = useQuery<any>({
    queryKey: ["/api/tenants", tenantId, "enrollments", enrollmentId, "components"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/enrollments/${enrollmentId}/components`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!tenantId && !!enrollmentId,
  });

  const { data: instructors } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "members", "instructors"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/members?role=instructor`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
  });

  const { data: vehicles } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "vehicles"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/vehicles`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
  });

  const { data: locations } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: open,
  });

  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + 14 * 86400000).toISOString();
  const { data: slots } = useQuery<{ windows: any[]; busy: any[] }>({
    queryKey: ["/api/tenants", tenantId, "instructors", instructorId, "slots", vehicleId || "no-veh"],
    queryFn: async () => {
      const url = `/api/tenants/${tenantId}/instructors/${instructorId}/slots?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${vehicleId ? `&vehicleId=${vehicleId}` : ""}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return { windows: [], busy: [] };
      return r.json();
    },
    enabled: open && !!instructorId,
  });

  function isBusy(start: Date, end: Date) {
    if (!slots?.busy) return false;
    return slots.busy.some((b: any) => new Date(b.startAt) < end && new Date(b.endAt) > start);
  }
  function isInWindow(start: Date, end: Date) {
    if (!slots?.windows || slots.windows.length === 0) return true;
    return slots.windows.some((w: any) => new Date(w.startAt) <= start && new Date(w.endAt) >= end);
  }
  const startDate = startAt ? new Date(startAt) : null;
  const endDate = endAt ? new Date(endAt) : null;
  const slotConflict = !!(startDate && endDate && isBusy(startDate, endDate));
  const slotOutsideWindow = !!(startDate && endDate && instructorId && !isInWindow(startDate, endDate));
  const durationInvalid = !!(startDate && endDate && endDate <= startDate);

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/enrollments/${enrollmentId}/btw-sessions`, {
        componentType,
        instructorId,
        vehicleId: vehicleId || null,
        locationId: locationId || null,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        notes,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session scheduled" });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments", enrollmentId, "components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "sessions"] });
      setOpen(false);
      setStartAt(""); setEndAt(""); setNotes("");
    },
    onError: (e: any) => {
      toast({ title: "Could not schedule", description: e?.message || "Error", variant: "destructive" });
    },
  });

  const gateBlocked = !!comps?.inClassGate;
  const btwComponents = (comps?.components || []).filter((c: any) => ["BTW_OBSERVATION", "BTW_PRACTICE", "ROAD_TEST"].includes(c.type));

  useEffect(() => {
    const remaining = btwComponents.filter((c: any) => c.remainingHours > 0);
    if (remaining.length > 0 && !remaining.some((c: any) => c.type === componentType)) {
      setComponentType(remaining[0].type);
    }
  }, [comps, componentType]);

  if (!comps || btwComponents.length === 0) return null;

  return (
    <div className="border rounded-md p-3 space-y-3" data-testid={`btw-scheduler-${enrollmentId}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Schedule BTW / Road Test
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen((o) => !o)}
          data-testid={`button-toggle-btw-${enrollmentId}`}
        >
          {open ? "Close" : "Schedule"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {btwComponents.map((c: any) => (
          <div key={c.type} className="text-xs border rounded-md px-2 py-1" data-testid={`comp-${c.type}-${enrollmentId}`}>
            <span className="font-medium">{COMPONENT_LABELS[c.type] || c.type}</span>{": "}
            <span className="text-muted-foreground">{c.attendedHours}/{c.requiredHours} done</span>
            {c.bookedHours > 0 && <span className="text-muted-foreground"> · {c.bookedHours} booked</span>}
            <span className="text-muted-foreground"> · {c.remainingHours} remaining</span>
          </div>
        ))}
      </div>

      {gateBlocked && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription data-testid={`gate-msg-${enrollmentId}`}>
            In-class component must be completed at this school before BTW or Road Test sessions can be scheduled
            ({comps.inClassAttended}/{comps.inClassRequired} hours done).{" "}
            <a
              href="https://www.tdlr.texas.gov/driver/driver.htm"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
              data-testid={`link-tdlr-rule-${enrollmentId}`}
            >
              Learn more about Texas TDLR rules
            </a>
            .
          </AlertDescription>
        </Alert>
      )}

      {open && !gateBlocked && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={componentType} onValueChange={setComponentType}>
              <SelectTrigger data-testid={`select-component-${enrollmentId}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {btwComponents.filter((c: any) => c.remainingHours > 0).map((c: any) => (
                  <SelectItem key={c.type} value={c.type}>{COMPONENT_LABELS[c.type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Instructor</Label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger data-testid={`select-instructor-${enrollmentId}`}><SelectValue placeholder="Select instructor" /></SelectTrigger>
              <SelectContent>
                {(instructors || []).map((m: any) => (
                  <SelectItem key={m.userId || m.id} value={m.userId || m.id}>
                    {m.firstName || m.email} {m.lastName || ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Vehicle (optional)</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger data-testid={`select-vehicle-${enrollmentId}`}><SelectValue placeholder="No vehicle" /></SelectTrigger>
              <SelectContent>
                {(vehicles || []).map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)}>{[v.year, v.make, v.model].filter(Boolean).join(" ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Location (optional)</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger data-testid={`select-location-${enrollmentId}`}><SelectValue placeholder="No location" /></SelectTrigger>
              <SelectContent>
                {(locations || []).map((l: any) => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Start</Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} data-testid={`input-start-${enrollmentId}`} />
          </div>
          <div className="space-y-1">
            <Label>End</Label>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} data-testid={`input-end-${enrollmentId}`} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid={`input-notes-${enrollmentId}`} />
          </div>
          {durationInvalid && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription data-testid={`duration-invalid-${enrollmentId}`}>End time must be after start time.</AlertDescription>
            </Alert>
          )}
          {slotConflict && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription data-testid={`slot-conflict-${enrollmentId}`}>
                Instructor or vehicle is already booked at this time.
              </AlertDescription>
            </Alert>
          )}
          {!slotConflict && !durationInvalid && slotOutsideWindow && (
            <Alert className="sm:col-span-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription data-testid={`slot-outside-${enrollmentId}`}>
                This time is outside the instructor's set availability windows.
              </AlertDescription>
            </Alert>
          )}
          {!slotConflict && !durationInvalid && !slotOutsideWindow && startDate && endDate && instructorId && (
            <div className="sm:col-span-2 text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              Slot is open for this instructor{vehicleId ? " and vehicle" : ""}.
            </div>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <Button
              onClick={() => create.mutate()}
              disabled={!instructorId || !startAt || !endAt || durationInvalid || slotConflict || slotOutsideWindow || create.isPending}
              data-testid={`button-create-btw-${enrollmentId}`}
            >
              {create.isPending ? "Scheduling..." : "Schedule Session"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
