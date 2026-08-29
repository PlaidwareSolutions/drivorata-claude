import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Settings, Send, Network } from "lucide-react";
import { SchedulingRelationshipsDiagram } from "@/components/admin/scheduling-relationships-diagram";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Package,
  MapPin,
  Users,
  GraduationCap,
  Car,
  Calendar,
  DollarSign,
  Clock,
  BookOpen,
  CalendarDays,
  Activity,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  CarFront,
  Megaphone,
  Tag,
  Building2,
  CalendarPlus,
  CalendarRange,
  Wand2,
  Mail,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { ManualEnrollmentWizard } from "@/components/admin/wizards/manual-enrollment-wizard";
import { PrivateLessonWizard } from "@/components/admin/wizards/private-lesson-wizard";
import { BroadcastMessageWizard } from "@/components/admin/wizards/broadcast-message-wizard";
import { AddPackageWizard } from "@/components/admin/wizards/add-package-wizard";
import { cn } from "@/lib/utils";
import { useLocationFilter } from "@/lib/location-filter-context";
import { LocationFilterIndicator } from "@/components/admin/location-filter-indicator";
import { useViewRole, type ViewRole } from "@/lib/view-role-context";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  pending_payment: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  subtitle,
  href,
}: {
  title: string;
  value: number | string;
  icon: any;
  loading: boolean;
  subtitle?: string;
  href?: string;
}) {
  const content = (
    <Card className={cn(href && "hover:shadow-md transition-shadow cursor-pointer")}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <>
            <p className="text-2xl font-bold" data-testid={`text-stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
              {value}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href} data-testid={`link-stat-${title.toLowerCase().replace(/\s/g, "-")}`}>{content}</Link>;
  return content;
}

function EnrollmentStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground text-center py-4">No enrollments yet</p>;

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = Math.round((d.count / total) * 100);
        return (
          <div key={d.status} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={cn("text-xs capitalize", statusColors[d.status])}>
                  {d.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <span className="text-muted-foreground font-medium">{d.count} ({pct}%)</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnrollmentTrendChart({ data }: { data: { month: string; count: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No trend data</p>;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => {
        const height = Math.max((d.count / max) * 100, 4);
        const label = new Date(d.month + "-01").toLocaleDateString([], { month: "short" });
        return (
          <div key={d.month} className="flex flex-col items-center flex-1 gap-1">
            <span className="text-xs text-muted-foreground font-medium">{d.count}</span>
            <div
              className="w-full bg-primary/80 rounded-t-sm transition-all"
              style={{ height: `${height}%` }}
            />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

interface SetupHealth {
  packagesWithoutOfferings: { id: number; name: string }[];
  publishedOfferingsWithoutSessions: { id: number; name: string }[];
  sessionsMissingResources: { id: number; type: string; startAt: string; missing: string[] }[];
  enrollmentsWithUnusedCredits: { id: number; firstName: string; lastName: string; email: string; classroom: number; drive: number }[];
}

interface ReminderSettings {
  enabled: boolean;
  intervalDays: number;
}

function StaleCreditReminderControls({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const { data: settings } = useQuery<ReminderSettings>({
    queryKey: ["/api/tenants", tenantId, "stale-credit-reminders/settings"],
    enabled: !!tenantId,
  });
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [draftDays, setDraftDays] = useState<string>("");

  const enabled = draftEnabled ?? settings?.enabled ?? false;
  const days = draftDays !== "" ? draftDays : String(settings?.intervalDays ?? 30);

  const saveMutation = useMutation({
    mutationFn: async (payload: { enabled?: boolean; intervalDays?: number }) => {
      return apiRequest("PATCH", `/api/tenants/${tenantId}/stale-credit-reminders/settings`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "stale-credit-reminders/settings"] });
      toast({ title: "Reminder settings saved" });
      setDraftEnabled(null);
      setDraftDays("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err?.message ?? "", variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/tenants/${tenantId}/stale-credit-reminders/run`, {}),
    onSuccess: async (res: Response) => {
      const data = (await res.json().catch(() => ({}))) as { processed?: number; emailSent?: number; inAppSent?: number; failed?: number };
      const processed = data.processed ?? 0;
      const emailSent = data.emailSent ?? 0;
      const inAppSent = data.inAppSent ?? 0;
      const failed = data.failed ?? 0;
      toast({
        title: "Reminders processed",
        description: `Processed ${processed}: email sent ${emailSent}, in-app ${inAppSent}${failed ? `, failed ${failed}` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "setup-health"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send reminders", description: err?.message ?? "", variant: "destructive" });
    },
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid="button-open-reminder-settings">
          <Settings className="h-3.5 w-3.5 mr-1" /> Reminders
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Stale-credit reminders</p>
            <p className="text-xs text-muted-foreground">Automatically email and notify students with unused credits and no upcoming bookings.</p>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="reminder-enabled" className="text-sm">Enabled</Label>
            <Switch
              id="reminder-enabled"
              checked={enabled}
              onCheckedChange={(v) => setDraftEnabled(v)}
              data-testid="switch-reminder-enabled"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reminder-days" className="text-sm">Send at most every (days)</Label>
            <Input
              id="reminder-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDraftDays(e.target.value)}
              data-testid="input-reminder-days"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              data-testid="button-run-reminders-now"
            >
              {runMutation.isPending ? "Sending..." : "Send now"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const parsed = parseInt(days, 10);
                if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
                  toast({ title: "Days must be 1-365", variant: "destructive" });
                  return;
                }
                saveMutation.mutate({ enabled, intervalDays: parsed });
              }}
              disabled={saveMutation.isPending}
              data-testid="button-save-reminder-settings"
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SendReminderButton({ tenantId, enrollmentId }: { tenantId: number; enrollmentId: number }) {
  const { toast } = useToast();
  const send = async (force: boolean) => {
    const res = await fetch(`/api/tenants/${tenantId}/enrollments/${enrollmentId}/stale-credit-reminder`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) as { message?: string; lastReminderAt?: string } };
  };
  const mutation = useMutation({
    mutationFn: async () => {
      // Default: respect cooldown. If 409, ask admin to confirm override.
      const first = await send(false);
      if (first.status === 409) {
        const last = first.body.lastReminderAt ? new Date(first.body.lastReminderAt).toLocaleString() : "recently";
        const confirmed = window.confirm(
          `This student was already reminded ${last}. Send another reminder anyway?`,
        );
        if (!confirmed) return { skipped: true };
        const second = await send(true);
        if (second.status >= 400) throw new Error(second.body.message ?? "Failed to send reminder");
        return { sent: true };
      }
      if (first.status >= 400) throw new Error(first.body.message ?? "Failed to send reminder");
      return { sent: true };
    },
    onSuccess: (result) => {
      if ((result as { sent?: boolean })?.sent) {
        toast({ title: "Reminder sent" });
        queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "setup-health"] });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send reminder", description: err.message, variant: "destructive" });
    },
  });
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 text-xs"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={mutation.isPending}
      data-testid={`button-send-reminder-${enrollmentId}`}
    >
      <Send className="h-3 w-3 mr-1" />
      {mutation.isPending ? "..." : "Remind"}
    </Button>
  );
}

function SetupHealthCard({ tenantId }: { tenantId: number | undefined }) {
  const { data, isLoading } = useQuery<SetupHealth>({
    queryKey: ["/api/tenants", tenantId, "setup-health"],
    enabled: !!tenantId,
  });

  const totalIssues = data
    ? data.packagesWithoutOfferings.length +
      data.publishedOfferingsWithoutSessions.length +
      data.sessionsMissingResources.length +
      data.enrollmentsWithUnusedCredits.length
    : 0;

  return (
    <Card className="mb-6" data-testid="card-setup-health">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            {totalIssues === 0 && !isLoading ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            School Setup Health
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Checking your setup..."
              : totalIssues === 0
                ? "Everything looks good — your school is fully configured."
                : `${totalIssues} item${totalIssues === 1 ? "" : "s"} need attention.`}
          </CardDescription>
        </div>
        {tenantId && <StaleCreditReminderControls tenantId={tenantId} />}
      </CardHeader>
      {!isLoading && data && totalIssues > 0 && (
        <CardContent className="space-y-3">
          {data.packagesWithoutOfferings.length > 0 && (
            <div className="rounded-md border p-3" data-testid="health-packages-no-offerings">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {data.packagesWithoutOfferings.length} package{data.packagesWithoutOfferings.length === 1 ? "" : "s"} without cohorts
                </p>
                <Link href="/admin/packages">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid="link-view-packages-no-offerings">View</Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Students who buy these packages won't have a cohort to join.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.packagesWithoutOfferings.slice(0, 8).map((p) => (
                  <Link key={p.id} href={`/admin/packages/${p.id}`}>
                    <Badge variant="outline" className="hover-elevate cursor-pointer text-xs" data-testid={`health-pkg-${p.id}`}>
                      {p.name}
                    </Badge>
                  </Link>
                ))}
                {data.packagesWithoutOfferings.length > 8 && (
                  <span className="text-xs text-muted-foreground self-center">+{data.packagesWithoutOfferings.length - 8} more</span>
                )}
              </div>
            </div>
          )}

          {data.publishedOfferingsWithoutSessions.length > 0 && (
            <div className="rounded-md border p-3" data-testid="health-offerings-no-sessions">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {data.publishedOfferingsWithoutSessions.length} published cohort{data.publishedOfferingsWithoutSessions.length === 1 ? "" : "s"} with no sessions
                </p>
                <Link href="/admin/calendar?manageOfferings=1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid="link-view-offerings-no-sessions">View</Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                These cohorts are visible to students but have nothing to attend.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.publishedOfferingsWithoutSessions.slice(0, 8).map((o) => (
                  <Link key={o.id} href={(o as any).packageId ? `/admin/packages/${(o as any).packageId}/cohorts/${o.id}` : `/admin/packages`}>
                    <Badge variant="outline" className="hover-elevate cursor-pointer text-xs" data-testid={`health-offering-${o.id}`}>
                      {o.name}
                    </Badge>
                  </Link>
                ))}
                {data.publishedOfferingsWithoutSessions.length > 8 && (
                  <span className="text-xs text-muted-foreground self-center">+{data.publishedOfferingsWithoutSessions.length - 8} more</span>
                )}
              </div>
            </div>
          )}

          {data.sessionsMissingResources.length > 0 && (
            <div className="rounded-md border p-3" data-testid="health-sessions-missing-resources">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  {data.sessionsMissingResources.length} upcoming session{data.sessionsMissingResources.length === 1 ? "" : "s"} missing instructor or vehicle
                </p>
                <Link href="/admin/calendar">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid="link-view-sessions-missing-resources">View</Button>
                </Link>
              </div>
              <div className="space-y-1">
                {data.sessionsMissingResources.slice(0, 5).map((s) => (
                  <Link key={s.id} href={(s as any).offeringId && (s as any).packageId ? `/admin/packages/${(s as any).packageId}/cohorts/${(s as any).offeringId}/sessions/${s.id}` : `/admin/sessions/${s.id}`}>
                    <div className="flex items-center justify-between gap-2 text-xs hover-elevate rounded px-2 py-1 cursor-pointer" data-testid={`health-session-${s.id}`}>
                      <span className="truncate">
                        <Badge variant="outline" className="text-xs mr-2">{s.type}</Badge>
                        {formatDateTime(s.startAt)}
                      </span>
                      <span className="text-amber-700 dark:text-amber-400 shrink-0">Missing: {s.missing.join(", ")}</span>
                    </div>
                  </Link>
                ))}
                {data.sessionsMissingResources.length > 5 && (
                  <p className="text-xs text-muted-foreground px-2">+{data.sessionsMissingResources.length - 5} more</p>
                )}
              </div>
            </div>
          )}

          {data.enrollmentsWithUnusedCredits.length > 0 && (
            <div className="rounded-md border p-3" data-testid="health-enrollments-unused-credits">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  {data.enrollmentsWithUnusedCredits.length} active enrollment{data.enrollmentsWithUnusedCredits.length === 1 ? "" : "s"} with unused credits and no upcoming bookings
                </p>
                <Link href="/admin/enrollments?creditFilter=unused">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" data-testid="link-view-enrollments-unused-credits">View</Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Reach out to these students to schedule their remaining hours.
              </p>
              <div className="space-y-1">
                {data.enrollmentsWithUnusedCredits.slice(0, 5).map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 text-xs hover-elevate rounded px-2 py-1" data-testid={`health-enrollment-${e.id}`}>
                    <Link href={`/admin/enrollments?focusId=${e.id}`} className="flex-1 min-w-0">
                      <span className="truncate block">{e.firstName} {e.lastName} <span className="text-muted-foreground">({e.email})</span></span>
                    </Link>
                    <span className="text-muted-foreground shrink-0">
                      {e.classroom > 0 && `${e.classroom} classroom`}
                      {e.classroom > 0 && e.drive > 0 && " \u00b7 "}
                      {e.drive > 0 && `${e.drive} drive`}
                    </span>
                    {tenantId && <SendReminderButton tenantId={tenantId} enrollmentId={e.id} />}
                  </div>
                ))}
                {data.enrollmentsWithUnusedCredits.length > 5 && (
                  <p className="text-xs text-muted-foreground px-2">+{data.enrollmentsWithUnusedCredits.length - 5} more</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface QuickActionItem {
  key: string;
  label: string;
  description: string;
  icon: typeof Package;
  onClick: () => void;
  testId: string;
}

type QuickActionRole = "tenant_admin" | "office_manager" | "instructor" | "platform_admin";

type QuickActionItemWithRoles = QuickActionItem & { roles: QuickActionRole[] };

function QuickActionsPanel({ tenantId }: { tenantId: number }) {
  const [, setLocation] = useLocation();
  const { currentTenant } = useTenant();
  const [manualEnrollOpen, setManualEnrollOpen] = useState(false);
  const [privateLessonOpen, setPrivateLessonOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [addPackageOpen, setAddPackageOpen] = useState(false);

  const userRoles: QuickActionRole[] = (
    currentTenant?.roles ?? (currentTenant ? [currentTenant.role] : [])
  ) as QuickActionRole[];
  const isAdmin = userRoles.includes("tenant_admin") || userRoles.includes("platform_admin");
  const isOfficeManager = userRoles.includes("office_manager");
  // Quick Actions are only visible to tenant_admin / office_manager / platform_admin.
  // Instructors and students do not see the panel at all.
  const canSeePanel = isAdmin || isOfficeManager;

  const goCreate = (path: string, param: string = "create") => {
    setLocation(`${path}?${param}=1`);
  };

  const allActions: QuickActionItemWithRoles[] = [
    {
      key: "enroll",
      label: "Enroll Student",
      description: "Walk-in or phone enrollment",
      icon: UserPlus,
      onClick: () => setManualEnrollOpen(true),
      testId: "quick-action-enroll-student",
      roles: ["tenant_admin", "office_manager", "platform_admin"],
    },
    {
      key: "private-lesson",
      label: "Schedule Private Lesson",
      description: "Book 1-on-1 BTW or road test",
      icon: CalendarPlus,
      onClick: () => setPrivateLessonOpen(true),
      testId: "quick-action-private-lesson",
      roles: ["tenant_admin", "office_manager", "platform_admin"],
    },
    {
      key: "broadcast",
      label: "Send Broadcast",
      description: "Email + in-app announcement",
      icon: Megaphone,
      onClick: () => setBroadcastOpen(true),
      testId: "quick-action-broadcast",
      roles: ["tenant_admin", "office_manager", "platform_admin"],
    },
    {
      key: "package",
      label: "New Package",
      description: "Add a course package",
      icon: Package,
      onClick: () => setAddPackageOpen(true),
      testId: "quick-action-new-package",
      roles: ["tenant_admin", "platform_admin"],
    },
    {
      key: "offering",
      label: "New Cohort",
      description: "Schedule cohort / class",
      icon: BookOpen,
      onClick: () => setLocation("/admin/calendar?manageOfferings=1&new=1"),
      testId: "quick-action-new-offering",
      roles: ["tenant_admin", "office_manager", "platform_admin"],
    },
    {
      key: "schedule-session",
      label: "Schedule Session",
      description: "Open the create-session dialog",
      icon: Wand2,
      onClick: () => goCreate("/admin/calendar"),
      testId: "quick-action-generate-sessions",
      roles: ["tenant_admin", "office_manager", "platform_admin"],
    },
    {
      key: "invite",
      label: "Invite Member",
      description: "Add staff or student",
      icon: Users,
      onClick: () => goCreate("/admin/members", "invite"),
      testId: "quick-action-invite-member",
      roles: ["tenant_admin", "platform_admin"],
    },
    {
      key: "vehicle",
      label: "Add Vehicle",
      description: "Register a fleet vehicle",
      icon: CarFront,
      onClick: () => goCreate("/admin/vehicles"),
      testId: "quick-action-add-vehicle",
      roles: ["tenant_admin", "office_manager", "platform_admin"],
    },
    {
      key: "location",
      label: "Add Location",
      description: "New school location",
      icon: Building2,
      onClick: () => goCreate("/admin/locations"),
      testId: "quick-action-add-location",
      roles: ["tenant_admin", "platform_admin"],
    },
    {
      key: "promotion",
      label: "Create Promotion",
      description: "Discount code or sale",
      icon: Tag,
      onClick: () => goCreate("/admin/promotions"),
      testId: "quick-action-create-promotion",
      roles: ["tenant_admin", "office_manager", "platform_admin"],
    },
    {
      key: "announcement",
      label: "Edit Announcement",
      description: "Storefront banner",
      icon: Mail,
      onClick: () => setLocation("/admin/announcement"),
      testId: "quick-action-edit-announcement",
      roles: ["tenant_admin", "platform_admin"],
    },
  ];

  // Hide entirely for instructor / student / non-admin roles.
  if (!canSeePanel) {
    return null;
  }

  const actions = allActions.filter((a) =>
    a.roles.some((r) => userRoles.includes(r)),
  );

  return (
    <>
      <Card className="mb-6" data-testid="card-quick-actions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Quick Actions
          </CardTitle>
          <CardDescription>Common admin tasks, one click away</CardDescription>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-quick-actions-empty">
              No quick actions are available for your role.
            </p>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {actions.map((a) => {
                  const Icon = a.icon;
                  const button = (
                    <button
                      type="button"
                      onClick={a.onClick}
                      className="flex flex-col items-start gap-1 p-3 border rounded-md text-left hover-elevate transition-colors w-full"
                      data-testid={`button-${a.testId}`}
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium leading-tight">{a.label}</span>
                      <span className="text-[11px] text-muted-foreground leading-tight">{a.description}</span>
                    </button>
                  );
                  return (
                    <Tooltip key={a.key}>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        <p className="font-medium">{a.label}</p>
                        <p className="text-muted-foreground">{a.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
      <ManualEnrollmentWizard tenantId={tenantId} open={manualEnrollOpen} onOpenChange={setManualEnrollOpen} />
      <PrivateLessonWizard tenantId={tenantId} open={privateLessonOpen} onOpenChange={setPrivateLessonOpen} />
      <BroadcastMessageWizard tenantId={tenantId} open={broadcastOpen} onOpenChange={setBroadcastOpen} />
      <AddPackageWizard tenantId={tenantId} open={addPackageOpen} onOpenChange={setAddPackageOpen} />
    </>
  );
}

function AdminView({ stats, isLoading, tenantId }: { stats: any; isLoading: boolean; tenantId: number | undefined }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Enrollments" value={stats?.totalEnrollments ?? 0} icon={GraduationCap} loading={isLoading} subtitle={`${stats?.recentEnrollmentsCount ?? 0} in last 30 days`} href="/admin/enrollments" />
        <StatCard title="Total Revenue" value={formatCurrency(stats?.totalRevenue ?? 0)} icon={DollarSign} loading={isLoading} href="/admin/payment-settings" />
        <StatCard title="Sessions Today" value={stats?.todaySessions ?? 0} icon={Calendar} loading={isLoading} subtitle={`${stats?.weekSessions ?? 0} this week`} href="/admin/calendar" />
        <StatCard title="Team Members" value={stats?.totalMembers ?? 0} icon={Users} loading={isLoading} href="/admin/members" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Packages" value={stats?.totalPackages ?? 0} icon={Package} loading={isLoading} href="/admin/packages" />
        <StatCard title="Locations" value={stats?.totalLocations ?? 0} icon={MapPin} loading={isLoading} href="/admin/locations" />
        <StatCard title="Vehicles" value={stats?.totalVehicles ?? 0} icon={Car} loading={isLoading} href="/admin/vehicles" />
        <StatCard title="Total Sessions" value={stats?.totalSessions ?? 0} icon={CalendarDays} loading={isLoading} href="/admin/calendar" />
      </div>

      {/* Quick Actions sit between the stat cards and Setup Health, per spec. */}
      {tenantId && <QuickActionsPanel tenantId={tenantId} />}
      <SetupHealthCard tenantId={tenantId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enrollment Status</CardTitle>
            <CardDescription>Breakdown by current status</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <EnrollmentStatusChart data={stats?.enrollmentsByStatus ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enrollment Trend</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <EnrollmentTrendChart data={stats?.enrollmentsByMonth ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Upcoming Sessions</CardTitle>
              <CardDescription>Next scheduled sessions</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/calendar" data-testid="link-view-all-sessions">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (stats?.upcomingSessions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No upcoming sessions</p>
            ) : (
              <div className="space-y-2">
                {(stats?.upcomingSessions ?? []).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`session-row-${s.id}`}>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs capitalize">{s.type}</Badge>
                      <div>
                        <p className="text-sm font-medium">{formatDate(s.startAt)} {formatTime(s.startAt)} - {formatTime(s.endAt)}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{s.bookedCount}/{s.capacity} booked</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Enrollments</CardTitle>
              <CardDescription>Latest student enrollments</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/enrollments" data-testid="link-view-all-enrollments">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (stats?.recentEnrollmentsList ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No enrollments yet</p>
            ) : (
              <div className="space-y-2">
                {(stats?.recentEnrollmentsList ?? []).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`enrollment-row-${e.id}`}>
                    <div>
                      <p className="text-sm font-medium">{e.firstName} {e.lastName}</p>
                      <p className="text-xs text-muted-foreground">{e.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={cn("text-xs capitalize", statusColors[e.status])}>
                        {e.status?.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(e.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function InstructorView({ stats, isLoading }: { stats: any; isLoading: boolean }) {
  const instrData = stats?.instructor ?? {};
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard title="My Sessions Today" value={instrData.myTodaySessions ?? 0} icon={Calendar} loading={isLoading} href="/admin/my-sessions" />
        <StatCard title="Upcoming Sessions" value={instrData.myUpcomingSessionsCount ?? 0} icon={CalendarDays} loading={isLoading} href="/admin/my-sessions" />
        <StatCard title="My Availability" value="Manage" icon={Clock} loading={false} href="/admin/instructor-availability" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">My Upcoming Sessions</CardTitle>
            <CardDescription>Sessions assigned to you</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/my-sessions" data-testid="link-view-my-sessions">View All</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (instrData.myUpcomingSessions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No upcoming sessions assigned to you</p>
          ) : (
            <div className="space-y-2">
              {(instrData.myUpcomingSessions ?? []).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`my-session-row-${s.id}`}>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs capitalize">{s.type}</Badge>
                    <div>
                      <p className="text-sm font-medium">{formatDate(s.startAt)} {formatTime(s.startAt)} - {formatTime(s.endAt)}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{s.bookedCount}/{s.capacity} students</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StudentView({ stats, isLoading }: { stats: any; isLoading: boolean }) {
  const studentData = stats?.student ?? {};
  const myEnrollments = studentData.myEnrollments ?? [];
  const myBookings = studentData.myBookings ?? [];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard title="Active Enrollments" value={myEnrollments.length} icon={GraduationCap} loading={isLoading} href="/admin/enrollments" />
        <StatCard title="Upcoming Bookings" value={myBookings.length} icon={BookOpen} loading={isLoading} href="/admin/my-bookings" />
        <StatCard title="Schedule" value="Browse" icon={Calendar} loading={false} href="/admin/calendar" />
      </div>

      {myEnrollments.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">My Enrollments</CardTitle>
            <CardDescription>Your current course progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myEnrollments.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-md border" data-testid={`my-enrollment-${e.id}`}>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className={cn("text-xs capitalize", statusColors[e.status])}>
                      {e.status?.replace(/_/g, " ")}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">Enrollment #{e.id}</p>
                      <p className="text-xs text-muted-foreground">
                        Classroom: {e.classroomHoursCompleted ?? 0}h | Drive: {e.drivingHoursCompleted ?? 0}h
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">My Upcoming Bookings</CardTitle>
            <CardDescription>Sessions you are booked into</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/my-bookings" data-testid="link-view-my-bookings">View All</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : myBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No upcoming bookings</p>
          ) : (
            <div className="space-y-2">
              {myBookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-2 rounded-md border" data-testid={`my-booking-${b.id}`}>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {b.status}
                    </Badge>
                    <p className="text-sm font-medium">Session #{b.sessionId}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SchedulingDiagramDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          data-testid="button-open-scheduling-diagram"
        >
          <Network className="h-4 w-4" />
          Scheduling diagram
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="dialog-scheduling-diagram"
      >
        <DialogHeader>
          <DialogTitle>Scheduling — relationships</DialogTitle>
          <DialogDescription>
            How Package, Schedule Offering, Schedule Session, Private Lesson,
            and Driving Test relate. Private Lesson and Driving Test are
            standalone Schedule Sessions distinguished by their type.
          </DialogDescription>
        </DialogHeader>
        <div
          className="overflow-auto rounded-md border bg-background p-2"
          data-testid="dialog-scheduling-diagram-scroll"
        >
          <div className="min-w-[900px]">
            <SchedulingRelationshipsDiagram />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDashboard() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const { viewRole } = useViewRole();
  const { selectedLocationId } = useLocationFilter();

  const locationParam = selectedLocationId ? `?locationId=${selectedLocationId}` : "";

  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/tenants", tenantId, "dashboard-stats", selectedLocationId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/dashboard-stats${locationParam}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboard stats");
      return res.json();
    },
    enabled: !!tenantId,
  });

  if (!currentTenant) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh]">
        <Activity className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
        <h1 className="text-2xl font-bold mb-2" data-testid="text-dashboard-title">Welcome to Drivorata</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Select a school from the sidebar to view its dashboard, or create a new one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview and key metrics</p>
          <div className="mt-2"><LocationFilterIndicator appliesHere /></div>
        </div>
        {viewRole === "admin" && <SchedulingDiagramDialog />}
      </div>

      {viewRole === "admin" && <AdminView stats={stats} isLoading={isLoading} tenantId={tenantId} />}
      {viewRole === "instructor" && <InstructorView stats={stats} isLoading={isLoading} />}
      {viewRole === "student" && <StudentView stats={stats} isLoading={isLoading} />}
    </div>
  );
}
