import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Users, GraduationCap, DollarSign, TrendingUp, UserPlus, MessageSquare, CheckCircle, FileText, Handshake, UserCheck, Banknote, CreditCard, AlertTriangle, Receipt } from "lucide-react";

interface PlatformStats {
  totalTenants: number;
  totalEnrollments: number;
  totalMembers: number;
  totalUsers: number;
  totalRevenue: number;
  recentEnrollments: number;
  recentSignups: number;
  totalTickets: number;
  openTickets: number;
  readyTickets: number;
  enrollmentsByMonth: { month: string; count: number }[];
  tenantsByMonth: { month: string; count: number }[];
  signupsByMonth: { month: string; count: number }[];
  totalAffiliates: number;
  activeAffiliates: number;
  totalCommissionsPaidCents: number;
  mrr: number;
  activeSubscriptions: number;
  totalInvoicedCents: number;
  totalCollectedCents: number;
  overdueInvoiceCount: number;
}

function StatCard({ title, value, icon: Icon, description, testId, iconClassName }: {
  title: string;
  value: string | number;
  icon: any;
  description?: string;
  testId: string;
  iconClassName?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={iconClassName || "h-4 w-4 text-muted-foreground"} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyChart({ title, data, color }: { title: string; data: { month: string; count: number }[]; color: string }) {
  if (!data || data.length === 0) return null;
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-32">
          {data.map((d) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{d.count}</span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max((d.count / maxCount) * 100, 4)}%`,
                  backgroundColor: color,
                  minHeight: "4px",
                }}
              />
              <span className="text-[9px] text-muted-foreground rotate-[-45deg] origin-top-left whitespace-nowrap">
                {d.month.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlatformOverview() {
  const { data: stats, isLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-platform-overview-title">Platform Overview</h1>
        <p className="text-muted-foreground">Monitor your driving school platform at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Schools"
          value={stats.totalTenants}
          icon={Building2}
          description="Active driving schools"
          testId="stat-total-tenants"
        />
        <StatCard
          title="Total Enrollments"
          value={stats.totalEnrollments}
          icon={GraduationCap}
          description={`${stats.recentEnrollments} in last 30 days`}
          testId="stat-total-enrollments"
        />
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          description={`${stats.recentSignups} new in last 30 days`}
          testId="stat-total-users"
        />
        <StatCard
          title="Total Revenue"
          value={`$${(stats.totalRevenue / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          description="All-time processed"
          testId="stat-total-revenue"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Recent Sign-ups"
          value={stats.recentSignups}
          icon={UserPlus}
          description="New users in last 30 days"
          testId="stat-recent-signups"
        />
        <StatCard
          title="Recent Enrollments"
          value={stats.recentEnrollments}
          icon={TrendingUp}
          description="New enrollments in last 30 days"
          testId="stat-recent-enrollments"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Open Tickets"
          value={stats.openTickets}
          icon={MessageSquare}
          iconClassName="h-4 w-4 text-yellow-500"
          description="Tickets awaiting response"
          testId="stat-open-tickets"
        />
        <StatCard
          title="Ready for Review"
          value={stats.readyTickets}
          icon={CheckCircle}
          iconClassName="h-4 w-4 text-green-500"
          description="Tickets ready for review"
          testId="stat-ready-tickets"
        />
        <StatCard
          title="Total Tickets"
          value={stats.totalTickets}
          icon={FileText}
          description="All-time support tickets"
          testId="stat-total-tickets"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="MRR"
          value={`$${(stats.mrr / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          iconClassName="h-4 w-4 text-green-500"
          description="Monthly recurring revenue"
          testId="stat-mrr"
        />
        <StatCard
          title="Active Subscriptions"
          value={stats.activeSubscriptions}
          icon={CreditCard}
          description="Paying tenants"
          testId="stat-active-subscriptions"
        />
        <StatCard
          title="Total Collected"
          value={`$${(stats.totalCollectedCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={Receipt}
          description={`$${(stats.totalInvoicedCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} invoiced`}
          testId="stat-total-collected"
        />
        <StatCard
          title="Overdue Invoices"
          value={stats.overdueInvoiceCount}
          icon={AlertTriangle}
          iconClassName={`h-4 w-4 ${stats.overdueInvoiceCount > 0 ? "text-red-500" : "text-muted-foreground"}`}
          description="Require attention"
          testId="stat-overdue-invoices"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Affiliates"
          value={stats.totalAffiliates}
          icon={Handshake}
          description="All registered affiliates"
          testId="stat-total-affiliates"
        />
        <StatCard
          title="Active Affiliates"
          value={stats.activeAffiliates}
          icon={UserCheck}
          description="Currently active affiliates"
          testId="stat-active-affiliates"
        />
        <StatCard
          title="Commissions Paid"
          value={`$${(stats.totalCommissionsPaidCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          icon={Banknote}
          description="Total commissions paid out"
          testId="stat-total-commissions-paid"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MonthlyChart
          title="Enrollments (12 months)"
          data={stats.enrollmentsByMonth}
          color="hsl(var(--primary))"
        />
        <MonthlyChart
          title="Org Growth (12 months)"
          data={stats.tenantsByMonth}
          color="hsl(var(--chart-2, 142 71% 45%))"
        />
        <MonthlyChart
          title="User Sign-ups (12 months)"
          data={stats.signupsByMonth}
          color="hsl(var(--chart-3, 221 83% 53%))"
        />
      </div>
    </div>
  );
}
