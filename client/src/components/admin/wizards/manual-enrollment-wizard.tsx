import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WizardShell, type WizardStep } from "./wizard-shell";

interface PackageItem {
  id: number;
  name: string;
  price: number;
  classroomHoursRequired: number;
  driveHoursRequired: number;
  ageMin?: number | null;
  ageMax?: number | null;
  active: boolean;
  locationScopeMode?: "ALL_LOCATIONS" | "SPECIFIC_LOCATIONS";
}

interface MemberRow {
  id: number;
  userId: string | null;
  role: string;
  user: {
    id: string;
    email: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
  } | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
}

interface LocationItem {
  id: number;
  name: string;
}

interface OfferingItem {
  id: number;
  name: string;
  status: string;
  packageId: number;
  locationId?: number | null;
}

interface ManualEnrollmentWizardProps {
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: WizardStep[] = [
  { key: "student", title: "Student" },
  { key: "package", title: "Package & Location" },
  { key: "offering", title: "Cohort" },
  { key: "payment", title: "Payment" },
  { key: "review", title: "Review" },
];

type PaymentMethod = "PENDING" | "CASH_PAID" | "EXTERNAL";

function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}

export function ManualEnrollmentWizard({ tenantId, open, onOpenChange }: ManualEnrollmentWizardProps) {
  const { toast } = useToast();
  const [stepIdx, setStepIdx] = useState(0);

  // Student fields
  const [studentMode, setStudentMode] = useState<"new" | "existing">("new");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedExistingMemberId, setSelectedExistingMemberId] = useState<number | null>(null);
  // Tracked separately from member.id so the server can bind the enrollment
  // to the actual user record via /admin-enroll's existingUserId field.
  const [selectedExistingMemberUserId, setSelectedExistingMemberUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  // Selection
  const [packageId, setPackageId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [offeringId, setOfferingId] = useState<number | null>(null);
  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PENDING");
  const [notes, setNotes] = useState("");

  const { data: packages = [] } = useQuery<PackageItem[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: locations = [] } = useQuery<LocationItem[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: offerings = [] } = useQuery<OfferingItem[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/schedule-offerings`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId,
  });
  const { data: members = [] } = useQuery<MemberRow[]>({
    queryKey: ["/api/tenants", tenantId, "members"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/members`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId && studentMode === "existing",
  });
  const { data: packageLocs } = useQuery<{ locationIds: number[] }>({
    queryKey: ["/api/tenants", tenantId, "packages", packageId, "locations"],
    queryFn: () => fetch(`/api/tenants/${tenantId}/packages/${packageId}/locations`, { credentials: "include" }).then((r) => r.json()),
    enabled: open && !!tenantId && !!packageId,
  });

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) || null,
    [packages, packageId],
  );
  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === locationId) || null,
    [locations, locationId],
  );
  const filteredOfferings = useMemo(() => {
    return offerings.filter((o) => {
      if (packageId && o.packageId !== packageId) return false;
      if (locationId && o.locationId && o.locationId !== locationId) return false;
      return o.status === "published" || o.status === "draft";
    });
  }, [offerings, packageId, locationId]);

  const allowedLocationIds = useMemo(() => {
    if (!selectedPackage) return null;
    if (selectedPackage.locationScopeMode === "SPECIFIC_LOCATIONS") {
      return packageLocs?.locationIds ?? [];
    }
    return null;
  }, [selectedPackage, packageLocs]);

  const filteredLocations = useMemo(() => {
    if (allowedLocationIds === null) return locations;
    return locations.filter((l) => allowedLocationIds.includes(l.id));
  }, [locations, allowedLocationIds]);

  const showLocationSelector = locations.length > 1 || allowedLocationIds !== null;
  const locationRequired = allowedLocationIds !== null && filteredLocations.length > 0;

  useEffect(() => {
    if (locationId && allowedLocationIds !== null && !allowedLocationIds.includes(locationId)) {
      setLocationId(null);
    }
  }, [locationId, allowedLocationIds]);

  const studentMembers = useMemo(
    () => members.filter((m) => m.role === "student" && m.user),
    [members],
  );
  const matchingStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return studentMembers.slice(0, 8);
    return studentMembers
      .filter((m) => {
        const u = m.user!;
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        return (
          name.includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 12);
  }, [studentMembers, studentSearch]);

  const age = calculateAge(dateOfBirth);
  const isMinor = age !== null && age < 18;

  const isDirty =
    firstName.length > 0 ||
    lastName.length > 0 ||
    email.length > 0 ||
    phone.length > 0 ||
    dateOfBirth.length > 0 ||
    parentName.length > 0 ||
    parentEmail.length > 0 ||
    parentPhone.length > 0 ||
    packageId !== null ||
    locationId !== null ||
    offeringId !== null ||
    notes.length > 0 ||
    selectedExistingMemberId !== null;

  function reset() {
    setStepIdx(0);
    setStudentMode("new");
    setStudentSearch("");
    setSelectedExistingMemberId(null);
    setSelectedExistingMemberUserId(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setDateOfBirth("");
    setParentName("");
    setParentEmail("");
    setParentPhone("");
    setPackageId(null);
    setLocationId(null);
    setOfferingId(null);
    setPaymentMethod("PENDING");
    setNotes("");
  }

  function pickExistingStudent(m: MemberRow) {
    if (!m.user) return;
    setSelectedExistingMemberId(m.id);
    setSelectedExistingMemberUserId(m.user.id ?? m.userId ?? null);
    setFirstName(m.user.firstName ?? "");
    setLastName(m.user.lastName ?? "");
    setEmail(m.user.email ?? "");
    setPhone(m.user.phone ?? "");
    setDateOfBirth(m.user.dateOfBirth ?? "");
    setParentName(m.parentName ?? "");
    setParentEmail(m.parentEmail ?? "");
    setParentPhone(m.parentPhone ?? "");
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/admin-enroll`, {
        // When the admin picked an existing student, pass the userId so the
        // server binds the enrollment to that member instead of creating a
        // duplicate student record.
        existingUserId: selectedExistingMemberUserId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        dateOfBirth: dateOfBirth || null,
        parentName: isMinor ? parentName : (parentName || null),
        parentEmail: isMinor ? parentEmail : (parentEmail || null),
        parentPhone: isMinor ? parentPhone : (parentPhone || null),
        packageId,
        locationId,
        offeringId: offeringId || null,
        paymentMethod,
        notes: notes || null,
      });
      return res.json();
    },
    onSuccess: (data: { enrollmentId: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "dashboard-stats"] });
      toast({
        title: "Enrollment created",
        description: `Enrollment #${data.enrollmentId} created successfully.`,
      });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to create enrollment",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const stepValid: Record<number, boolean> = {
    0: firstName.trim().length > 0
      && lastName.trim().length > 0
      && /\S+@\S+\.\S+/.test(email)
      && (!isMinor || (parentName.trim().length > 0 && /\S+@\S+\.\S+/.test(parentEmail))),
    1: packageId !== null && (!locationRequired || locationId !== null),
    2: true, // offering optional
    3: true, // payment radio always selected
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
      title="Manual Enrollment"
      description="Create an enrollment on behalf of a student walking in or calling."
      steps={STEPS}
      currentStepIndex={stepIdx}
      onBack={() => setStepIdx((i) => Math.max(0, i - 1))}
      onNext={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
      onSubmit={() => submitMutation.mutate()}
      canGoBack={stepIdx > 0}
      canGoNext={stepValid[stepIdx]}
      isSubmitting={submitMutation.isPending}
      submitLabel="Create Enrollment"
      testIdPrefix="manual-enrollment"
      isDirty={isDirty}
    >
      {stepIdx === 0 && (
        <div className="space-y-3">
          <Tabs
            value={studentMode}
            onValueChange={(v) => {
              setStudentMode(v as "new" | "existing");
              if (v === "new") {
                setSelectedExistingMemberId(null);
                setSelectedExistingMemberUserId(null);
              }
            }}
          >
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="new" data-testid="tab-me-new-student">New student</TabsTrigger>
              <TabsTrigger value="existing" data-testid="tab-me-existing-student">Existing student</TabsTrigger>
            </TabsList>
          </Tabs>
          {studentMode === "existing" && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/30">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="Search by name, email, or phone..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  data-testid="input-me-student-search"
                />
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1">
                {matchingStudents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">No students found.</p>
                ) : (
                  matchingStudents.map((m) => {
                    const u = m.user!;
                    const isSelected = selectedExistingMemberId === m.id;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => pickExistingStudent(m)}
                        className={`w-full text-left text-xs px-2 py-1.5 rounded border hover-elevate ${isSelected ? "bg-primary/10 border-primary" : ""}`}
                        data-testid={`button-me-pick-student-${m.id}`}
                      >
                        <div className="font-medium">{u.firstName} {u.lastName}</div>
                        <div className="text-muted-foreground">{u.email}</div>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedExistingMemberId !== null && (
                <p className="text-[11px] text-muted-foreground">Fields below were prefilled. You can edit before continuing.</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="me-first-name">First name *</Label>
              <Input id="me-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-me-first-name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="me-last-name">Last name *</Label>
              <Input id="me-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-me-last-name" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="me-email">Email *</Label>
            <Input id="me-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-me-email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="me-phone">Phone</Label>
              <Input id="me-phone" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-me-phone" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="me-dob">Date of birth</Label>
              <Input id="me-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} data-testid="input-me-dob" />
            </div>
          </div>
          {age !== null && (
            <p className="text-xs text-muted-foreground" data-testid="text-me-age-info">
              Age: {age}
              {isMinor && " — Parent/guardian info required"}
            </p>
          )}
          {isMinor && (
            <div className="space-y-3 border-t pt-3 mt-1">
              <p className="text-sm font-medium">Parent / Guardian</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="me-parent-name">Parent name *</Label>
                  <Input id="me-parent-name" value={parentName} onChange={(e) => setParentName(e.target.value)} data-testid="input-me-parent-name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="me-parent-phone">Parent phone</Label>
                  <Input id="me-parent-phone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} data-testid="input-me-parent-phone" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="me-parent-email">Parent email *</Label>
                <Input id="me-parent-email" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} data-testid="input-me-parent-email" />
              </div>
            </div>
          )}
        </div>
      )}

      {stepIdx === 1 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Package *</Label>
            <Select value={packageId ? String(packageId) : ""} onValueChange={(v) => setPackageId(parseInt(v, 10))}>
              <SelectTrigger data-testid="select-me-package">
                <SelectValue placeholder="Choose a package..." />
              </SelectTrigger>
              <SelectContent>
                {packages.filter((p) => p.active).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)} data-testid={`option-me-package-${p.id}`}>
                    {p.name} — {formatPrice(p.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedPackage && (
            <Card>
              <CardContent className="pt-3 space-y-1 text-xs">
                <div><strong>Price:</strong> {formatPrice(selectedPackage.price)}</div>
                <div><strong>Classroom hours:</strong> {selectedPackage.classroomHoursRequired}</div>
                <div><strong>Drive hours:</strong> {selectedPackage.driveHoursRequired}</div>
                {(selectedPackage.ageMin || selectedPackage.ageMax) && (
                  <div><strong>Age:</strong> {selectedPackage.ageMin ?? "—"} to {selectedPackage.ageMax ?? "—"}</div>
                )}
              </CardContent>
            </Card>
          )}
          {showLocationSelector ? (
            <div className="space-y-1">
              <Label>
                Location{locationRequired ? " *" : ""}
              </Label>
              {allowedLocationIds !== null && allowedLocationIds.length === 0 ? (
                <p className="text-xs text-destructive" data-testid="text-me-no-allowed-locations">
                  This package isn't available at any active location yet. Update its allowed locations first.
                </p>
              ) : (
                <Select value={locationId ? String(locationId) : "none"} onValueChange={(v) => setLocationId(v === "none" ? null : parseInt(v, 10))}>
                  <SelectTrigger data-testid="select-me-location">
                    <SelectValue placeholder={locationRequired ? "Select a location..." : "No specific location"} />
                  </SelectTrigger>
                  <SelectContent>
                    {!locationRequired && (
                      <SelectItem value="none">No specific location</SelectItem>
                    )}
                    {filteredLocations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)} data-testid={`option-me-location-${l.id}`}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {locationRequired && (
                <p className="text-[11px] text-muted-foreground">
                  This package is restricted to specific locations.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {stepIdx === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Optionally assign this student to an existing cohort (schedule offering).
            You can leave this blank and book sessions later.
          </p>
          <div className="space-y-1">
            <Label>Cohort</Label>
            <Select value={offeringId ? String(offeringId) : "none"} onValueChange={(v) => setOfferingId(v === "none" ? null : parseInt(v, 10))}>
              <SelectTrigger data-testid="select-me-offering">
                <SelectValue placeholder="No cohort assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No cohort</SelectItem>
                {filteredOfferings.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)} data-testid={`option-me-offering-${o.id}`}>
                    {o.name} <Badge variant="outline" className="ml-2 text-[10px]">{o.status}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredOfferings.length === 0 && (
              <p className="text-xs text-muted-foreground">No matching offerings for this package and location.</p>
            )}
          </div>
        </div>
      )}

      {stepIdx === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">How is the student paying?</p>
          <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
            <div className="flex items-start gap-2 border rounded-md p-3">
              <RadioGroupItem value="PENDING" id="pm-pending" data-testid="radio-me-payment-pending" />
              <div className="flex-1">
                <Label htmlFor="pm-pending" className="font-medium cursor-pointer">Pending payment</Label>
                <p className="text-xs text-muted-foreground">Create the enrollment now; the student pays later. No credits granted yet.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 border rounded-md p-3">
              <RadioGroupItem value="CASH_PAID" id="pm-cash" data-testid="radio-me-payment-cash" />
              <div className="flex-1">
                <Label htmlFor="pm-cash" className="font-medium cursor-pointer">Paid in cash today</Label>
                <p className="text-xs text-muted-foreground">Mark as paid in cash, confirm enrollment, and grant package credits.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 border rounded-md p-3">
              <RadioGroupItem value="EXTERNAL" id="pm-external" data-testid="radio-me-payment-external" />
              <div className="flex-1">
                <Label htmlFor="pm-external" className="font-medium cursor-pointer">Paid via external method</Label>
                <p className="text-xs text-muted-foreground">Already received payment outside Drivorata (e.g. check, transfer). Confirm and grant credits.</p>
              </div>
            </div>
          </RadioGroup>
          <div className="space-y-1">
            <Label htmlFor="me-notes">Internal notes (optional)</Label>
            <Textarea id="me-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} data-testid="textarea-me-notes" />
          </div>
        </div>
      )}

      {stepIdx === 4 && (
        <div className="space-y-3 text-sm" data-testid="me-review">
          <Card>
            <CardContent className="pt-3 space-y-1">
              <p className="font-medium">Student</p>
              <p>{firstName} {lastName} &lt;{email}&gt;</p>
              {phone && <p className="text-xs text-muted-foreground">Phone: {phone}</p>}
              {dateOfBirth && <p className="text-xs text-muted-foreground">DOB: {dateOfBirth}{age !== null ? ` (age ${age})` : ""}</p>}
              {isMinor && (
                <>
                  <p className="font-medium mt-2">Parent / Guardian</p>
                  <p>{parentName} &lt;{parentEmail}&gt;</p>
                  {parentPhone && <p className="text-xs text-muted-foreground">Phone: {parentPhone}</p>}
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 space-y-1">
              <p className="font-medium">Package & Location</p>
              <p>{selectedPackage?.name} — {formatPrice(selectedPackage?.price ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Location: {selectedLocation?.name ?? "Any"}</p>
              {offeringId && <p className="text-xs text-muted-foreground">Cohort: {filteredOfferings.find(o => o.id === offeringId)?.name}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 space-y-1">
              <p className="font-medium">Payment</p>
              <p>
                {paymentMethod === "PENDING" && "Pending — student will pay later"}
                {paymentMethod === "CASH_PAID" && "Paid in cash — credits will be granted"}
                {paymentMethod === "EXTERNAL" && "Paid externally — credits will be granted"}
              </p>
              {notes && <p className="text-xs text-muted-foreground italic">"{notes}"</p>}
            </CardContent>
          </Card>
        </div>
      )}
    </WizardShell>
  );
}
