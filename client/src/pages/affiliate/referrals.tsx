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

export default function AffiliateReferrals() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/affiliate/referrals"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const referrals = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-affiliate-referrals-title">Referrals</h1>
      {referrals.length === 0 ? (
        <p className="text-muted-foreground" data-testid="text-no-referrals">No referrals yet.</p>
      ) : (
        <Table data-testid="table-affiliate-referrals">
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Referred</TableHead>
              <TableHead>Activated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referrals.map((r: any) => (
              <TableRow key={r.id} data-testid={`row-referral-${r.id}`}>
                <TableCell data-testid={`text-referral-school-${r.id}`}>{r.tenantName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" data-testid={`badge-referral-status-${r.id}`}>{r.status}</Badge>
                </TableCell>
                <TableCell>{r.referredAt ? new Date(r.referredAt).toLocaleDateString() : "—"}</TableCell>
                <TableCell>{r.activatedAt ? new Date(r.activatedAt).toLocaleDateString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
