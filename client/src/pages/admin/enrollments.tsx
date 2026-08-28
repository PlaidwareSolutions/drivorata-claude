import { useState, useEffect } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GraduationCap, Search, Pencil, Filter, BookOpen, Car, ArrowUp, ArrowDown, CheckCircle, X, ExternalLink, PenLine, Clock, ShoppingCart, AlertCircle, Mail, Settings as SettingsIcon, Eye, Phone, Calendar, User as UserIcon, Users as UsersIcon, MapPin, FileText, Package as PackageIcon, CreditCard, Download, RefreshCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link, useSearch } from "wouter";
import type { CreditLedgerEntry } from "@shared/schema";
import { useLocationFilter } from "@/lib/location-filter-context";
import { LocationFilterIndicator } from "@/components/admin/location-filter-indicator";

type Enrollment = {
  id: number;
  tenantId: number;
  userId: string | null;
  packageId: number;
  locationId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  status: string;
  notes: string | null;
  classroomHoursCompleted: number;
  drivingHoursCompleted: number;
  creditClassroom: number;
  creditDrive: number;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  stripePaymentId: string | null;
  amountPaid: number | null;
  cartId: string | null;
  offeringId: number | null;
  isWaitlisted: boolean | null;
  createdAt: string;
  updatedAt: string;
};

type ScheduleOffering = {
  id: number;
  name: string;
  startsAt: string;
};

type WaitlistEntry = {
  id: number;
  offeringId: number;
  email: string;
};

type Package = {
  id: number;
  name: string;
  price: number;
  creditClassroom: number | null;
  creditDrive: number | null;
};

type Location = {
  id: number;
  name: string;
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Awaiting Payment",
  confirmed: "Confirmed",
  active: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
};


function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pending":
    case "pending_payment":
      return "outline";
    case "confirmed":
    case "active":
      return "default";
    case "in_progress":
      return "secondary";
    case "completed":
      return "default";
    case "cancelled":
    case "expired":
    case "refunded":
      return "destructive";
    default:
      return "outline";
  }
}

function getStatusBadgeClassName(status: string): string {
  if (status === "completed") {
    return "bg-green-600 hover:bg-green-700 text-white border-green-600 no-default-hover-elevate no-default-active-elevate";
  }
  return "";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(firstName: string, lastName: string): string {
  return `${(firstName?.[0] || "").toUpperCase()}${(lastName?.[0] || "").toUpperCase()}`;
}

const editEnrollmentSchema = z.object({
  status: z.enum(["pending", "pending_payment", "confirmed", "active", "in_progress", "completed", "cancelled", "expired", "refunded"]),
  notes: z.string().optional(),
});

const reasonLabels: Record<string, string> = {
  PACKAGE_GRANT: "Package Grant",
  SESSION_CONSUME: "Session Booking",
  ADJUSTMENT: "Manual Adjustment",
  REFUND_REVERSAL: "Refund Reversal",
  BOOKING_CANCEL: "Booking Cancelled",
};

function formatReasonLabel(reason: string): string {
  return reasonLabels[reason] || reason;
}

function ReminderTrackingBadges({
  hasOpened,
  hasClicked,
  recoveredAt,
  opens,
  clicks,
  testIdPrefix,
}: {
  hasOpened: boolean;
  hasClicked: boolean;
  recoveredAt: string | null;
  opens: number;
  clicks: number;
  testIdPrefix: string;
}) {
  // Show all three states even when negative so admins can quickly distinguish
  // "no signal yet" from "opened but not clicked".
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Badge
        variant={hasOpened ? "default" : "outline"}
        className={hasOpened ? "bg-blue-600 hover:bg-blue-600 text-white text-[10px] h-5 px-1.5" : "text-[10px] h-5 px-1.5"}
        data-testid={`${testIdPrefix}-opened`}
      >
        {hasOpened ? `Opened${opens > 1 ? ` ×${opens}` : ""}` : "Not opened"}
      </Badge>
      <Badge
        variant={hasClicked ? "default" : "outline"}
        className={hasClicked ? "bg-purple-600 hover:bg-purple-600 text-white text-[10px] h-5 px-1.5" : "text-[10px] h-5 px-1.5"}
        data-testid={`${testIdPrefix}-clicked`}
      >
        {hasClicked ? `Clicked${clicks > 1 ? ` ×${clicks}` : ""}` : "Not clicked"}
      </Badge>
      {recoveredAt && (
        <Badge
          className="bg-green-600 hover:bg-green-600 text-white text-[10px] h-5 px-1.5"
          data-testid={`${testIdPrefix}-recovered`}
        >
          Recovered
        </Badge>
      )}
    </div>
  );
}

