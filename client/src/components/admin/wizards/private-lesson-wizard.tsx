import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WizardShell, type WizardStep } from "./wizard-shell";

interface EnrollmentItem {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  packageId: number | null;
  locationId: number | null;
}
interface MemberItem {
  id: number;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  emailInvited: string | null;
  role: string;
  status: string;
  user?: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
}
interface VehicleItem { id: number; name: string; locationId: number | null; status: string }
interface LocationItem { id: number; name: string }

const STEPS: WizardStep[] = [
  { key: "student", title: "Student" },
  { key: "type", title: "Type" },
  { key: "resources", title: "Resources" },
  { key: "time", title: "Time slot" },
  { key: "confirm", title: "Confirm" },
];

type ComponentType = "BTW_OBSERVATION" | "BTW_PRACTICE" | "ROAD_TEST";

interface Props {
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ALLOWED_STATUSES = ["confirmed", "active", "in_progress"];

function memberDisplayName(m: MemberItem): string {
  const fn = m.user?.firstName || m.firstName || "";
  const ln = m.user?.lastName || m.lastName || "";
  const name = `${fn} ${ln}`.trim();
  if (name) return name;
  return m.user?.email || m.emailInvited || `Member #${m.id}`;
}

export function PrivateLessonWizard({ tenantId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [stepIdx, setStepIdx] = useState(0);

  const [enrollmentId, setEnrollmentId] = useState<number | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [onlyWithDriveCredits, setOnlyWithDriveCredits] = useState(true);
  const [componentType, setComponentType] = useState<ComponentType>("BTW_PRACTICE");
  const [instructorUserId, setInstructorUserId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [startAt, setStartAt] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [notes, setNotes] = useState("");
  const [sendConfirmation, setSendConfirmation] = useState(false);

  const { data: enrollments = [] } = useQuery<EnrollmentItem[]>({
    queryKey: ["/api/tenants", tenantId, "enrollments"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/enrollments`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: members = [] } = useQuery<MemberItem[]>({
    queryKey: ["/api/tenants", tenantId, "members"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/members`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: vehicles = [] } = useQuery<VehicleItem[]>({
    queryKey: ["/api/tenants", tenantId, "vehicles"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/vehicles`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: locations = [] } = useQuery<LocationItem[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });

  const eligibleEnrollments = useMemo(() => {
    return enrollments.filter((e) => ALLOWED_STATUSES.includes(e.status));
  }, [enrollments]);

  // Fetch drive credit balances for all eligible enrollments so we can filter and badge.
  const eligibleIds = useMemo(
    () => eligibleEnrollments.map((e) => e.id).join(","),
    [eligibleEnrollments],
  );
  const { data: driveBalances = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/tenants", tenantId, "private-lesson-drive-balances", eligibleIds],
    queryFn: async () => {
      const ids = eligibleEnrollments.map((e) => e.id);
      const entries = await Promise.all(
        ids.map(async (id) => {
          const r = await fetch(
            `/api/tenants/${tenantId}/enrollments/${id}/credit-balance`,
            { credentials: "include" },
          );
          if (!r.ok) return [id, 0] as const;
          const j = (await r.json()) as { drive?: number };
          return [id, j.drive ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    enabled: open && !!tenantId && eligibleEnrollments.length > 0,
  });

  const filteredEnrollments = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    let list = eligibleEnrollments;
    if (onlyWithDriveCredits) {
      list = list.filter((e) => (driveBalances[e.id] ?? 0) > 0);
    }
    if (q) {
      list = list.filter((e) =>
        `${e.firstName} ${e.lastName} ${e.email}`.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 25);
  }, [eligibleEnrollments, studentSearch, onlyWithDriveCredits, driveBalances]);

  const selectedDriveBalance = enrollmentId !== null ? (driveBalances[enrollmentId] ?? 0) : 0;

  const instructors = useMemo(() => {
    return members.filter(
      (m) => m.role === "instructor" && m.status === "ACTIVE" && m.userId,
    );
  }, [members]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (v.status !== "ACTIVE" && v.status !== "active") return false;
      if (locationId && v.locationId && v.locationId !== locationId) return false;
      return true;
    });
  }, [vehicles, locationId]);

  const selectedEnrollment = enrollments.find((e) => e.id === enrollmentId) || null;
  const selectedInstructor = instructors.find((i) => i.userId === instructorUserId) || null;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const selectedLocation = locations.find((l) => l.id === locationId) || null;

  // Fetch slot availability for the selected instructor over the next 14 days.
  const { data: slotsData } = useQuery<{
    windows: { startAt: string; endAt: string }[];
    busy: { startAt: string; endAt: string }[];
  }>({
    queryKey: ["/api/tenants", tenantId, "instructors", instructorUserId, "slots", vehicleId],
    queryFn: () => {
      const url = new URL(`/api/tenants/${tenantId}/instructors/${instructorUserId}/slots`, window.location.origin);
      if (vehicleId) url.searchParams.set("vehicleId", String(vehicleId));
      return fetch(url.toString().replace(window.location.origin, ""), {
        credentials: "include",
      }).then((r) => r.json());
    },
    enabled: open && stepIdx >= 3 && !!instructorUserId,
  });

  // Generate candidate slots: walk through available windows in 30-min increments.
  const candidateSlots = useMemo(() => {
    if (!slotsData?.windows) return [] as { startAt: string; label: string }[];
    const out: { startAt: string; label: string }[] = [];
    const now = Date.now();
    const durationMs = durationMinutes * 60 * 1000;
    const busy = (slotsData.busy ?? []).map((b) => ({
      start: new Date(b.startAt).getTime(),
      end: new Date(b.endAt).getTime(),
    }));
    for (const win of slotsData.windows) {
      const winStart = new Date(win.startAt).getTime();
      const winEnd = new Date(win.endAt).getTime();
      let cursor = Math.max(winStart, now);
      // Round up to next 30-min boundary
      const rem = cursor % (30 * 60 * 1000);
      if (rem) cursor += (30 * 60 * 1000 - rem);
      while (cursor + durationMs <= winEnd) {
        const slotEnd = cursor + durationMs;
        const overlaps = busy.some((b) => cursor < b.end && slotEnd > b.start);
        if (!overlaps) {
          const d = new Date(cursor);
          out.push({
            startAt: d.toISOString(),
            label: d.toLocaleString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        }
        cursor += 30 * 60 * 1000;
        if (out.length >= 60) break;
      }
      if (out.length >= 60) break;
    }
    return out;
  }, [slotsData, durationMinutes]);

  // When instructor changes, clear chosen slot
  useEffect(() => {
    setStartAt("");
  }, [instructorUserId, vehicleId, durationMinutes]);

  function reset() {
    setStepIdx(0);
    setEnrollmentId(null);
    setStudentSearch("");
    setComponentType("BTW_PRACTICE");
    setInstructorUserId("");
    setVehicleId(null);
    setLocationId(null);
    setStartAt("");
    setDurationMinutes(60);
    setNotes("");
    setSendConfirmation(false);
  }

  const isDirty =
    enrollmentId !== null ||
    instructorUserId !== "" ||
    vehicleId !== null ||
    locationId !== null ||
    startAt !== "" ||
    notes.length > 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!enrollmentId || !startAt || !instructorUserId) {
        throw new Error("Missing required fields");
      }
      const start = new Date(startAt);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
      const res = await apiRequest(
        "POST",
        `/api/tenants/${tenantId}/enrollments/${enrollmentId}/btw-sessions`,
        {
          componentType,
          instructorId: instructorUserId,
          locationId,
          vehicleId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          notes: notes || null,
          sendConfirmationEmail: sendConfirmation,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "dashboard-stats"] });
      toast({ title: "Private lesson scheduled" });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to schedule",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const stepValid: Record<number, boolean> = {
    0: enrollmentId !== null,
    1: !!componentType,
    2: !!instructorUserId,
    3: !!startAt,
    4: true,
  };

  function handleClose(o: boolean) {
    if (!o) reset();
    onOpenChange(o);
  }

  return (
    <WizardShell
      open={open}
      onOpenChange={handleClose}
      title="Schedule Private Lesson"
      description="Book a one-on-one BTW or road test session for a confirmed student."
      steps={STEPS}
      currentStepIndex={stepIdx}
      onBack={() => setStepIdx((i) => Math.max(0, i - 1))}
      onNext={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
      onSubmit={() => submitMutation.mutate()}
      canGoBack={stepIdx > 0}
      canGoNext={stepValid[stepIdx]}
      isSubmitting={submitMutation.isPending}
      submitLabel="Schedule Session"
      testIdPrefix="private-lesson"
      isDirty={isDirty}
    >
      {stepIdx === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose a confirmed student. Only confirmed, active, or in-progress enrollments can be booked.
          </p>
          <div className="space-y-1">
            <Label htmlFor="pl-search">Search students</Label>
            <Input
              id="pl-search"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search by name or email..."
              data-testid="input-pl-student-search"
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={onlyWithDriveCredits}
              onChange={(e) => setOnlyWithDriveCredits(e.target.checked)}
              data-testid="checkbox-pl-only-with-credits"
            />
            <span>Only show students with available drive credits</span>
          </label>
          <div className="border rounded-md max-h-64 overflow-y-auto">
            {filteredEnrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3 text-center">No matching students.</p>
            ) : filteredEnrollments.map((e) => {
              const drive = driveBalances[e.id] ?? 0;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEnrollmentId(e.id)}
                  className={`w-full text-left p-2 border-b last:border-b-0 hover-elevate ${enrollmentId === e.id ? "bg-primary/10" : ""}`}
                  data-testid={`button-pl-select-enrollment-${e.id}`}
                >
                  <div className="text-sm font-medium">{e.firstName} {e.lastName}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>{e.email}</span>
                    <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                    <Badge
                      variant={drive > 0 ? "secondary" : "destructive"}
                      className="text-[10px]"
                      data-testid={`badge-pl-drive-credits-${e.id}`}
                    >
                      {drive} drive credit{drive === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
          {enrollmentId !== null && selectedDriveBalance === 0 && (
            <p className="text-xs text-destructive" data-testid="text-pl-no-credits-warning">
              This student has no remaining drive credits. The booking will likely be rejected.
            </p>
          )}
        </div>
      )}

      {stepIdx === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">What type of lesson is this?</p>
          <RadioGroup value={componentType} onValueChange={(v) => setComponentType(v as ComponentType)}>
            <div className="flex items-start gap-2 border rounded-md p-3">
              <RadioGroupItem value="BTW_PRACTICE" id="ct-practice" data-testid="radio-pl-type-practice" />
              <div className="flex-1">
                <Label htmlFor="ct-practice" className="font-medium cursor-pointer">Behind-the-wheel practice</Label>
                <p className="text-xs text-muted-foreground">Standard solo driving lesson with the student behind the wheel.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 border rounded-md p-3">
              <RadioGroupItem value="BTW_OBSERVATION" id="ct-obs" data-testid="radio-pl-type-observation" />
              <div className="flex-1">
                <Label htmlFor="ct-obs" className="font-medium cursor-pointer">Behind-the-wheel observation</Label>
                <p className="text-xs text-muted-foreground">Student observes another student's lesson (counts toward TDLR observation hours).</p>
              </div>
            </div>
            <div className="flex items-start gap-2 border rounded-md p-3">
              <RadioGroupItem value="ROAD_TEST" id="ct-road" data-testid="radio-pl-type-road" />
              <div className="flex-1">
                <Label htmlFor="ct-road" className="font-medium cursor-pointer">Road test</Label>
                <p className="text-xs text-muted-foreground">Final TDLR road test session.</p>
              </div>
            </div>
          </RadioGroup>
        </div>
      )}

      {stepIdx === 2 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Instructor *</Label>
            <Select value={instructorUserId} onValueChange={setInstructorUserId}>
              <SelectTrigger data-testid="select-pl-instructor">
                <SelectValue placeholder="Choose instructor..." />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((m) => (
                  <SelectItem key={m.id} value={m.userId!} data-testid={`option-pl-instructor-${m.id}`}>
                    {memberDisplayName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instructors.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active instructors. Invite one from Members first.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Select value={locationId ? String(locationId) : "none"} onValueChange={(v) => setLocationId(v === "none" ? null : parseInt(v, 10))}>
              <SelectTrigger data-testid="select-pl-location">
                <SelectValue placeholder="No specific location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific location</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)} data-testid={`option-pl-location-${l.id}`}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Vehicle</Label>
            <Select value={vehicleId ? String(vehicleId) : "none"} onValueChange={(v) => setVehicleId(v === "none" ? null : parseInt(v, 10))}>
              <SelectTrigger data-testid="select-pl-vehicle">
                <SelectValue placeholder="No specific vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific vehicle</SelectItem>
                {filteredVehicles.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)} data-testid={`option-pl-vehicle-${v.id}`}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {stepIdx === 3 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Duration</Label>
            <Select value={String(durationMinutes)} onValueChange={(v) => setDurationMinutes(parseInt(v, 10))}>
              <SelectTrigger data-testid="select-pl-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="90">1.5 hours</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Available start time *</Label>
            {!instructorUserId ? (
              <p className="text-sm text-muted-foreground">Choose an instructor first.</p>
            ) : candidateSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available slots in the next 14 days. Check the instructor's availability or try another duration.
              </p>
            ) : (
              <div className="border rounded-md max-h-64 overflow-y-auto">
                {candidateSlots.map((s) => (
                  <button
                    key={s.startAt}
                    type="button"
                    onClick={() => setStartAt(s.startAt)}
                    className={`w-full text-left p-2 border-b last:border-b-0 text-sm hover-elevate ${startAt === s.startAt ? "bg-primary/10" : ""}`}
                    data-testid={`button-pl-slot-${s.startAt}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="pl-notes">Internal notes</Label>
            <Textarea id="pl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="textarea-pl-notes" />
          </div>
        </div>
      )}

      {stepIdx === 4 && (
        <div className="space-y-3 text-sm" data-testid="pl-review">
          <Card>
            <CardContent className="pt-3 space-y-1">
              <p className="font-medium">Student</p>
              <p>{selectedEnrollment ? `${selectedEnrollment.firstName} ${selectedEnrollment.lastName}` : ""}</p>
              <p className="text-xs text-muted-foreground">{selectedEnrollment?.email}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 space-y-1">
              <p className="font-medium">Lesson details</p>
              <p>{componentType.replace("_", " ")} — {durationMinutes} minutes</p>
              {startAt && (
                <p className="text-xs text-muted-foreground">
                  {new Date(startAt).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 space-y-1">
              <p className="font-medium">Resources</p>
              <p>Instructor: {selectedInstructor ? memberDisplayName(selectedInstructor) : "—"}</p>
              <p>Vehicle: {selectedVehicle?.name ?? "—"}</p>
              <p>Location: {selectedLocation?.name ?? "—"}</p>
              {notes && <p className="text-xs text-muted-foreground italic">"{notes}"</p>}
            </CardContent>
          </Card>
          <label className="flex items-start gap-2 text-sm border rounded-md p-3">
            <input
              type="checkbox"
              checked={sendConfirmation}
              onChange={(e) => setSendConfirmation(e.target.checked)}
              className="mt-0.5"
              data-testid="checkbox-pl-send-confirmation"
            />
            <div>
              <p className="font-medium">Send a confirmation email to the student</p>
              <p className="text-xs text-muted-foreground">
                Includes the date, time, instructor, vehicle, and location. Best-effort delivery.
              </p>
            </div>
          </label>
        </div>
      )}
    </WizardShell>
  );
}
