import { useEffect, useRef, useState } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Shield, CheckCircle, XCircle, Loader2, Clock, Trash2, Banknote, PenLine, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  // Service fee is captured as a percentage in the form (e.g. 3.00 = 3%) and
  // converted to integer basis points on submit. Capped at 10% to match the
  // server-side guard in shared/service-fee.ts (MAX_SERVICE_FEE_BPS = 1000).
  serviceFeePct: z.number().min(0).max(10),
  // Flat per-transaction admin fee in dollars. Converted to integer cents on
  // submit. Server cap is $100 (10000 cents) — see shared/service-fee.ts.
  serviceFeeFlat: z.number().min(0).max(100),
});

type PaymentSettingsFormValues = z.infer<typeof paymentSettingsSchema>;

type StoredPaymentSettings = Partial<Record<keyof PaymentSettingsFormValues, unknown>> | null | undefined;

type CredentialFieldName =
  | "stripeSecretKey"
  | "stripePublishableKey"
  | "stripeWebhookSecret"
  | "paypalClientId"
  | "paypalClientSecret";

type SavedBadgeProps = {
  fieldName: CredentialFieldName;
  current: unknown;
  settings: StoredPaymentSettings;
};

type SecretInputProps = {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  name?: string;
  placeholder?: string;
  testId: string;
};

