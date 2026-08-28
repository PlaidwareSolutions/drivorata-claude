import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  ArrowLeft,
  Printer,
  CreditCard,
  Banknote,
  Mail,
  Phone,
  Calendar,
  User,
  Receipt as ReceiptIcon,
  Loader2,
} from "lucide-react";

type LineItem = {
  id: number;
  firstName: string;
  lastName: string;
  status: string;
  isWaitlisted?: boolean;
  offeringId?: number | null;
  priceCents: number;
  package: any;
};

type ReceiptData = {
  kind: "cart" | "enrollment";
  reference: string;
  createdAt?: string | null;
  items: LineItem[];
  totals: { subtotalCents: number; serviceFeeCents?: number; totalCents: number; currency: string };
  payment: {
    provider: "STRIPE" | "PAYPAL" | "CASH";
    status: string;
    amountCents: number;
    currency: string;
    reference: string | null;
  } | null;
  customer: {
    student: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      dateOfBirth?: string;
    };
    parent: { name: string; email: string; phone: string } | null;
  };
  school: { id: number; name: string; slug: string; logoUrl?: string | null } | null;
};

function fmtMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents || 0) / 100);
}

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return d;
  }
}

function fmtBirthday(d?: string) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function providerLabel(provider?: string) {
  if (!provider) return "Payment";
  if (provider === "STRIPE") return "Credit Card";
  if (provider === "PAYPAL") return "PayPal";
  if (provider === "CASH") return "Cash";
  return provider;
}

function ProviderIcon({ provider }: { provider?: string }) {
  if (provider === "CASH") return <Banknote className="h-4 w-4" />;
  return <CreditCard className="h-4 w-4" />;
}

/**
 * Unified printable thank-you / receipt page used by both `/site/{slug}/checkout/success`
 * and any custom-domain `/thank-you`-style page that lands here with `?cart=...` or
 * `?enrollment=...` in the URL.
 *
 * Renders for three sources of truth:
 *   1. cart payments (Stripe / PayPal multi-item carts)         → ?cart=<uuid>
 *   2. single enrollment payments                                 → ?enrollment=<id>
 *   3. cash-only enrollments (set ?cash=true to label as Cash)
 */
