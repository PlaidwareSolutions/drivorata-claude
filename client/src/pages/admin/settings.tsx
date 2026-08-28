import { useState, useEffect, useRef } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  CheckCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Clock,
  XCircle,
  Search,
  CreditCard,
  Shield,
  Loader2,
  Trash2,
  Banknote,
  PenLine,
  Key,
  Plus,
  Check,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const generalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens allowed"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  logoUrl: z.string().optional(),
  showPendingInterest: z.boolean().default(false),
});

const domainSchema = z.object({
  customDomain: z.string().min(1, "Domain is required"),
});

const paymentSettingsSchema = z.object({
  stripeEnabled: z.boolean(),
  stripeSecretKey: z.string().optional().default(""),
  stripePublishableKey: z.string().optional().default(""),
  stripeWebhookSecret: z.string().optional().default(""),
  paypalEnabled: z.boolean(),
  paypalClientId: z.string().optional().default(""),
  paypalClientSecret: z.string().optional().default(""),
  paypalMode: z.enum(["sandbox", "production"]).default("sandbox"),
  cashEnabled: z.boolean(),
  cashRequireSignature: z.boolean(),
  autoExpireEnabled: z.boolean(),
  expireAfterHours: z.number().min(1).max(168),
  // Captured as a percentage (e.g. 3.00) and converted to integer basis points
  // on submit. Server cap is 10% (1000 bps) — see shared/service-fee.ts.
  serviceFeePct: z.number().min(0).max(10),
  // Flat per-transaction admin fee in dollars. Converted to integer cents on
  // submit. Server cap is $100 (10000 cents) — see shared/service-fee.ts.
  serviceFeeFlat: z.number().min(0).max(100),
});

