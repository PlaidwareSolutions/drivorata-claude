import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AffiliatePayouts() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/affiliate/payouts"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const payouts = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-affiliate-payouts-title">Payouts</h1>
      {payouts.length === 0 ? (
        <p className="text-muted-foreground" data-testid="text-no-payouts">No payouts yet.</p>
      ) : (
        <Table data-testid="table-affiliate-payouts">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((p: any) => (
              <TableRow key={p.id} data-testid={`row-payout-${p.id}`}>
                <TableCell>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</TableCell>
                <TableCell data-testid={`text-payout-amount-${p.id}`}>${(p.amountCents / 100).toFixed(2)}</TableCell>
                <TableCell>{p.method ?? "—"}</TableCell>
                <TableCell>{p.reference ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
