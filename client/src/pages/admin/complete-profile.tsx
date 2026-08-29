import { useState } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Shield, GraduationCap, Car, Mail, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

const roleLabels: Record<string, string> = {
  platform_admin: "Platform Admin",
  tenant_admin: "School Admin",
  office_manager: "Office Manager",
  instructor: "Instructor",
  student: "Student",
  parent: "Parent",
};

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  instructorType: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  permitNumber: z.string().optional(),
  permitExpiry: z.string().optional(),
});

export default function CompleteProfilePage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const { toast } = useToast();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);

  const { data: profile, isLoading } = useQuery<{
    roles: string[];
    needsCompletion: boolean;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    instructorType: string | null;
    licenseNumber: string | null;
    licenseExpiry: string | null;
    permitNumber: string | null;
    permitExpiry: string | null;
  }>({
    queryKey: ["/api/tenants", tenantId, "my-profile"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/my-profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      dateOfBirth: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      instructorType: "",
      licenseNumber: "",
      licenseExpiry: "",
      permitNumber: "",
      permitExpiry: "",
    },
    values: profile ? {
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      phone: profile.phone || "",
      dateOfBirth: profile.dateOfBirth || "",
      emergencyContactName: profile.emergencyContactName || "",
      emergencyContactPhone: profile.emergencyContactPhone || "",
      instructorType: profile.instructorType || "",
      licenseNumber: profile.licenseNumber || "",
      licenseExpiry: profile.licenseExpiry || "",
      permitNumber: profile.permitNumber || "",
      permitExpiry: profile.permitExpiry || "",
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: z.infer<typeof profileSchema>) => {
      const res = await apiRequest("PATCH", `/api/tenants/${tenantId}/my-profile`, {
        ...data,
        phone: data.phone || null,
        dateOfBirth: data.dateOfBirth || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        instructorType: data.instructorType || null,
        licenseNumber: data.licenseNumber || null,
        licenseExpiry: data.licenseExpiry || null,
        permitNumber: data.permitNumber || null,
        permitExpiry: data.permitExpiry || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Profile saved successfully" });
      setEditing(false);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to save profile", variant: "destructive" });
    },
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-2xl p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const hasInstructorRole = profile?.roles.includes("instructor");
  const hasStudentRole = profile?.roles.includes("student");

  if (!editing && profile && !profile.needsCompletion) {
    const showInstructor = profile.roles.includes("instructor");
    const showStudent = profile.roles.includes("student");
    const fmtDate = (d: string | null) => {
      if (!d) return "—";
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString();
    };
    const Field = ({ label, value, testId }: { label: string; value: React.ReactNode; testId: string }) => (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm" data-testid={testId}>{value || <span className="text-muted-foreground">—</span>}</p>
      </div>
    );
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2" data-testid="text-my-profile-heading">
                  <User className="h-5 w-5" />
                  My Profile
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <span className="text-sm text-muted-foreground">Roles:</span>
                  {profile.roles.map((r) => (
                    <Badge key={r} variant="secondary" data-testid={`badge-profile-role-${r}`}>
                      {roleLabels[r] || r}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit-profile">
                <Pencil className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal Information
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="First Name" value={profile.firstName} testId="text-profile-firstName" />
                <Field label="Last Name" value={profile.lastName} testId="text-profile-lastName" />
                <Field
                  label="Email"
                  value={user?.email ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {user.email}
                    </span>
                  ) : null}
                  testId="text-profile-email"
                />
                <Field label="Phone" value={profile.phone} testId="text-profile-phone" />
                <Field label="Date of Birth" value={fmtDate(profile.dateOfBirth)} testId="text-profile-dateOfBirth" />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Emergency Contact
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Contact Name" value={profile.emergencyContactName} testId="text-profile-emergencyContactName" />
                <Field label="Contact Phone" value={profile.emergencyContactPhone} testId="text-profile-emergencyContactPhone" />
              </div>
            </div>

            {showInstructor && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Instructor Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Instructor Type"
                    value={
                      profile.instructorType === "CLASSROOM" ? "Classroom"
                      : profile.instructorType === "DRIVE" ? "Behind-the-Wheel"
                      : profile.instructorType === "BOTH" ? "Classroom & BTW"
                      : profile.instructorType
                    }
                    testId="text-profile-instructorType"
                  />
                  <div />
                  <Field label="License Number" value={profile.licenseNumber} testId="text-profile-licenseNumber" />
                  <Field label="License Expiry" value={fmtDate(profile.licenseExpiry)} testId="text-profile-licenseExpiry" />
                </div>
              </div>
            )}

            {showStudent && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  Student Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Permit Number" value={profile.permitNumber} testId="text-profile-permitNumber" />
                  <Field label="Permit Expiry" value={fmtDate(profile.permitExpiry)} testId="text-profile-permitExpiry" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="text-complete-profile-heading">
            <User className="h-5 w-5" />
            {profile?.needsCompletion === false ? "Update Your Profile" : "Complete Your Profile"}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="text-sm text-muted-foreground">Your roles:</span>
            {profile?.roles.map((r) => (
              <Badge key={r} variant="secondary" data-testid={`badge-profile-role-${r}`}>
                {roleLabels[r] || r}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Please complete your profile information to get started. This information is required for compliance and scheduling.
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Personal Information
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="First name" data-testid="input-profile-firstName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Last name" data-testid="input-profile-lastName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Phone number" data-testid="input-profile-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" data-testid="input-profile-dateOfBirth" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Emergency Contact
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="emergencyContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Emergency contact name" data-testid="input-profile-emergencyContactName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emergencyContactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Emergency phone" data-testid="input-profile-emergencyContactPhone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {hasInstructorRole && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    Instructor Details
                  </p>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="instructorType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instructor Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-profile-instructorType">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="CLASSROOM">Classroom</SelectItem>
                              <SelectItem value="DRIVE">Behind-the-Wheel</SelectItem>
                              <SelectItem value="BOTH">Classroom & BTW</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="licenseNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>License Number</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="License #" data-testid="input-profile-licenseNumber" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="licenseExpiry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>License Expiry</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" data-testid="input-profile-licenseExpiry" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}

              {hasStudentRole && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Student Details
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="permitNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Permit Number</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Permit #" data-testid="input-profile-permitNumber" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="permitExpiry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Permit Expiry</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" data-testid="input-profile-permitExpiry" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-profile">
                  {saveMutation.isPending ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}