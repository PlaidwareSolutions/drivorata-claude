import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AffiliateCommissions() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/affiliate/commissions"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const commissions = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-affiliate-commissions-title">Commissions</h1>
      {commissions.length === 0 ? (
        <p className="text-muted-foreground" data-testid="text-no-commissions">No commissions yet.</p>
      ) : (
        <Table data-testid="table-affiliate-commissions">
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {commissions.map((c: any) => (
              <TableRow key={c.id} data-testid={`row-commission-${c.id}`}>
                <TableCell>{c.period ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" data-testid={`badge-commission-type-${c.id}`}>{c.type}</Badge>
                </TableCell>
                <TableCell data-testid={`text-commission-amount-${c.id}`}>${(c.amountCents / 100).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant="outline" data-testid={`badge-commission-status-${c.id}`}>{c.status}</Badge>
                </TableCell>
                <TableCell>{c.description ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
