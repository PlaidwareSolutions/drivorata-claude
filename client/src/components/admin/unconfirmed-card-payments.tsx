import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCcw, Search } from "lucide-react";

// Card checkouts Stripe may have charged but Drivorata never confirmed (the
// pre-2026-10-18 webhook bug). Server side: server/payments/payment-recovery.ts.

interface ProviderCheck {
  checkedAt: string;
  paid: boolean;
  sessionStatus: string | null;
  paymentStatus: string;
  chargeId: string | null;
  amountCents: number | null;
  customerEmail: string | null;
  paidAt: string | null;
}

interface Person {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  parentEmail?: string | null;
}

interface UnconfirmedPayment {
  id: number;
  status: string;
  amountCents: number;
  currency: string | null;
  createdAt: string;
  cartId: string | null;
  enrollmentId: number | null;
  metadataJson: { providerCheck?: ProviderCheck; packageName?: string } | null;
  enrollment: (Person & { packageSnapshotJson?: { name?: string } | null }) | null;
  cartCustomer: Person | null;
  cartItems: Array<{
    package: { name: string } | null;
    offering: { id: number; name: string; startsAt: string } | null;
  }>;
}

type Filter = "paid" | "unchecked" | "unpaid" | "all";

const queryKey = (tenantId: number | undefined) => ["/api/tenants", tenantId, "unconfirmed-card-payments"];

export function useUnconfirmedCardPayments(tenantId: number | undefined) {
  return useQuery<UnconfirmedPayment[]>({
    queryKey: queryKey(tenantId),
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/unconfirmed-card-payments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });
}

function money(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function when(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function errorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    return JSON.parse(body).message || body;
  } catch {
    return body;
  }
}

function customerOf(p: UnconfirmedPayment): Person {
  return p.enrollment || p.cartCustomer || {};
}

function purchasedOf(p: UnconfirmedPayment): Array<{ label: string; classDate?: string; past?: boolean }> {
  if (p.cartItems.length) {
    return p.cartItems.map((it) => ({
      label: [it.package?.name, it.offering?.name].filter(Boolean).join(" — ") || "Item",
      classDate: it.offering?.startsAt,
      past: it.offering ? new Date(it.offering.startsAt).getTime() <= Date.now() : undefined,
    }));
  }
  return [{ label: p.enrollment?.packageSnapshotJson?.name || p.metadataJson?.packageName || "Package" }];
}

function StripeBadge({ check }: { check?: ProviderCheck }) {
  if (!check) return <Badge variant="outline">Not checked</Badge>;
  if (check.paid) return <Badge className="bg-green-600 hover:bg-green-600">Paid at Stripe</Badge>;
  return <Badge variant="secondary">Not paid ({check.sessionStatus || check.paymentStatus})</Badge>;
}

export function UnconfirmedCardPaymentsPanel({ tenantId }: { tenantId: number }) {
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useUnconfirmedCardPayments(tenantId);
  const [filter, setFilter] = useState<Filter>("paid");
  const [search, setSearch] = useState("");
  const [recovering, setRecovering] = useState<UnconfirmedPayment | null>(null);

  const counts = useMemo(() => ({
    paid: rows.filter((p) => p.metadataJson?.providerCheck?.paid).length,
    unchecked: rows.filter((p) => !p.metadataJson?.providerCheck).length,
    unpaid: rows.filter((p) => p.metadataJson?.providerCheck && !p.metadataJson.providerCheck.paid).length,
    all: rows.length,
  }), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      const c = p.metadataJson?.providerCheck;
      if (filter === "paid" && !c?.paid) return false;
      if (filter === "unchecked" && c) return false;
      if (filter === "unpaid" && (!c || c.paid)) return false;
      if (!q) return true;
      const cust = customerOf(p);
      return [cust.firstName, cust.lastName, cust.email, cust.parentEmail, c?.customerEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, filter, search]);

  const checkAll = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/tenants/${tenantId}/unconfirmed-card-payments/check`, {})).json(),
    onSuccess: (s: { checked: number; paid: number; unpaid: number; errors: unknown[] }) => {
      queryClient.invalidateQueries({ queryKey: queryKey(tenantId) });
      toast({
        title: "Checked with Stripe",
        description: `${s.checked} checked: ${s.paid} paid, ${s.unpaid} not paid${s.errors.length ? `, ${s.errors.length} could not be checked` : ""}.`,
      });
    },
    onError: (err) => toast({ title: "Check failed", description: errorMessage(err), variant: "destructive" }),
  });

  return (
    <div data-testid="panel-unconfirmed-card">
      <p className="text-sm text-muted-foreground mb-4">
        Card checkouts that were never confirmed here. Before Oct 18, 2026 Stripe's payment notifications were not
        processed, so customers who paid show up in this list instead of under Confirmed. <strong>Check with Stripe</strong>{" "}
        to see which ones were actually paid, then <strong>Recover</strong> each paid one to create its enrollment.
      </p>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button onClick={() => checkAll.mutate()} disabled={checkAll.isPending} data-testid="button-check-stripe">
          <RefreshCcw className={`h-4 w-4 mr-2 ${checkAll.isPending ? "animate-spin" : ""}`} />
          {checkAll.isPending ? "Checking with Stripe…" : "Check all with Stripe"}
        </Button>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-[220px]" data-testid="select-unconfirmed-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paid">Paid at Stripe ({counts.paid})</SelectItem>
            <SelectItem value="unchecked">Not checked yet ({counts.unchecked})</SelectItem>
            <SelectItem value="unpaid">Not paid ({counts.unpaid})</SelectItem>
            <SelectItem value="all">All ({counts.all})</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-unconfirmed"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {counts.unchecked > 0 && filter === "paid"
            ? "Nothing marked paid yet — run “Check all with Stripe” first."
            : "No payments in this view."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const cust = customerOf(p);
            const check = p.metadataJson?.providerCheck;
            return (
              <Card key={p.id} data-testid={`row-unconfirmed-${p.id}`}>
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="font-medium">
                      {cust.firstName} {cust.lastName}{" "}
                      <span className="text-muted-foreground font-normal">· {money(p.amountCents)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground break-all">
                      {[cust.email, cust.phone].filter(Boolean).join(" · ")}
                      {check?.customerEmail && check.customerEmail.toLowerCase() !== (cust.email || "").toLowerCase()
                        ? ` · paid as ${check.customerEmail}`
                        : ""}
                    </div>
                    {purchasedOf(p).map((it, i) => (
                      <div key={i} className="text-sm">
                        {it.label}
                        {it.classDate ? (
                          <span className="text-muted-foreground">
                            {" "}— {when(it.classDate)}
                            {it.past ? " (already held)" : ""}
                          </span>
                        ) : null}
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground">
                      Checkout {when(p.createdAt)}
                      {check?.paidAt ? ` · paid ${when(check.paidAt)}` : ""}
                      {check?.chargeId ? ` · ${check.chargeId}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StripeBadge check={check} />
                    <Button
                      size="sm"
                      variant={check?.paid ? "default" : "outline"}
                      disabled={!!check && !check.paid}
                      onClick={() => setRecovering(p)}
                      data-testid={`button-recover-${p.id}`}
                    >
                      Recover…
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {recovering && (
        <RecoverDialog tenantId={tenantId} payment={recovering} onClose={() => setRecovering(null)} />
      )}
    </div>
  );
}