export function CheckoutReceipt({
  cartId,
  enrollmentId,
  primaryColor,
  headingFont,
  schoolName,
  homeHref = "/",
}: {
  cartId?: string | null;
  enrollmentId?: string | null;
  primaryColor?: string;
  headingFont?: string;
  schoolName?: string;
  homeHref?: string;
}) {
  // Cart wins over single enrollment when both present (cart implies multi-item).
  const useCart = !!cartId;

  const { data: receipt, isLoading } = useQuery<ReceiptData | null>({
    queryKey: useCart
      ? ["/api/public/cart", cartId, "receipt"]
      : ["/api/public/enrollments", enrollmentId, "receipt"],
    queryFn: async () => {
      const url = useCart
        ? `/api/public/cart/${cartId}/receipt`
        : `/api/public/enrollments/${enrollmentId}/receipt`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: useCart ? !!cartId : !!enrollmentId,
  });

  // Clear cart from localStorage on confirmed success (cart flow only).
  useEffect(() => {
    if (!useCart || !receipt) return;
    try {
      // The slug is part of the cart-key on public-site flows; we don't have it
      // here cleanly, but we can scan localStorage for any cart entry that
      // matches this id and remove it.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("drv_cart_") && localStorage.getItem(k) === cartId) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
  }, [useCart, receipt, cartId]);

  const waitlistedCount = useMemo(
    () => (receipt?.items || []).filter((i) => i.isWaitlisted).length,
    [receipt],
  );

  if (isLoading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </section>
    );
  }

  if (!receipt) {
    // Fall back to a friendly confirmation when receipt fetch fails
    // (e.g. webhook hasn't activated the enrollment yet).
    return (
      <section className="py-20 px-4">
        <div className="max-w-lg mx-auto text-center">
          <Loader2
            className="h-12 w-12 mx-auto mb-4 animate-spin"
            style={{ color: primaryColor || "#2563eb" }}
          />
          <h2 className="text-2xl font-bold mb-3" style={{ fontFamily: headingFont }}>
            Confirming your payment…
          </h2>
          <p className="text-muted-foreground mb-6">
            Hang tight — we're verifying your payment with the processor. A
            confirmation email will arrive shortly. You can safely close this
            window.
          </p>
          <a href={homeHref}>
            <Button
              variant="outline"
              data-testid="link-back-to-site"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {schoolName || "Home"}
            </Button>
          </a>
        </div>
      </section>
    );
  }

  const isWaitlistedAny = waitlistedCount > 0;
  const totalText = fmtMoney(receipt.totals.totalCents, receipt.totals.currency);
  const isAdult = (() => {
    const dob = receipt.customer.student.dateOfBirth;
    if (!dob) return true;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return true;
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 18;
  })();
  const showParent = !!receipt.customer.parent && !isAdult;

  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print, header, footer, nav { display: none !important; }
          .receipt-card { box-shadow: none !important; border: 1px solid #e5e7eb !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>
      <section className="py-10 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Print-only header */}
          <div className="print-only mb-6 text-center">
            {receipt.school?.logoUrl ? (
              <img
                src={receipt.school.logoUrl}
                alt={receipt.school.name}
                className="h-10 mx-auto mb-2"
              />
            ) : null}
            <div className="font-bold">{receipt.school?.name || schoolName}</div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <CheckCircle
              className="h-14 w-14 mx-auto mb-3"
              style={{ color: primaryColor || "#16a34a" }}
            />
            <h1
              className="text-3xl font-bold mb-2"
              style={{ fontFamily: headingFont }}
              data-testid="text-checkout-success"
            >
              {receipt.payment?.provider === "CASH"
                ? "Enrollment Confirmed!"
                : "Payment Successful!"}
            </h1>
            <p className="text-muted-foreground" data-testid="text-success-message">
              {isWaitlistedAny
                ? `Your purchase is confirmed. ${waitlistedCount} item${
                    waitlistedCount === 1 ? " is" : "s are"
                  } on the waitlist — we'll email when a seat opens.`
                : "Your enrollment is confirmed. A confirmation email is on its way."}
            </p>
          </div>

          {/* Order summary card */}
          <div className="receipt-card rounded-lg border bg-card p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <ReceiptIcon className="h-4 w-4" />
                  <span>Order Receipt</span>
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-confirmation-number">
                  Confirmation #
                  <span className="font-mono ml-1">
                    {receipt.kind === "cart"
                      ? receipt.reference.slice(0, 8).toUpperCase()
                      : receipt.reference}
                  </span>
                </div>
                {receipt.createdAt && (
                  <div className="text-xs text-muted-foreground" data-testid="text-receipt-date">
                    {fmtDate(receipt.createdAt)}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total Paid
                </div>
                <div className="text-2xl font-bold" data-testid="text-total-paid">
                  {totalText}
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-3 mb-4">
              {receipt.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 text-sm"
                  data-testid={`row-line-item-${item.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {item.package?.name || `Enrollment #${item.id}`}
                    </div>
                    {item.package?.description && (
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {item.package.description}
                      </div>
                    )}
                    {receipt.kind === "cart" && (
                      <div className="text-xs text-muted-foreground">
                        For: {item.firstName} {item.lastName}
                      </div>
                    )}
                    {item.isWaitlisted && (
                      <div
                        className="text-xs text-amber-600 font-medium mt-0.5"
                        data-testid={`badge-waitlisted-${item.id}`}
                      >
                        Waitlisted — we'll email when a seat opens
                      </div>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap font-medium">
                    {fmtMoney(item.priceCents, receipt.totals.currency)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmtMoney(receipt.totals.subtotalCents, receipt.totals.currency)}</span>
              </div>
              {(receipt.totals.serviceFeeCents ?? 0) > 0 && (
                <div className="flex justify-between text-muted-foreground" data-testid="text-service-fee">
                  <span>Service fee</span>
                  <span>{fmtMoney(receipt.totals.serviceFeeCents ?? 0, receipt.totals.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1">
                <span>Total</span>
                <span data-testid="text-grand-total">{totalText}</span>
              </div>
            </div>

            {/* Payment method */}
            {receipt.payment && (
              <div className="border-t mt-4 pt-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Payment Method
                </div>
                <div
                  className="flex items-center gap-2 text-sm"
                  data-testid="text-payment-method"
                >
                  <ProviderIcon provider={receipt.payment.provider} />
                  <span>{providerLabel(receipt.payment.provider)}</span>
                  {receipt.payment.reference && (
                    <span
                      className="ml-auto font-mono text-xs text-muted-foreground"
                      data-testid="text-payment-reference"
                    >
                      Ref: {receipt.payment.reference.slice(-12)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Customer details */}
          <div className="receipt-card rounded-lg border bg-card p-6 mb-6">
            <div
              className={`grid gap-6 ${showParent ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
            >
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  <User className="h-3.5 w-3.5" />
                  Student
                </div>
                <div className="font-medium" data-testid="text-student-name">
                  {receipt.customer.student.firstName} {receipt.customer.student.lastName}
                </div>
                {receipt.customer.student.dateOfBirth && (
                  <div
                    className="flex items-center gap-2 text-sm text-muted-foreground mt-1"
                    data-testid="text-student-dob"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    DOB: {fmtBirthday(receipt.customer.student.dateOfBirth)}
                  </div>
                )}
                {receipt.customer.student.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Mail className="h-3.5 w-3.5" />
                    <span data-testid="text-student-email">{receipt.customer.student.email}</span>
                  </div>
                )}
                {receipt.customer.student.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Phone className="h-3.5 w-3.5" />
                    <span data-testid="text-student-phone">{receipt.customer.student.phone}</span>
                  </div>
                )}
              </div>
              {showParent && receipt.customer.parent && (
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    <User className="h-3.5 w-3.5" />
                    Parent / Guardian
                  </div>
                  <div className="font-medium" data-testid="text-parent-name">
                    {receipt.customer.parent.name}
                  </div>
                  {receipt.customer.parent.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Mail className="h-3.5 w-3.5" />
                      <span data-testid="text-parent-email">
                        {receipt.customer.parent.email}
                      </span>
                    </div>
                  )}
                  {receipt.customer.parent.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Phone className="h-3.5 w-3.5" />
                      <span data-testid="text-parent-phone">
                        {receipt.customer.parent.phone}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* What happens next — hidden from print */}
          <div className="receipt-card rounded-lg border bg-card p-6 mb-6 no-print">
            <div className="font-semibold mb-3">What Happens Next</div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">Check your email</div>
                  <div className="text-muted-foreground">
                    A confirmation with your enrollment details and next steps
                    is on its way to{" "}
                    {receipt.customer.student.email ||
                      receipt.customer.parent?.email ||
                      "your inbox"}
                    .
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">Schedule your sessions</div>
                  <div className="text-muted-foreground">
                    {receipt.school?.name || schoolName || "The school"} will
                    contact you to schedule classroom and behind-the-wheel
                    sessions.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">Track your progress</div>
                  <div className="text-muted-foreground">
                    Log into the student portal to monitor your progress
                    throughout the course.
                  </div>
                </div>
              </li>
            </ul>
          </div>

          {/* Actions — hidden from print */}
          <div className="flex flex-wrap items-center justify-center gap-3 no-print">
            <Button
              variant="outline"
              onClick={() => window.print()}
              data-testid="button-print-receipt"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Receipt
            </Button>
            <a href={homeHref}>
              <Button
                style={{ backgroundColor: primaryColor }}
                data-testid="link-back-to-site"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to {receipt.school?.name || schoolName || "Home"}
              </Button>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