const fontOptions = [
  "Inter", "Poppins", "Roboto", "Open Sans", "Montserrat",
  "Plus Jakarta Sans", "DM Sans", "Outfit", "Space Grotesk",
  "Lora", "Playfair Display", "Merriweather",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type DnsCheckResult = {
  status: "verified" | "not_found" | "error";
  domain: string;
  txtRecordFound: boolean;
  verified: boolean;
  lastChecked: string;
  message: string;
};

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

// ─── General Tab ─────────────────────────────────────────────────────────────

type SlugStatus = "idle" | "checking" | "available" | "taken";

function GeneralTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slugConfirmOpen, setSlugConfirmOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<z.infer<typeof generalSchema> | null>(null);
  const [slugSafetyWarnings, setSlugSafetyWarnings] = useState<string[]>([]);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["/api/tenants", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const form = useForm({
    resolver: zodResolver(generalSchema),
    values: tenant
      ? { name: tenant.name || "", slug: tenant.slug || "", phone: tenant.phone || "", email: tenant.email || "", logoUrl: tenant.logoUrl || "", showPendingInterest: !!tenant.showPendingInterest }
      : { name: "", slug: "", phone: "", email: "", logoUrl: "", showPendingInterest: false },
  });

  const watchedSlug = form.watch("slug");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = watchedSlug?.trim();
    if (!trimmed || trimmed === tenant?.slug) {
      setSlugStatus("idle");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(trimmed)) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tenants/check-slug?slug=${encodeURIComponent(trimmed)}&excludeId=${tenantId}`,
          { credentials: "include" }
        );
        if (!res.ok) { setSlugStatus("idle"); return; }
        const data = await res.json();
        setSlugStatus(data.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [watchedSlug, tenant?.slug, tenantId]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof generalSchema> & { confirmSlugChange?: boolean }) =>
      apiRequest("PATCH", `/api/tenants/${tenantId}`, data),
    onSuccess: (_res, variables) => {
      const slugChanged = variables.slug !== tenant?.slug;
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      if (slugChanged) {
        queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId] });
        queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/platform/tenants", tenantId] });
      }
      setSlugStatus("idle");
      toast({ title: "Settings saved", description: slugChanged ? "URL slug has been updated. Bookmarked links using the old slug will no longer work." : undefined });
    },
    onError: (error: any, variables) => {
      const msg = error?.message || "";
      // Handle 422 requiresConfirmation — server detected active payments / API keys
      if (msg.startsWith("422:")) {
        try {
          const body = JSON.parse(msg.slice(4).trim());
          if (body.requiresConfirmation) {
            setPendingFormData(variables);
            setSlugSafetyWarnings(body.warnings || []);
            setSlugConfirmOpen(true);
            return;
          }
        } catch {}
      }
      if (msg.includes("409") || msg.toLowerCase().includes("slug")) {
        setSlugStatus("taken");
        toast({ title: "Slug already taken", description: "This URL slug is already in use. Please choose a different one.", variant: "destructive" });
      } else {
        toast({ title: "Failed to save settings", variant: "destructive" });
      }
    },
  });

  const handleFormSubmit = (data: z.infer<typeof generalSchema>) => {
    mutation.mutate(data);
  };

  const confirmSlugChange = () => {
    if (pendingFormData) {
      mutation.mutate({ ...pendingFormData, confirmSlugChange: true });
    }
    setSlugConfirmOpen(false);
    setPendingFormData(null);
  };

  if (isLoading) return <TabSkeleton />;

  const slugStatusEl = (() => {
    if (slugStatus === "checking") return (
      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1" data-testid="text-slug-checking">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking availability...
      </p>
    );
    if (slugStatus === "available") return (
      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1" data-testid="text-slug-available">
        <CheckCircle className="h-3 w-3" /> Available
      </p>
    );
    if (slugStatus === "taken") return (
      <p className="text-xs text-destructive flex items-center gap-1 mt-1" data-testid="text-slug-taken">
        <XCircle className="h-3 w-3" /> Already taken — choose a different slug
      </p>
    );
    return null;
  })();

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">General Information</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>School Name</FormLabel>
                  <FormControl><Input {...field} data-testid="input-school-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="slug" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      data-testid="input-slug"
                      onChange={(e) => {
                        const sanitized = e.target.value
                          .toLowerCase()
                          .replace(/\s+/g, "-")
                          .replace(/[^a-z0-9-]/g, "");
                        field.onChange(sanitized);
                      }}
                    />
                  </FormControl>
                  <FormDescription>Used in your school's URL (e.g. drivorata.com/site/<strong>{watchedSlug || "your-slug"}</strong>). Only lowercase letters, numbers, and hyphens.</FormDescription>
                  {slugStatusEl}
                  <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 mt-1">
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      <strong>Storefront integrations:</strong> If your storefront uses the dynamic{" "}
                      <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">GET /api/public/me</code>{" "}
                      discovery pattern, a slug change is picked up automatically on next load. If your storefront has the slug hardcoded, you will need to update it after saving.
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Email</FormLabel>
                  <FormControl><Input {...field} type="email" data-testid="input-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input {...field} data-testid="input-phone" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="logoUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl><Input {...field} data-testid="input-logo-url" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="showPendingInterest" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div className="pr-4">
                    <FormLabel className="m-0">Show "considering" hint on cohort picker</FormLabel>
                    <FormDescription>
                      Displays a soft social-proof indicator (e.g. "3 considering") next to scheduled classes on your public site when shoppers have started checkout for a cohort. Capacity and seat availability are unaffected.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-show-pending-interest"
                    />
                  </FormControl>
                </FormItem>
              )} />
              <Button
                type="submit"
                disabled={mutation.isPending || slugStatus === "taken" || slugStatus === "checking"}
                data-testid="button-save-settings"
              >
                {mutation.isPending ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={slugConfirmOpen} onOpenChange={setSlugConfirmOpen}>
        <AlertDialogContent data-testid="dialog-slug-change-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm URL Slug Change
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are changing your URL slug from <strong className="text-foreground">{tenant?.slug}</strong> to <strong className="text-foreground">{pendingFormData?.slug}</strong>. This will affect:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>All bookmarked links using the current slug will stop working</li>
                  <li>The public site URL will change immediately</li>
                  <li>External websites using your API will need to update their URLs</li>
                </ul>
                {slugSafetyWarnings.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" /> Active Integrations Detected
                    </p>
                    {slugSafetyWarnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-400">• {w}</p>
                    ))}
                  </div>
                )}
                <p className="text-sm font-medium">Are you sure you want to proceed?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-slug-change-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSlugChange}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-slug-change-confirm"
            >
              Yes, change anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Domain Tab ──────────────────────────────────────────────────────────────

function DomainTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [dnsCheckResult, setDnsCheckResult] = useState<DnsCheckResult | null>(null);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["/api/tenants", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const form = useForm({
    resolver: zodResolver(domainSchema),
    values: { customDomain: tenant?.customDomain || "" },
  });

  const saveDomainMutation = useMutation({
    mutationFn: async (data: z.infer<typeof domainSchema>) =>
      apiRequest("PATCH", `/api/tenants/${tenantId}`, { customDomain: data.customDomain, domainVerified: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId] });
      setVerificationToken(null);
      setDnsCheckResult(null);
      toast({ title: "Domain saved" });
    },
    onError: () => toast({ title: "Failed to save domain", variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/domain/verify`);
      return res.json();
    },
    onSuccess: (data) => {
      setVerificationToken(data.token);
      setDnsCheckResult(null);
      toast({ title: "Verification token generated" });
    },
    onError: () => toast({ title: "Failed to initiate verification", variant: "destructive" }),
  });

  const checkDnsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tenants/${tenantId}/domain/check`);
      return res.json() as Promise<DnsCheckResult>;
    },
    onSuccess: (data) => {
      setDnsCheckResult(data);
      if (data.verified) {
        queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId] });
        toast({ title: "Domain verified", description: "DNS TXT record found and domain is now verified." });
      } else {
        toast({ title: "DNS record not found yet", description: "Propagation can take up to 48 hours." });
      }
    },
    onError: () => toast({ title: "Failed to check DNS status", variant: "destructive" }),
  });

  if (isLoading) return <TabSkeleton />;

  const getStatusBadge = () => {
    if (tenant?.domainVerified) return (
      <Badge variant="default" className="bg-green-600" data-testid="badge-domain-verified">
        <CheckCircle className="h-3 w-3 mr-1" /> Verified
      </Badge>
    );
    if (tenant?.customDomain && tenant?.domainVerificationToken) return (
      <Badge variant="secondary" data-testid="badge-pending-verification">
        <Clock className="h-3 w-3 mr-1" /> Pending Verification
      </Badge>
    );
    if (tenant?.customDomain) return (
      <Badge variant="secondary" data-testid="badge-unverified">
        <AlertCircle className="h-3 w-3 mr-1" /> Unverified
      </Badge>
    );
    return null;
  };

  const tokenToDisplay = verificationToken || tenant?.domainVerificationToken;

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" /> Domain Configuration
          </CardTitle>
          {getStatusBadge()}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveDomainMutation.mutate(data))} className="space-y-4">
              <FormField control={form.control} name="customDomain" render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Domain</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="www.yourdrivingschool.com" data-testid="input-custom-domain" />
                  </FormControl>
                  <FormDescription>
                    Enter your custom domain. You'll need to configure DNS to point to this platform.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" disabled={saveDomainMutation.isPending} data-testid="button-save-domain">
                {saveDomainMutation.isPending ? "Saving..." : "Save Domain"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {tenant?.customDomain && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Domain Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!tokenToDisplay ? (
              <>
                <p className="text-sm text-muted-foreground">
                  To verify ownership of your domain, generate a verification token and add it as a DNS TXT record.
                </p>
                <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending} variant="outline" data-testid="button-generate-token">
                  Generate Verification Token
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">DNS TXT Record Value:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm flex-1 break-all" data-testid="text-verification-token">
                      driveSchool-verify={tokenToDisplay}
                    </code>
                    <Button size="icon" variant="ghost" onClick={() => {
                      navigator.clipboard.writeText(`driveSchool-verify=${tokenToDisplay}`);
                      toast({ title: "Copied to clipboard" });
                    }} data-testid="button-copy-token">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!tenant.domainVerified && (
                  <div className="p-3 bg-muted rounded-md space-y-2">
                    <p className="text-xs font-medium">Instructions:</p>
                    <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                      <li>Log in to your domain registrar (GoDaddy, Namecheap, etc.)</li>
                      <li>Navigate to DNS settings for <strong>{tenant.customDomain}</strong></li>
                      <li>Add a new TXT record with the value shown above</li>
                      <li>Wait for DNS propagation (can take up to 48 hours)</li>
                      <li>Use "Check DNS Status" below to verify — it will automatically confirm once found</li>
                    </ol>
                  </div>
                )}

                <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending} variant="outline" size="sm" data-testid="button-regenerate-token">
                  <RefreshCw className="h-4 w-4 mr-1" /> Regenerate Token
                </Button>

                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">DNS Propagation Status</p>
                  {dnsCheckResult && (
                    <div className={`p-3 rounded-md flex items-start gap-2 ${
                      dnsCheckResult.verified
                        ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                        : dnsCheckResult.status === "error"
                          ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                          : "bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800"
                    }`} data-testid="dns-check-result">
                      {dnsCheckResult.verified
                        ? <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                        : dnsCheckResult.status === "error"
                          ? <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                          : <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />}
                      <div>
                        <p className={`text-sm font-medium ${
                          dnsCheckResult.verified ? "text-green-800 dark:text-green-300"
                            : dnsCheckResult.status === "error" ? "text-red-800 dark:text-red-300"
                              : "text-yellow-800 dark:text-yellow-300"
                        }`} data-testid="text-dns-status">
                          {dnsCheckResult.verified ? "Verified — TXT Record Detected"
                            : dnsCheckResult.status === "error" ? "DNS Lookup Error"
                              : "TXT Record Not Found"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1" data-testid="text-dns-message">{dnsCheckResult.message}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={() => checkDnsMutation.mutate()} disabled={checkDnsMutation.isPending} variant="outline" data-testid="button-check-dns">
                      {checkDnsMutation.isPending
                        ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />Checking...</>
                        : <><Search className="h-4 w-4 mr-1" />Check DNS Status</>}
                    </Button>
                  </div>
                  {(tenant.lastDomainCheck || dnsCheckResult?.lastChecked) && (
                    <p className="text-xs text-muted-foreground" data-testid="text-last-checked">
                      Last checked: {new Date(dnsCheckResult?.lastChecked || tenant.lastDomainCheck).toLocaleString()}
                    </p>
                  )}
                  {!tenant.domainVerified && !dnsCheckResult?.verified && (
                    <p className="text-xs text-muted-foreground">
                      Click "Check DNS Status" to look up your TXT record. Once found, your domain will be verified automatically.
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tenant?.domainVerified && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" /> Domain Verified
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Your domain <strong>{tenant.customDomain}</strong> has been verified. Your site is accessible at this domain once DNS A/CNAME records are properly configured to point to this platform.
            </p>
            <p className="text-xs text-muted-foreground">
              To change your domain, enter a new domain above and save. This will reset the verification status.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Theme Tab ───────────────────────────────────────────────────────────────

function ThemeTab({ tenantId, tenantName }: { tenantId: number; tenantName: string }) {
  const { toast } = useToast();

  const { data: theme, isLoading } = useQuery({
    queryKey: ["/api/tenants", tenantId, "theme"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/theme`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const form = useForm({
    values: {
      primaryColor: theme?.primaryColor || "#2563eb",
      secondaryColor: theme?.secondaryColor || "#64748b",
      accentColor: theme?.accentColor || "#f59e0b",
      backgroundColor: theme?.backgroundColor || "#ffffff",
      textColor: theme?.textColor || "#1e293b",
      fontFamily: theme?.fontFamily || "Inter",
      headingFont: theme?.headingFont || "Inter",
      borderRadius: theme?.borderRadius || "8px",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PUT", `/api/tenants/${tenantId}/theme`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "theme"] });
      toast({ title: "Theme saved" });
    },
    onError: () => toast({ title: "Failed to save theme", variant: "destructive" }),
  });

  if (isLoading) return <TabSkeleton />;

  const watchedValues = form.watch();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Colors & Fonts</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: "primaryColor" as const, label: "Primary Color", testId: "input-primary-color" },
                  { name: "secondaryColor" as const, label: "Secondary Color", testId: "input-secondary-color" },
                  { name: "accentColor" as const, label: "Accent Color", testId: "input-accent-color" },
                  { name: "backgroundColor" as const, label: "Background", testId: "input-bg-color" },
                  { name: "textColor" as const, label: "Text Color", testId: "input-text-color" },
                ].map(({ name, label, testId }) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <input type="color" value={field.value} onChange={field.onChange}
                            className="h-9 w-9 rounded-md border cursor-pointer" data-testid={testId} />
                          <Input {...field} className="flex-1" />
                        </div>
                      </FormControl>
                    </FormItem>
                  )} />
                ))}
              </div>
              <FormField control={form.control} name="fontFamily" render={({ field }) => (
                <FormItem>
                  <FormLabel>Body Font</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-body-font"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fontOptions.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="headingFont" render={({ field }) => (
                <FormItem>
                  <FormLabel>Heading Font</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-heading-font"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {fontOptions.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-theme">
                {mutation.isPending ? "Saving..." : "Save Theme"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border p-4 space-y-3"
            style={{ backgroundColor: watchedValues.backgroundColor, color: watchedValues.textColor, fontFamily: watchedValues.fontFamily }}>
            <h3 className="text-xl font-bold" style={{ fontFamily: watchedValues.headingFont }}>{tenantName}</h3>
            <p className="text-sm opacity-70">Welcome to our driving school. We offer comprehensive driver education programs.</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="px-4 py-2 rounded-md text-sm font-medium text-white" style={{ backgroundColor: watchedValues.primaryColor }}>Primary Button</button>
              <button className="px-4 py-2 rounded-md text-sm font-medium text-white" style={{ backgroundColor: watchedValues.secondaryColor }}>Secondary</button>
              <button className="px-4 py-2 rounded-md text-sm font-medium text-white" style={{ backgroundColor: watchedValues.accentColor }}>Accent</button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────

function PaymentsTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const [stripeTestResult, setStripeTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [paypalTestResult, setPaypalTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingStripe, setTestingStripe] = useState(false);
  const [testingPaypal, setTestingPaypal] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/tenants", tenantId, "payment-settings"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/payment-settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load payment settings");
      return res.json();
    },
  });

  const { data: staleData } = useQuery({
    queryKey: ["/api/tenants", tenantId, "payments", "stale-count"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/payments/stale-count`, { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    refetchInterval: 30000,
  });

  const form = useForm<z.infer<typeof paymentSettingsSchema>>({
    resolver: zodResolver(paymentSettingsSchema),
    values: settings
      ? {
          stripeEnabled: settings.stripeEnabled ?? false,
          stripeSecretKey: settings.stripeSecretKey ?? "",
          stripePublishableKey: settings.stripePublishableKey ?? "",
          stripeWebhookSecret: settings.stripeWebhookSecret ?? "",
          paypalEnabled: settings.paypalEnabled ?? false,
          paypalClientId: settings.paypalClientId ?? "",
          paypalClientSecret: settings.paypalClientSecret ?? "",
          paypalMode: settings.paypalMode ?? "sandbox",
          cashEnabled: settings.cashEnabled ?? false,
          cashRequireSignature: settings.cashRequireSignature ?? false,
          autoExpireEnabled: settings.autoExpireEnabled ?? true,
          expireAfterHours: settings.expireAfterHours ?? 2,
          serviceFeePct: ((settings.serviceFeeBps ?? 0) as number) / 100,
          serviceFeeFlat: ((settings.serviceFeeFlatCents ?? 0) as number) / 100,
        }
      : {
          stripeEnabled: false, stripeSecretKey: "", stripePublishableKey: "", stripeWebhookSecret: "",
          paypalEnabled: false, paypalClientId: "", paypalClientSecret: "", paypalMode: "sandbox",
          cashEnabled: false, cashRequireSignature: false, autoExpireEnabled: true, expireAfterHours: 2,
          serviceFeePct: 0, serviceFeeFlat: 0,
        },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof paymentSettingsSchema>) => {
      // Convert the user-facing percentage (e.g. 3.00) into integer basis
      // points (e.g. 300) before persisting. Round to avoid floating-point
      // drift on common values like 1.05 → 105.
      const { serviceFeePct, serviceFeeFlat, ...rest } = data;
      const serviceFeeBps = Math.round((serviceFeePct ?? 0) * 100);
      const serviceFeeFlatCents = Math.round((serviceFeeFlat ?? 0) * 100);
      return apiRequest("PUT", `/api/tenants/${tenantId}/payment-settings`, {
        ...rest,
        serviceFeeBps,
        serviceFeeFlatCents,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "payment-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "payments", "stale-count"] });
      toast({ title: "Payment settings saved" });
    },
    onError: () => toast({ title: "Failed to save payment settings", variant: "destructive" }),
  });

  async function testStripeConnection() {
    setTestingStripe(true);
    setStripeTestResult(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/payment-settings/test-stripe`, { method: "POST", credentials: "include" });
      const result = await res.json();
      const isOk = res.ok && result.ok === true;
      setStripeTestResult({ success: isOk, message: result.error || result.message || (isOk ? "Connection successful" : "Connection failed") });
    } catch {
      setStripeTestResult({ success: false, message: "Connection failed" });
    } finally {
      setTestingStripe(false);
    }
  }

  async function testPaypalConnection() {
    setTestingPaypal(true);
    setPaypalTestResult(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/payment-settings/test-paypal`, { method: "POST", credentials: "include" });
      const result = await res.json();
      const isOk = res.ok && result.ok === true;
      setPaypalTestResult({ success: isOk, message: result.error || result.message || (isOk ? "Connection successful" : "Connection failed") });
    } catch {
      setPaypalTestResult({ success: false, message: "Connection failed" });
    } finally {
      setTestingPaypal(false);
    }
  }

  async function runManualCleanup() {
    setCleaningUp(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/payments/cleanup`, { method: "POST", credentials: "include" });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "payments", "stale-count"] });
      toast({ title: result.expired > 0 ? `Cleaned up ${result.expired} expired enrollment${result.expired > 1 ? "s" : ""}` : "No expired enrollments to clean up" });
    } catch {
      toast({ title: "Cleanup failed", variant: "destructive" });
    } finally {
      setCleaningUp(false);
    }
  }

  if (isLoading) return <TabSkeleton rows={4} />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <CardTitle className="text-lg">Stripe Settings</CardTitle>
              </div>
              <FormField control={form.control} name="stripeEnabled" render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Label htmlFor="stripe-toggle" className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</Label>
                  <Switch id="stripe-toggle" checked={field.value} onCheckedChange={field.onChange} data-testid="switch-stripe-enabled" />
                </div>
              )} />
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="stripeSecretKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Secret Key</FormLabel>
                  <FormControl><Input {...field} type="password" placeholder="sk_..." data-testid="input-stripe-secret-key" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="stripePublishableKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>Publishable Key</FormLabel>
                  <FormControl><Input {...field} type="password" placeholder="pk_..." data-testid="input-stripe-publishable-key" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="stripeWebhookSecret" render={({ field }) => (
                <FormItem>
                  <FormLabel>Webhook Secret (optional)</FormLabel>
                  <FormControl><Input {...field} type="password" placeholder="whsec_..." data-testid="input-stripe-webhook-secret" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex items-center gap-4 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={testStripeConnection} disabled={testingStripe} data-testid="button-test-stripe">
                  {testingStripe && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Test Connection
                </Button>
                {stripeTestResult && (
                  <div className="flex items-center gap-1 text-sm" data-testid="text-stripe-test-result">
                    {stripeTestResult.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    <span className={stripeTestResult.success ? "text-green-600" : "text-red-600"}>{stripeTestResult.message}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                <CardTitle className="text-lg">PayPal Settings</CardTitle>
              </div>
              <FormField control={form.control} name="paypalEnabled" render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Label htmlFor="paypal-toggle" className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</Label>
                  <Switch id="paypal-toggle" checked={field.value} onCheckedChange={field.onChange} data-testid="switch-paypal-enabled" />
                </div>
              )} />
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="paypalClientId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client ID</FormLabel>
                  <FormControl><Input {...field} type="password" placeholder="Client ID" data-testid="input-paypal-client-id" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="paypalClientSecret" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Secret</FormLabel>
                  <FormControl><Input {...field} type="password" placeholder="Client Secret" data-testid="input-paypal-client-secret" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="paypalMode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-paypal-mode"><SelectValue placeholder="Select mode" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex items-center gap-4 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={testPaypalConnection} disabled={testingPaypal} data-testid="button-test-paypal">
                  {testingPaypal && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Test Connection
                </Button>
                {paypalTestResult && (
                  <div className="flex items-center gap-1 text-sm" data-testid="text-paypal-test-result">
                    {paypalTestResult.success ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                    <span className={paypalTestResult.success ? "text-green-600" : "text-red-600"}>{paypalTestResult.message}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              <CardTitle className="text-lg">Cash Payments</CardTitle>
            </div>
            <FormField control={form.control} name="cashEnabled" render={({ field }) => (
              <div className="flex items-center gap-2">
                <Label htmlFor="cash-toggle" className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</Label>
                <Switch id="cash-toggle" checked={field.value} onCheckedChange={field.onChange} data-testid="switch-cash-enabled" />
              </div>
            )} />
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription>
              Allow students to select "Cash" as a payment method during enrollment. Cash payments will remain pending until an admin confirms receipt.
            </CardDescription>
            <FormField control={form.control} name="cashRequireSignature" render={({ field }) => (
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <PenLine className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <Label htmlFor="cash-signature-toggle" className="font-medium">Require Signatures</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Require both the student and staff member to sign when submitting a cash payment</p>
                </div>
                <Switch id="cash-signature-toggle" checked={field.value} onCheckedChange={field.onChange} data-testid="switch-cash-require-signature" />
              </div>
            )} />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              <CardTitle className="text-lg">Service Fee</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Optional surcharges added to card payments (Stripe and PayPal) to offset processing costs. Use either, both, or neither. Cash and external payments are never charged these fees.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="serviceFeePct"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service fee (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      step="0.01"
                      value={field.value ?? 0}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        field.onChange(Number.isFinite(v) ? v : 0);
                      }}
                      onBlur={field.onBlur}
                      data-testid="input-service-fee-pct"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    Percentage of the subtotal. Max 10%. Set to 0 to disable.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="serviceFeeFlat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Admin fee ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={field.value ?? 0}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        field.onChange(Number.isFinite(v) ? v : 0);
                      }}
                      onBlur={field.onBlur}
                      data-testid="input-service-fee-flat"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    Flat amount added per transaction. Max $100. Set to 0 to disable.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <CardTitle className="text-lg">Payment Expiry</CardTitle>
              </div>
              <CardDescription className="mt-1">Automatically expire enrollments that remain unpaid after a set time</CardDescription>
            </div>
            <FormField control={form.control} name="autoExpireEnabled" render={({ field }) => (
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-expire-toggle" className="text-sm text-muted-foreground">{field.value ? "Auto" : "Manual"}</Label>
                <Switch id="auto-expire-toggle" checked={field.value} onCheckedChange={field.onChange} data-testid="switch-auto-expire" />
              </div>
            )} />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <FormField control={form.control} name="expireAfterHours" render={({ field }) => (
                <FormItem className="flex-1 max-w-xs">
                  <FormLabel>Expire unpaid enrollments after</FormLabel>
                  <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-expire-hours"><SelectValue placeholder="Select duration" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="6">6 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">48 hours</SelectItem>
                      <SelectItem value="72">72 hours (3 days)</SelectItem>
                      <SelectItem value="168">168 hours (7 days)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex items-center gap-3">
                {staleData && staleData.count > 0 && (
                  <span className="text-sm text-muted-foreground" data-testid="text-stale-count">
                    {staleData.count} stale enrollment{staleData.count > 1 ? "s" : ""}
                  </span>
                )}
                <Button type="button" variant="outline" size="sm" onClick={runManualCleanup} disabled={cleaningUp} data-testid="button-cleanup-now">
                  {cleaningUp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Clean Up Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={mutation.isPending} data-testid="button-save-payment-settings">
          {mutation.isPending ? "Saving..." : "Save Payment Settings"}
        </Button>
      </form>
    </Form>
  );
}


// ─── Communications (Email Templates) Tab ────────────────────────────────────

interface EmailTemplateItem {
  key: "enrollment_received" | "payment_received";
  label: string;
  description: string;
  defaultSubject: string;
  defaultBody: string;
  placeholders: string[];
  subjectOverride: string | null;
  bodyOverride: string | null;
  updatedAt: string | null;
}

function CommunicationsTab({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ items: EmailTemplateItem[] }>({
    queryKey: ["/api/tenants", tenantId, "email-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tenants/${tenantId}/email-templates`);
      return res.json();
    },
  });

  if (isLoading) return <TabSkeleton rows={2} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enrollment & Payment Emails</CardTitle>
          <CardDescription>
            Customize the automatic emails students receive when they enroll and when their payment lands. Leave a field blank to use the default copy.
          </CardDescription>
        </CardHeader>
      </Card>
      {(data?.items ?? []).map((tpl) => (
        <EmailTemplateCard key={tpl.key} tenantId={tenantId} tpl={tpl} onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "email-templates"] });
          toast({ title: "Template saved" });
        }} />
      ))}
    </div>
  );
}