function CartReminderSummaryCard({ summary }: { summary: {
  remindersSent: number;
  uniqueReminders: number;
  totalOpens: number;
  totalClicks: number;
  recoveries: number;
  openRate: number;
  clickRate: number;
  recoveryRate: number;
  byStage: Array<{
    stage: number; sent: number; uniqueOpens: number; uniqueClicks: number;
    recoveries: number; openRate: number; clickRate: number; recoveryRate: number;
  }>;
} | undefined }) {
  if (!summary || summary.remindersSent === 0) return null;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <Card className="mb-4" data-testid="card-cart-reminder-summary">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold" data-testid="text-reminder-summary-title">Reminder performance</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <SummaryStat label="Reminders sent" value={String(summary.remindersSent)} testId="stat-reminders-sent" />
          <SummaryStat label="Open rate" value={pct(summary.openRate)} testId="stat-open-rate" />
          <SummaryStat label="Click rate" value={pct(summary.clickRate)} testId="stat-click-rate" />
          <SummaryStat label="Recovery rate" value={pct(summary.recoveryRate)} sub={`${summary.recoveries} recovered`} testId="stat-recovery-rate" />
        </div>
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-2">Per-stage cadence comparison (helps you tune the wait times):</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {summary.byStage.map(s => (
              <div key={s.stage} className="rounded border p-2" data-testid={`stage-row-${s.stage}`}>
                <div className="font-medium mb-1">Stage {s.stage} {s.stage === 1 ? "(early)" : "(late)"}</div>
                <div className="text-muted-foreground">
                  Sent {s.sent} · Open {pct(s.openRate)} · Click {pct(s.clickRate)} · Recovery {pct(s.recoveryRate)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryStat({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId: string }) {
  return (
    <div className="rounded border p-2" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CartReminderSettingsCard({
  settings,
  onToggle,
  onChangeHours,
  onRunNow,
  isRunning,
  isSaving,
}: {
  settings: { enabled: boolean; hoursStage1: number; hoursStage2: number } | undefined;
  onToggle: (enabled: boolean) => void;
  onChangeHours: (h1: number, h2: number) => void;
  onRunNow: () => void;
  isRunning: boolean;
  isSaving: boolean;
}) {
  const [h1, setH1] = useState(settings?.hoursStage1 ?? 1);
  const [h2, setH2] = useState(settings?.hoursStage2 ?? 24);
  useEffect(() => {
    if (settings) {
      setH1(settings.hoursStage1);
      setH2(settings.hoursStage2);
    }
  }, [settings?.hoursStage1, settings?.hoursStage2]);
  const dirty = !!settings && (h1 !== settings.hoursStage1 || h2 !== settings.hoursStage2);
  return (
    <Card className="mb-4" data-testid="card-cart-reminder-settings">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold" data-testid="text-reminder-title">Automated follow-up emails</p>
              <p className="text-xs text-muted-foreground">
                Send a reminder to abandoned-cart visitors and pending cash payers with a one-click resume link.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={!!settings?.enabled}
                onCheckedChange={onToggle}
                disabled={isSaving}
                data-testid="switch-cart-reminders-enabled"
              />
              <Label className="text-sm">{settings?.enabled ? "Enabled" : "Disabled"}</Label>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onRunNow}
              disabled={isRunning || !settings?.enabled}
              data-testid="button-run-reminders-now"
            >
              <Mail className="h-4 w-4 mr-1" /> Send due reminders
            </Button>
          </div>
        </div>
        <div className="mt-3 flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs">First reminder after (hours)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={h1}
              onChange={(e) => setH1(Math.max(1, parseInt(e.target.value || "1") || 1))}
              className="h-8 w-28"
              data-testid="input-reminder-stage1"
            />
          </div>
          <div>
            <Label className="text-xs">Second reminder after (hours)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={h2}
              onChange={(e) => setH2(Math.max(1, parseInt(e.target.value || "24") || 24))}
              className="h-8 w-28"
              data-testid="input-reminder-stage2"
            />
          </div>
          <Button
            size="sm"
            variant="default"
            disabled={!dirty || isSaving}
            onClick={() => onChangeHours(h1, h2)}
            data-testid="button-save-reminder-hours"
          >
            Save cadence
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EnrollmentsPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const { toast } = useToast();

  const { selectedLocationId } = useLocationFilter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [packageFilter, setPackageFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [creditFilter, setCreditFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  // Sorting state for Confirmed tab
  type ConfirmedSortKey = "name" | "package" | "status" | "date";
  const [confirmedSort, setConfirmedSort] = useState<{ key: ConfirmedSortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  function toggleConfirmedSort(key: ConfirmedSortKey) {
    setConfirmedSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  // Filter + sort state for Pending Cash tab
  const [pendingCashSearch, setPendingCashSearch] = useState("");
  const [pendingCashSort, setPendingCashSort] = useState<"waited_longest" | "newest" | "amount_high" | "amount_low">("waited_longest");

  // Filter + sort state for Expired & Abandoned tab
  const [abandonedSearch, setAbandonedSearch] = useState("");
  const [abandonedSort, setAbandonedSort] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    setLocationFilter(selectedLocationId !== null ? String(selectedLocationId) : "all");
  }, [selectedLocationId]);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  const [creditLedgerEnrollment, setCreditLedgerEnrollment] = useState<Enrollment | null>(null);
  const [sigViewEnrollment, setSigViewEnrollment] = useState<Enrollment | null>(null);
  const [detailsEnrollment, setDetailsEnrollment] = useState<Enrollment | null>(null);
  const [cartDetails, setCartDetails] = useState<CartCustomerDetailsInput | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const search = useSearch();

  type AttentionTab = "confirmed" | "pending_cash" | "abandoned";
  const [activeTab, setActiveTab] = useState<AttentionTab>("confirmed");

  const { data: enrollments = [], isLoading } = useQuery<Enrollment[]>({
    queryKey: ["/api/tenants", tenantId, "enrollments"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/enrollments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  type CartCustomerSnapshotFields = {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    parentName?: string | null;
    parentEmail?: string | null;
    parentPhone?: string | null;
    notes?: string | null;
  };

  type PendingCashPayment = {
    id: number;
    tenantId: number;
    enrollmentId: number | null;
    cartId: string | null;
    amountCents: number;
    createdAt: string;
    enrollment: Enrollment | null;
    cartCustomer: CartCustomerSnapshotFields | null;
    cartItems: Array<{
      package: { id: number; name: string } | null;
      offering: { id: number; name: string } | null;
      quantity: number;
    }>;
    lastReminderAt?: string | null;
    remindersSent?: number;
    unsubscribed?: boolean;
    suppressionReason?: string | null;
    reminderOpens?: number;
    reminderClicks?: number;
    reminderHasOpened?: boolean;
    reminderHasClicked?: boolean;
    reminderRecoveredAt?: string | null;
  };

  const { data: pendingCash = [], isLoading: pendingCashLoading } = useQuery<PendingCashPayment[]>({
    queryKey: ["/api/tenants", tenantId, "pending-cash-payments"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/pending-cash-payments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
  });

  type AbandonedCart = {
    id: string;
    tenantId: number;
    status: string;
    customerSnapshotJson: CartCustomerSnapshotFields | null;
    updatedAt: string;
    items: Array<{ id: number; packageId: number; offeringId: number | null; priceCents: number; package?: { name: string } | null; offering?: { name: string } | null }>;
    lastReminderAt?: string | null;
    remindersSent?: number;
    unsubscribed?: boolean;
    suppressionReason?: string | null;
    reminderOpens?: number;
    reminderClicks?: number;
    reminderHasOpened?: boolean;
    reminderHasClicked?: boolean;
    reminderRecoveredAt?: string | null;
  };

  type CartReminderSettings = { enabled: boolean; hoursStage1: number; hoursStage2: number };
  const { data: reminderSettings } = useQuery<CartReminderSettings>({
    queryKey: ["/api/tenants", tenantId, "cart-reminders", "settings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/cart-reminders/settings`, { credentials: "include" });
      if (!res.ok) return { enabled: false, hoursStage1: 1, hoursStage2: 24 };
      return res.json();
    },
    enabled: !!tenantId,
  });

  const updateReminderSettings = useMutation({
    mutationFn: async (patch: Partial<CartReminderSettings>) =>
      apiRequest("PATCH", `/api/tenants/${tenantId}/cart-reminders/settings`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "cart-reminders", "settings"] });
      toast({ title: "Reminder settings saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to save", variant: "destructive" }),
  });

  const sendReminderNow = useMutation({
    mutationFn: async (params: { kind: "abandoned_cart" | "pending_cash"; cartId?: string | null; paymentId?: number | null }) =>
      apiRequest("POST", `/api/tenants/${tenantId}/cart-reminders/send-now`, params),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "abandoned-carts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "pending-cash-payments"] });
      toast({ title: vars.kind === "abandoned_cart" ? "Cart reminder sent" : "Payment reminder sent" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to send reminder", variant: "destructive" }),
  });

  const runRemindersNow = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/tenants/${tenantId}/cart-reminders/run`, {}),
    onSuccess: async (res: any) => {
      const data = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "abandoned-carts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "pending-cash-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "cart-reminders", "summary"] });
      toast({
        title: "Reminder sweep complete",
        description: `Abandoned cart: ${data?.abandonedSent ?? 0} · Pending cash: ${data?.pendingCashSent ?? 0} · Failed: ${data?.failed ?? 0}`,
      });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to run reminders", variant: "destructive" }),
  });

  type CartReminderSummary = {
    remindersSent: number;
    uniqueReminders: number;
    totalOpens: number;
    totalClicks: number;
    recoveries: number;
    openRate: number;
    clickRate: number;
    recoveryRate: number;
    byStage: Array<{
      stage: number;
      sent: number;
      uniqueOpens: number;
      uniqueClicks: number;
      recoveries: number;
      openRate: number;
      clickRate: number;
      recoveryRate: number;
    }>;
  };
  const { data: reminderSummary } = useQuery<CartReminderSummary>({
    queryKey: ["/api/tenants", tenantId, "cart-reminders", "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/cart-reminders/summary`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: abandonedCarts = [], isLoading: abandonedLoading } = useQuery<AbandonedCart[]>({
    queryKey: ["/api/tenants", tenantId, "abandoned-carts"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/abandoned-carts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
  });

  const confirmCashMutation = useMutation({
    mutationFn: async (paymentId: number) =>
      apiRequest("POST", `/api/tenants/${tenantId}/payments/${paymentId}/confirm-cash`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "pending-cash-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments", "attention-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "pending-cash-payments", "count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "cart-reminders", "summary"] });
      toast({ title: "Cash payment confirmed" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to confirm", variant: "destructive" }),
  });

  const cancelCashMutation = useMutation({
    mutationFn: async (paymentId: number) =>
      apiRequest("POST", `/api/tenants/${tenantId}/payments/${paymentId}/cancel-cash`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "pending-cash-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "abandoned-carts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "schedule-offerings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments", "attention-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "pending-cash-payments", "count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "cart-reminders", "summary"] });
      toast({ title: "Cash payment cancelled" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to cancel", variant: "destructive" }),
  });

  const resendEnrollmentEmailMutation = useMutation({
    mutationFn: async (paymentId: number) =>
      apiRequest("POST", `/api/tenants/${tenantId}/payments/${paymentId}/resend-enrollment-received-email`),
    onSuccess: () => {
      toast({ title: "Enrollment confirmation email sent" });
    },
    onError: (e: any) => toast({ title: e?.message || "Failed to resend email", variant: "destructive" }),
  });

  useEffect(() => {
    const params = new URLSearchParams(search);
    const focusParam = params.get("focusId");
    if (focusParam && enrollments.length > 0) {
      const id = parseInt(focusParam);
      const found = enrollments.find(e => e.id === id);
      if (found && focusedId !== id) {
        setFocusedId(id);
        setEditingEnrollment(found);
      }
    }
    const cf = params.get("creditFilter");
    if (cf) setCreditFilter(cf);
  }, [search, enrollments, focusedId]);

  const { data: packages = [] } = useQuery<Package[]>({
    queryKey: ["/api/tenants", tenantId, "packages"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/packages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: offerings = [] } = useQuery<ScheduleOffering[]>({
    queryKey: ["/api/tenants", tenantId, "schedule-offerings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/schedule-offerings`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
  });

  const promoteWaitlistMutation = useMutation({
    mutationFn: async ({ enrollmentId }: { enrollmentId: number }) => {
      // Promote by enrollment id — server resolves the matching waitlist row.
      return apiRequest("POST", `/api/tenants/${tenantId}/enrollments/${enrollmentId}/promote-waitlist`);
    },
    onSuccess: () => {
      toast({ title: "Promoted", description: "Student moved off the waitlist." });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
    },
    onError: (e: any) => toast({ title: "Promotion failed", description: e?.message || "Try again", variant: "destructive" }),
  });

  const { data: bookings = [] } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "bookings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/bookings`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
  });
  const bookingsByEnrollment = new Map<number, any[]>();
  for (const b of bookings) {
    const list = bookingsByEnrollment.get(b.enrollmentId) || [];
    list.push(b);
    bookingsByEnrollment.set(b.enrollmentId, list);
  }

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/tenants", tenantId, "locations"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/locations`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const { data: sigPayments = [], isLoading: sigLoading } = useQuery<any[]>({
    queryKey: ["/api/tenants", tenantId, "enrollments", sigViewEnrollment?.id, "payments"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/enrollments/${sigViewEnrollment!.id}/payments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!sigViewEnrollment,
  });

  const { data: creditLedgerEntries = [], isLoading: creditsLoading } = useQuery<CreditLedgerEntry[]>({
    queryKey: ["/api/tenants", tenantId, "enrollments", creditLedgerEnrollment?.id, "credits"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/enrollments/${creditLedgerEnrollment!.id}/credits`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId && !!creditLedgerEnrollment,
  });

  const editForm = useForm<z.infer<typeof editEnrollmentSchema>>({
    resolver: zodResolver(editEnrollmentSchema),
    defaultValues: {
      status: "pending",
      notes: "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof editEnrollmentSchema> }) => {
      const res = await apiRequest("PATCH", `/api/tenants/${tenantId}/enrollments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      toast({ title: "Enrollment updated successfully" });
      setEditingEnrollment(null);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update enrollment", variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/enrollments/${id}/confirm`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      toast({ title: "Enrollment confirmed successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to confirm enrollment", variant: "destructive" });
    },
  });

  function getCreditStatus(e: Enrollment): string {
    const pkg = packages.find(p => p.id === e.packageId);
    const totalClassroom = pkg?.creditClassroom ?? 0;
    const totalDrive = pkg?.creditDrive ?? 0;
    const hasClassroom = totalClassroom > 0;
    const hasDrive = totalDrive > 0;
    const classroomRemaining = e.creditClassroom;
    const driveRemaining = e.creditDrive;
    if (!hasClassroom && !hasDrive) {
      if (classroomRemaining > 0 || driveRemaining > 0) return "unused";
      return "none";
    }
    const classroomDone = !hasClassroom || classroomRemaining <= 0;
    const driveDone = !hasDrive || driveRemaining <= 0;
    if (classroomDone && driveDone) return "used_all";
    const classroomFull = hasClassroom && classroomRemaining >= totalClassroom;
    const driveFull = hasDrive && driveRemaining >= totalDrive;
    if (classroomFull && driveFull) return "unused";
    return "partially_used";
  }

  function getDateBucket(dateStr: string): string {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) return "last_7";
    if (diffDays <= 30) return "last_30";
    if (diffDays <= 90) return "last_90";
    return "older";
  }

  // The Confirmed tab must never include expired rows. Expired enrollments
  // appear only in the "Expired & abandoned" tab.
  const baseEnrollments = enrollments.filter((e) => e.status !== "expired");
  const filteredEnrollments = baseEnrollments.filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (packageFilter !== "all" && e.packageId !== parseInt(packageFilter)) return false;
    if (locationFilter !== "all" && e.locationId !== parseInt(locationFilter)) return false;
    if (creditFilter !== "all" && getCreditStatus(e) !== creditFilter) return false;
    if (dateFilter !== "all" && getDateBucket(e.createdAt) !== dateFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      const email = e.email.toLowerCase();
      if (!name.includes(q) && !email.includes(q)) return false;
    }
    return true;
  });

  const sortedFilteredEnrollments = [...filteredEnrollments].sort((a, b) => {
    const dir = confirmedSort.dir === "asc" ? 1 : -1;
    switch (confirmedSort.key) {
      case "name": {
        const an = `${a.firstName} ${a.lastName}`.toLowerCase();
        const bn = `${b.firstName} ${b.lastName}`.toLowerCase();
        return an.localeCompare(bn) * dir;
      }
      case "package":
        return getPackageName(a.packageId).localeCompare(getPackageName(b.packageId)) * dir;
      case "status":
        return (statusLabels[a.status] || a.status).localeCompare(statusLabels[b.status] || b.status) * dir;
      case "date":
      default:
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    }
  });

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0) + (packageFilter !== "all" ? 1 : 0) + (locationFilter !== "all" ? 1 : 0) + (creditFilter !== "all" ? 1 : 0) + (dateFilter !== "all" ? 1 : 0) + (searchQuery ? 1 : 0);

  const statusCounts = enrollments.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const creditStatusCounts = enrollments.reduce((acc, e) => {
    const cs = getCreditStatus(e);
    acc[cs] = (acc[cs] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dateBucketCounts = enrollments.reduce((acc, e) => {
    const bucket = getDateBucket(e.createdAt);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function clearAllFilters() {
    setStatusFilter("all");
    setPackageFilter("all");
    setLocationFilter("all");
    setCreditFilter("all");
    setDateFilter("all");
    setSearchQuery("");
  }

  function getPackageName(packageId: number | null): string {
    if (!packageId) return "Online Course";
    const pkg = packages.find((p) => p.id === packageId);
    return pkg?.name || `Package #${packageId}`;
  }

  function getPackagePrice(packageId: number | null): number | null {
    if (!packageId) return null;
    const pkg = packages.find((p) => p.id === packageId);
    return pkg?.price ?? null;
  }

  function getLocationName(locationId: number | null): string {
    if (!locationId) return "Not assigned";
    const loc = locations.find((l) => l.id === locationId);
    return loc?.name || `Location #${locationId}`;
  }

  function openEditDialog(enrollment: Enrollment) {
    editForm.reset({
      status: enrollment.status as any,
      notes: enrollment.notes || "",
    });
    setEditingEnrollment(enrollment);
  }

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  const confirmedEnrollments = enrollments.filter(e => !["expired"].includes(e.status));
  const expiredEnrollments = enrollments.filter(e => e.status === "expired");

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold" data-testid="text-enrollments-heading">Enrollments</h1>
          <LocationFilterIndicator appliesHere />
        </div>
        <Badge variant="secondary" data-testid="badge-enrollment-count">
          {enrollments.length}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AttentionTab)} className="mb-4">
        <TabsList data-testid="tabs-enrollments">
          <TabsTrigger value="confirmed" data-testid="tab-confirmed">
            Confirmed ({confirmedEnrollments.length})
          </TabsTrigger>
          <TabsTrigger value="pending_cash" data-testid="tab-pending-cash">
            Pending cash ({pendingCash.length})
          </TabsTrigger>
          <TabsTrigger value="abandoned" data-testid="tab-abandoned">
            Expired & abandoned ({expiredEnrollments.length + abandonedCarts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending_cash" className="mt-4" data-testid="panel-pending-cash">
          <p className="text-sm text-muted-foreground mb-4">
            Cash-pay enrollments awaiting confirmation. These are <strong>intent only</strong> — they don't hold seats and don't show in the Confirmed tab. Confirm to activate, or cancel to discard.
          </p>
          {(() => {
            const q = pendingCashSearch.trim().toLowerCase();
            const filtered = pendingCash.filter(p => {
              if (!q) return true;
              const cust = p.enrollment || p.cartCustomer || {};
              const name = `${cust.firstName || ""} ${cust.lastName || ""}`.toLowerCase();
              const email = (cust.email || "").toLowerCase();
              return name.includes(q) || email.includes(q);
            });
            const sorted = [...filtered].sort((a, b) => {
              switch (pendingCashSort) {
                case "newest":
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                case "amount_high":
                  return b.amountCents - a.amountCents;
                case "amount_low":
                  return a.amountCents - b.amountCents;
                case "waited_longest":
                default:
                  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              }
            });
            return (<>
              <CartReminderSettingsCard
                settings={reminderSettings}
                onToggle={(enabled) => updateReminderSettings.mutate({ enabled })}
                onChangeHours={(hoursStage1, hoursStage2) => updateReminderSettings.mutate({ hoursStage1, hoursStage2 })}
                onRunNow={() => runRemindersNow.mutate()}
                isRunning={runRemindersNow.isPending}
                isSaving={updateReminderSettings.isPending}
              />
              <CartReminderSummaryCard summary={reminderSummary} />
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={pendingCashSearch}
                    onChange={(e) => setPendingCashSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-pending-cash"
                  />
                </div>
                <Select value={pendingCashSort} onValueChange={(v) => setPendingCashSort(v as any)}>
                  <SelectTrigger className="w-[200px]" data-testid="select-sort-pending-cash">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="waited_longest">Waited longest</SelectItem>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="amount_high">Amount: high → low</SelectItem>
                    <SelectItem value="amount_low">Amount: low → high</SelectItem>
                  </SelectContent>
                </Select>
                {pendingCashSearch && (
                  <Button variant="ghost" size="sm" onClick={() => setPendingCashSearch("")} data-testid="button-clear-pending-cash-search">
                    <X className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>
          {pendingCashLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div>
          ) : sorted.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No pending cash payments.</p>
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full" data-testid="table-pending-cash">
                <thead><tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Package / Cohort</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Amount</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Waited</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Last reminded</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {sorted.map(p => {
                    const cust = p.enrollment || p.cartCustomer || null;
                    const first = cust?.firstName || "—";
                    const last = cust?.lastName || "";
                    const email = cust?.email || "—";
                    const firstItem = p.cartItems?.[0] || null;
                    const offering = p.enrollment?.offeringId
                      ? offerings.find(o => o.id === p.enrollment!.offeringId)
                      : (firstItem?.offering || null);
                    const pkgName = p.enrollment
                      ? getPackageName(p.enrollment.packageId)
                      : (firstItem?.package?.name
                          ? (p.cartItems.length > 1 ? `${firstItem.package.name} +${p.cartItems.length - 1} more` : firstItem.package.name)
                          : "(cart payment)");
                    return (
                      <tr key={p.id} className="border-b last:border-b-0" data-testid={`row-pending-cash-${p.id}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9"><AvatarFallback>{getInitials(first, last)}</AvatarFallback></Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium" data-testid={`text-pc-name-${p.id}`}>{first} {last}</p>
                              <p className="text-xs text-muted-foreground truncate" data-testid={`text-pc-email-${p.id}`}>{email}</p>
                              {p.unsubscribed && (() => {
                                const reason = p.suppressionReason || "";
                                const label = reason === "bounce" ? "Bounced" : reason === "complaint" ? "Complained" : "Unsubscribed";
                                const tid = reason === "bounce" ? `badge-bounced-pc-${p.id}` : reason === "complaint" ? `badge-complained-pc-${p.id}` : `badge-unsubscribed-pc-${p.id}`;
                                return (
                                  <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 h-4" data-testid={tid}>
                                    {label}
                                  </Badge>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-sm" data-testid={`text-pc-pkg-${p.id}`}>{pkgName}</p>
                          {offering && (
                            <Link href={(offering as any).packageId ? `/admin/packages/${(offering as any).packageId}/cohorts/${offering.id}` : `/admin/packages`} className="text-xs text-primary hover:underline" data-testid={`link-pc-offering-${p.id}`}>
                              {offering.name}
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-sm" data-testid={`text-pc-amount-${p.id}`}>
                          ${(p.amountCents / 100).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground" data-testid={`text-pc-waited-${p.id}`}>
                          {(() => {
                            const ms = Date.now() - new Date(p.createdAt).getTime();
                            const mins = Math.max(0, Math.floor(ms / 60000));
                            if (mins < 60) return `waited ${mins}m`;
                            const hrs = Math.floor(mins / 60);
                            const remMin = mins % 60;
                            if (hrs < 24) return `waited ${hrs}h ${remMin}m`;
                            const days = Math.floor(hrs / 24);
                            return `waited ${days}d ${hrs % 24}h`;
                          })()}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground" data-testid={`text-pc-reminded-${p.id}`}>
                          {p.lastReminderAt ? (
                            <div className="space-y-1">
                              <div>{formatDate(p.lastReminderAt)}{p.remindersSent ? ` (${p.remindersSent})` : ""}</div>
                              <ReminderTrackingBadges
                                hasOpened={!!p.reminderHasOpened}
                                hasClicked={!!p.reminderHasClicked}
                                recoveredAt={p.reminderRecoveredAt ?? null}
                                opens={p.reminderOpens ?? 0}
                                clicks={p.reminderClicks ?? 0}
                                testIdPrefix={`badge-pc-${p.id}`}
                              />
                            </div>
                          ) : "Never"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {p.enrollment ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDetailsEnrollment(p.enrollment!)}
                                data-testid={`button-view-details-pc-${p.id}`}
                                title="View purchase details"
                              >
                                <Eye className="h-4 w-4 mr-1" /> Details
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const snap: CartCustomerSnapshotFields = p.cartCustomer || {};
                                  setCartDetails({
                                    cartId: p.cartId || `pc-${p.id}`,
                                    source: "pending_cash",
                                    customer: {
                                      firstName: snap.firstName ?? null,
                                      lastName: snap.lastName ?? null,
                                      email: snap.email ?? null,
                                      phone: snap.phone ?? null,
                                      dateOfBirth: snap.dateOfBirth ?? null,
                                      parentName: snap.parentName ?? null,
                                      parentEmail: snap.parentEmail ?? null,
                                      parentPhone: snap.parentPhone ?? null,
                                      notes: snap.notes ?? null,
                                    },
                                    items: (p.cartItems || []).map((it) => ({
                                      packageName: it.package?.name ?? null,
                                      offeringName: it.offering?.name ?? null,
                                      quantity: it.quantity,
                                    })),
                                    totalCents: p.amountCents,
                                    lastActivityAt: p.createdAt,
                                    remindersSent: p.remindersSent ?? 0,
                                    lastReminderAt: p.lastReminderAt ?? null,
                                    reminderOpens: p.reminderOpens ?? 0,
                                    reminderClicks: p.reminderClicks ?? 0,
                                    reminderRecoveredAt: p.reminderRecoveredAt ?? null,
                                  });
                                }}
                                data-testid={`button-cart-details-${p.cartId || `pc-${p.id}`}`}
                                title="View customer details"
                              >
                                <Eye className="h-4 w-4 mr-1" /> Details
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => confirmCashMutation.mutate(p.id)}
                              disabled={confirmCashMutation.isPending}
                              data-testid={`button-confirm-cash-${p.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" /> Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sendReminderNow.mutate({ kind: "pending_cash", paymentId: p.id })}
                              disabled={sendReminderNow.isPending || !(p.enrollment?.email || p.cartCustomer?.email) || !!p.unsubscribed}
                              title={p.unsubscribed ? (p.suppressionReason === "bounce" ? "Address bounced" : p.suppressionReason === "complaint" ? "Recipient marked as spam" : "Recipient has unsubscribed") : ((p.enrollment?.email || p.cartCustomer?.email) ? "Send reminder email now" : "No email on file")}
                              data-testid={`button-remind-pc-${p.id}`}
                            >
                              <Mail className="h-4 w-4 mr-1" /> Remind
                            </Button>
                            {p.cartId && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => resendEnrollmentEmailMutation.mutate(p.id)}
                                disabled={resendEnrollmentEmailMutation.isPending || !p.cartCustomer?.email || !!p.unsubscribed}
                                title={p.unsubscribed ? "Recipient has unsubscribed" : (p.cartCustomer?.email ? "Resend enrollment confirmation email" : "No email on file")}
                                data-testid={`button-resend-enrollment-${p.id}`}
                              >
                                <RefreshCcw className="h-4 w-4 mr-1" /> Resend
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelCashMutation.mutate(p.id)}
                              disabled={cancelCashMutation.isPending}
                              data-testid={`button-cancel-cash-${p.id}`}
                            >
                              <X className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div></CardContent></Card>
          )}
            </>);
          })()}
        </TabsContent>

        <TabsContent value="abandoned" className="mt-4" data-testid="panel-abandoned">
          <p className="text-sm text-muted-foreground mb-4">
            Expired pending-payment enrollments and abandoned carts. Useful for follow-up, but these never held seats.
          </p>
          {(() => {
            const q = abandonedSearch.trim().toLowerCase();
            const matchExp = (e: Enrollment) => {
              if (!q) return true;
              return `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.email.toLowerCase().includes(q);
            };
            const matchCart = (c: any) => {
              if (!q) return true;
              const cust = c.customerSnapshotJson || {};
              return `${cust.firstName || ""} ${cust.lastName || ""}`.toLowerCase().includes(q) || (cust.email || "").toLowerCase().includes(q);
            };
            const cmpDate = (a: string, b: string) => abandonedSort === "newest"
              ? new Date(b).getTime() - new Date(a).getTime()
              : new Date(a).getTime() - new Date(b).getTime();
            const filteredExpired = expiredEnrollments.filter(matchExp).sort((a, b) => cmpDate(a.createdAt, b.createdAt));
            const filteredCarts = abandonedCarts.filter(matchCart).sort((a, b) => cmpDate(a.updatedAt, b.updatedAt));
            return (<>
              <CartReminderSettingsCard
                settings={reminderSettings}
                onToggle={(enabled) => updateReminderSettings.mutate({ enabled })}
                onChangeHours={(hoursStage1, hoursStage2) => updateReminderSettings.mutate({ hoursStage1, hoursStage2 })}
                onRunNow={() => runRemindersNow.mutate()}
                isRunning={runRemindersNow.isPending}
                isSaving={updateReminderSettings.isPending}
              />
              <CartReminderSummaryCard summary={reminderSummary} />
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={abandonedSearch}
                    onChange={(e) => setAbandonedSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-abandoned"
                  />
                </div>
                <Select value={abandonedSort} onValueChange={(v) => setAbandonedSort(v as any)}>
                  <SelectTrigger className="w-[180px]" data-testid="select-sort-abandoned">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                {abandonedSearch && (
                  <Button variant="ghost" size="sm" onClick={() => setAbandonedSearch("")} data-testid="button-clear-abandoned-search">
                    <X className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>
          {(filteredExpired.length === 0 && filteredCarts.length === 0 && !abandonedLoading) ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{q ? "No matches for your search." : "Nothing expired or abandoned."}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-6">
              {filteredExpired.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> Expired enrollments ({filteredExpired.length})
                  </h2>
                  <Card><CardContent className="p-0"><div className="overflow-x-auto">
                    <table className="w-full" data-testid="table-expired">
                      <thead><tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Student</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Package</th>
                        <th className="px-4 py-3 font-medium hidden lg:table-cell">Created</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredExpired.map(e => (
                          <tr key={e.id} className="border-b last:border-b-0" data-testid={`row-expired-${e.id}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9"><AvatarFallback>{getInitials(e.firstName, e.lastName)}</AvatarFallback></Avatar>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">{e.firstName} {e.lastName}</p>
                                  <p className="text-xs text-muted-foreground truncate">{e.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell text-sm">{getPackageName(e.packageId)}</td>
                            <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{formatDate(e.createdAt)}</td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setDetailsEnrollment(e)}
                                data-testid={`button-view-details-expired-${e.id}`}
                                title="View purchase details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div></CardContent></Card>
                </div>
              )}
              {abandonedLoading ? (
                <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16" />)}</div>
              ) : filteredCarts.length > 0 ? (
                <div>
                  <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" /> Abandoned carts ({filteredCarts.length})
                  </h2>
                  <Card><CardContent className="p-0"><div className="overflow-x-auto">
                    <table className="w-full" data-testid="table-abandoned-carts">
                      <thead><tr className="border-b text-left text-sm text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Visitor</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Items</th>
                        <th className="px-4 py-3 font-medium hidden lg:table-cell">Last activity</th>
                        <th className="px-4 py-3 font-medium hidden lg:table-cell">Last reminded</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr></thead>
                      <tbody>
                        {filteredCarts.map(c => {
                          const cust = c.customerSnapshotJson || {};
                          const first = cust.firstName || "—";
                          const last = cust.lastName || "";
                          const email = cust.email || "(no email)";
                          return (
                            <tr key={c.id} className="border-b last:border-b-0" data-testid={`row-abandoned-cart-${c.id}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-9 w-9"><AvatarFallback>{getInitials(first, last)}</AvatarFallback></Avatar>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{first} {last}</p>
                                    <p className="text-xs text-muted-foreground truncate">{email}</p>
                                    {c.unsubscribed && (() => {
                                      const reason = c.suppressionReason || "";
                                      const label = reason === "bounce" ? "Bounced" : reason === "complaint" ? "Complained" : "Unsubscribed";
                                      const tid = reason === "bounce" ? `badge-bounced-cart-${c.id}` : reason === "complaint" ? `badge-complained-cart-${c.id}` : `badge-unsubscribed-cart-${c.id}`;
                                      return (
                                        <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 h-4" data-testid={tid}>
                                          {label}
                                        </Badge>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                {c.items.length === 0 ? (
                                  <span className="text-xs text-muted-foreground italic">empty</span>
                                ) : (
                                  <ul className="space-y-0.5 text-xs">
                                    {c.items.map(it => (
                                      <li key={it.id}>
                                        <span className="font-medium">{it.package?.name || `Package #${it.packageId}`}</span>
                                        {it.offering && <span className="text-muted-foreground"> · {it.offering.name}</span>}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">{formatDate(c.updatedAt)}</td>
                              <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground" data-testid={`text-cart-reminded-${c.id}`}>
                                {c.lastReminderAt ? (
                                  <div className="space-y-1">
                                    <div>{formatDate(c.lastReminderAt)}{c.remindersSent ? ` (${c.remindersSent})` : ""}</div>
                                    <ReminderTrackingBadges
                                      hasOpened={!!c.reminderHasOpened}
                                      hasClicked={!!c.reminderHasClicked}
                                      recoveredAt={c.reminderRecoveredAt ?? null}
                                      opens={c.reminderOpens ?? 0}
                                      clicks={c.reminderClicks ?? 0}
                                      testIdPrefix={`badge-cart-${c.id}`}
                                    />
                                  </div>
                                ) : "Never"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      const snap: CartCustomerSnapshotFields = c.customerSnapshotJson || {};
                                      const totalCents = c.items.reduce((sum, it) => sum + (it.priceCents || 0), 0);
                                      setCartDetails({
                                        cartId: c.id,
                                        source: "abandoned_cart",
                                        customer: {
                                          firstName: snap.firstName ?? null,
                                          lastName: snap.lastName ?? null,
                                          email: snap.email ?? null,
                                          phone: snap.phone ?? null,
                                          dateOfBirth: snap.dateOfBirth ?? null,
                                          parentName: snap.parentName ?? null,
                                          parentEmail: snap.parentEmail ?? null,
                                          parentPhone: snap.parentPhone ?? null,
                                          notes: snap.notes ?? null,
                                        },
                                        items: c.items.map((it) => ({
                                          packageName: it.package?.name ?? null,
                                          offeringName: it.offering?.name ?? null,
                                          priceCents: it.priceCents,
                                        })),
                                        totalCents,
                                        lastActivityAt: c.updatedAt,
                                        remindersSent: c.remindersSent ?? 0,
                                        lastReminderAt: c.lastReminderAt ?? null,
                                        reminderOpens: c.reminderOpens ?? 0,
                                        reminderClicks: c.reminderClicks ?? 0,
                                        reminderRecoveredAt: c.reminderRecoveredAt ?? null,
                                      });
                                    }}
                                    title="View customer details"
                                    data-testid={`button-cart-details-${c.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" /> Details
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => sendReminderNow.mutate({ kind: "abandoned_cart", cartId: c.id })}
                                    disabled={sendReminderNow.isPending || !email || email === "(no email)" || !!c.unsubscribed}
                                    title={c.unsubscribed ? (c.suppressionReason === "bounce" ? "Address bounced" : c.suppressionReason === "complaint" ? "Recipient marked as spam" : "Recipient has unsubscribed") : (email && email !== "(no email)" ? "Send reminder email now" : "No email on file")}
                                    data-testid={`button-remind-cart-${c.id}`}
                                  >
                                    <Mail className="h-4 w-4 mr-1" /> Remind
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div></CardContent></Card>
                </div>
              ) : null}
            </div>
          )}
            </>);
          })()}
        </TabsContent>

        <TabsContent value="confirmed" className="mt-4" data-testid="panel-confirmed">

      <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="filter-status-chips">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter("all")}
          data-testid="chip-status-all"
        >
          All ({enrollments.length})
        </Button>
        {[
          { key: "pending", label: "Pending" },
          { key: "pending_payment", label: "Awaiting Payment" },
          { key: "confirmed", label: "Confirmed" },
          { key: "in_progress", label: "In Progress" },
          { key: "completed", label: "Completed" },
          { key: "cancelled", label: "Cancelled" },
        ].filter(s => (statusCounts[s.key] || 0) > 0).map(s => (
          <Button
            key={s.key}
            variant={statusFilter === s.key ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s.key)}
            data-testid={`chip-status-${s.key}`}
          >
            {s.label} ({statusCounts[s.key] || 0})
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap" data-testid="filter-credit-chips">
        <span className="text-sm text-muted-foreground mr-1">Credits:</span>
        <Button
          variant={creditFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setCreditFilter("all")}
          data-testid="chip-credit-all"
        >
          All ({enrollments.length})
        </Button>
        {[
          { key: "unused", label: "Unused" },
          { key: "partially_used", label: "Partially Used" },
          { key: "used_all", label: "Fully Used" },
          { key: "none", label: "No Credits" },
        ].filter(c => (creditStatusCounts[c.key] || 0) > 0).map(c => (
          <Button
            key={c.key}
            variant={creditFilter === c.key ? "default" : "outline"}
            size="sm"
            onClick={() => setCreditFilter(c.key)}
            data-testid={`chip-credit-${c.key}`}
          >
            {c.label} ({creditStatusCounts[c.key]})
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-enrollments"
          />
        </div>
        <Select value={packageFilter} onValueChange={setPackageFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-package">
            <SelectValue placeholder="All Packages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Packages</SelectItem>
            {packages.map((pkg) => (
              <SelectItem key={pkg.id} value={String(pkg.id)}>
                {pkg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-location">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={String(loc.id)}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-date">
            <SelectValue placeholder="All Dates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            {(dateBucketCounts["last_7"] || 0) > 0 && (
              <SelectItem value="last_7">Last 7 days ({dateBucketCounts["last_7"]})</SelectItem>
            )}
            {(dateBucketCounts["last_30"] || 0) > 0 && (
              <SelectItem value="last_30">Last 30 days ({dateBucketCounts["last_30"]})</SelectItem>
            )}
            {(dateBucketCounts["last_90"] || 0) > 0 && (
              <SelectItem value="last_90">Last 90 days ({dateBucketCounts["last_90"]})</SelectItem>
            )}
            {(dateBucketCounts["older"] || 0) > 0 && (
              <SelectItem value="older">Older ({dateBucketCounts["older"]})</SelectItem>
            )}
          </SelectContent>
        </Select>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
            <X className="h-4 w-4 mr-1" />
            Clear filters ({activeFilterCount})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : sortedFilteredEnrollments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-base font-medium mb-1">
              {enrollments.length === 0 ? "No enrollments yet" : "No enrollments match your filters"}
            </p>
            <p className="text-sm">
              {enrollments.length === 0
                ? "Students will appear here after they enroll in a package."
                : "Try adjusting your search or filter criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-enrollments">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="px-4 py-3 font-medium">
                      <button onClick={() => toggleConfirmedSort("name")} className="inline-flex items-center gap-1 hover:text-foreground" data-testid="sort-name">
                        Student {confirmedSort.key === "name" && (confirmedSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">
                      <button onClick={() => toggleConfirmedSort("package")} className="inline-flex items-center gap-1 hover:text-foreground" data-testid="sort-package">
                        Package {confirmedSort.key === "package" && (confirmedSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Location</th>
                    <th className="px-4 py-3 font-medium">
                      <button onClick={() => toggleConfirmedSort("status")} className="inline-flex items-center gap-1 hover:text-foreground" data-testid="sort-status">
                        Status {confirmedSort.key === "status" && (confirmedSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Credits</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">
                      <button onClick={() => toggleConfirmedSort("date")} className="inline-flex items-center gap-1 hover:text-foreground" data-testid="sort-date">
                        Date Enrolled {confirmedSort.key === "date" && (confirmedSort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredEnrollments.map((enrollment) => {
                    const price = getPackagePrice(enrollment.packageId);
                    return (
                      <tr
                        key={enrollment.id}
                        className="border-b last:border-b-0"
                        data-testid={`row-enrollment-${enrollment.id}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback>
                                {getInitials(enrollment.firstName, enrollment.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              {enrollment.userId ? (
                                <Link
                                  href={`/admin/students/${enrollment.userId}`}
                                  className="text-sm font-medium hover:underline text-foreground"
                                  data-testid={`link-student-detail-${enrollment.id}`}
                                >
                                  {enrollment.firstName} {enrollment.lastName}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium" data-testid={`text-student-name-${enrollment.id}`}>
                                  {enrollment.firstName} {enrollment.lastName}
                                </span>
                              )}
                              <p className="text-xs text-muted-foreground truncate" data-testid={`text-student-email-${enrollment.id}`}>
                                {enrollment.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-package-name-${enrollment.id}`}>
                              {getPackageName(enrollment.packageId)}
                            </p>
                            {price !== null && (
                              <p className="text-xs text-muted-foreground" data-testid={`text-package-price-${enrollment.id}`}>
                                ${(price / 100).toFixed(2)}
                              </p>
                            )}
                            {enrollment.offeringId && (
                              <p className="text-xs text-muted-foreground truncate" data-testid={`text-offering-name-${enrollment.id}`}>
                                Cohort:{" "}
                                <span data-testid={`link-offering-${enrollment.id}`}>
                                  {offerings.find(o => o.id === enrollment.offeringId)?.name || `#${enrollment.offeringId}`}
                                </span>
                              </p>
                            )}
                            {(() => {
                              const enrBookings = bookingsByEnrollment.get(enrollment.id) || [];
                              if (enrBookings.length === 0) return null;
                              return (
                                <p
                                  className="text-xs text-muted-foreground truncate"
                                  data-testid={`text-booked-sessions-${enrollment.id}`}
                                  title={enrBookings.map((b: any) => `${b.creditType} #${b.sessionId} (${b.status})`).join(", ")}
                                >
                                  {enrBookings.length} session{enrBookings.length === 1 ? "" : "s"} booked
                                </p>
                              );
                            })()}
                            {enrollment.isWaitlisted && (
                              <div className="mt-1 flex items-center gap-2">
                                <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400" data-testid={`badge-waitlisted-${enrollment.id}`}>
                                  Waitlisted
                                </Badge>
                                {enrollment.offeringId && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    disabled={promoteWaitlistMutation.isPending}
                                    onClick={() => promoteWaitlistMutation.mutate({ enrollmentId: enrollment.id })}
                                    data-testid={`button-promote-waitlist-${enrollment.id}`}
                                  >
                                    Promote
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-muted-foreground" data-testid={`text-location-name-${enrollment.id}`}>
                            {getLocationName(enrollment.locationId)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={getStatusBadgeVariant(enrollment.status)}
                            className={getStatusBadgeClassName(enrollment.status)}
                            data-testid={`badge-enrollment-status-${enrollment.id}`}
                          >
                            {statusLabels[enrollment.status] || enrollment.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {(() => {
                            const pkg = packages.find((p) => p.id === enrollment.packageId);
                            const totalClassroom = pkg?.creditClassroom ?? 0;
                            const totalDrive = pkg?.creditDrive ?? 0;
                            const remainClassroom = enrollment.creditClassroom ?? 0;
                            const remainDrive = enrollment.creditDrive ?? 0;
                            const usedClassroom = Math.max(0, totalClassroom - Math.min(remainClassroom, totalClassroom));
                            const usedDrive = Math.max(0, totalDrive - Math.min(remainDrive, totalDrive));
                            const hasAnyCredits = remainClassroom > 0 || remainDrive > 0 || totalClassroom > 0 || totalDrive > 0;
                            const classroomPct = totalClassroom > 0 ? (usedClassroom / totalClassroom) * 100 : 0;
                            const drivePct = totalDrive > 0 ? (usedDrive / totalDrive) * 100 : 0;
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 -ml-2"
                                onClick={() => setCreditLedgerEnrollment(enrollment)}
                                data-testid={`button-view-credits-${enrollment.id}`}
                              >
                                <div className="flex flex-col gap-1.5 min-w-[120px]">
                                  {(totalClassroom > 0 || remainClassroom > 0) && (
                                    <div data-testid={`text-credit-classroom-${enrollment.id}`}>
                                      <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <div className="flex items-center gap-1">
                                          <BookOpen className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-xs text-muted-foreground">Classroom</span>
                                        </div>
                                        <span className="text-xs font-medium">
                                          {totalClassroom > 0 ? `${usedClassroom}/${totalClassroom}` : `${remainClassroom} left`}
                                        </span>
                                      </div>
                                      {totalClassroom > 0 && (
                                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                          <div
                                            className="h-full rounded-full bg-primary transition-all"
                                            style={{ width: `${classroomPct}%` }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {(totalDrive > 0 || remainDrive > 0) && (
                                    <div data-testid={`text-credit-drive-${enrollment.id}`}>
                                      <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <div className="flex items-center gap-1">
                                          <Car className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-xs text-muted-foreground">Drive</span>
                                        </div>
                                        <span className="text-xs font-medium">
                                          {totalDrive > 0 ? `${usedDrive}/${totalDrive}` : `${remainDrive} left`}
                                        </span>
                                      </div>
                                      {totalDrive > 0 && (
                                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                          <div
                                            className="h-full rounded-full bg-primary transition-all"
                                            style={{ width: `${drivePct}%` }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {!hasAnyCredits && (
                                    <span className="text-sm text-muted-foreground">--</span>
                                  )}
                                </div>
                              </Button>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-sm text-muted-foreground" data-testid={`text-date-enrolled-${enrollment.id}`}>
                            {formatDate(enrollment.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {["pending", "pending_payment"].includes(enrollment.status) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => confirmMutation.mutate(enrollment.id)}
                                disabled={confirmMutation.isPending}
                                data-testid={`button-confirm-enrollment-${enrollment.id}`}
                                title="Confirm enrollment"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {["pending_payment", "confirmed", "active", "in_progress", "completed"].includes(enrollment.status) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setSigViewEnrollment(enrollment)}
                                data-testid={`button-view-signatures-${enrollment.id}`}
                                title="View payment signatures"
                              >
                                <PenLine className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDetailsEnrollment(enrollment)}
                              data-testid={`button-view-details-${enrollment.id}`}
                              title="View purchase details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditDialog(enrollment)}
                              data-testid={`button-edit-enrollment-${enrollment.id}`}
                              title="Edit enrollment"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

        </TabsContent>
      </Tabs>

      <Dialog open={!!editingEnrollment} onOpenChange={(open) => { if (!open) setEditingEnrollment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-edit-dialog-title">
              Edit Enrollment
            </DialogTitle>
            <DialogDescription>
              {editingEnrollment
                ? `Update status and notes for ${editingEnrollment.firstName} ${editingEnrollment.lastName}`
                : "Update enrollment details"}
            </DialogDescription>
            {editingEnrollment && (
              <Button
                variant="ghost"
                size="sm"
                className="px-0 h-auto justify-start w-fit text-primary hover:underline"
                onClick={() => {
                  const enr = editingEnrollment;
                  setEditingEnrollment(null);
                  setDetailsEnrollment(enr);
                }}
                data-testid="link-view-purchase-details"
              >
                <Eye className="h-4 w-4 mr-1" /> View purchase details
              </Button>
            )}
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => {
                if (editingEnrollment) {
                  updateMutation.mutate({ id: editingEnrollment.id, data });
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="pending_payment">Awaiting Payment</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Add notes about this enrollment..."
                        className="resize-none"
                        rows={3}
                        data-testid="textarea-edit-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-enrollment">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!creditLedgerEnrollment} onOpenChange={(open) => { if (!open) setCreditLedgerEnrollment(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-credit-ledger-title">Credit History</DialogTitle>
            <DialogDescription>
              {creditLedgerEnrollment
                ? `${creditLedgerEnrollment.firstName} ${creditLedgerEnrollment.lastName}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {creditLedgerEnrollment && (() => {
            const pkg = packages.find((p) => p.id === creditLedgerEnrollment.packageId);
            const totalClassroom = pkg?.creditClassroom ?? 0;
            const totalDrive = pkg?.creditDrive ?? 0;
            const remainClassroom = creditLedgerEnrollment.creditClassroom ?? 0;
            const remainDrive = creditLedgerEnrollment.creditDrive ?? 0;
            const usedClassroom = Math.max(0, totalClassroom - remainClassroom);
            const usedDrive = Math.max(0, totalDrive - remainDrive);
            return (
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Card className="flex-1 min-w-[140px]">
                  <CardContent className="p-4 flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Classroom</p>
                      <p className="text-xl font-bold" data-testid="text-credit-summary-classroom">
                        {remainClassroom}
                        {totalClassroom > 0 && (
                          <span className="text-sm font-normal text-muted-foreground"> / {totalClassroom}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {totalClassroom > 0 ? `${usedClassroom} used` : "remaining"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="flex-1 min-w-[140px]">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Car className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Drive</p>
                      <p className="text-xl font-bold" data-testid="text-credit-summary-drive">
                        {remainDrive}
                        {totalDrive > 0 && (
                          <span className="text-sm font-normal text-muted-foreground"> / {totalDrive}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {totalDrive > 0 ? `${usedDrive} used` : "remaining"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Transaction History</h3>
                {creditsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : creditLedgerEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No credit transactions yet.</p>
                ) : (
                  <div className="space-y-2">
                    {creditLedgerEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-3 border rounded-md p-3"
                        data-testid={`credit-entry-${entry.id}`}
                      >
                        <div className="flex items-start gap-2">
                          {entry.delta > 0 ? (
                            <ArrowUp className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                          ) : (
                            <ArrowDown className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">
                                {entry.delta > 0 ? "+" : ""}{entry.delta} {entry.type}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {formatReasonLabel(entry.reason)}
                              </Badge>
                            </div>
                            {entry.note && (
                              <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                          {entry.createdAt ? formatDate(entry.createdAt as unknown as string) : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ); })()}
        </DialogContent>
      </Dialog>

      <CartCustomerDetailsDialog
        details={cartDetails}
        onClose={() => setCartDetails(null)}
      />

      <PurchaseDetailsDialog
        tenantId={tenantId}
        enrollment={detailsEnrollment}
        onClose={() => setDetailsEnrollment(null)}
      />

      <Dialog open={!!sigViewEnrollment} onOpenChange={(open) => { if (!open) setSigViewEnrollment(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-signatures-dialog-title">Payment Signatures</DialogTitle>
            <DialogDescription>
              {sigViewEnrollment
                ? `${sigViewEnrollment.firstName} ${sigViewEnrollment.lastName}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            if (sigLoading) {
              return (
                <div className="space-y-2 py-4">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
                </div>
              );
            }
            const cashPayments = sigPayments.filter((p: any) => p.provider === "CASH");
            if (cashPayments.length === 0) {
              return (
                <p className="text-sm text-muted-foreground py-4 text-center" data-testid="text-no-signatures">
                  No cash payment signatures found for this enrollment.
                </p>
              );
            }
            return cashPayments.map((payment: any) => (
              <div key={payment.id} className="space-y-4 border rounded-md p-4" data-testid={`sig-payment-${payment.id}`}>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{payment.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {payment.createdAt ? formatDate(payment.createdAt) : ""}
                  </span>
                </div>
                {payment.studentSignature ? (
                  <div>
                    <p className="text-sm font-medium mb-1">Student Signature</p>
                    <div className="border rounded-md p-2 bg-white">
                      <img
                        src={payment.studentSignature}
                        alt="Student signature"
                        className="max-h-24 mx-auto"
                        data-testid="img-student-signature"
                      />
                    </div>
                  </div>
                ) : null}
                {payment.receiverSignature ? (
                  <div>
                    <p className="text-sm font-medium mb-1">
                      Receiver Signature
                      {payment.receiverName && (
                        <span className="font-normal text-muted-foreground"> — {payment.receiverName}</span>
                      )}
                    </p>
                    <div className="border rounded-md p-2 bg-white">
                      <img
                        src={payment.receiverSignature}
                        alt="Receiver signature"
                        className="max-h-24 mx-auto"
                        data-testid="img-receiver-signature"
                      />
                    </div>
                  </div>
                ) : null}
                {!payment.studentSignature && !payment.receiverSignature && (
                  <p className="text-sm text-muted-foreground text-center">No signatures captured for this payment.</p>
                )}
              </div>
            ));
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type PackageSnapshot = {
  name?: string | null;
  price?: number | null;
  priceCents?: number | null;
  creditClassroom?: number | null;
  creditDrive?: number | null;
  minAge?: number | null;
  description?: string | null;
  providerName?: string | null;
  providerUrl?: string | null;
  [key: string]: unknown;
};

type CartCustomerSnapshot = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

type PurchaseDetails = {
  enrollment: Enrollment & {
    onlineCourseId: number | null;
    priceSnapshotCents: number | null;
    currencySnapshot: string | null;
    packageSnapshotJson: PackageSnapshot | null;
    activatedAt: string | null;
    confirmationEmailSentAt: string | null;
    paymentReceivedEmailSentAt: string | null;
  };
  package: { id: number; name: string; price: number; creditClassroom: number | null; creditDrive: number | null } | null;
  location: { id: number; name: string } | null;
  onlineCourse: { id: number; name: string; providerName: string | null; providerUrl: string | null } | null;
  cartCustomerSnapshot: CartCustomerSnapshot | null;
  cartId: string | null;
  payments: Array<{
    id: number;
    provider: string;
    status: string;
    amountCents: number;
    currency: string | null;
    providerPaymentId: string | null;
    createdAt: string;
    completedAt: string | null;
    receiverName: string | null;
  }>;
};

function formatCents(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function formatDateWithTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${formatDate(iso)}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return String(iso);
  }
}

function dash(v: string | null | undefined): string {
  return v != null && String(v).trim() !== "" ? String(v) : "—";
}

function computeAgeYears(dob: string | null | undefined, asOf: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const ref = asOf ? new Date(asOf) : new Date();
  if (isNaN(d.getTime()) || isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

function CopyButton({ value, testId }: { value: string; testId?: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        try {
          navigator.clipboard.writeText(value);
          toast({ title: "Copied", description: value });
        } catch {
          toast({ title: "Copy failed", variant: "destructive" });
        }
      }}
      className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      data-testid={testId}
      aria-label={`Copy ${value}`}
    >
      Copy
    </button>
  );
}

function ContactValue({ kind, value, testId }: { kind: "email" | "phone"; value: string | null | undefined; testId?: string }) {
  if (!value || !String(value).trim()) return <span data-testid={testId}>—</span>;
  const v = String(value).trim();
  const href = kind === "email" ? `mailto:${v}` : `tel:${v.replace(/[^+\d]/g, "")}`;
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <a href={href} className="text-primary hover:underline break-all" data-testid={testId}>{v}</a>
      <CopyButton value={v} testId={testId ? `${testId}-copy` : undefined} />
    </span>
  );
}

type IconComponent = React.ComponentType<{ className?: string }>;

function DetailRow({ icon: Icon, label, value, testId }: { icon?: IconComponent; label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm break-words" data-testid={testId}>{value}</div>
      </div>
    </div>
  );
}

const KNOWN_SNAPSHOT_KEYS = new Set([
  "id", "name", "price", "priceCents", "creditClassroom", "creditDrive",
  "minAge", "description", "providerName", "providerUrl",
  "imageUrl", "tenantId", "active", "sortOrder", "createdAt", "updatedAt",
]);

function humanizeKey(k: string): string {
  return k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function renderSnapshotExtra(snap: PackageSnapshot): React.ReactNode[] {
  return Object.entries(snap)
    .filter(([k, v]) => !KNOWN_SNAPSHOT_KEYS.has(k) && v != null && typeof v !== "object")
    .map(([k, v]) => (
      <DetailRow key={k} label={humanizeKey(k)} value={String(v)} testId={`text-pd-pkg-extra-${k}`} />
    ));
}

function PurchaseDetailsDialog({
  tenantId,
  enrollment,
  onClose,
}: {
  tenantId: number | undefined;
  enrollment: Enrollment | null;
  onClose: () => void;
}) {
  const open = !!enrollment;
  const { toast } = useToast();
  const { data, isLoading } = useQuery<PurchaseDetails>({
    queryKey: ["/api/tenants", tenantId, "enrollments", enrollment?.id, "details"],
    enabled: open && !!tenantId && !!enrollment?.id,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl" data-testid="dialog-purchase-details">
        <DialogHeader>
          <DialogTitle data-testid="text-purchase-details-title">Purchase Details</DialogTitle>
          <DialogDescription>
            {enrollment ? `Submitted by ${enrollment.firstName} ${enrollment.lastName}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3 py-2" data-testid="skeleton-purchase-details">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : (() => {
          const e = data.enrollment;
          const snap: PackageSnapshot = data.enrollment.packageSnapshotJson || {};
          const cartSnap: CartCustomerSnapshot = data.cartCustomerSnapshot || {};
          // Buyer fields fall back to the cart customer snapshot when the
          // enrollment row is missing them (cart checkouts can persist data
          // on the cart that didn't make it onto the enrollment).
          const phone = e.phone || cartSnap.phone || null;
          const dob = e.dateOfBirth || cartSnap.dateOfBirth || null;
          const parentName = e.parentName || cartSnap.parentName || null;
          const parentEmail = e.parentEmail || cartSnap.parentEmail || null;
          const parentPhone = e.parentPhone || cartSnap.parentPhone || null;
          // Buyer-submitted notes live on the cart's customer snapshot.
          // enrollment.notes is admin-editable (see edit dialog), so we
          // surface it separately as "Internal admin notes" to avoid
          // mislabeling staff comments as the student's own message.
          const studentNotes = cartSnap.notes || null;
          const adminNotes = e.notes || null;
          const hasAnyNotes = !!(studentNotes || adminNotes);
          const hasParent = !!(parentName || parentEmail || parentPhone);
          const ageAtPurchase = computeAgeYears(dob, e.createdAt);
          const isMinor = ageAtPurchase != null && ageAtPurchase < 18;

          // Most-recent completed payment (or fallback to most recent attempt)
          // plus a count of any prior attempts so admins can see retries.
          const sortedPayments = [...data.payments].sort(
            (a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime(),
          );
          const completed = sortedPayments.find((p) => p.status === "COMPLETED");
          const featured = completed || sortedPayments[0] || null;
          const priorAttempts = featured ? sortedPayments.length - 1 : 0;

          const providerUrl = data.onlineCourse?.providerUrl || snap.providerUrl || null;
          const extraSnapRows = renderSnapshotExtra(snap);

          return (
            <div className="space-y-5">
              <section data-testid="section-student">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <UserIcon className="h-4 w-4" /> Student
                  {isMinor && (
                    <Badge variant="outline" className="ml-1 text-[10px]" data-testid="badge-pd-minor">
                      Minor at purchase
                    </Badge>
                  )}
                </h3>
                <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <DetailRow icon={UserIcon} label="First name" value={dash(e.firstName)} testId="text-pd-first-name" />
                  <DetailRow icon={UserIcon} label="Last name" value={dash(e.lastName)} testId="text-pd-last-name" />
                  <DetailRow icon={Mail} label="Email" value={<ContactValue kind="email" value={e.email} testId="text-pd-email" />} />
                  <DetailRow icon={Phone} label="Phone" value={<ContactValue kind="phone" value={phone} testId="text-pd-phone" />} />
                  <DetailRow
                    icon={Calendar}
                    label="Date of birth"
                    value={
                      <span data-testid="text-pd-dob">
                        {dob ? formatDate(dob) : "—"}
                        {ageAtPurchase != null && (
                          <span className="text-muted-foreground"> · age {ageAtPurchase} at purchase</span>
                        )}
                      </span>
                    }
                  />
                </div>
              </section>

              <section data-testid="section-parent">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" /> Parent / Guardian
                </h3>
                <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  {hasParent ? (
                    <>
                      <DetailRow icon={UserIcon} label="Name" value={dash(parentName)} testId="text-pd-parent-name" />
                      <DetailRow icon={Mail} label="Email" value={<ContactValue kind="email" value={parentEmail} testId="text-pd-parent-email" />} />
                      <DetailRow icon={Phone} label="Phone" value={<ContactValue kind="phone" value={parentPhone} testId="text-pd-parent-phone" />} />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground py-1.5 col-span-full" data-testid="text-pd-parent-empty">
                      {isMinor ? "No parent / guardian info on file (student is a minor — please collect)." : "No parent / guardian info provided."}
                    </p>
                  )}
                </div>
              </section>

              <section data-testid="section-location">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Location
                </h3>
                <div className="rounded-md border p-3">
                  <p className="text-sm" data-testid="text-pd-location">{dash(data.location?.name)}</p>
                </div>
              </section>

              <section data-testid="section-package">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <PackageIcon className="h-4 w-4" /> Package
                </h3>
                <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <DetailRow label="Package name" value={dash(snap.name || data.package?.name)} testId="text-pd-pkg-name" />
                  <DetailRow
                    label="Price at purchase"
                    value={formatCents(
                      e.priceSnapshotCents ?? (snap.priceCents != null ? Number(snap.priceCents) : (snap.price != null ? Math.round(Number(snap.price) * 100) : null)),
                      e.currencySnapshot,
                    )}
                    testId="text-pd-pkg-price"
                  />
                  <DetailRow icon={BookOpen} label="Classroom credits" value={dash(snap.creditClassroom != null ? String(snap.creditClassroom) : (data.package?.creditClassroom != null ? String(data.package.creditClassroom) : null))} testId="text-pd-pkg-classroom" />
                  <DetailRow icon={Car} label="Drive credits" value={dash(snap.creditDrive != null ? String(snap.creditDrive) : (data.package?.creditDrive != null ? String(data.package.creditDrive) : null))} testId="text-pd-pkg-drive" />
                  <DetailRow label="Minimum age" value={dash(snap.minAge != null ? String(snap.minAge) : null)} testId="text-pd-pkg-min-age" />
                  {data.onlineCourse && (
                    <DetailRow
                      label="Online course"
                      value={`${data.onlineCourse.name}${data.onlineCourse.providerName ? ` (${data.onlineCourse.providerName})` : ""}`}
                      testId="text-pd-online-course"
                    />
                  )}
                  {providerUrl && (
                    <DetailRow
                      label="Provider URL"
                      value={
                        <a href={providerUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all" data-testid="link-pd-provider-url">
                          {providerUrl}
                        </a>
                      }
                    />
                  )}
                  {extraSnapRows}
                </div>
              </section>

              <section data-testid="section-notes">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Notes
                </h3>
                <div className="rounded-md border p-3 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes from student (at checkout)</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-pd-student-notes">
                      {dash(studentNotes)}
                    </p>
                  </div>
                  {adminNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Internal admin notes</p>
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-pd-admin-notes">
                        {adminNotes}
                      </p>
                    </div>
                  )}
                  {!hasAnyNotes && null}
                </div>
              </section>

              <section data-testid="section-payment">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Payment
                </h3>
                <div className="rounded-md border p-3">
                  {!featured ? (
                    <p className="text-sm text-muted-foreground" data-testid="text-pd-no-payments">No payment attempts on file.</p>
                  ) : (
                    <div data-testid={`row-pd-payment-${featured.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium" data-testid="text-pd-payment-provider">
                            {featured.provider}
                            <span className="text-muted-foreground font-normal"> — {featured.status}</span>
                            {!completed && (
                              <Badge variant="outline" className="ml-2 text-[10px]" data-testid="badge-pd-no-completed">
                                No completed payment yet
                              </Badge>
                            )}
                          </p>
                          {featured.providerPaymentId && (
                            <p className="text-xs text-muted-foreground truncate" data-testid="text-pd-payment-ref">
                              Ref: {featured.providerPaymentId}
                            </p>
                          )}
                          {featured.receiverName && (
                            <p className="text-xs text-muted-foreground" data-testid="text-pd-payment-receiver">
                              Received by {featured.receiverName}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium" data-testid="text-pd-payment-amount">
                            {formatCents(featured.amountCents, featured.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid="text-pd-payment-date">
                            {formatDateWithTime(featured.completedAt || featured.createdAt)}
                          </p>
                        </div>
                      </div>
                      {priorAttempts > 0 && (
                        <p className="text-xs text-muted-foreground mt-2" data-testid="text-pd-prior-attempts">
                          {priorAttempts} earlier attempt{priorAttempts === 1 ? "" : "s"} on file.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section data-testid="section-timeline">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Timeline
                </h3>
                <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <DetailRow label="Submitted" value={formatDateWithTime(e.createdAt)} testId="text-pd-submitted" />
                  <DetailRow label="Last updated" value={formatDateWithTime(e.updatedAt)} testId="text-pd-updated" />
                  <DetailRow label="Activated" value={formatDateWithTime(e.activatedAt)} testId="text-pd-activated" />
                  <DetailRow label="Confirmation email" value={formatDateWithTime(e.confirmationEmailSentAt)} testId="text-pd-conf-email" />
                  <DetailRow label="Payment receipt email" value={formatDateWithTime(e.paymentReceivedEmailSentAt)} testId="text-pd-pay-email" />
                  {data.cartId && (
                    <DetailRow icon={ShoppingCart} label="Originating cart" value={data.cartId} testId="text-pd-cart-id" />
                  )}
                </div>
              </section>
            </div>
          );
        })()}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              if (!tenantId || !enrollment?.id) return;
              try {
                const resp = await fetch(
                  `/api/tenants/${tenantId}/enrollments/${enrollment.id}/details.pdf`,
                  { credentials: "include" },
                );
                if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const cd = resp.headers.get("Content-Disposition") || "";
                const m = /filename="?([^";]+)"?/i.exec(cd);
                a.download = m?.[1] || `purchase-${enrollment.id}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (err) {
                toast({
                  title: "Couldn't download PDF",
                  description: err instanceof Error ? err.message : "Please try again.",
                  variant: "destructive",
                });
              }
            }}
            disabled={isLoading || !data}
            data-testid="button-download-purchase-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="button-close-purchase-details">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CartCustomerDetailsInput = {
  cartId: string;
  source: "abandoned_cart" | "pending_cash";
  customer: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    parentName?: string | null;
    parentEmail?: string | null;
    parentPhone?: string | null;
    notes?: string | null;
  } | null;
  items: Array<{
    packageName?: string | null;
    offeringName?: string | null;
    quantity?: number;
    priceCents?: number | null;
  }>;
  totalCents: number | null;
  lastActivityAt: string;
  remindersSent: number;
  lastReminderAt: string | null;
  reminderOpens: number;
  reminderClicks: number;
  reminderRecoveredAt: string | null;
};

function NotOnFile({ testId }: { testId?: string }) {
  return (
    <span className="text-muted-foreground italic" data-testid={testId}>Not on file</span>
  );
}

function CartCustomerDetailsDialog({
  details,
  onClose,
}: {
  details: CartCustomerDetailsInput | null;
  onClose: () => void;
}) {
  const open = !!details;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl" data-testid="dialog-customer-details">
        <DialogHeader>
          <DialogTitle data-testid="text-cart-details-title">Customer Details</DialogTitle>
          <DialogDescription>
            {details?.source === "pending_cash"
              ? "Cart-only pending cash payer — no enrollment record yet."
              : "Visitor abandoned this cart before completing checkout."}
          </DialogDescription>
        </DialogHeader>

        {details && (() => {
          const c = details.customer || {};
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
          const dob = c.dateOfBirth || null;
          const age = computeAgeYears(dob, details.lastActivityAt);
          const hasParent = !!(c.parentName || c.parentEmail || c.parentPhone);
          const itemCount = details.items.length;
          const firstItem = details.items[0];
          const packageLabel = firstItem
            ? (firstItem.packageName
                ? (itemCount > 1 ? `${firstItem.packageName} +${itemCount - 1} more` : firstItem.packageName)
                : "(unnamed package)")
            : "(empty cart)";
          const offeringLabel = firstItem?.offeringName || null;
          return (
            <div className="space-y-5">
              <section data-testid="section-cart-student">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <UserIcon className="h-4 w-4" /> Student
                </h3>
                <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <DetailRow
                    icon={UserIcon}
                    label="Name"
                    value={fullName ? <span data-testid="text-cart-student-name">{fullName}</span> : <NotOnFile testId="text-cart-student-name" />}
                  />
                  <DetailRow
                    icon={Mail}
                    label="Email"
                    value={c.email ? <ContactValue kind="email" value={c.email} testId="text-cart-student-email" /> : <NotOnFile testId="text-cart-student-email" />}
                  />
                  <DetailRow
                    icon={Phone}
                    label="Phone"
                    value={c.phone ? <ContactValue kind="phone" value={c.phone} testId="text-cart-student-phone" /> : <NotOnFile testId="text-cart-student-phone" />}
                  />
                  <DetailRow
                    icon={Calendar}
                    label="Date of birth"
                    value={
                      dob ? (
                        <span data-testid="text-cart-student-dob">
                          {formatDate(dob)}
                          {age != null && <span className="text-muted-foreground"> (age {age})</span>}
                        </span>
                      ) : (
                        <NotOnFile testId="text-cart-student-dob" />
                      )
                    }
                  />
                </div>
              </section>

              {hasParent && (
                <section data-testid="section-cart-parent">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <UsersIcon className="h-4 w-4" /> Parent / Guardian
                  </h3>
                  <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    <DetailRow
                      icon={UserIcon}
                      label="Name"
                      value={c.parentName ? <span data-testid="text-cart-parent-name">{c.parentName}</span> : <NotOnFile testId="text-cart-parent-name" />}
                    />
                    <DetailRow
                      icon={Mail}
                      label="Email"
                      value={c.parentEmail ? <ContactValue kind="email" value={c.parentEmail} testId="text-cart-parent-email" /> : <NotOnFile testId="text-cart-parent-email" />}
                    />
                    <DetailRow
                      icon={Phone}
                      label="Phone"
                      value={c.parentPhone ? <ContactValue kind="phone" value={c.parentPhone} testId="text-cart-parent-phone" /> : <NotOnFile testId="text-cart-parent-phone" />}
                    />
                  </div>
                </section>
              )}

              <section data-testid="section-cart-context">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" /> Cart
                </h3>
                <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <DetailRow
                    icon={PackageIcon}
                    label="Package"
                    value={<span data-testid="text-cart-package">{packageLabel}</span>}
                  />
                  <DetailRow
                    icon={MapPin}
                    label="Cohort"
                    value={offeringLabel ? <span data-testid="text-cart-offering">{offeringLabel}</span> : <NotOnFile testId="text-cart-offering" />}
                  />
                  <DetailRow
                    icon={CreditCard}
                    label="Total"
                    value={<span data-testid="text-cart-total">{formatCents(details.totalCents, "USD")}</span>}
                  />
                  <DetailRow
                    icon={Clock}
                    label="Last activity"
                    value={<span data-testid="text-cart-last-activity">{formatDateWithTime(details.lastActivityAt)}</span>}
                  />
                </div>
              </section>

              <section data-testid="section-cart-reminders">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Reminder activity
                </h3>
                <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <DetailRow
                    label="Reminders sent"
                    value={<span data-testid="text-cart-reminders-sent">{details.remindersSent}</span>}
                  />
                  <DetailRow
                    label="Last reminded"
                    value={
                      details.lastReminderAt
                        ? <span data-testid="text-cart-last-reminded">{formatDateWithTime(details.lastReminderAt)}</span>
                        : <NotOnFile testId="text-cart-last-reminded" />
                    }
                  />
                  <DetailRow
                    label="Email opens"
                    value={<span data-testid="text-cart-reminder-opens">{details.reminderOpens}</span>}
                  />
                  <DetailRow
                    label="Link clicks"
                    value={<span data-testid="text-cart-reminder-clicks">{details.reminderClicks}</span>}
                  />
                  {details.reminderRecoveredAt && (
                    <DetailRow
                      label="Recovered"
                      value={<span data-testid="text-cart-recovered-at">{formatDateWithTime(details.reminderRecoveredAt)}</span>}
                    />
                  )}
                </div>
              </section>

              {c.notes && (
                <section data-testid="section-cart-notes">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Notes from visitor
                  </h3>
                  <div className="rounded-md border p-3">
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-cart-notes">{c.notes}</p>
                  </div>
                </section>
              )}
            </div>
          );
        })()}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-customer-details">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
