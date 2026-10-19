# Enrollment & payment troubleshooting

For "I paid but I'm not enrolled", "I never got the email", "the school didn't
hear about my sign-up" and "which class is this Stripe payment for?".

## 1. What to ask for (intake)

Ask the school or customer for as much of this as they have:

- Customer name and the **email used at checkout** (a parent may have paid with their own)
- The **reference** (e.g. `AA-7K3F9Q`) — on the thank-you page, the confirmation email and the Stripe receipt
- Approximate date/time of the attempt
- Course / class / date they chose
- Payment evidence: Stripe receipt or a bank/card statement line (amount + date)
- Which emails they did get, if any, and the subject lines

The reference alone is usually enough; name + email + date is the fallback.

## 2. Find it in the admin

| Question | Where |
|---|---|
| Did a payment happen, for what class? | **Admin → Payments** — search the reference, email, phone, Stripe `pi_…`/`cs_…` id or class name. Status: Paid / Cash due / Checkout started / Not completed / Refunded |
| Is the student enrolled? | **Admin → Enrollments → Confirmed** — search name, email or reference; open the row for **Purchase details** |
| Which emails went out, and did they arrive? | Purchase details → **Email history** (Delivered / Bounced / Delayed / Failed / Not sent — unsubscribed) |
| Resend a confirmation or the school notification | Purchase details → **Resend to customer** / **Resend school notification** |
| Customer paid at Stripe but is not enrolled | **Enrollments → Unconfirmed card payments** → *Check all with Stripe* → *Recover…* |
| Started checkout, never paid | Payments → *Checkout started* / *Not completed*; the school also got a **NOT PAID** email |

## 3. How it is supposed to work

```
Card:  checkout started ──(Stripe)──▶ paid ──▶ webhook or reconcile job ──▶ enrollment confirmed
                                                                         ├─▶ customer: "You're enrolled … payment received"
                                                                         └─▶ school:   "PAID — New enrollment …"
       not paid after expireAfterHours (default 1h) ──▶ school: "NOT PAID — checkout not completed …"
Cash:  reservation ──▶ customer: "We received your enrollment" (payment due) + school: "CASH DUE …"
       cash confirmed in admin ──▶ customer confirmation + school "PAID"
```

- Nothing is emailed when a card checkout *starts* — an unpaid checkout is not an enrollment.
- `server/payments/complete-payment.ts` is the only place a provider payment becomes COMPLETED
  (Stripe webhook, the reconcile job and admin recovery all call it).
- **Reconcile job** (`server/payments/reconcile.ts`, every `PAYMENT_RECONCILE_INTERVAL_MINUTES`,
  default 15): asks Stripe about card checkouts 10 min – 48 h old that are still not COMPLETED and
  completes paid ones. So a missed webhook delays an enrollment by ≤ 15 min, never loses it.
  Logs: `[Reconcile] payment N (REF) was paid at Stripe but not confirmed — completed`.
- **Owner emails** go to every active admin / office manager plus the extra inboxes in
  Settings → Communications. A PAID email is sent once per enrollment; if no recipient could be
  reached the "sent" marker is released so **Resend school notification** works.

## 4. Tracing an email end to end

1. Purchase details → Email history gives the recipient, time and **Resend id**.
2. In Resend → **Emails/Logs**, search that id (or the recipient) for the provider-side view.
3. Delivery badges come from the Resend webhook (`/api/webhooks/resend`, events
   `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`).
   If every email stays at "Sent", that webhook isn't reaching us — check it exists on the
   **same Resend account the API key sends from** and that `RESEND_WEBHOOK_SECRET` matches.
4. A bounce or spam complaint adds the address to the school's unsubscribe list; later emails show
   "Not sent — unsubscribed". Fix the address on the enrollment, then resend.

SQL, read-only, when the admin isn't enough:

```sql
-- everything about one reference
select id, status, provider, amount_cents, provider_order_id, provider_payment_id, created_at, completed_at,
       metadata_json->'purchase' as purchase, metadata_json->'providerCheck' as stripe_said
from payments where reference = 'AA-7K3F9Q';

select id, kind, recipient_email, subject, status, delivery_status, provider_message_id, created_at
from session_change_emails
where payment_id = (select id from payments where reference = 'AA-7K3F9Q')
   or enrollment_id in (select id from enrollments where reference = 'AA-7K3F9Q')
order by created_at;
```

## 5. Common causes

| Symptom | Likely cause | Fix |
|---|---|---|
| Paid, not enrolled, older than 15 min | Stripe key/secret wrong for the tenant, or reconcile errors | Railway logs `[Reconcile]` / `[StripeWebhook]`; Payment Settings; then *Recover…* |
| Webhook logs "no Stripe webhook secret" | Secret not saved | Stripe → Workbench → Webhooks → signing secret → Admin → Payment Settings |
| Customer got nothing, school got PAID | Address typo, bounce or unsubscribe | Email history badge; correct the address; Resend to customer |
| School got nothing | No active admins and no extra inboxes, or notifications switched off | Settings → Communications; Resend school notification |
| Stripe payment you can't place | Pre-Oct-2026 payments carry no class | Payments search by amount/date; newer ones show class + ref in the Stripe description |
