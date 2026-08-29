import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  MapPin,
  Users,
  GraduationCap,
  ExternalLink,
  KeyRound,
  Loader2,
  Copy,
  Check,
  FlaskConical,
  FlaskConicalOff,
  Globe,
  CreditCard,
  Receipt,
  DollarSign,
  FileText,
  PenLine,
  AlertTriangle,
  Sparkles,
  Trash2,
  Key,
  Plus,
  Clock,
  ArrowLeft,
  Mail,
  Phone,
  Settings,
} from "lucide-react";
import { usePlatform } from "@/lib/platform-context";
import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PlatformPlan {
  id: number;
  name: string;
  slug: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  features: string[];
  maxLocations: number | null;
  maxStudents: number | null;
  maxInstructors: number | null;
  active: boolean;
  sortOrder: number;
}

interface TenantInvoice {
  id: number;
  tenantId: number;
  planId: number | null;
  amountCents: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  paidAt: string | null;
  stripeInvoiceId: string | null;
  notes: string | null;
  createdAt: string;
}

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface NewApiKeyResponse extends ApiKey {
  plainTextKey: string;
}

interface TenantWithStats {
  id: number;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  createdAt: string;
  customDomain: string | null;
  domainVerified: boolean;
  logoUrl: string | null;
  locationCount: number;
  memberCount: number;
  enrollmentCount: number;
  previewMode?: boolean;
  websiteEnabled?: boolean;
  planId: number | null;
  subscriptionStatus: string | null;
  billingEmail: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  planName: string | null;
  monthlyPriceCents: number | null;
  maxLocations: number | null;
  maxStudents: number | null;
  maxInstructors: number | null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString();
}

function getStatusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "trialing": return "outline";
    case "past_due":
    case "suspended": return "destructive";
    case "canceled": return "secondary";
    default: return "outline";
  }
}

function getInvoiceStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid": return "default";
    case "pending": return "outline";
    case "failed":
    case "void": return "destructive";
    case "draft": return "secondary";
    default: return "outline";
  }
}

