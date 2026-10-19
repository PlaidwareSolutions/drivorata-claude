import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCcw } from "lucide-react";

// Every email Drivorata sent about one enrollment, with Resend's delivery
// outcome, plus "send again" for the customer confirmation and the owner
// notification. Answers "they say they never got the email" without digging
// through Resend: bounced / delayed / never sent is visible here.

export interface EnrollmentEmail {
  id: number;
  kind: string | null;
  recipientEmail: string;
  subject: string;
  status: string;
  errorMsg: string | null;
  deliveryStatus: string | null;
  deliveryUpdatedAt: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = {
  customer_enrollment_received: "Customer · reservation",
  customer_payment_received: "Customer · confirmation",
  owner_paid: "School · PAID",
  owner_cash_due: "School · CASH DUE",
  owner_new: "School · new enrollment",
  owner_not_paid: "School · NOT PAID",
};

function outcome(e: EnrollmentEmail): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string } {
  if (e.status === "failed") return { label: "Failed to send", variant: "destructive" };
  if (e.status === "skipped_unsubscribed") return { label: "Not sent — unsubscribed", variant: "secondary" };
  if (e.status === "skipped_no_provider") return { label: "Not sent — email off", variant: "secondary" };
  if (e.status === "queued") return { label: "Queued", variant: "outline" };
  switch (e.deliveryStatus) {
    case "delivered":
      return { label: "Delivered", variant: "default", className: "bg-green-600 hover:bg-green-600" };
    case "bounced":
      return { label: "Bounced", variant: "destructive" };
    case "complained":
      return { label: "Marked as spam", variant: "destructive" };
    case "delivery_delayed":
      return { label: "Delayed", variant: "secondary" };
    default:
      return { label: "Sent", variant: "outline" };
  }
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function EnrollmentEmailActivity({
  tenantId,
  enrollmentId,
  emails,
  detailsQueryKey,
}: {
  tenantId: number;
  enrollmentId: number;
  emails: EnrollmentEmail[];
  detailsQueryKey: unknown[];
}) {
  const { toast } = useToast();
  const resend = useMutation({
    mutationFn: async (target: "customer" | "owner") =>
      (await apiRequest("POST", `/api/tenants/${tenantId}/enrollments/${enrollmentId}/resend-email`, { target })).json(),
    onSuccess: (r: { latest: { status: string; recipientEmail: string; errorMsg: string | null } | null }, target) => {
      queryClient.invalidateQueries({ queryKey: detailsQueryKey });
      const s = r.latest?.status;
      toast({
        title: s === "failed" ? "Email failed to send" : target === "customer" ? "Confirmation sent again" : "Notification sent again",
        description: r.latest ? `${r.latest.recipientEmail}${r.latest.errorMsg ? ` — ${r.latest.errorMsg}` : ""}` : undefined,
        variant: s === "failed" ? "destructive" : undefined,
      });
    },
    onError: (err) => toast({ title: "Could not resend", description: err instanceof Error ? err.message : String(err), variant: "destructive" }),
  });

  return (
    <section data-testid="section-email-activity">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4" /> Email history
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate("customer")} data-testid="button-resend-customer">
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Resend to customer
          </Button>
          <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate("owner")} data-testid="button-resend-owner">
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Resend school notification
          </Button>
        </div>
      </div>
      <div className="rounded-md border divide-y">
        {emails.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">No emails recorded for this enrollment.</p>
        ) : (
          emails.map((e) => {
            const o = outcome(e);
            return (
              <div key={e.id} className="p-3 text-sm flex flex-col sm:flex-row sm:items-start gap-2 justify-between" data-testid={`row-email-${e.id}`}>
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium break-words">{e.subject}</div>
                  <div className="text-muted-foreground break-all">
                    {e.kind ? `${KIND_LABELS[e.kind] ?? e.kind} · ` : ""}
                    {e.recipientEmail}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {when(e.sentAt || e.createdAt)}
                    {e.deliveryUpdatedAt ? ` · ${o.label.toLowerCase()} ${when(e.deliveryUpdatedAt)}` : ""}
                    {e.providerMessageId ? ` · Resend ${e.providerMessageId}` : ""}
                  </div>
                  {e.errorMsg && e.status === "failed" && <div className="text-xs text-destructive">{e.errorMsg}</div>}
                </div>
                <Badge variant={o.variant} className={`shrink-0 ${o.className ?? ""}`}>{o.label}</Badge>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
