import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  UserPlus,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  Check,
  Pencil,
} from "lucide-react";
import type { Affiliate, MarketingProgramSettings, AffiliateCommission, AffiliatePayout, AffiliateApplication } from "@shared/schema";
import { ClipboardList, CheckCircle2, XCircle, Eye, Mail, Phone, Globe, Building2 } from "lucide-react";

interface AffiliateWithStats extends Affiliate {
  userName: string;
  userEmail: string;
  schoolCount: number;
  totalEarnedCents: number;
}

interface AffiliateDetail extends Affiliate {
  referrals: Array<{
    id: number;
    tenantId: number;
    status: string;
    referredAt: string;
    activatedAt: string | null;
    churnedAt: string | null;
  }>;
  stats: {
    totalReferrals: number;
    activeSchools: number;
    totalEarnedCents: number;
    pendingCents: number;
    tier: string;
    commissionModel: string;
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function modelBadgeVariant(model: string): "default" | "secondary" | "outline" {
  switch (model) {
    case "recurring": return "default";
    case "hybrid": return "secondary";
    case "reseller": return "outline";
    default: return "default";
  }
}

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active": return "default";
    case "suspended": return "destructive";
    case "inactive": return "secondary";
    default: return "outline";
  }
}

function tierBadgeVariant(tier: string): "default" | "secondary" | "outline" {
  switch (tier) {
    case "gold": return "default";
    case "silver": return "secondary";
    default: return "outline";
  }
}