function RecoverDialog({
  tenantId,
  payment,
  onClose,
}: {
  tenantId: number;
  payment: UnconfirmedPayment;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const items = purchasedOf(payment);
  const classItems = items.filter((i) => i.classDate);
  const canBookSeat = classItems.length > 0 && classItems.every((i) => !i.past);
  const [bookSeat, setBookSeat] = useState(canBookSeat);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [notifyAdmin, setNotifyAdmin] = useState(false);
  const [note, setNote] = useState("");
  const cust = customerOf(payment);

  const recover = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", `/api/tenants/${tenantId}/payments/${payment.id}/recover`, {
          bookSeat: classItems.length ? bookSeat : undefined,
          notifyCustomer,
          notifyAdmin,
          note: note.trim() || undefined,
        })
      ).json(),
    onSuccess: (r: { ok: boolean; errors?: string[] }) => {
      queryClient.invalidateQueries({ queryKey: queryKey(tenantId) });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      if (r.ok) {
        toast({ title: "Payment recovered", description: `${cust.firstName} ${cust.lastName} is now enrolled.` });
      } else {
        toast({ title: "Recovered with problems", description: (r.errors || []).join("; "), variant: "destructive" });
      }
      onClose();
    },
    onError: (err) => toast({ title: "Could not recover", description: errorMessage(err), variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recover payment</DialogTitle>
          <DialogDescription>
            Stripe is asked again before anything changes. This marks the {money(payment.amountCents)} payment from{" "}
            {cust.firstName} {cust.lastName} as paid and creates the enrollment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm space-y-1">
            {items.map((it, i) => (
              <div key={i}>
                {it.label}
                {it.classDate ? <span className="text-muted-foreground"> — {when(it.classDate)}</span> : null}
              </div>
            ))}
          </div>

          {classItems.length > 0 && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="recover-book-seat"
                checked={bookSeat}
                disabled={!canBookSeat}
                onCheckedChange={(v) => setBookSeat(v === true)}
                data-testid="checkbox-recover-book-seat"
              />
              <Label htmlFor="recover-book-seat" className="font-normal leading-snug">
                Book a seat in this class
                <span className="block text-xs text-muted-foreground">
                  {canBookSeat
                    ? "Holds a seat and adds the student to every session."
                    : "The class has already been held, so no seat is booked. The enrollment still records which class was bought."}
                </span>
              </Label>
            </div>
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="recover-notify-customer"
              checked={notifyCustomer}
              onCheckedChange={(v) => setNotifyCustomer(v === true)}
              data-testid="checkbox-recover-notify-customer"
            />
            <Label htmlFor="recover-notify-customer" className="font-normal leading-snug">
              Email the customer a “payment received” confirmation
              <span className="block text-xs text-muted-foreground">
                Includes the online-course link for online courses. Leave off if you've already contacted them.
              </span>
            </Label>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="recover-notify-admin"
              checked={notifyAdmin}
              onCheckedChange={(v) => setNotifyAdmin(v === true)}
              data-testid="checkbox-recover-notify-admin"
            />
            <Label htmlFor="recover-notify-admin" className="font-normal leading-snug">
              Send the school's new-enrollment notification
            </Label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="recover-note">Note (optional)</Label>
            <Textarea
              id="recover-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Called the parent on Oct 20; attended the Sept class."
              data-testid="input-recover-note"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => recover.mutate()} disabled={recover.isPending} data-testid="button-confirm-recover">
            {recover.isPending ? "Recovering…" : "Recover payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
