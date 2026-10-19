import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTenant } from "@/lib/tenant-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Search } from "lucide-react";

// Every payment attempt with who paid, for which class and date, and its
// state — the place to match a Stripe/bank line to an enrollment without
// cross-referencing emails. Server: GET /api/tenants/:id/payments?include=context.

interface PurchaseItem {
  name: string;
  className?: string;
  startsAt?: string;
  locationName?: string | null;
}

interface Person {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface PaymentRow {
  id: number;
  reference: string | null;
  provider: string;
  status: string;
  amountCents: number;
  serviceFeeCents: number;
  currency: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  completedAt: string | null;
  createdAt: string;
  cartId: string | null;
  metadataJson: { purchase?: PurchaseItem[]; packageName?: string; onlineCourseName?: string } | null;
  enrollment: (Person & { id: number; packageSnapshotJson?: { name?: string } | null }) | null;
  cartCustomer: Person | null;
  cartItems: Array<{ package: { name: string } | null; offering: { name: string; startsAt: string } | null }>;
}

type StatusGroup = "all" | "paid" | "pending" | "not_completed" | "refunded";

function statusOf(p: PaymentRow): { group: StatusGroup; label: string; className: string } {
  switch (p.status) {
    case "COMPLETED":
      return { group: "paid", label: "Paid", className: "bg-green-600 hover:bg-green-600 text-white" };
    case "REFUNDED":
      return { group: "refunded", label: "Refunded", className: "" };
    case "CREATED":
    case "PENDING":
      return p.provider === "CASH"
        ? { group: "pending", label: "Cash due", className: "bg-amber-600 hover:bg-amber-600 text-white" }
        : { group: "pending", label: "Checkout started", className: "" };
    default:
      return { group: "not_completed", label: "Not completed", className: "" };
  }
}

const METHOD: Record<string, string> = { STRIPE: "Card", PAYPAL: "PayPal", CASH: "Cash" };

function money(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dateTime(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
}

function classDate(iso: string | undefined) {
  return iso ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

function customerOf(p: PaymentRow): Person {
  return p.enrollment || p.cartCustomer || {};
}

function itemsOf(p: PaymentRow): Array<{ label: string; date: string }> {
  const purchase = p.metadataJson?.purchase;
  if (purchase?.length) {
    return purchase.map((it) => ({
      label: [it.className && it.className !== it.name ? `${it.name}: ${it.className}` : it.name, it.locationName].filter(Boolean).join(" — "),
      date: classDate(it.startsAt),
    }));
  }
  if (p.cartItems.length) {
    return p.cartItems.map((it) => ({
      label: [it.package?.name, it.offering?.name].filter(Boolean).join(": ") || "Item",
      date: classDate(it.offering?.startsAt),
    }));
  }
  const name = p.enrollment?.packageSnapshotJson?.name || p.metadataJson?.packageName || p.metadataJson?.onlineCourseName;
  return name ? [{ label: name, date: "" }] : [];
}

function csvCell(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: PaymentRow[]) {
  const header = [
    "Date", "Reference", "Status", "Method", "Amount", "Service fee", "Customer", "Email", "Phone",
    "Purchased", "Class date", "Transaction ID", "Paid at", "Started at", "Enrollment ID",
  ];
  const lines = rows.map((p) => {
    const c = customerOf(p);
    const items = itemsOf(p);
    return [
      dateTime(p.completedAt || p.createdAt),
      p.reference ?? "",
      statusOf(p).label,
      METHOD[p.provider] ?? p.provider,
      (p.amountCents / 100).toFixed(2),
      (p.serviceFeeCents / 100).toFixed(2),
      `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      c.email ?? "",
      c.phone ?? "",
      items.map((i) => i.label).join("; "),
      items.map((i) => i.date).filter(Boolean).join("; "),
      p.providerPaymentId || p.providerOrderId || "",
      dateTime(p.completedAt),
      dateTime(p.createdAt),
      p.enrollment?.id ?? "",
    ].map(csvCell).join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PaymentsPage() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.tenant.id;
  const { data: rows = [], isLoading } = useQuery<PaymentRow[]>({
    queryKey: ["/api/tenants", tenantId, "payments", "context"],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/payments?include=context`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!tenantId,
  });

  const [group, setGroup] = useState<StatusGroup>("paid");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const counts = useMemo(() => {
    const c: Record<StatusGroup, number> = { all: rows.length, paid: 0, pending: 0, not_completed: 0, refunded: 0 };
    for (const p of rows) c[statusOf(p).group]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return rows.filter((p) => {
      if (group !== "all" && statusOf(p).group !== group) return false;
      const t = new Date(p.completedAt || p.createdAt).getTime();
      if (fromT != null && t < fromT) return false;
      if (toT != null && t > toT) return false;
      if (!q) return true;
      const c = customerOf(p);
      return [p.reference, c.firstName, c.lastName, c.email, c.phone, p.providerPaymentId, p.providerOrderId, ...itemsOf(p).map((i) => i.label)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, group, search, from, to]);

  const total = visible.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amountCents, 0);

  if (!currentTenant) return null;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold" data-testid="text-payments-heading">Payments</h1>
        <Button variant="outline" onClick={() => downloadCsv(visible)} disabled={!visible.length} data-testid="button-export-payments">
          <Download className="h-4 w-4 mr-2" /> Export CSV ({visible.length})
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={group} onValueChange={(v) => setGroup(v as StatusGroup)}>
          <SelectTrigger className="w-[210px]" data-testid="select-payment-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paid">Paid ({counts.paid})</SelectItem>
            <SelectItem value="pending">Pending ({counts.pending})</SelectItem>
            <SelectItem value="not_completed">Not completed ({counts.not_completed})</SelectItem>
            <SelectItem value="refunded">Refunded ({counts.refunded})</SelectItem>
            <SelectItem value="all">All ({counts.all})</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Reference, name, email, phone, transaction ID or class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-payments"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" aria-label="From date" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" aria-label="To date" />
        </div>
      </div>

      {group === "paid" || group === "all" ? (
        <p className="text-sm text-muted-foreground mb-3">Paid in this view: <strong>{money(total)}</strong></p>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : visible.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No payments match.</CardContent></Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Purchased · class date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Transaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => {
                const c = customerOf(p);
                const st = statusOf(p);
                return (
                  <TableRow key={p.id} data-testid={`row-payment-${p.id}`}>
                    <TableCell className="whitespace-nowrap text-sm">{dateTime(p.completedAt || p.createdAt)}</TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {p.enrollment ? (
                        <Link href={`/admin/enrollments?focusId=${p.enrollment.id}`} className="text-primary hover:underline">
                          {p.reference || `#${p.id}`}
                        </Link>
                      ) : (
                        p.reference || `#${p.id}`
                      )}
                    </TableCell>
                    <TableCell className="text-sm min-w-[180px]">
                      <div className="font-medium">{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "—"}</div>
                      <div className="text-muted-foreground break-all">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="text-sm min-w-[220px]">
                      {itemsOf(p).map((it, i) => (
                        <div key={i}>
                          {it.label}
                          {it.date && <span className="text-muted-foreground"> · {it.date}</span>}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {money(p.amountCents)}
                      <div className="text-xs text-muted-foreground">{METHOD[p.provider] ?? p.provider}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={st.className}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground break-all min-w-[140px]">
                      {p.providerPaymentId || p.providerOrderId || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