function SecretInput({ value, onChange, onBlur, name, placeholder, testId }: SecretInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        type={shown ? "text" : "password"}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        data-testid={testId}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        tabIndex={-1}
        aria-label={shown ? "Hide value" : "Show value"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`${testId}-toggle`}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SavedBadge({ fieldName, current, settings }: SavedBadgeProps) {
  const rawOriginal = settings ? settings[fieldName] : undefined;
  const original = typeof rawOriginal === "string" ? rawOriginal : "";
  const currentStr = typeof current === "string" ? current : "";

  if (!currentStr && !original) {
    return (
      <Badge variant="outline" className="text-xs font-normal text-muted-foreground" data-testid={`badge-${String(fieldName)}-empty`}>
        Not set
      </Badge>
    );
  }
  if (currentStr === original) {
    return (
      <Badge variant="outline" className="text-xs font-normal text-green-700 border-green-200 dark:text-green-400 dark:border-green-900" data-testid={`badge-${String(fieldName)}-saved`}>
        Saved
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs font-normal text-amber-700 border-amber-200 dark:text-amber-400 dark:border-amber-900" data-testid={`badge-${String(fieldName)}-unsaved`}>
      Unsaved changes
    </Badge>
  );
}

export default function PaymentSettingsPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;

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
    enabled: !!tenantId,
    // Avoid clobbering values the user has typed/pasted with background refetches.
    // The form is only reset from settings on initial load (see useEffect below)
    // or when the active tenant changes.
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  const { data: staleData } = useQuery({
    queryKey: ["/api/tenants", tenantId, "payments", "stale-count"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/payments/stale-count`, { credentials: "include" });
      if (!res.ok) return { count: 0, expireAfterHours: 2 };
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  // IMPORTANT: use defaultValues (NOT `values:`) so background refetches of
  // `settings` cannot wipe out a key the user has just typed/pasted into a
  // password field. We do a single explicit reset in the effect below when
  // settings first arrive or the active tenant changes.
  const form = useForm<PaymentSettingsFormValues>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues: {
      stripeEnabled: false,
      stripeSecretKey: "",
      stripePublishableKey: "",
      stripeWebhookSecret: "",
      paypalEnabled: false,
      paypalClientId: "",
      paypalClientSecret: "",
      paypalMode: "sandbox",
      cashEnabled: false,
      cashRequireSignature: false,
      autoExpireEnabled: true,
      expireAfterHours: 2,
      serviceFeePct: 0,
      serviceFeeFlat: 0,
    },
  });

  const lastResetForRef = useRef<{ tenantId: number | undefined; loaded: boolean }>({
    tenantId: undefined,
    loaded: false,
  });

  useEffect(() => {
    if (!settings) return;
    const last = lastResetForRef.current;
    // Reset only when tenant changes or this is the first load for the
    // current tenant. After that, never overwrite user input from background
    // query updates (e.g. after a save invalidation).
    if (last.tenantId === tenantId && last.loaded) return;
    form.reset({
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
    });
    lastResetForRef.current = { tenantId, loaded: true };
  }, [settings, tenantId, form]);

  const mutation = useMutation({
    mutationFn: async (data: PaymentSettingsFormValues) => {
      // Convert the user-facing percentage (e.g. 3.00) into integer basis
      // points (e.g. 300) before persisting. Round to avoid floating point
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
    onError: () => {
      toast({ title: "Failed to save payment settings", variant: "destructive" });
    },
  });

  async function testStripeConnection() {
    setTestingStripe(true);
    setStripeTestResult(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/payment-settings/test-stripe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeSecretKey: form.getValues("stripeSecretKey") ?? "",
        }),
      });
      const result = await res.json();
      const isOk = res.ok && result.ok === true;
      const baseMessage =
        result.error || result.message || (isOk ? "Connection successful" : "Connection failed");
      const sourceLabel =
        result.source === "form"
          ? " (tested key currently in form)"
          : result.source === "saved"
          ? " (tested saved key)"
          : "";
      setStripeTestResult({
        success: isOk,
        message: `${baseMessage}${sourceLabel}`,
      });
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
      const res = await fetch(`/api/tenants/${tenantId}/payment-settings/test-paypal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paypalClientId: form.getValues("paypalClientId") ?? "",
          paypalClientSecret: form.getValues("paypalClientSecret") ?? "",
          paypalMode: form.getValues("paypalMode") ?? "sandbox",
        }),
      });
      const result = await res.json();
      const isOk = res.ok && result.ok === true;
      const baseMessage =
        result.error || result.message || (isOk ? "Connection successful" : "Connection failed");
      const sourceLabel =
        result.source === "form"
          ? " (tested credentials currently in form)"
          : result.source === "saved"
          ? " (tested saved credentials)"
          : "";
      setPaypalTestResult({
        success: isOk,
        message: `${baseMessage}${sourceLabel}`,
      });
    } catch {
      setPaypalTestResult({ success: false, message: "Connection failed" });
    } finally {
      setTestingPaypal(false);
    }
  }

  async function runManualCleanup() {
    setCleaningUp(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/payments/cleanup`, {
        method: "POST",
        credentials: "include",
      });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "payments", "stale-count"] });
      toast({
        title: result.expired > 0
          ? `Cleaned up ${result.expired} expired enrollment${result.expired > 1 ? "s" : ""}`
          : "No expired enrollments to clean up",
      });
    } catch {
      toast({ title: "Cleanup failed", variant: "destructive" });
    } finally {
      setCleaningUp(false);
    }
  }

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground" data-testid="text-no-tenant">Select a school first.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <CreditCard className="h-6 w-6" />
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Payment Settings</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  <CardTitle className="text-lg">Stripe Settings</CardTitle>
                </div>
                <FormField
                  control={form.control}
                  name="stripeEnabled"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="stripe-toggle" className="text-sm text-muted-foreground">
                        {field.value ? "Enabled" : "Disabled"}
                      </Label>
                      <Switch
                        id="stripe-toggle"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-stripe-enabled"
                      />
                    </div>
                  )}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="stripeSecretKey"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Secret Key</FormLabel>
                        <SavedBadge fieldName="stripeSecretKey" current={field.value} settings={settings} />
                      </div>
                      <FormControl>
                        <SecretInput
                          name={field.name}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="sk_..."
                          testId="input-stripe-secret-key"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stripePublishableKey"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Publishable Key</FormLabel>
                        <SavedBadge fieldName="stripePublishableKey" current={field.value} settings={settings} />
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="pk_..."
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                          data-testid="input-stripe-publishable-key"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stripeWebhookSecret"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Webhook Secret (optional)</FormLabel>
                        <SavedBadge fieldName="stripeWebhookSecret" current={field.value} settings={settings} />
                      </div>
                      <FormControl>
                        <SecretInput
                          name={field.name}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="whsec_..."
                          testId="input-stripe-webhook-secret"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={testStripeConnection}
                      disabled={testingStripe}
                      data-testid="button-test-stripe"
                    >
                      {testingStripe ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Test Connection
                    </Button>
                    {stripeTestResult && (
                      <div className="flex items-center gap-1 text-sm" data-testid="text-stripe-test-result">
                        {stripeTestResult.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className={stripeTestResult.success ? "text-green-600" : "text-red-600"}>
                          {stripeTestResult.message}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tests the key currently in the form. Save your changes if you want them to apply to live checkouts.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <CardTitle className="text-lg">PayPal Settings</CardTitle>
                </div>
                <FormField
                  control={form.control}
                  name="paypalEnabled"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="paypal-toggle" className="text-sm text-muted-foreground">
                        {field.value ? "Enabled" : "Disabled"}
                      </Label>
                      <Switch
                        id="paypal-toggle"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-paypal-enabled"
                      />
                    </div>
                  )}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="paypalClientId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Client ID</FormLabel>
                        <SavedBadge fieldName="paypalClientId" current={field.value} settings={settings} />
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="Client ID"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          data-form-type="other"
                          data-testid="input-paypal-client-id"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paypalClientSecret"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Client Secret</FormLabel>
                        <SavedBadge fieldName="paypalClientSecret" current={field.value} settings={settings} />
                      </div>
                      <FormControl>
                        <SecretInput
                          name={field.name}
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="Client Secret"
                          testId="input-paypal-client-secret"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paypalMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-paypal-mode">
                            <SelectValue placeholder="Select mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="sandbox">Sandbox</SelectItem>
                          <SelectItem value="production">Production</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={testPaypalConnection}
                      disabled={testingPaypal}
                      data-testid="button-test-paypal"
                    >
                      {testingPaypal ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Test Connection
                    </Button>
                    {paypalTestResult && (
                      <div className="flex items-center gap-1 text-sm" data-testid="text-paypal-test-result">
                        {paypalTestResult.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className={paypalTestResult.success ? "text-green-600" : "text-red-600"}>
                          {paypalTestResult.message}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tests the credentials currently in the form. Save your changes if you want them to apply to live checkouts.
                  </p>
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
              <FormField
                control={form.control}
                name="cashEnabled"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="cash-toggle" className="text-sm text-muted-foreground">
                      {field.value ? "Enabled" : "Disabled"}
                    </Label>
                    <Switch
                      id="cash-toggle"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-cash-enabled"
                    />
                  </div>
                )}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <CardDescription>
                Allow students to select "Cash" as a payment method during enrollment. Cash payments will remain pending until an admin confirms receipt.
              </CardDescription>
              <FormField
                control={form.control}
                name="cashRequireSignature"
                render={({ field }) => (
                  <div className="flex items-center gap-3 p-3 rounded-md border">
                    <PenLine className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <Label htmlFor="cash-signature-toggle" className="font-medium">
                        Require Signatures
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Require both the student and staff member to sign when submitting a cash payment
                      </p>
                    </div>
                    <Switch
                      id="cash-signature-toggle"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-cash-require-signature"
                    />
                  </div>
                )}
              />
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
                <CardDescription className="mt-1">
                  Automatically expire enrollments that remain unpaid after a set time
                </CardDescription>
              </div>
              <FormField
                control={form.control}
                name="autoExpireEnabled"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="auto-expire-toggle" className="text-sm text-muted-foreground">
                      {field.value ? "Auto" : "Manual"}
                    </Label>
                    <Switch
                      id="auto-expire-toggle"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-auto-expire"
                    />
                  </div>
                )}
              />
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <FormField
                  control={form.control}
                  name="expireAfterHours"
                  render={({ field }) => (
                    <FormItem className="flex-1 max-w-xs">
                      <FormLabel>Expire unpaid enrollments after</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(parseInt(v))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-expire-hours">
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
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
                  )}
                />
                <div className="flex items-center gap-3">
                  {staleData && staleData.count > 0 && (
                    <span className="text-sm text-muted-foreground" data-testid="text-stale-count">
                      {staleData.count} stale enrollment{staleData.count > 1 ? "s" : ""}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={runManualCleanup}
                    disabled={cleaningUp}
                    data-testid="button-cleanup-now"
                  >
                    {cleaningUp ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Clean Up Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="h-20" aria-hidden />

          <div className="sticky bottom-0 left-0 right-0 -mx-6 px-6 py-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex items-center justify-between gap-3 z-10">
            <p className="text-xs text-muted-foreground" data-testid="text-save-hint">
              {form.formState.isDirty
                ? "You have unsaved changes — save before testing or before the changes go live."
                : "All changes saved."}
            </p>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save-payment-settings">
              {mutation.isPending ? "Saving..." : "Save Payment Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
