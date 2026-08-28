import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  DollarSign,
  TrendingUp,
  Wallet,
  Copy,
  Link as LinkIcon,
  Award,
} from "lucide-react";

interface DashboardData {
  code: string;
  referralLink: string;
  commissionModel: "recurring" | "hybrid" | "reseller";
  tier: string;
  activeSchools: number;
  totalSchools: number;
  totalEarnedCents: number;
  pendingPayoutCents: number;
  approvedPayoutCents: number;
  recurringRate: number;
  hybridUpfrontCents: number;
  hybridRecurringRate: number;
  resellerWholesaleCents: number;
  tierSilverThreshold: number;
  tierGoldThreshold: number;
}

interface Referral {
  id: number;
  tenantName: string;
  status: "pending" | "active" | "churned";
  referredAt: string;
  activatedAt: string | null;
}

interface Commission {
  id: number;
  type: string;
  amountCents: number;
  status: "pending" | "approved" | "paid" | "reversed";
  period: string | null;
  description: string | null;
  createdAt: string;
  invoiceId: number | null;
  invoiceAmountCents: number | null;
  tenantName: string | null;
}

interface Payout {
  id: number;
  amountCents: number;
  method: string;
  reference: string | null;
  paidAt: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString();
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
    case "approved":
    case "paid":
      return "default";
    case "pending":
      return "secondary";
    case "churned":
    case "reversed":
      return "destructive";
    default:
      return "outline";
  }
}

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function AffiliateDashboard() {
  const { toast } = useToast();

  const { data: dashboard, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["/api/affiliate/dashboard"],
  });

  const { data: referrals, isLoading: refsLoading } = useQuery<Referral[]>({
    queryKey: ["/api/affiliate/referrals"],
  });

  const { data: commissions, isLoading: commsLoading } = useQuery<Commission[]>({
    queryKey: ["/api/affiliate/commissions"],
  });

  const { data: payouts, isLoading: payoutsLoading } = useQuery<Payout[]>({
    queryKey: ["/api/affiliate/payouts"],
  });

  if (dashLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground" data-testid="text-no-dashboard-data">Unable to load dashboard data.</p>
      </div>
    );
  }

  const model = dashboard.commissionModel;

  const copyReferralLink = () => {
    navigator.clipboard.writeText(dashboard.referralLink);
    toast({ title: "Copied", description: "Referral link copied to clipboard." });
  };

  const tierProgress = () => {
    const schools = dashboard.activeSchools;
    const silverThreshold = dashboard.tierSilverThreshold;
    const goldThreshold = dashboard.tierGoldThreshold;

    if (dashboard.tier === "gold") {
      return { label: "Gold Tier", progress: 100, description: `${schools} schools (Gold achieved)` };
    }
    if (dashboard.tier === "silver") {
      const pct = Math.min(100, (schools / goldThreshold) * 100);
      return { label: "Silver Tier", progress: pct, description: `${schools}/${goldThreshold} schools to Gold` };
    }
    const pct = Math.min(100, (schools / silverThreshold) * 100);
    return { label: "Base Tier", progress: pct, description: `${schools}/${silverThreshold} schools to Silver` };
  };

  const recentCommissions = (commissions ?? []).slice(0, 10);
  const recentPayouts = (payouts ?? []).slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-affiliate-dashboard-title">Affiliate Dashboard</h1>

      {model === "recurring" && <RecurringStats dashboard={dashboard} />}
      {model === "hybrid" && <HybridStats dashboard={dashboard} />}
      {model === "reseller" && <ResellerStats dashboard={dashboard} />}

      <Card data-testid="card-referral-link">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Your Referral Link</CardTitle>
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="text-sm bg-muted px-3 py-2 rounded-md flex-1 min-w-0 truncate" data-testid="text-referral-link">
              {dashboard.referralLink}
            </code>
            <Button variant="outline" size="sm" onClick={copyReferralLink} data-testid="button-copy-referral-link">
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Code: <span className="font-mono font-medium" data-testid="text-referral-code">{dashboard.code}</span>
          </p>
        </CardContent>
      </Card>

      {(model === "recurring" || model === "hybrid") && (
        <TierProgressCard dashboard={dashboard} tierProgress={tierProgress()} />
      )}

      <Card data-testid="card-referred-schools">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Referred Schools</CardTitle>
        </CardHeader>
        <CardContent>
          {refsLoading ? (
            <Skeleton className="h-32" />
          ) : !referrals || referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-referrals">No referrals yet. Share your referral link to get started.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referred</TableHead>
                  <TableHead>Activated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((ref) => (
                  <TableRow key={ref.id} data-testid={`row-referral-${ref.id}`}>
                    <TableCell className="font-medium" data-testid={`text-referral-name-${ref.id}`}>{ref.tenantName}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(ref.status)} data-testid={`badge-referral-status-${ref.id}`}>
                        {ref.status}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`text-referral-date-${ref.id}`}>{formatDate(ref.referredAt)}</TableCell>
                    <TableCell data-testid={`text-referral-activated-${ref.id}`}>{formatDate(ref.activatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-recent-commissions">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent Commissions</CardTitle>
        </CardHeader>
        <CardContent>
          {commsLoading ? (
            <Skeleton className="h-32" />
          ) : recentCommissions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-commissions">No commissions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCommissions.map((comm) => (
                  <TableRow key={comm.id} data-testid={`row-commission-${comm.id}`}>
                    <TableCell data-testid={`text-commission-period-${comm.id}`}>{comm.period ?? "-"}</TableCell>
                    <TableCell data-testid={`text-commission-tenant-${comm.id}`}>
                      {comm.tenantName ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-commission-type-${comm.id}`}>{comm.type}</Badge>
                    </TableCell>
                    <TableCell data-testid={`text-commission-invoice-${comm.id}`}>
                      {comm.invoiceId ? (
                        <span className="text-sm">
                          #{comm.invoiceId}
                          {comm.invoiceAmountCents != null && (
                            <span className="text-muted-foreground ml-1">({formatCents(comm.invoiceAmountCents)})</span>
                          )}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-commission-amount-${comm.id}`}>
                      {formatCents(comm.amountCents)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(comm.status)} data-testid={`badge-commission-status-${comm.id}`}>
                        {comm.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-payout-history">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Payout History</CardTitle>
        </CardHeader>
        <CardContent>
          {payoutsLoading ? (
            <Skeleton className="h-32" />
          ) : recentPayouts.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-no-payouts">No payouts recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayouts.map((p) => (
                  <TableRow key={p.id} data-testid={`row-payout-${p.id}`}>
                    <TableCell data-testid={`text-payout-date-${p.id}`}>{formatDate(p.paidAt)}</TableCell>
                    <TableCell className="font-medium" data-testid={`text-payout-amount-${p.id}`}>
                      {formatCents(p.amountCents)}
                    </TableCell>
                    <TableCell data-testid={`text-payout-method-${p.id}`}>{p.method}</TableCell>
                    <TableCell className="text-muted-foreground text-sm" data-testid={`text-payout-ref-${p.id}`}>
                      {p.reference ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RecurringStats({ dashboard }: { dashboard: DashboardData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-recurring">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-active-schools">{dashboard.activeSchools}</div>
          <p className="text-xs text-muted-foreground">{dashboard.totalSchools} total referred</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Commission Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-commission-rate">{dashboard.recurringRate}%</div>
          <p className="text-xs text-muted-foreground">Monthly recurring</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-total-earned">{formatCents(dashboard.totalEarnedCents)}</div>
          <p className="text-xs text-muted-foreground">Lifetime earnings</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-pending-payout">{formatCents(dashboard.pendingPayoutCents)}</div>
          <p className="text-xs text-muted-foreground">{formatCents(dashboard.approvedPayoutCents)} approved</p>
        </CardContent>
      </Card>
    </div>
  );
}

function HybridStats({ dashboard }: { dashboard: DashboardData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-hybrid">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-active-schools">{dashboard.activeSchools}</div>
          <p className="text-xs text-muted-foreground">{dashboard.totalSchools} total referred</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Upfront Bonus</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-upfront-bonus">{formatCents(dashboard.hybridUpfrontCents)}</div>
          <p className="text-xs text-muted-foreground">Per signed school</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recurring Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-hybrid-recurring-rate">{dashboard.hybridRecurringRate}%</div>
          <p className="text-xs text-muted-foreground">Monthly recurring</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-total-earned">{formatCents(dashboard.totalEarnedCents)}</div>
          <p className="text-xs text-muted-foreground">{formatCents(dashboard.pendingPayoutCents)} pending</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ResellerStats({ dashboard }: { dashboard: DashboardData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="stats-reseller">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Schools</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-active-schools">{dashboard.activeSchools}</div>
          <p className="text-xs text-muted-foreground">{dashboard.totalSchools} total referred</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Wholesale Price</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-wholesale-price">{formatCents(dashboard.resellerWholesaleCents)}</div>
          <p className="text-xs text-muted-foreground">Per school / month</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Margin Earned</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-total-earned">{formatCents(dashboard.totalEarnedCents)}</div>
          <p className="text-xs text-muted-foreground">{formatCents(dashboard.pendingPayoutCents)} pending</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TierProgressCard({ dashboard, tierProgress }: { dashboard: DashboardData; tierProgress: { label: string; progress: number; description: string } }) {
  return (
    <Card data-testid="card-tier-progress">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Tier Progress</CardTitle>
        <Award className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Badge variant={dashboard.tier === "gold" ? "default" : "secondary"} data-testid="badge-current-tier">
            {tierLabel(dashboard.tier)} Tier
          </Badge>
          <span className="text-sm text-muted-foreground" data-testid="text-tier-description">{tierProgress.description}</span>
        </div>
        <Progress value={tierProgress.progress} className="h-2" data-testid="progress-tier" />
        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground flex-wrap">
          <span>Base</span>
          <span>Silver ({dashboard.tierSilverThreshold} schools)</span>
          <span>Gold ({dashboard.tierGoldThreshold} schools)</span>
        </div>
      </CardContent>
    </Card>
  );
}
