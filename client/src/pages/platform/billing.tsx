import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Plus,
  Pencil,
  CheckCircle,
  Loader2,
  Receipt,
  CreditCard,
  Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PlatformPlan, TenantInvoice } from "@shared/schema";

interface PlatformStats {
  mrr: number;
  activeSubscriptions: number;
  totalCollectedCents: number;
  totalInvoicedCents: number;
  overdueInvoiceCount: number;
}

interface EnrichedInvoice extends TenantInvoice {
  tenantName: string;
}

interface TenantBasic {
  id: number;
  name: string;
  slug: string;
  planId?: number | null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid": return "default";
    case "pending": return "secondary";
    case "failed":
    case "void": return "destructive";
    default: return "outline";
  }
}

function StatCard({ title, value, icon: Icon, description, testId }: {
  title: string;
  value: string | number;
  icon: any;
  description?: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`${testId}-value`}>{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlatformBilling() {
  const { toast } = useToast();
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlatformPlan | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState("all");

  const [planName, setPlanName] = useState("");
  const [planSlug, setPlanSlug] = useState("");
  const [planMonthly, setPlanMonthly] = useState("");
  const [planAnnual, setPlanAnnual] = useState("");
  const [planFeatures, setPlanFeatures] = useState("");
  const [planMaxLocations, setPlanMaxLocations] = useState("");
  const [planMaxStudents, setPlanMaxStudents] = useState("");
  const [planMaxInstructors, setPlanMaxInstructors] = useState("");
  const [planActive, setPlanActive] = useState(true);
  const [planSortOrder, setPlanSortOrder] = useState("0");

  const [invTenantId, setInvTenantId] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invPeriodStart, setInvPeriodStart] = useState("");
  const [invPeriodEnd, setInvPeriodEnd] = useState("");
  const [invDueDate, setInvDueDate] = useState("");
  const [invNotes, setInvNotes] = useState("");

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/platform/stats"],
  });

  const { data: plans, isLoading: plansLoading } = useQuery<PlatformPlan[]>({
    queryKey: ["/api/platform/plans"],
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<EnrichedInvoice[]>({
    queryKey: ["/api/platform/invoices"],
  });

  const { data: tenants } = useQuery<TenantBasic[]>({
    queryKey: ["/api/platform/tenants"],
  });

  const createPlanMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/platform/plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/plans"] });
      toast({ title: "Plan created" });
      closePlanDialog();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/platform/plans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/plans"] });
      toast({ title: "Plan updated" });
      closePlanDialog();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/platform/invoices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      toast({ title: "Invoice created" });
      closeInvoiceDialog();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/platform/invoices/${id}/mark-paid`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/stats"] });
      toast({ title: "Invoice marked as paid" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openAddPlan() {
    setEditingPlan(null);
    setPlanName("");
    setPlanSlug("");
    setPlanMonthly("");
    setPlanAnnual("");
    setPlanFeatures("");
    setPlanMaxLocations("");
    setPlanMaxStudents("");
    setPlanMaxInstructors("");
    setPlanActive(true);
    setPlanSortOrder("0");
    setPlanDialogOpen(true);
  }

  function openEditPlan(plan: PlatformPlan) {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanSlug(plan.slug);
    setPlanMonthly(String(plan.monthlyPriceCents / 100));
    setPlanAnnual(plan.annualPriceCents ? String(plan.annualPriceCents / 100) : "");
    setPlanFeatures((plan.features || []).join("\n"));
    setPlanMaxLocations(plan.maxLocations ? String(plan.maxLocations) : "");
    setPlanMaxStudents(plan.maxStudents ? String(plan.maxStudents) : "");
    setPlanMaxInstructors(plan.maxInstructors ? String(plan.maxInstructors) : "");
    setPlanActive(plan.active ?? true);
    setPlanSortOrder(String(plan.sortOrder ?? 0));
    setPlanDialogOpen(true);
  }

  function closePlanDialog() {
    setPlanDialogOpen(false);
    setEditingPlan(null);
  }

  function handlePlanSubmit() {
    const data = {
      name: planName,
      slug: planSlug || planName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      monthlyPriceCents: Math.round(parseFloat(planMonthly || "0") * 100),
      annualPriceCents: planAnnual ? Math.round(parseFloat(planAnnual) * 100) : null,
      features: planFeatures.split("\n").map((f) => f.trim()).filter(Boolean),
      maxLocations: planMaxLocations ? parseInt(planMaxLocations) : null,
      maxStudents: planMaxStudents ? parseInt(planMaxStudents) : null,
      maxInstructors: planMaxInstructors ? parseInt(planMaxInstructors) : null,
      active: planActive,
      sortOrder: parseInt(planSortOrder) || 0,
    };
    if (editingPlan) {
      updatePlanMutation.mutate({ id: editingPlan.id, data });
    } else {
      createPlanMutation.mutate(data);
    }
  }

  function openCreateInvoice() {
    setInvTenantId("");
    setInvAmount("");
    setInvPeriodStart("");
    setInvPeriodEnd("");
    setInvDueDate("");
    setInvNotes("");
    setInvoiceDialogOpen(true);
  }

  function closeInvoiceDialog() {
    setInvoiceDialogOpen(false);
  }

  function handleInvoiceSubmit() {
    const tid = parseInt(invTenantId);
    if (!tid) return;
    createInvoiceMutation.mutate({
      tenantId: tid,
      amountCents: Math.round(parseFloat(invAmount || "0") * 100),
      periodStart: invPeriodStart,
      periodEnd: invPeriodEnd,
      dueDate: invDueDate,
      notes: invNotes || null,
    });
  }

  function handleTenantSelectForInvoice(tenantIdStr: string) {
    setInvTenantId(tenantIdStr);
    const tid = parseInt(tenantIdStr);
    if (tid && tenants && plans) {
      const tenant = tenants.find((t: any) => t.id === tid);
      if (tenant?.planId) {
        const plan = plans.find((p) => p.id === tenant.planId);
        if (plan) {
          setInvAmount(String(plan.monthlyPriceCents / 100));
        }
      }
    }
  }

  const filteredInvoices = invoices?.filter((inv) => {
    if (invoiceFilter === "all") return true;
    if (invoiceFilter === "overdue") {
      return (inv.status === "pending" || inv.status === "failed") && new Date(inv.dueDate) < new Date();
    }
    return inv.status === invoiceFilter;
  });

  const planTenantCounts = new Map<number, number>();
  if (tenants) {
    for (const t of tenants as any[]) {
      if (t.planId) {
        planTenantCounts.set(t.planId, (planTenantCounts.get(t.planId) || 0) + 1);
      }
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-platform-billing-title">Billing</h1>
        <p className="text-muted-foreground">Manage platform billing, subscription plans, and invoices</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <StatCard
              title="Monthly Recurring Revenue"
              value={formatCents(stats?.mrr || 0)}
              icon={TrendingUp}
              testId="card-stat-mrr"
            />
            <StatCard
              title="Total Collected"
              value={formatCents(stats?.totalCollectedCents || 0)}
              icon={DollarSign}
              testId="card-stat-collected"
            />
            <StatCard
              title="Active Subscriptions"
              value={stats?.activeSubscriptions || 0}
              icon={Users}
              testId="card-stat-active-subs"
            />
            <StatCard
              title="Overdue Invoices"
              value={stats?.overdueInvoiceCount || 0}
              icon={AlertTriangle}
              testId="card-stat-overdue"
            />
          </>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-plans-heading">Subscription Plans</h2>
          <Button onClick={openAddPlan} data-testid="button-add-plan">
            <Plus className="h-4 w-4 mr-2" />
            Add Plan
          </Button>
        </div>

        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : plans && plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((plan) => (
              <Card key={plan.id} data-testid={`card-plan-${plan.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-2xl font-bold">{formatCents(plan.monthlyPriceCents)}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                    {plan.annualPriceCents && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatCents(plan.annualPriceCents)}/mo billed annually
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!plan.active && <Badge variant="secondary">Inactive</Badge>}
                    <Button size="icon" variant="ghost" onClick={() => openEditPlan(plan)} data-testid={`button-edit-plan-${plan.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" data-testid={`badge-plan-tenants-${plan.id}`}>
                      <Building2 className="h-3 w-3 mr-1" />
                      {planTenantCounts.get(plan.id) || 0} tenants
                    </Badge>
                  </div>
                  {plan.features && plan.features.length > 0 && (
                    <ul className="text-sm space-y-1">
                      {plan.features.slice(0, 5).map((f, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className="text-xs text-muted-foreground">+{plan.features.length - 5} more</li>
                      )}
                    </ul>
                  )}
                  <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>{plan.maxLocations ? `${plan.maxLocations} locations` : "Unlimited locations"}</span>
                    <span>{plan.maxStudents ? `${plan.maxStudents} students` : "Unlimited students"}</span>
                    <span>{plan.maxInstructors ? `${plan.maxInstructors} instructors` : "Unlimited instructors"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No subscription plans yet. Create your first plan to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-invoices-heading">Invoices</h2>
          <Button onClick={openCreateInvoice} data-testid="button-create-invoice">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        <Tabs value={invoiceFilter} onValueChange={setInvoiceFilter} data-testid="tabs-invoice-filter">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-filter-all">All</TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-filter-pending">Pending</TabsTrigger>
            <TabsTrigger value="paid" data-testid="tab-filter-paid">Paid</TabsTrigger>
            <TabsTrigger value="overdue" data-testid="tab-filter-overdue">Overdue</TabsTrigger>
            <TabsTrigger value="failed" data-testid="tab-filter-failed">Failed</TabsTrigger>
          </TabsList>

          <TabsContent value={invoiceFilter} className="mt-4">
            {invoicesLoading ? (
              <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
            ) : filteredInvoices && filteredInvoices.length > 0 ? (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Paid Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((inv) => {
                        const isOverdue = (inv.status === "pending" || inv.status === "failed") && new Date(inv.dueDate) < new Date();
                        return (
                          <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                            <TableCell className="font-medium" data-testid={`text-invoice-tenant-${inv.id}`}>
                              {inv.tenantName}
                            </TableCell>
                            <TableCell data-testid={`text-invoice-amount-${inv.id}`}>
                              {formatCents(inv.amountCents)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(inv.status)} data-testid={`badge-invoice-status-${inv.id}`}>
                                {isOverdue ? "Overdue" : inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm" data-testid={`text-invoice-due-${inv.id}`}>
                              {formatDate(inv.dueDate)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(inv.paidAt)}
                            </TableCell>
                            <TableCell>
                              {(inv.status === "pending" || inv.status === "failed") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => markPaidMutation.mutate(inv.id)}
                                  disabled={markPaidMutation.isPending}
                                  data-testid={`button-mark-paid-${inv.id}`}
                                >
                                  {markPaidMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                  ) : (
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                  )}
                                  Mark Paid
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Receipt className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {invoiceFilter === "all" ? "No invoices yet." : `No ${invoiceFilter} invoices.`}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-plan">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Plan" : "Add Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-name">Name</Label>
                <Input id="plan-name" value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Professional" data-testid="input-plan-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-slug">Slug</Label>
                <Input id="plan-slug" value={planSlug} onChange={(e) => setPlanSlug(e.target.value)} placeholder="professional" data-testid="input-plan-slug" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-monthly">Monthly Price ($)</Label>
                <Input id="plan-monthly" type="number" value={planMonthly} onChange={(e) => setPlanMonthly(e.target.value)} placeholder="299" data-testid="input-plan-monthly" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-annual">Annual Price/mo ($)</Label>
                <Input id="plan-annual" type="number" value={planAnnual} onChange={(e) => setPlanAnnual(e.target.value)} placeholder="249" data-testid="input-plan-annual" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-features">Features (one per line)</Label>
              <Textarea id="plan-features" value={planFeatures} onChange={(e) => setPlanFeatures(e.target.value)} rows={4} placeholder={"Online scheduling\nPayment processing\nStudent portal"} data-testid="input-plan-features" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-max-locations">Max Locations</Label>
                <Input id="plan-max-locations" type="number" value={planMaxLocations} onChange={(e) => setPlanMaxLocations(e.target.value)} placeholder="Unlimited" data-testid="input-plan-max-locations" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-max-students">Max Students</Label>
                <Input id="plan-max-students" type="number" value={planMaxStudents} onChange={(e) => setPlanMaxStudents(e.target.value)} placeholder="Unlimited" data-testid="input-plan-max-students" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-max-instructors">Max Instructors</Label>
                <Input id="plan-max-instructors" type="number" value={planMaxInstructors} onChange={(e) => setPlanMaxInstructors(e.target.value)} placeholder="Unlimited" data-testid="input-plan-max-instructors" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan-sort">Sort Order</Label>
                <Input id="plan-sort" type="number" value={planSortOrder} onChange={(e) => setPlanSortOrder(e.target.value)} data-testid="input-plan-sort" />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch id="plan-active" checked={planActive} onCheckedChange={setPlanActive} data-testid="switch-plan-active" />
                <Label htmlFor="plan-active">Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePlanDialog} data-testid="button-plan-cancel">Cancel</Button>
            <Button
              onClick={handlePlanSubmit}
              disabled={!planName || !planMonthly || createPlanMutation.isPending || updatePlanMutation.isPending}
              data-testid="button-plan-submit"
            >
              {(createPlanMutation.isPending || updatePlanMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingPlan ? "Save Changes" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-invoice">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select value={invTenantId} onValueChange={handleTenantSelectForInvoice}>
                <SelectTrigger data-testid="select-invoice-tenant">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants?.map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-amount">Amount ($)</Label>
              <Input id="inv-amount" type="number" value={invAmount} onChange={(e) => setInvAmount(e.target.value)} placeholder="299.00" data-testid="input-invoice-amount" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inv-period-start">Period Start</Label>
                <Input id="inv-period-start" type="date" value={invPeriodStart} onChange={(e) => setInvPeriodStart(e.target.value)} data-testid="input-invoice-period-start" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-period-end">Period End</Label>
                <Input id="inv-period-end" type="date" value={invPeriodEnd} onChange={(e) => setInvPeriodEnd(e.target.value)} data-testid="input-invoice-period-end" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-due-date">Due Date</Label>
              <Input id="inv-due-date" type="date" value={invDueDate} onChange={(e) => setInvDueDate(e.target.value)} data-testid="input-invoice-due-date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea id="inv-notes" value={invNotes} onChange={(e) => setInvNotes(e.target.value)} rows={2} data-testid="input-invoice-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeInvoiceDialog} data-testid="button-invoice-cancel">Cancel</Button>
            <Button
              onClick={handleInvoiceSubmit}
              disabled={!invTenantId || !invAmount || !invPeriodStart || !invPeriodEnd || !invDueDate || createInvoiceMutation.isPending}
              data-testid="button-invoice-submit"
            >
              {createInvoiceMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
