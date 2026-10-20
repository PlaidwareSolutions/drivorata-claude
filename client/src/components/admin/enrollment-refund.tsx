import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Refund an enrollment through its card processor (server/payments/refund.ts):
// Authorize.net voids same-day payments and refunds settled ones; Stripe
// refunds. "Record only" = the money was already returned elsewhere.

interface Outcome {
  provider: string;
  method: "void" | "refund" | "record_only";
  amountCents: number;
}

const PROCESSOR: Record<string, string> = { STRIPE: "Stripe", AUTHORIZE_NET: "Authorize.net (Chase)" };

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function describe(o: Outcome): string {
  if (o.method === "void") return `Voided ${money(o.amountCents)} — the charge is cancelled and never reaches the card.`;
  if (o.method === "refund") return `Refunded ${money(o.amountCents)} to the card via ${PROCESSOR[o.provider] ?? o.provider}.`;
  return `Recorded a ${money(o.amountCents)} refund (no money moved in Drivorata).`;
}

export function EnrollmentRefundButton({
  tenantId,
  enrollmentId,
  enrollmentStatus,
  payment,
  onDone,
}: {
  tenantId: number;
  enrollmentId: number;
  enrollmentStatus: string;
  payment: { provider: string; status: string; amountCents: number } | null;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [recordOnly, setRecordOnly] = useState(false);
  const card = payment && (payment.provider === "STRIPE" || payment.provider === "AUTHORIZE_NET");

  const refund = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/tenants/${tenantId}/enrollments/${enrollmentId}/refund`, { recordOnly })).json(),
    onSuccess: (r: { outcomes: Outcome[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", tenantId, "payments", "context"] });
      toast({ title: "Enrollment refunded", description: r.outcomes.map(describe).join(" ") || "No payment on file; marked refunded." });
      setOpen(false);
      onDone?.();
    },
    onError: (err) => {
      const raw = err instanceof Error ? err.message : String(err);
      let message = raw.replace(/^\d+:\s*/, "");
      try {
        message = JSON.parse(message).message || message;
      } catch {}
      toast({ title: "Refund not processed", description: message, variant: "destructive" });
    },
  });

  if (!payment || payment.status !== "COMPLETED" || enrollmentStatus === "refunded") return null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="button-refund-enrollment">
        Refund…
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund this enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              {card && !recordOnly
                ? `The payment goes back to the customer's card through ${PROCESSOR[payment.provider]}. Same-day payments are voided; older ones are refunded and take a few business days to appear. The enrollment is marked refunded and its class credits are removed.`
                : "The enrollment is marked refunded and its class credits are removed. No money is moved by Drivorata."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {card && (
            <div className="flex items-start gap-2">
              <Checkbox id="refund-record-only" checked={recordOnly} onCheckedChange={(v) => setRecordOnly(v === true)} data-testid="checkbox-refund-record-only" />
              <Label htmlFor="refund-record-only" className="font-normal leading-snug">
                I already refunded this in the {PROCESSOR[payment.provider]} dashboard — just record it
              </Label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refund.isPending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => refund.mutate()} disabled={refund.isPending} data-testid="button-confirm-refund">
              {refund.isPending ? "Refunding…" : card && !recordOnly ? `Refund ${money(payment.amountCents)}` : "Mark refunded"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