function EmailTemplateCard({
  tenantId,
  tpl,
  onSaved,
}: {
  tenantId: number;
  tpl: EmailTemplateItem;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(tpl.subjectOverride ?? "");
  const [body, setBody] = useState(tpl.bodyOverride ?? "");
  const isOverridden = !!(tpl.subjectOverride || tpl.bodyOverride);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/tenants/${tenantId}/email-templates/${tpl.key}`, {
        subjectOverride: subject.trim() || null,
        bodyOverride: body.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => onSaved(),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/tenants/${tenantId}/email-templates/${tpl.key}`, {
        subjectOverride: null,
        bodyOverride: null,
      });
    },
    onSuccess: () => {
      setSubject("");
      setBody("");
      onSaved();
    },
  });

  return (
    <Card data-testid={`email-template-${tpl.key}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{tpl.label}</CardTitle>
            <CardDescription>{tpl.description}</CardDescription>
          </div>
          {isOverridden && (
            <Badge variant="outline" data-testid={`badge-customized-${tpl.key}`}>Customized</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor={`subject-${tpl.key}`}>Subject line</Label>
          <Input
            id={`subject-${tpl.key}`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={tpl.defaultSubject}
            data-testid={`input-subject-${tpl.key}`}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Default: <span className="font-mono">{tpl.defaultSubject}</span>
          </p>
        </div>
        <div>
          <Label htmlFor={`body-${tpl.key}`}>Body</Label>
          <textarea
            id={`body-${tpl.key}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tpl.defaultBody}
            rows={10}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            data-testid={`textarea-body-${tpl.key}`}
          />
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer">View default body</summary>
            <pre className="text-xs bg-muted/50 rounded p-3 mt-2 whitespace-pre-wrap">{tpl.defaultBody}</pre>
          </details>
        </div>
        <div>
          <p className="text-xs font-medium mb-1">Available placeholders</p>
          <div className="flex flex-wrap gap-1">
            {tpl.placeholders.map(ph => (
              <code key={ph} className="text-xs bg-muted rounded px-1.5 py-0.5">{ph}</code>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {isOverridden && (
            <Button
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              data-testid={`button-reset-${tpl.key}`}
            >
              Reset to default
            </Button>
          )}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid={`button-save-${tpl.key}`}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TabSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full" />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { currentTenant } = useTenant();

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  const tenantId = currentTenant.tenant.id;
  const tenantName = currentTenant.tenant.name || "";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">School Settings</h1>
      <Tabs defaultValue="general">
        <TabsList className="mb-6" data-testid="settings-tabs">
          <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
          <TabsTrigger value="domain" data-testid="tab-domain">Domain</TabsTrigger>
          <TabsTrigger value="theme" data-testid="tab-theme">Theme</TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
          <TabsTrigger value="communications" data-testid="tab-communications">Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="domain">
          <DomainTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="theme">
          <ThemeTab tenantId={tenantId} tenantName={tenantName} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="communications">
          <CommunicationsTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