export default function PlatformAffiliatesPage() {
  const { toast } = useToast();
  const [viewTab, setViewTab] = useState("affiliates");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editAffiliate, setEditAffiliate] = useState<AffiliateWithStats | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutAffiliateId, setPayoutAffiliateId] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [addEmail, setAddEmail] = useState("");
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addModel, setAddModel] = useState("");
  const [addRecurringRate, setAddRecurringRate] = useState<number | "">("");
  const [addHybridUpfront, setAddHybridUpfront] = useState<number | "">("");
  const [addHybridRecurring, setAddHybridRecurring] = useState<number | "">("");
  const [addResellerWholesale, setAddResellerWholesale] = useState<number | "">("");

  const [editModel, setEditModel] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editRecurringRate, setEditRecurringRate] = useState<number | "">("");
  const [editHybridUpfront, setEditHybridUpfront] = useState<number | "">("");
  const [editHybridRecurring, setEditHybridRecurring] = useState<number | "">("");
  const [editResellerWholesale, setEditResellerWholesale] = useState<number | "">("");
  const [editPaypalEmail, setEditPaypalEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [payoutAmount, setPayoutAmount] = useState<number | "">("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [addingFromAppId, setAddingFromAppId] = useState<number | null>(null);

  const { data: affiliates, isLoading } = useQuery<AffiliateWithStats[]>({
    queryKey: ["/api/platform/affiliates"],
  });

  const { data: settings } = useQuery<MarketingProgramSettings>({
    queryKey: ["/api/platform/marketing-settings"],
  });

  const { data: applications, isLoading: appsLoading } = useQuery<AffiliateApplication[]>({
    queryKey: ["/api/platform/affiliate-applications"],
  });

  const pendingAppsCount = applications?.filter((a) => a.status === "pending").length || 0;

  const updateAppMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { status: string; notes?: string | null } }) => {
      const res = await apiRequest("PATCH", `/api/platform/affiliate-applications/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update application");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/affiliate-applications"] });
      toast({ title: "Application updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const enabledModels = settings?.enabledModels || [];

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/platform/affiliates", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create affiliate");
      }
      return res.json();
    },
    onSuccess: async () => {
      if (addingFromAppId) {
        try {
          await apiRequest("PATCH", `/api/platform/affiliate-applications/${addingFromAppId}`, { status: "converted" });
          queryClient.invalidateQueries({ queryKey: ["/api/platform/affiliate-applications"] });
        } catch {}
        setAddingFromAppId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/platform/affiliates"] });
      toast({ title: "Affiliate created", description: "The affiliate has been added successfully." });
      resetAddForm();
      setAddDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/platform/affiliates/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update affiliate");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/affiliates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform/affiliates", expandedId] });
      toast({ title: "Affiliate updated", description: "Changes have been saved." });
      setEditDialogOpen(false);
      setEditAffiliate(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const payoutMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiRequest("POST", `/api/platform/affiliates/${id}/payouts`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to record payout");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/affiliates"] });
      if (payoutAffiliateId) {
        queryClient.invalidateQueries({ queryKey: ["/api/platform/affiliates", payoutAffiliateId, "payouts"] });
      }
      toast({ title: "Payout recorded", description: "The payout has been recorded." });
      setPayoutDialogOpen(false);
      setPayoutAffiliateId(null);
      setPayoutAmount("");
      setPayoutMethod("");
      setPayoutReference("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function resetAddForm() {
    setAddEmail("");
    setAddFirstName("");
    setAddLastName("");
    setAddModel("");
    setAddRecurringRate("");
    setAddHybridUpfront("");
    setAddHybridRecurring("");
    setAddResellerWholesale("");
  }

  function handleAdd() {
    const data: Record<string, unknown> = {
      email: addEmail,
      firstName: addFirstName || undefined,
      lastName: addLastName || undefined,
      commissionModel: addModel,
    };
    if (addModel === "recurring" && addRecurringRate !== "") {
      data.recurringRate = addRecurringRate;
    }
    if (addModel === "hybrid") {
      if (addHybridUpfront !== "") data.hybridUpfrontCents = Math.round(Number(addHybridUpfront) * 100);
      if (addHybridRecurring !== "") data.hybridRecurringRate = addHybridRecurring;
    }
    if (addModel === "reseller" && addResellerWholesale !== "") {
      data.resellerWholesaleCents = Math.round(Number(addResellerWholesale) * 100);
    }
    createMutation.mutate(data);
  }

  function openEditDialog(aff: AffiliateWithStats) {
    setEditAffiliate(aff);
    setEditModel(aff.commissionModel);
    setEditStatus(aff.status);
    setEditRecurringRate(aff.recurringRate ?? "");
    setEditHybridUpfront(aff.hybridUpfrontCents ? aff.hybridUpfrontCents / 100 : "");
    setEditHybridRecurring(aff.hybridRecurringRate ?? "");
    setEditResellerWholesale(aff.resellerWholesaleCents ? aff.resellerWholesaleCents / 100 : "");
    setEditPaypalEmail(aff.paypalEmail || "");
    setEditNotes(aff.notes || "");
    setEditDialogOpen(true);
  }

  function handleEdit() {
    if (!editAffiliate) return;
    const data: Record<string, unknown> = {
      commissionModel: editModel,
      status: editStatus,
      paypalEmail: editPaypalEmail || null,
      notes: editNotes || null,
    };
    if (editModel === "recurring") {
      data.recurringRate = editRecurringRate !== "" ? editRecurringRate : null;
    }
    if (editModel === "hybrid") {
      data.hybridUpfrontCents = editHybridUpfront !== "" ? Math.round(Number(editHybridUpfront) * 100) : null;
      data.hybridRecurringRate = editHybridRecurring !== "" ? editHybridRecurring : null;
    }
    if (editModel === "reseller") {
      data.resellerWholesaleCents = editResellerWholesale !== "" ? Math.round(Number(editResellerWholesale) * 100) : null;
    }
    updateMutation.mutate({ id: editAffiliate.id, data });
  }

  function handleRecordPayout() {
    if (!payoutAffiliateId || payoutAmount === "" || !payoutMethod) return;
    payoutMutation.mutate({
      id: payoutAffiliateId,
      data: {
        amountCents: Math.round(Number(payoutAmount) * 100),
        method: payoutMethod,
        reference: payoutReference || null,
      },
    });
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const filtered = (affiliates || []).filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (modelFilter !== "all" && a.commissionModel !== modelFilter) return false;
    return true;
  });

  const totalAffiliates = affiliates?.length || 0;
  const activeAffiliates = affiliates?.filter((a) => a.status === "active").length || 0;
  const totalPaidCents = affiliates?.reduce((sum, a) => sum + a.totalEarnedCents, 0) || 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-affiliates">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Affiliate Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage affiliates, view performance, and record payouts.
          </p>
        </div>
        <Button onClick={() => { resetAddForm(); setAddingFromAppId(null); setAddDialogOpen(true); }} data-testid="button-add-affiliate">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Affiliate
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-stat-total">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Affiliates</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-affiliates">{totalAffiliates}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-active">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Affiliates</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-affiliates">{activeAffiliates}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-paid">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commissions Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-paid">{formatCents(totalPaidCents)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={viewTab} onValueChange={setViewTab}>
        <TabsList data-testid="tabs-view-toggle">
          <TabsTrigger value="affiliates" data-testid="tab-view-affiliates">
            <Users className="h-4 w-4 mr-1.5" />
            Affiliates
          </TabsTrigger>
          <TabsTrigger value="applications" data-testid="tab-view-applications" className="relative">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Applications
            {pendingAppsCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold" data-testid="badge-pending-apps-count">
                {pendingAppsCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewTab === "affiliates" && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList data-testid="tabs-status-filter">
                <TabsTrigger value="all" data-testid="tab-status-all">All</TabsTrigger>
                <TabsTrigger value="active" data-testid="tab-status-active">Active</TabsTrigger>
                <TabsTrigger value="suspended" data-testid="tab-status-suspended">Suspended</TabsTrigger>
                <TabsTrigger value="inactive" data-testid="tab-status-inactive">Inactive</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-model-filter">
                <SelectValue placeholder="All Models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="reseller">Reseller</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table data-testid="table-affiliates">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Schools</TableHead>
                    <TableHead className="text-right">Total Earned</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground" data-testid="text-no-affiliates">
                        No affiliates found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((aff) => (
                      <AffiliateRow
                        key={aff.id}
                        affiliate={aff}
                        isExpanded={expandedId === aff.id}
                        onToggle={() => setExpandedId(expandedId === aff.id ? null : aff.id)}
                        onEdit={() => openEditDialog(aff)}
                        onRecordPayout={() => { setPayoutAffiliateId(aff.id); setPayoutDialogOpen(true); }}
                        copiedCode={copiedCode}
                        onCopyCode={copyCode}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {viewTab === "applications" && (
        <ApplicationsSection
          applications={applications || []}
          isLoading={appsLoading}
          onUpdateStatus={(id, status) => updateAppMutation.mutate({ id, data: { status } })}
          isPending={updateAppMutation.isPending}
          onAddAsAffiliate={(app) => {
            setAddingFromAppId(app.id);
            setAddEmail(app.email);
            setAddFirstName(app.firstName);
            setAddLastName(app.lastName);
            if (app.preferredModel && enabledModels.includes(app.preferredModel)) {
              setAddModel(app.preferredModel);
            }
            setAddDialogOpen(true);
          }}
        />
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent data-testid="dialog-add-affiliate">
          <DialogHeader>
            <DialogTitle>Add Affiliate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} data-testid="input-add-email" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-first">First Name</Label>
                <Input id="add-first" value={addFirstName} onChange={(e) => setAddFirstName(e.target.value)} data-testid="input-add-first-name" />
              </div>
              <div>
                <Label htmlFor="add-last">Last Name</Label>
                <Input id="add-last" value={addLastName} onChange={(e) => setAddLastName(e.target.value)} data-testid="input-add-last-name" />
              </div>
            </div>
            <div>
              <Label>Commission Model</Label>
              <Select value={addModel} onValueChange={(v) => setAddModel(v)}>
                <SelectTrigger data-testid="select-add-model">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {enabledModels.includes("recurring") && <SelectItem value="recurring">Recurring</SelectItem>}
                  {enabledModels.includes("hybrid") && <SelectItem value="hybrid">Hybrid</SelectItem>}
                  {enabledModels.includes("reseller") && <SelectItem value="reseller">Reseller</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {addModel === "recurring" && (
              <div>
                <Label htmlFor="add-recurring-rate">Commission Rate (%)</Label>
                <Input
                  id="add-recurring-rate"
                  type="number"
                  min={0}
                  max={100}
                  placeholder={settings?.recurringDefaultRate?.toString() || "25"}
                  value={addRecurringRate}
                  onChange={(e) => setAddRecurringRate(e.target.value ? Number(e.target.value) : "")}
                  data-testid="input-add-recurring-rate"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank to use platform default ({settings?.recurringDefaultRate || 25}%)</p>
              </div>
            )}
            {addModel === "hybrid" && (
              <>
                <div>
                  <Label htmlFor="add-hybrid-upfront">Upfront Bonus ($)</Label>
                  <Input
                    id="add-hybrid-upfront"
                    type="number"
                    min={0}
                    placeholder={settings ? (settings.hybridDefaultUpfrontCents / 100).toString() : "300"}
                    value={addHybridUpfront}
                    onChange={(e) => setAddHybridUpfront(e.target.value ? Number(e.target.value) : "")}
                    data-testid="input-add-hybrid-upfront"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to use platform default ({formatCents(settings?.hybridDefaultUpfrontCents || 30000)})</p>
                </div>
                <div>
                  <Label htmlFor="add-hybrid-recurring">Recurring Rate (%)</Label>
                  <Input
                    id="add-hybrid-recurring"
                    type="number"
                    min={0}
                    max={100}
                    placeholder={settings?.hybridDefaultRecurringRate?.toString() || "15"}
                    value={addHybridRecurring}
                    onChange={(e) => setAddHybridRecurring(e.target.value ? Number(e.target.value) : "")}
                    data-testid="input-add-hybrid-recurring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to use platform default ({settings?.hybridDefaultRecurringRate || 15}%)</p>
                </div>
              </>
            )}
            {addModel === "reseller" && (
              <div>
                <Label htmlFor="add-reseller-wholesale">Wholesale Price ($)</Label>
                <Input
                  id="add-reseller-wholesale"
                  type="number"
                  min={0}
                  placeholder={settings ? (settings.resellerDefaultWholesaleCents / 100).toString() : "180"}
                  value={addResellerWholesale}
                  onChange={(e) => setAddResellerWholesale(e.target.value ? Number(e.target.value) : "")}
                  data-testid="input-add-reseller-wholesale"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank to use platform default ({formatCents(settings?.resellerDefaultWholesaleCents || 18000)})</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">Cancel</Button>
            <Button onClick={handleAdd} disabled={!addEmail || !addModel || createMutation.isPending} data-testid="button-confirm-add">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Affiliate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-affiliate">
          <DialogHeader>
            <DialogTitle>Edit Affiliate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Commission Model</Label>
              <Select value={editModel} onValueChange={setEditModel}>
                <SelectTrigger data-testid="select-edit-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {enabledModels.includes("recurring") && <SelectItem value="recurring">Recurring</SelectItem>}
                  {enabledModels.includes("hybrid") && <SelectItem value="hybrid">Hybrid</SelectItem>}
                  {enabledModels.includes("reseller") && <SelectItem value="reseller">Reseller</SelectItem>}
                  {!enabledModels.includes(editModel) && editModel && <SelectItem value={editModel}>{editModel} (disabled)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editModel === "recurring" && (
              <div>
                <Label htmlFor="edit-recurring-rate">Commission Rate (%)</Label>
                <Input
                  id="edit-recurring-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={editRecurringRate}
                  onChange={(e) => setEditRecurringRate(e.target.value ? Number(e.target.value) : "")}
                  data-testid="input-edit-recurring-rate"
                />
              </div>
            )}
            {editModel === "hybrid" && (
              <>
                <div>
                  <Label htmlFor="edit-hybrid-upfront">Upfront Bonus ($)</Label>
                  <Input
                    id="edit-hybrid-upfront"
                    type="number"
                    min={0}
                    value={editHybridUpfront}
                    onChange={(e) => setEditHybridUpfront(e.target.value ? Number(e.target.value) : "")}
                    data-testid="input-edit-hybrid-upfront"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-hybrid-recurring">Recurring Rate (%)</Label>
                  <Input
                    id="edit-hybrid-recurring"
                    type="number"
                    min={0}
                    max={100}
                    value={editHybridRecurring}
                    onChange={(e) => setEditHybridRecurring(e.target.value ? Number(e.target.value) : "")}
                    data-testid="input-edit-hybrid-recurring"
                  />
                </div>
              </>
            )}
            {editModel === "reseller" && (
              <div>
                <Label htmlFor="edit-reseller-wholesale">Wholesale Price ($)</Label>
                <Input
                  id="edit-reseller-wholesale"
                  type="number"
                  min={0}
                  value={editResellerWholesale}
                  onChange={(e) => setEditResellerWholesale(e.target.value ? Number(e.target.value) : "")}
                  data-testid="input-edit-reseller-wholesale"
                />
              </div>
            )}
            <div>
              <Label htmlFor="edit-paypal">PayPal Email</Label>
              <Input
                id="edit-paypal"
                type="email"
                value={editPaypalEmail}
                onChange={(e) => setEditPaypalEmail(e.target.value)}
                data-testid="input-edit-paypal"
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="resize-none"
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">Cancel</Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending} data-testid="button-confirm-edit">
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen}>
        <DialogContent data-testid="dialog-record-payout">
          <DialogHeader>
            <DialogTitle>Record Payout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="payout-amount">Amount ($)</Label>
              <Input
                id="payout-amount"
                type="number"
                min={0}
                step={0.01}
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value ? Number(e.target.value) : "")}
                data-testid="input-payout-amount"
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                <SelectTrigger data-testid="select-payout-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payout-ref">Reference</Label>
              <Input
                id="payout-ref"
                value={payoutReference}
                onChange={(e) => setPayoutReference(e.target.value)}
                placeholder="Transaction ID, check number, etc."
                data-testid="input-payout-reference"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutDialogOpen(false)} data-testid="button-cancel-payout">Cancel</Button>
            <Button onClick={handleRecordPayout} disabled={payoutAmount === "" || !payoutMethod || payoutMutation.isPending} data-testid="button-confirm-payout">
              {payoutMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApplicationsSection({
  applications,
  isLoading,
  onUpdateStatus,
  isPending,
  onAddAsAffiliate,
}: {
  applications: AffiliateApplication[];
  isLoading: boolean;
  onUpdateStatus: (id: number, status: string) => void;
  isPending: boolean;
  onAddAsAffiliate: (app: AffiliateApplication) => void;
}) {
  const [appFilter, setAppFilter] = useState("pending");
  const [expandedAppId, setExpandedAppId] = useState<number | null>(null);

  const filtered = applications.filter((a) => {
    if (appFilter !== "all" && a.status !== appFilter) return false;
    return true;
  });

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  return (
    <div className="space-y-4">
      <Tabs value={appFilter} onValueChange={setAppFilter}>
        <TabsList data-testid="tabs-app-status-filter">
          <TabsTrigger value="pending" data-testid="tab-app-pending">Pending</TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-app-approved">Approved</TabsTrigger>
          <TabsTrigger value="converted" data-testid="tab-app-converted">Converted</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-app-rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-app-all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <Table data-testid="table-applications">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Preferred Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground" data-testid="text-no-applications">
                    No applications found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((app) => (
                  <>
                    <TableRow key={app.id} className="cursor-pointer" onClick={() => setExpandedAppId(expandedAppId === app.id ? null : app.id)} data-testid={`row-application-${app.id}`}>
                      <TableCell>
                        {expandedAppId === app.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-medium" data-testid={`text-app-name-${app.id}`}>{app.firstName} {app.lastName}</TableCell>
                      <TableCell data-testid={`text-app-email-${app.id}`}>{app.email}</TableCell>
                      <TableCell data-testid={`text-app-company-${app.id}`}>{app.company || "—"}</TableCell>
                      <TableCell>
                        {app.preferredModel ? (
                          <Badge variant={modelBadgeVariant(app.preferredModel)} data-testid={`badge-app-model-${app.id}`}>
                            {app.preferredModel}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={app.status === "approved" ? "default" : app.status === "rejected" ? "destructive" : app.status === "converted" ? "outline" : "secondary"}
                          className={app.status === "converted" ? "border-green-500 text-green-600 dark:text-green-400" : ""}
                          data-testid={`badge-app-status-${app.id}`}
                        >
                          {app.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-app-date-${app.id}`}>
                        {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {app.status === "pending" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                                onClick={() => onUpdateStatus(app.id, "approved")}
                                disabled={isPending}
                                title="Approve"
                                data-testid={`button-approve-app-${app.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                onClick={() => onUpdateStatus(app.id, "rejected")}
                                disabled={isPending}
                                title="Reject"
                                data-testid={`button-reject-app-${app.id}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {app.status === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onAddAsAffiliate(app)}
                              data-testid={`button-add-as-affiliate-${app.id}`}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          )}
                          {app.status === "converted" && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1" data-testid={`text-app-converted-${app.id}`}>
                              <CheckCircle2 className="h-3 w-3" />
                              Added
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedAppId === app.id && (
                      <TableRow key={`detail-${app.id}`} data-testid={`row-app-detail-${app.id}`}>
                        <TableCell colSpan={8} className="bg-muted/30">
                          <div className="p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              {app.phone && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                  <span data-testid={`text-app-phone-${app.id}`}>{app.phone}</span>
                                </div>
                              )}
                              {app.email && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                  <span>{app.email}</span>
                                </div>
                              )}
                              {app.website && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Globe className="h-4 w-4 text-muted-foreground" />
                                  <a href={app.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid={`link-app-website-${app.id}`}>{app.website}</a>
                                </div>
                              )}
                              {app.company && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span>{app.company}</span>
                                </div>
                              )}
                            </div>
                            {app.experience && (
                              <div>
                                <h4 className="text-sm font-semibold mb-1">About / Experience</h4>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-app-experience-${app.id}`}>{app.experience}</p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AffiliateRow({
  affiliate,
  isExpanded,
  onToggle,
  onEdit,
  onRecordPayout,
  copiedCode,
  onCopyCode,
}: {
  affiliate: AffiliateWithStats;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRecordPayout: () => void;
  copiedCode: string | null;
  onCopyCode: (code: string) => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle} data-testid={`row-affiliate-${affiliate.id}`}>
        <TableCell>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </TableCell>
        <TableCell className="font-medium" data-testid={`text-name-${affiliate.id}`}>{affiliate.userName}</TableCell>
        <TableCell data-testid={`text-email-${affiliate.id}`}>{affiliate.userEmail}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded" data-testid={`text-code-${affiliate.id}`}>{affiliate.code}</code>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); onCopyCode(affiliate.code); }}
              data-testid={`button-copy-code-${affiliate.id}`}
            >
              {copiedCode === affiliate.code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={modelBadgeVariant(affiliate.commissionModel)} data-testid={`badge-model-${affiliate.id}`}>
            {affiliate.commissionModel}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant={statusBadgeVariant(affiliate.status)} data-testid={`badge-status-${affiliate.id}`}>
            {affiliate.status}
          </Badge>
        </TableCell>
        <TableCell>
          {(affiliate.commissionModel === "recurring" || affiliate.commissionModel === "hybrid") && (
            <Badge variant={tierBadgeVariant(affiliate.tier)} data-testid={`badge-tier-${affiliate.id}`}>
              {affiliate.tier}
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right" data-testid={`text-schools-${affiliate.id}`}>{affiliate.schoolCount}</TableCell>
        <TableCell className="text-right" data-testid={`text-earned-${affiliate.id}`}>{formatCents(affiliate.totalEarnedCents)}</TableCell>
        <TableCell>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            data-testid={`button-edit-${affiliate.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow data-testid={`row-detail-${affiliate.id}`}>
          <TableCell colSpan={10} className="bg-muted/30 p-0">
            <AffiliateExpandedDetail affiliateId={affiliate.id} onRecordPayout={onRecordPayout} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function AffiliateExpandedDetail({ affiliateId, onRecordPayout }: { affiliateId: number; onRecordPayout: () => void }) {
  const { data: detail, isLoading: detailLoading } = useQuery<AffiliateDetail>({
    queryKey: ["/api/platform/affiliates", affiliateId],
  });

  const { data: commissions, isLoading: commissionsLoading } = useQuery<AffiliateCommission[]>({
    queryKey: ["/api/platform/affiliates", affiliateId, "commissions"],
  });

  const { data: payouts, isLoading: payoutsLoading } = useQuery<AffiliatePayout[]>({
    queryKey: ["/api/platform/affiliates", affiliateId, "payouts"],
  });

  if (detailLoading || commissionsLoading || payoutsLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  const referrals = detail?.referrals || [];

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <h4 className="text-sm font-semibold mb-2" data-testid={`text-referrals-heading-${affiliateId}`}>Referrals ({referrals.length})</h4>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-auto">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between gap-2 text-sm border rounded-md p-2">
                  <span>Tenant #{ref.tenantId}</span>
                  <Badge variant={ref.status === "active" ? "default" : ref.status === "churned" ? "destructive" : "secondary"} data-testid={`badge-referral-status-${ref.id}`}>
                    {ref.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <h4 className="text-sm font-semibold mb-2" data-testid={`text-commissions-heading-${affiliateId}`}>Commission History ({commissions?.length || 0})</h4>
          {(!commissions || commissions.length === 0) ? (
            <p className="text-sm text-muted-foreground">No commissions yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Period</TableHead>
                    <TableHead className="text-xs">School</TableHead>
                    <TableHead className="text-xs">Invoice</TableHead>
                    <TableHead className="text-xs">Rate</TableHead>
                    <TableHead className="text-xs text-right">Invoice Amt</TableHead>
                    <TableHead className="text-xs text-right">Commission</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c: any) => (
                    <TableRow key={c.id} data-testid={`row-commission-detail-${c.id}`}>
                      <TableCell className="text-xs py-1" data-testid={`text-comm-type-${c.id}`}>{c.type}</TableCell>
                      <TableCell className="text-xs py-1" data-testid={`text-comm-period-${c.id}`}>{c.period || "—"}</TableCell>
                      <TableCell className="text-xs py-1" data-testid={`text-comm-tenant-${c.id}`}>{c.tenantName || "—"}</TableCell>
                      <TableCell className="text-xs py-1" data-testid={`text-comm-invoice-${c.id}`}>
                        {c.invoiceId ? `#${c.invoiceId}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs py-1" data-testid={`text-comm-rate-${c.id}`}>{c.commissionRate || "—"}</TableCell>
                      <TableCell className="text-xs py-1 text-right" data-testid={`text-comm-invoice-amt-${c.id}`}>
                        {c.invoiceAmountCents != null ? formatCents(c.invoiceAmountCents) : "—"}
                      </TableCell>
                      <TableCell className="text-xs py-1 text-right font-medium" data-testid={`text-comm-amount-${c.id}`}>{formatCents(c.amountCents)}</TableCell>
                      <TableCell className="text-xs py-1">
                        <Badge variant={c.status === "paid" ? "default" : c.status === "approved" ? "secondary" : "outline"} className="text-xs" data-testid={`badge-comm-status-${c.id}`}>
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <h4 className="text-sm font-semibold" data-testid={`text-payouts-heading-${affiliateId}`}>Payout History ({payouts?.length || 0})</h4>
          <Button size="sm" variant="outline" onClick={onRecordPayout} data-testid={`button-record-payout-${affiliateId}`}>
            <DollarSign className="h-3 w-3 mr-1" />
            Record Payout
          </Button>
        </div>
        {(!payouts || payouts.length === 0) ? (
          <p className="text-sm text-muted-foreground">No payouts yet.</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs py-1">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-xs py-1 text-right">{formatCents(p.amountCents)}</TableCell>
                    <TableCell className="text-xs py-1">{p.method}</TableCell>
                    <TableCell className="text-xs py-1">{p.reference || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
