import { useTenant } from "@/lib/tenant-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, CheckCircle, AlertCircle, Copy, RefreshCw, Clock, XCircle, Search, LogIn } from "lucide-react";
import { useState } from "react";
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

const domainSchema = z.object({
  customDomain: z.string().min(1, "Domain is required"),
});

type DnsCheckResult = {
  status: "verified" | "not_found" | "error";
  domain: string;
  txtRecordFound: boolean;
  verified: boolean;
  lastChecked: string;
  message: string;
};

export default function DomainPage() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = currentTenant?.tenant.id;
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [dnsCheckResult, setDnsCheckResult] = useState<DnsCheckResult | null>(null);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["/api/tenants", tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const form = useForm({
    resolver: zodResolver(domainSchema),
    values: {
      customDomain: tenant?.customDomain || "",
    },
  });

  const saveDomainMutation = useMutation({
    mutationFn: async (data: z.infer<typeof domainSchema>) => {
      return apiRequest("PATCH", `/api/tenants/${tenantId}`, {
        customDomain: data.customDomain,
        domainVerified: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId] });
      setVerificationToken(null);
      setDnsCheckResult(null);
      toast({ title: "Domain saved" });
    },
    onError: () => {
      toast({ title: "Failed to save domain", variant: "destructive" });
    },
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
    onError: () => {
      toast({ title: "Failed to initiate verification", variant: "destructive" });
    },
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
    onError: () => {
      toast({ title: "Failed to check DNS status", variant: "destructive" });
    },
  });

  if (!currentTenant) {
    return <div className="p-6 text-muted-foreground">Select a school first.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const getStatusBadge = () => {
    if (tenant?.domainVerified) {
      return (
        <Badge variant="default" className="bg-green-600" data-testid="badge-domain-verified">
          <CheckCircle className="h-3 w-3 mr-1" /> Verified
        </Badge>
      );
    }
    if (tenant?.customDomain && tenant?.domainVerificationToken) {
      return (
        <Badge variant="secondary" data-testid="badge-pending-verification">
          <Clock className="h-3 w-3 mr-1" /> Pending Verification
        </Badge>
      );
    }
    if (tenant?.customDomain) {
      return (
        <Badge variant="secondary" data-testid="badge-unverified">
          <AlertCircle className="h-3 w-3 mr-1" /> Unverified
        </Badge>
      );
    }
    return null;
  };

  const formatLastChecked = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const tokenToDisplay = verificationToken || tenant?.domainVerificationToken;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Custom Domain</h1>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Domain Configuration
          </CardTitle>
          {getStatusBadge()}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => saveDomainMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="customDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Domain</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="www.yourdrivingschool.com"
                        data-testid="input-custom-domain"
                      />
                    </FormControl>
                    <FormDescription>
                      Enter your custom domain. You'll need to configure DNS to point to this platform.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={saveDomainMutation.isPending}
                data-testid="button-save-domain"
              >
                {saveDomainMutation.isPending ? "Saving..." : "Save Domain"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {tenant?.customDomain && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Domain Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!tokenToDisplay ? (
              <>
                <p className="text-sm text-muted-foreground">
                  To verify ownership of your domain, generate a verification token and add it as a DNS TXT record.
                </p>
                <Button
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  variant="outline"
                  data-testid="button-generate-token"
                >
                  Generate Verification Token
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">DNS TXT Record Value:</p>
                  <div className="flex items-center gap-2">
                    <code
                      className="text-sm flex-1 break-all"
                      data-testid="text-verification-token"
                    >
                      driveSchool-verify={tokenToDisplay}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(`driveSchool-verify=${tokenToDisplay}`);
                        toast({ title: "Copied to clipboard" });
                      }}
                      data-testid="button-copy-token"
                    >
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

                {!tenant.domainVerified && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={verifyMutation.isPending}
                        data-testid="button-regenerate-token"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Regenerate Token
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate Verification Token?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will create a new token and invalidate the current one. Your DNS TXT record at your domain registrar will no longer match and verification will fail until you update it with the new value.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => verifyMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid="button-confirm-regenerate"
                        >
                          Yes, Regenerate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">DNS Propagation Status</p>

                  {dnsCheckResult && (
                    <div
                      className={`p-3 rounded-md flex items-start gap-2 ${
                        dnsCheckResult.verified
                          ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                          : dnsCheckResult.status === "error"
                            ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                            : "bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800"
                      }`}
                      data-testid="dns-check-result"
                    >
                      {dnsCheckResult.verified ? (
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                      ) : dnsCheckResult.status === "error" ? (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            dnsCheckResult.verified
                              ? "text-green-800 dark:text-green-300"
                              : dnsCheckResult.status === "error"
                                ? "text-red-800 dark:text-red-300"
                                : "text-yellow-800 dark:text-yellow-300"
                          }`}
                          data-testid="text-dns-status"
                        >
                          {dnsCheckResult.verified
                            ? "Verified — TXT Record Detected"
                            : dnsCheckResult.status === "error"
                              ? "DNS Lookup Error"
                              : "TXT Record Not Found"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1" data-testid="text-dns-message">
                          {dnsCheckResult.message}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={() => checkDnsMutation.mutate()}
                      disabled={checkDnsMutation.isPending}
                      variant="outline"
                      data-testid="button-check-dns"
                    >
                      {checkDnsMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-1" />
                          Check DNS Status
                        </>
                      )}
                    </Button>
                  </div>

                  {(tenant.lastDomainCheck || dnsCheckResult?.lastChecked) && (
                    <p className="text-xs text-muted-foreground" data-testid="text-last-checked">
                      Last checked: {formatLastChecked(dnsCheckResult?.lastChecked || tenant.lastDomainCheck)}
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
              <CheckCircle className="h-5 w-5 text-green-600" />
              Domain Verified
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

      {tenant?.domainVerified && (() => {
        const baseDomain = (tenant.customDomain || "").replace(/^www\./, "");
        const portalDomain = `portal.${baseDomain}`;
        const portalUrl = `https://${portalDomain}/login?tenant=${currentTenant?.tenant.slug}`;
        const adminUrl = `https://${portalDomain}/admin`;
        return (
          <Card data-testid="card-staff-portal">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <LogIn className="h-5 w-5 text-blue-600" />
                Staff Portal URL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Share this URL with your staff. The login page displays your school's name and logo. After signing in, staff access the admin dashboard at{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">{adminUrl}</code>.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all" data-testid="text-portal-url">
                    {portalUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-copy-portal-url"
                    onClick={() => {
                      navigator.clipboard.writeText(portalUrl);
                      toast({ title: "Portal URL copied" });
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">DNS Setup for Staff Portal</p>
                <p className="text-xs text-muted-foreground">
                  Add these DNS records to your domain provider for the <code className="bg-muted px-1 rounded">{portalDomain}</code> subdomain:
                </p>
                <div className="bg-muted rounded p-3 space-y-1 text-xs font-mono">
                  <p>A&nbsp;&nbsp;&nbsp;&nbsp;portal&nbsp;&nbsp;&nbsp;&nbsp;34.111.179.208</p>
                  <p>TXT&nbsp;&nbsp;portal&nbsp;&nbsp;&nbsp;&nbsp;replit-verify=<span className="text-muted-foreground italic">(your Replit verification token)</span></p>
                </div>
                <p className="text-xs text-muted-foreground">
                  The portal subdomain must also be added as a published domain on the Drivorata backend in Replit's deployment settings.
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