function UsageMeter({ label, used, max }: { label: string; used: number; max: number | null }) {
  if (max === null) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span data-testid={`text-usage-${label.toLowerCase()}`}>{used} / Unlimited</span>
      </div>
    );
  }
  const pct = Math.min((used / max) * 100, 100);
  const isNearLimit = pct >= 80;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={isNearLimit ? "text-destructive font-medium" : ""} data-testid={`text-usage-${label.toLowerCase()}`}>
          {used} / {max}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isNearLimit ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function PlatformTenantDetail() {
  const params = useParams<{ id: string }>();
  const tenantId = parseInt(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { enterTenant } = usePlatform();

  const { data: tenants, isLoading: tenantsLoading } = useQuery<TenantWithStats[]>({
    queryKey: ["/api/platform/tenants"],
  });
  const { data: plans } = useQuery<PlatformPlan[]>({
    queryKey: ["/api/platform/plans"],
  });

  const tenant = tenants?.find((t) => t.id === tenantId) ?? null;

  const { data: tenantInvoices } = useQuery<TenantInvoice[]>({
    queryKey: ["/api/platform/tenants", tenantId, "invoices"],
    enabled: !!tenantId,
  });

  interface StripeStatusSubscription {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    items: { id: string; priceId: string; productId: string; nickname: string | null; unitAmount: number | null; currency: string; interval: string }[];
  }
  interface StripeStatusInvoice {
    id: string;
    amountPaid: number;
    currency: string;
    status: string | null;
    paidAt: string | null;
    createdAt: string;
    hostedInvoiceUrl: string | null;
  }
  interface StripeStatus {
    hasCustomer: boolean;
    customerId?: string;
    error?: string;
    subscription?: StripeStatusSubscription | null;
    invoices?: StripeStatusInvoice[];
  }

  const { data: stripeStatus, isLoading: stripeStatusLoading, refetch: refetchStripeStatus } = useQuery<StripeStatus>({
    queryKey: ["/api/platform/tenants", tenantId, "stripe-status"],
    queryFn: async () => {
      const res = await fetch(`/api/platform/tenants/${tenantId}/stripe-status`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Stripe status");
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const { data: apiKeys, isLoading: apiKeysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/tenants", tenantId, "api-keys"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/api-keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const activeApiKeys = apiKeys?.filter((k) => !k.revokedAt) ?? [];
  const revokedApiKeys = apiKeys?.filter((k) => k.revokedAt) ?? [];

  // Overview edit state
  const [isOverviewEditing, setIsOverviewEditing] = useState(false);
  const [overviewName, setOverviewName] = useState("");
  const [overviewEmail, setOverviewEmail] = useState("");
  const [overviewPhone, setOverviewPhone] = useState("");

  useEffect(() => {
    if (tenant) {
      setOverviewName(tenant.name);
      setOverviewEmail(tenant.email || "");
      setOverviewPhone(tenant.phone || "");
    }
  }, [tenant?.id]);

  const updateContactInfoMutation = useMutation({
    mutationFn: async (data: { name: string; email: string | null; phone: string | null }) => {
      const res = await apiRequest("PATCH", `/api/tenants/${tenantId}`, data);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "School updated", description: "Contact information has been saved." });
      setIsOverviewEditing(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleOverviewSave = () => {
    if (!overviewName.trim()) {
      toast({ title: "Name required", description: "School name cannot be empty.", variant: "destructive" });
      return;
    }
    updateContactInfoMutation.mutate({
      name: overviewName.trim(),
      email: overviewEmail.trim() || null,
      phone: overviewPhone.trim() || null,
    });
  };

  const handleOverviewCancel = () => {
    if (tenant) {
      setOverviewName(tenant.name);
      setOverviewEmail(tenant.email || "");
      setOverviewPhone(tenant.phone || "");
    }
    setIsOverviewEditing(false);
  };

  // Billing state
  const [billingPlanId, setBillingPlanId] = useState<string>("");
  const [billingStatus, setBillingStatus] = useState<string>("");
  const [billingEmailInput, setBillingEmailInput] = useState<string>("");
  const [stripeCustomerIdInput, setStripeCustomerIdInput] = useState<string>("");
  const [stripeCustomerIdError, setStripeCustomerIdError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setBillingPlanId(tenant.planId?.toString() || "none");
      setBillingStatus(tenant.subscriptionStatus || "trialing");
      setBillingEmailInput(tenant.billingEmail || "");
      setStripeCustomerIdInput(tenant.stripeCustomerId || "");
    }
  }, [tenant?.id]);

  // Invoice state
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [generateInvoiceOpen, setGenerateInvoiceOpen] = useState(false);

  // API key state
  const [apiKeyName, setApiKeyName] = useState("");
  const [newApiKey, setNewApiKey] = useState<NewApiKeyResponse | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  // Slug edit state
  const [slugEditValue, setSlugEditValue] = useState("");
  const [slugEditStatus, setSlugEditStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [slugEditWarnings, setSlugEditWarnings] = useState<string[]>([]);
  const [slugEditConfirmOpen, setSlugEditConfirmOpen] = useState(false);
  const slugEditDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tenant) setSlugEditValue(tenant.slug);
  }, [tenant?.id]);

  // Reset password state
  const [resetEmail, setResetEmail] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetLinkCopied, setResetLinkCopied] = useState(false);

  useEffect(() => {
    if (tenant?.email) setResetEmail(tenant.email);
  }, [tenant?.id]);

  // Demo data state
  type SeedDemoCounts = Record<string, { created: number; existed: number }>;
  type SeedDemoApiResponse = {
    summary?: { counts?: SeedDemoCounts; locationIds?: number[] };
    totals?: { created: number; existed: number };
  };
  type ClearDemoCounts = Record<string, { deleted: number; skipped: number }>;
  type ClearDemoApiResponse = {
    summary?: { counts?: ClearDemoCounts };
    totals?: { deleted: number; skipped: number };
  };

  const [seedDemoSummary, setSeedDemoSummary] = useState<{
    counts: SeedDemoCounts;
    totals: { created: number; existed: number };
    locationIds: number[];
  } | null>(null);
  const [clearDemoSummary, setClearDemoSummary] = useState<{
    counts: ClearDemoCounts;
    totals: { deleted: number; skipped: number };
  } | null>(null);

  // Scroll to hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Slug availability check
  useEffect(() => {
    if (slugEditDebounce.current) clearTimeout(slugEditDebounce.current);
    const trimmed = slugEditValue?.trim();
    if (!trimmed || !tenant || trimmed === tenant.slug) {
      setSlugEditStatus("idle");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(trimmed)) {
      setSlugEditStatus("idle");
      return;
    }
    setSlugEditStatus("checking");
    slugEditDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tenants/check-slug?slug=${encodeURIComponent(trimmed)}&excludeId=${tenant.id}`,
          { credentials: "include" }
        );
        if (!res.ok) { setSlugEditStatus("idle"); return; }
        const data = await res.json();
        setSlugEditStatus(data.available ? "available" : "taken");
      } catch {
        setSlugEditStatus("idle");
      }
    }, 500);
    return () => { if (slugEditDebounce.current) clearTimeout(slugEditDebounce.current); };
  }, [slugEditValue, tenant?.id]);

  const updateBillingMutation = useMutation({
    mutationFn: async ({ data }: { data: any }) => {
      const res = await apiRequest("PATCH", `/api/platform/tenants/${tenantId}/billing`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      toast({ title: "Billing updated", description: "Tenant billing information has been updated." });
    },
    onError: (err: Error) => {
      if (!err.message.startsWith("422:")) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/platform/invoices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants", tenantId, "invoices"] });
      toast({ title: "Invoice created", description: "The invoice has been generated successfully." });
      setGenerateInvoiceOpen(false);
      setInvoiceAmount("");
      setInvoiceNotes("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const res = await apiRequest("POST", `/api/platform/invoices/${invoiceId}/mark-paid`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants", tenantId, "invoices"] });
      toast({ title: "Invoice paid", description: "The invoice has been marked as paid." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateApiKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/api-keys`, { name });
      return res.json() as Promise<NewApiKeyResponse>;
    },
    onSuccess: (data) => {
      setNewApiKey(data);
      setApiKeyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "api-keys"] });
    },
    onError: (err: Error) => toast({ title: "Failed to generate key", description: err.message, variant: "destructive" }),
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("DELETE", `/api/tenants/${tenantId}/api-keys/${keyId}`);
    },
    onSuccess: () => {
      toast({ title: "API key revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "api-keys"] });
    },
    onError: (err: Error) => toast({ title: "Failed to revoke key", description: err.message, variant: "destructive" }),
  });

  const updateSlugMutation = useMutation({
    mutationFn: async ({ slug, confirmSlugChange }: { slug: string; confirmSlugChange?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/tenants/${tenantId}`, { slug, confirmSlugChange });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      toast({ title: "Slug updated", description: "The tenant's URL slug has been changed." });
      setSlugEditStatus("idle");
      setSlugEditConfirmOpen(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/platform/reset-user-password", { email });
      return res.json();
    },
    onSuccess: (data: any) => {
      const link = `${window.location.origin}/reset-password?token=${data.resetToken}`;
      setResetLink(link);
      setResetLinkCopied(false);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const enablePreviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/platform/tenants/${tenantId}/enable-preview`, {});
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      toast({ title: "Preview mode enabled", description: "Demo data has been loaded for this school." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const disablePreviewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/platform/tenants/${tenantId}/disable-preview`, {});
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      toast({ title: "Preview mode disabled" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleWebsiteMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", `/api/platform/tenants/${tenantId}/website-enabled`, { enabled });
      return res.json();
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      toast({ title: enabled ? "Page Builder enabled" : "Page Builder disabled" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const seedDemoDataMutation = useMutation<SeedDemoApiResponse, Error>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/platform/tenants/${tenantId}/seed-demo-data`, {});
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      setSeedDemoSummary({
        counts: data.summary?.counts ?? {},
        totals: data.totals ?? { created: 0, existed: 0 },
        locationIds: data.summary?.locationIds ?? [],
      });
      setClearDemoSummary(null);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      toast({ title: "Demo data seeded", description: `${data.totals?.created ?? 0} new rows created.` });
    },
    onError: (err: Error) => toast({ title: "Could not seed demo data", description: err.message, variant: "destructive" }),
  });

  const clearDemoDataMutation = useMutation<ClearDemoApiResponse, Error>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/platform/tenants/${tenantId}/clear-demo-data`, {});
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      setClearDemoSummary({
        counts: data.summary?.counts ?? {},
        totals: data.totals ?? { deleted: 0, skipped: 0 },
      });
      setSeedDemoSummary(null);
      queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
      toast({ title: "Demo data cleared", description: `${data.totals?.deleted ?? 0} rows deleted.` });
    },
    onError: (err: Error) => toast({ title: "Could not clear demo data", description: err.message, variant: "destructive" }),
  });

  const handleSaveBilling = () => {
    if (!tenant) return;
    const newStripeCustomerId = stripeCustomerIdInput.trim() || null;
    if (newStripeCustomerId !== null && !newStripeCustomerId.startsWith("cus_")) {
      setStripeCustomerIdError('Stripe Customer ID must start with "cus_"');
      return;
    }
    setStripeCustomerIdError(null);
    const data: any = {};
    const newPlanId = billingPlanId === "none" ? null : parseInt(billingPlanId);
    if (newPlanId !== tenant.planId) data.planId = newPlanId;
    if (billingStatus !== tenant.subscriptionStatus) data.subscriptionStatus = billingStatus;
    const newEmail = billingEmailInput.trim() || null;
    if (newEmail !== tenant.billingEmail) data.billingEmail = newEmail;
    if (newStripeCustomerId !== tenant.stripeCustomerId) {
      data.stripeCustomerId = newStripeCustomerId;
    }
    if (Object.keys(data).length > 0) {
      updateBillingMutation.mutate({ data }, {
        onSuccess: () => {
          if (data.stripeCustomerId !== undefined) {
            refetchStripeStatus();
          }
        },
        onError: (err: Error) => {
          if (err.message.startsWith("422:") && data.stripeCustomerId !== undefined) {
            try {
              const body = JSON.parse(err.message.slice(err.message.indexOf(":")+1).trim());
              setStripeCustomerIdError(body.message || "Invalid Stripe Customer ID.");
            } catch {
              setStripeCustomerIdError("Invalid Stripe Customer ID.");
            }
          }
        },
      });
    } else {
      toast({ title: "No changes", description: "Nothing to save." });
    }
  };

  const handleGenerateInvoice = () => {
    if (!tenant) return;
    const amountCents = Math.round(parseFloat(invoiceAmount || "0") * 100);
    if (amountCents <= 0) {
      toast({ title: "Invalid amount", description: "Amount must be greater than zero.", variant: "destructive" });
      return;
    }
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);
    if (dueDate < now) dueDate.setMonth(dueDate.getMonth() + 1);
    createInvoiceMutation.mutate({
      tenantId,
      planId: tenant.planId,
      amountCents,
      status: "pending",
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      dueDate: dueDate.toISOString(),
      notes: invoiceNotes || null,
    });
  };

  const handleSlugSave = async () => {
    if (!tenant || slugEditValue === tenant.slug) return;
    setSlugEditWarnings([]);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/slug-change-check`, { credentials: "include" });
      if (res.ok) {
        const check = await res.json();
        setSlugEditWarnings(check.warnings || []);
      }
    } catch {}
    setSlugEditConfirmOpen(true);
  };

  const handleCopyApiKey = (text: string) => {
    navigator.clipboard.writeText(text);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
  };

  const handleCopyResetLink = async () => {
    if (resetLink) {
      try {
        await navigator.clipboard.writeText(resetLink);
        setResetLinkCopied(true);
        toast({ title: "Copied!", description: "Reset link copied to clipboard." });
        setTimeout(() => setResetLinkCopied(false), 3000);
      } catch {
        toast({ title: "Copy failed", description: "Please select and copy the link manually.", variant: "destructive" });
      }
    }
  };

  const activePlans = plans?.filter((p) => p.active) ?? [];

  if (tenantsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6 text-center space-y-4">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">School not found.</p>
        <Button variant="outline" onClick={() => setLocation("/platform/tenants")} data-testid="button-back-to-tenants">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Tenants
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Back link */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/platform/tenants")}
          data-testid="button-back-to-tenants"
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Tenants
        </Button>
      </div>

      {/* Page heading */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-tenant-detail-name">{tenant.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{tenant.slug}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => { enterTenant(tenant.id); setLocation("/admin"); }}
          data-testid="button-enter-school"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Enter School
        </Button>
      </div>

      {/* ── OVERVIEW ── */}
      <Card id="overview" data-testid="card-overview">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Overview
            </span>
            {!isOverviewEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOverviewEditing(true)}
                data-testid="button-edit-overview"
              >
                <PenLine className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOverviewCancel}
                  disabled={updateContactInfoMutation.isPending}
                  data-testid="button-cancel-overview"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleOverviewSave}
                  disabled={updateContactInfoMutation.isPending}
                  data-testid="button-save-overview"
                >
                  {updateContactInfoMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={tenant.active ? "default" : "secondary"} data-testid="badge-tenant-active">
              {tenant.active ? "Active" : "Inactive"}
            </Badge>
            {tenant.previewMode && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800" data-testid="badge-preview-mode">
                <FlaskConical className="h-3 w-3 mr-1" />
                Preview
              </Badge>
            )}
            {tenant.planName && (
              <Badge variant="outline" data-testid="badge-plan-name">
                <CreditCard className="h-3 w-3 mr-1" />
                {tenant.planName}
              </Badge>
            )}
            <Badge variant={getStatusVariant(tenant.subscriptionStatus)} data-testid="badge-subscription-status">
              {tenant.subscriptionStatus || "trialing"}
            </Badge>
            {tenant.websiteEnabled === false && (
              <Badge variant="secondary" data-testid="badge-page-builder-disabled">Page Builder Off</Badge>
            )}
          </div>

          {isOverviewEditing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="overview-name">School Name</Label>
                <Input
                  id="overview-name"
                  value={overviewName}
                  onChange={(e) => setOverviewName(e.target.value)}
                  placeholder="School name"
                  data-testid="input-overview-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overview-email">Contact Email</Label>
                <Input
                  id="overview-email"
                  type="email"
                  value={overviewEmail}
                  onChange={(e) => setOverviewEmail(e.target.value)}
                  placeholder="email@example.com"
                  data-testid="input-overview-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="overview-phone">Phone</Label>
                <Input
                  id="overview-phone"
                  type="tel"
                  value={overviewPhone}
                  onChange={(e) => setOverviewPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  data-testid="input-overview-phone"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {tenant.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span data-testid="text-tenant-email">{tenant.email}</span>
                </div>
              )}
              {tenant.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span data-testid="text-tenant-phone">{tenant.phone}</span>
                </div>
              )}
              {tenant.customDomain && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4 shrink-0" />
                  <span data-testid="text-tenant-domain">{tenant.customDomain}</span>
                  {tenant.domainVerified && <Badge variant="outline" className="text-xs text-green-600 border-green-600">Verified</Badge>}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>Created {formatDate(tenant.createdAt)}</span>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {tenant.locationCount} location{tenant.locationCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {tenant.memberCount} member{tenant.memberCount !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" />
              {tenant.enrollmentCount} enrollment{tenant.enrollmentCount !== 1 ? "s" : ""}
            </span>
            {tenant.monthlyPriceCents !== null && (
              <span className="flex items-center gap-1.5">
                <DollarSign className="h-4 w-4" />
                {formatCents(tenant.monthlyPriceCents)}/mo
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── BILLING ── */}
      <Card id="billing" data-testid="card-billing">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Subscription controls */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Subscription</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="billing-plan">Plan</Label>
                <Select value={billingPlanId} onValueChange={setBillingPlanId}>
                  <SelectTrigger data-testid="select-billing-plan">
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Plan</SelectItem>
                    {activePlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id.toString()}>
                        {plan.name} — {formatCents(plan.monthlyPriceCents)}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-status">Subscription Status</Label>
                <Select value={billingStatus} onValueChange={setBillingStatus}>
                  <SelectTrigger data-testid="select-billing-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-email">Billing Email</Label>
              <Input
                id="billing-email"
                value={billingEmailInput}
                onChange={(e) => setBillingEmailInput(e.target.value)}
                placeholder="billing@example.com"
                data-testid="input-billing-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stripe-customer-id">Stripe Customer ID</Label>
              <Input
                id="stripe-customer-id"
                value={stripeCustomerIdInput}
                onChange={(e) => { setStripeCustomerIdInput(e.target.value); if (stripeCustomerIdError) setStripeCustomerIdError(null); }}
                placeholder="cus_..."
                data-testid="input-stripe-customer-id"
                className={stripeCustomerIdError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {stripeCustomerIdError ? (
                <p className="text-xs text-destructive" data-testid="error-stripe-customer-id">{stripeCustomerIdError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Link this school to a Stripe customer to show live subscription data below.</p>
              )}
            </div>
            <Button onClick={handleSaveBilling} disabled={updateBillingMutation.isPending} data-testid="button-save-billing">
              {updateBillingMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : "Save Billing"}
            </Button>
          </div>

          <Separator />

          {/* Live Stripe data */}
          <div className="space-y-3" data-testid="section-live-stripe-data">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Live Stripe Data</h3>
              {stripeStatus?.hasCustomer && stripeStatus.customerId && (
                <a
                  href={`https://dashboard.stripe.com/customers/${stripeStatus.customerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  data-testid="link-open-in-stripe"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in Stripe
                </a>
              )}
            </div>

            {stripeStatusLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : !stripeStatus?.hasCustomer ? (
              <p className="text-sm text-muted-foreground py-2" data-testid="text-no-stripe-customer">
                No Stripe customer linked. Enter a Stripe Customer ID above and save to enable live data.
              </p>
            ) : stripeStatus.error ? (
              <div className="flex items-center gap-2 text-sm text-destructive py-2" data-testid="text-stripe-error">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {stripeStatus.error}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active subscription */}
                {stripeStatus.subscription ? (
                  <div className="rounded-md border p-4 space-y-3" data-testid="card-stripe-subscription">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">Active Subscription</span>
                      <Badge
                        variant={
                          stripeStatus.subscription.status === "active" ? "default" :
                          stripeStatus.subscription.status === "trialing" ? "outline" :
                          stripeStatus.subscription.status === "past_due" ? "destructive" : "secondary"
                        }
                        data-testid="badge-stripe-sub-status"
                      >
                        {stripeStatus.subscription.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Current period</span>
                        <p className="font-medium" data-testid="text-stripe-period">
                          {formatDate(stripeStatus.subscription.currentPeriodStart)} – {formatDate(stripeStatus.subscription.currentPeriodEnd)}
                        </p>
                      </div>
                      {stripeStatus.subscription.items[0]?.unitAmount != null && (
                        <div>
                          <span className="text-muted-foreground">Price</span>
                          <p className="font-medium" data-testid="text-stripe-price">
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: stripeStatus.subscription.items[0].currency.toUpperCase() }).format(stripeStatus.subscription.items[0].unitAmount / 100)}
                            {stripeStatus.subscription.items[0].interval ? `/${stripeStatus.subscription.items[0].interval}` : ""}
                          </p>
                        </div>
                      )}
                    </div>
                    {stripeStatus.subscription.cancelAtPeriodEnd && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Cancels at end of current period
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-stripe-subscription">No active subscription found for this customer.</p>
                )}

                {/* Invoice history */}
                <div className="space-y-2" data-testid="section-stripe-invoices">
                  <span className="text-sm font-medium">Payment History</span>
                  {stripeStatus.invoices && stripeStatus.invoices.length > 0 ? (
                    <div className="rounded-md border overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Amount</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stripeStatus.invoices.map((inv, idx) => (
                              <TableRow key={inv.id} data-testid={`row-stripe-invoice-${idx}`}>
                                <TableCell className="text-xs py-2">
                                  {formatDate(inv.paidAt ?? inv.createdAt)}
                                </TableCell>
                                <TableCell className="text-xs py-2 font-medium" data-testid={`text-stripe-invoice-amount-${idx}`}>
                                  {new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency.toUpperCase() }).format(inv.amountPaid / 100)}
                                </TableCell>
                                <TableCell className="text-xs py-2">
                                  <Badge
                                    variant={inv.status === "paid" ? "default" : inv.status === "open" ? "outline" : "secondary"}
                                    className="text-xs"
                                    data-testid={`badge-stripe-invoice-status-${idx}`}
                                  >
                                    {inv.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs py-2">
                                  {inv.hostedInvoiceUrl ? (
                                    <a
                                      href={inv.hostedInvoiceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-primary hover:underline"
                                      data-testid={`link-stripe-invoice-${idx}`}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      View
                                    </a>
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2" data-testid="text-no-stripe-invoices">No invoices found.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Usage meters */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Plan Limits vs Usage</h3>
            <div className="space-y-3">
              <UsageMeter label="Locations" used={tenant.locationCount} max={tenant.maxLocations} />
              <UsageMeter label="Students" used={tenant.enrollmentCount} max={tenant.maxStudents} />
              <UsageMeter label="Instructors" used={tenant.memberCount} max={tenant.maxInstructors} />
            </div>
          </div>

          <Separator />

          {/* Invoice history */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Invoice History</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const plan = activePlans.find((p) => p.id === tenant.planId);
                  setInvoiceAmount(plan ? (plan.monthlyPriceCents / 100).toFixed(2) : "");
                  setInvoiceNotes("");
                  setGenerateInvoiceOpen(true);
                }}
                data-testid="button-generate-invoice"
              >
                <FileText className="h-3.5 w-3.5 mr-1" />
                Generate Invoice
              </Button>
            </div>

            {generateInvoiceOpen && (
              <div className="border rounded-md p-4 space-y-4 bg-muted/30">
                <p className="text-sm font-medium">New Invoice for {tenant.name}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invoice-amount">Amount ($)</Label>
                    <Input
                      id="invoice-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={invoiceAmount}
                      onChange={(e) => setInvoiceAmount(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-invoice-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice-notes">Notes (optional)</Label>
                    <Input
                      id="invoice-notes"
                      value={invoiceNotes}
                      onChange={(e) => setInvoiceNotes(e.target.value)}
                      placeholder="Monthly subscription"
                      data-testid="input-invoice-notes"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleGenerateInvoice} disabled={createInvoiceMutation.isPending} data-testid="button-submit-invoice">
                    {createInvoiceMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                    ) : (
                      <><FileText className="h-4 w-4 mr-2" /> Create Invoice</>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => setGenerateInvoiceOpen(false)} data-testid="button-cancel-invoice">Cancel</Button>
                </div>
              </div>
            )}

            {tenantInvoices && tenantInvoices.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantInvoices.map((inv) => (
                      <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                        <TableCell className="text-sm">{formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}</TableCell>
                        <TableCell className="text-sm font-medium" data-testid={`text-invoice-amount-${inv.id}`}>{formatCents(inv.amountCents)}</TableCell>
                        <TableCell>
                          <Badge variant={getInvoiceStatusVariant(inv.status)} className="text-xs" data-testid={`badge-invoice-status-${inv.id}`}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(inv.paidAt)}</TableCell>
                        <TableCell>
                          {(inv.status === "pending" || inv.status === "failed") && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markPaidMutation.mutate(inv.id)}
                              disabled={markPaidMutation.isPending}
                              data-testid={`button-mark-paid-${inv.id}`}
                            >
                              Mark Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No invoices yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── API ACCESS ── */}
      <Card id="api" data-testid="card-api-access">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            API Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            API keys let this school's external website read data from Drivorata. Generate or revoke keys on the school's behalf.
          </p>

          {/* New key reveal */}
          {newApiKey ? (
            <div className="space-y-3 border rounded-md p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Check className="h-4 w-4 text-green-600" />
                New API Key — copy it now, you won't see it again
              </div>
              <div className="flex items-center gap-2 p-3 bg-background rounded-md font-mono text-xs break-all border" data-testid="text-new-api-key">
                {newApiKey.plainTextKey}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleCopyApiKey(newApiKey.plainTextKey)} data-testid="button-copy-api-key">
                  {apiKeyCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {apiKeyCopied ? "Copied" : "Copy"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setNewApiKey(null)} data-testid="button-dismiss-new-key">Done</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="api-key-name">New key name</Label>
                <Input
                  id="api-key-name"
                  placeholder="e.g., Production Website"
                  value={apiKeyName}
                  onChange={(e) => setApiKeyName(e.target.value)}
                  data-testid="input-api-key-name"
                />
              </div>
              <Button
                onClick={() => generateApiKeyMutation.mutate(apiKeyName)}
                disabled={!apiKeyName.trim() || generateApiKeyMutation.isPending}
                data-testid="button-generate-api-key"
              >
                {generateApiKeyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Generate
              </Button>
            </div>
          )}

          {/* Key table */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Existing keys</h3>
            {apiKeysLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : activeApiKeys.length === 0 && revokedApiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No API keys yet.</p>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...activeApiKeys, ...revokedApiKeys].map((key) => (
                      <TableRow key={key.id} data-testid={`row-api-key-${key.id}`}>
                        <TableCell className="text-sm font-medium" data-testid={`text-key-name-${key.id}`}>{key.name}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{key.keyPrefix}••</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(key.createdAt).toLocaleDateString()}</span>
                        </TableCell>
                        <TableCell>
                          {key.revokedAt ? (
                            <Badge variant="secondary" className="text-xs">Revoked</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-600">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!key.revokedAt && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-revoke-key-${key.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will immediately stop any external website using "{key.name}" from accessing this school's data. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => revokeApiKeyMutation.mutate(key.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    data-testid={`button-confirm-revoke-${key.id}`}
                                  >
                                    Revoke Key
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <Separator />

          {/* Quick-start guide */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Quick Start Guide
            </h3>
            <p className="text-xs text-muted-foreground">Copy these snippets when handing a key off to the school.</p>

            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-xs">Bootstrap call — discover all school data in one request:</p>
              <code className="block bg-background px-3 py-2 rounded border text-xs font-mono" data-testid="text-api-bootstrap-url">
                GET {window.location.origin}/api/public/me
              </code>
              <p className="text-xs text-muted-foreground">
                Pass the API key as <code className="bg-background px-1 rounded">X-API-Key: drv_live_…</code> header. Returns the full tenant config, packages, locations, payment methods, and upcoming sessions.
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-xs">Base URL for slug-based calls:</p>
              <code className="block bg-background px-3 py-2 rounded border text-xs font-mono" data-testid="text-api-base-url">
                {window.location.origin}/api/public/tenant/{tenant.slug}
              </code>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-xs">Other available endpoints:</p>
              <ul className="space-y-1 text-muted-foreground text-xs font-mono">
                <li>GET /api/public/tenant/:slug/packages — Active packages</li>
                <li>GET /api/public/tenant/:slug/locations — Active locations</li>
                <li>GET /api/public/tenant/:slug/sessions — Upcoming sessions</li>
                <li>GET /api/public/tenant/:slug/instructors — Active instructors</li>
                <li>GET /api/public/tenant/:slug/payment-methods — Accepted payment methods</li>
                <li>POST /api/public/tenant/:slug/checkout/start — Start enrollment checkout</li>
                <li>GET /api/public/enrollments/:id/status — Check enrollment status</li>
              </ul>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-xs">Staff portal link:</p>
              <code className="block bg-background px-3 py-2 rounded border text-xs font-mono" data-testid="text-api-staff-link">
                {window.location.origin}/login?tenant={tenant.slug}
              </code>
              <p className="text-xs text-muted-foreground">
                Add this as a "Staff Login" link on the school's website so staff see the school's branding on the login page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SETTINGS ── */}
      <Card id="settings" data-testid="card-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Slug edit */}
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <PenLine className="h-4 w-4" />
                URL Slug
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Changing this will break existing links to this school's public pages.</p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="slug-input">Slug</Label>
                <Input
                  id="slug-input"
                  value={slugEditValue}
                  onChange={(e) => {
                    const sanitized = e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                    setSlugEditValue(sanitized);
                  }}
                  placeholder="my-driving-school"
                  data-testid="input-edit-slug"
                />
                <p className="text-xs text-muted-foreground">
                  Public URL: {import.meta.env.VITE_PLATFORM_DOMAIN || "drivorata.com"}/site/<strong>{slugEditValue || "your-slug"}</strong>
                </p>
                {slugEditStatus === "checking" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="text-slug-checking">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking...
                  </p>
                )}
                {slugEditStatus === "available" && (
                  <p className="text-xs text-green-600 flex items-center gap-1" data-testid="text-slug-available">
                    <Check className="h-3 w-3" /> Available
                  </p>
                )}
                {slugEditStatus === "taken" && (
                  <p className="text-xs text-destructive flex items-center gap-1" data-testid="text-slug-taken">
                    Already taken
                  </p>
                )}
              </div>
              <Button
                onClick={handleSlugSave}
                disabled={
                  updateSlugMutation.isPending ||
                  slugEditStatus === "taken" ||
                  slugEditStatus === "checking" ||
                  !tenant || slugEditValue === tenant.slug ||
                  !slugEditValue.trim()
                }
                data-testid="button-save-slug"
              >
                {updateSlugMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Slug"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Reset password */}
          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Reset Admin Password
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Generate a one-time reset link for any user at this school.</p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="reset-email">Email address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="admin@school.com"
                  data-testid="input-reset-email"
                />
              </div>
              <Button
                onClick={() => resetEmail && resetPasswordMutation.mutate(resetEmail)}
                disabled={!resetEmail || resetPasswordMutation.isPending}
                data-testid="button-generate-reset-link"
              >
                {resetPasswordMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><KeyRound className="h-4 w-4 mr-2" /> Generate Link</>
                )}
              </Button>
            </div>
            {resetLink && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Reset link (expires in 24 hours). Copy and share securely:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-2 rounded border flex-1 truncate block" data-testid="text-reset-link">{resetLink}</code>
                  <Button variant="outline" size="sm" onClick={handleCopyResetLink} data-testid="button-copy-reset-link" className="shrink-0">
                    {resetLinkCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Demo data */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Demo Data
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Populates this tenant with a starter catalog. Idempotent — re-running skips rows that already exist.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => seedDemoDataMutation.mutate()}
                  disabled={seedDemoDataMutation.isPending || clearDemoDataMutation.isPending}
                  data-testid="button-seed-demo-data"
                >
                  {seedDemoDataMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Seeding...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1" /> Seed Demo Data</>
                  )}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={seedDemoDataMutation.isPending || clearDemoDataMutation.isPending}
                      className="text-destructive hover:text-destructive"
                      data-testid="button-clear-demo-data"
                    >
                      {clearDemoDataMutation.isPending ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Clearing...</>
                      ) : (
                        <><Trash2 className="h-3.5 w-3.5 mr-1" /> Clear Demo Data</>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent data-testid="dialog-clear-demo-confirm">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        Clear Seeded Demo Data?
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>
                            This removes only rows the demo seeder created for{" "}
                            <strong className="text-foreground">{tenant.name}</strong> — matched by their
                            package / offering / promotion names and the <code>seed:</code> notes signature on
                            generated sessions.
                          </p>
                          <p className="text-sm">
                            Rows in use by real customer data (enrollments, waitlist entries, or sessions tied
                            to an enrollment) will be skipped.
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-clear-demo">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => clearDemoDataMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-clear-demo"
                      >
                        Clear Demo Data
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {clearDemoSummary && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2" data-testid="container-clear-demo-summary">
                <div className="text-sm font-medium" data-testid="text-clear-demo-totals">
                  {clearDemoSummary.totals.deleted} deleted · {clearDemoSummary.totals.skipped} skipped (in use)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(clearDemoSummary.counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, c]) => (
                    <div key={key} className="flex justify-between" data-testid={`row-clear-demo-${key}`}>
                      <span className="text-muted-foreground">{key}</span>
                      <span>
                        <span className="font-medium">{c.deleted}</span>
                        <span className="text-muted-foreground"> / {c.skipped} skipped</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {seedDemoSummary && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2" data-testid="container-seed-demo-summary">
                <div className="text-sm font-medium" data-testid="text-seed-demo-totals">
                  {seedDemoSummary.totals.created} created · {seedDemoSummary.totals.existed} already existed
                  {seedDemoSummary.locationIds.length > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {" "}· locations: {seedDemoSummary.locationIds.join(", ")}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {Object.entries(seedDemoSummary.counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, c]) => (
                    <div key={key} className="flex justify-between" data-testid={`row-seed-demo-${key}`}>
                      <span className="text-muted-foreground">{key}</span>
                      <span>
                        <span className="font-medium">{c.created}</span>
                        <span className="text-muted-foreground"> / {c.existed} existed</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Preview mode */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Preview Mode
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Preview mode loads demo data and marks the school with a "Preview" badge.
              </p>
            </div>
            {tenant.previewMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => disablePreviewMutation.mutate()}
                disabled={disablePreviewMutation.isPending}
                className="text-destructive hover:text-destructive"
                data-testid="button-disable-preview"
              >
                {disablePreviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FlaskConicalOff className="h-4 w-4 mr-2" />
                )}
                Disable Preview
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => enablePreviewMutation.mutate()}
                disabled={enablePreviewMutation.isPending}
                data-testid="button-enable-preview"
              >
                {enablePreviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4 mr-2" />
                )}
                Enable Preview
              </Button>
            )}
          </div>

          <Separator />

          {/* Page Builder toggle */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Page Builder
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controls whether this school can use the built-in page builder and public site.
              </p>
            </div>
            {tenant.websiteEnabled !== false ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleWebsiteMutation.mutate(false)}
                disabled={toggleWebsiteMutation.isPending}
                data-testid="button-disable-page-builder"
              >
                {toggleWebsiteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                Disable Page Builder
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleWebsiteMutation.mutate(true)}
                disabled={toggleWebsiteMutation.isPending}
                data-testid="button-enable-page-builder"
              >
                {toggleWebsiteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                Enable Page Builder
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Slug confirm dialog */}
      <AlertDialog open={slugEditConfirmOpen} onOpenChange={setSlugEditConfirmOpen}>
        <AlertDialogContent data-testid="dialog-slug-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Slug Change
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You're changing the slug from <strong>{tenant.slug}</strong> to <strong>{slugEditValue}</strong>.
                  All existing links, bookmarks, and API integrations using the old slug will stop working immediately.
                </p>
                {slugEditWarnings.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 space-y-1">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Active integrations that will be affected:
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {slugEditWarnings.map((w, i) => (
                        <li key={i} className="text-sm text-amber-700 dark:text-amber-400">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-slug-confirm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => updateSlugMutation.mutate({ slug: slugEditValue, confirmSlugChange: true })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-slug-change"
            >
              Change Slug
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
