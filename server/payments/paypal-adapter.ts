import pkg from "@paypal/paypal-server-sdk";
const { Client, Environment, OrdersController } = pkg as any;

function getPayPalClient(clientId: string, clientSecret: string, mode: string): Client {
  return new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: clientId,
      oAuthClientSecret: clientSecret,
    },
    environment: mode === "production" ? Environment.Production : Environment.Sandbox,
  });
}

export interface PayPalStartInput {
  clientId: string;
  clientSecret: string;
  mode: string;
  amountCents: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export interface PayPalStartOutput {
  orderId: string;
  approvalUrl: string;
}

async function realCreatePayPalOrder(input: PayPalStartInput): Promise<PayPalStartOutput> {
  const client = getPayPalClient(input.clientId, input.clientSecret, input.mode);
  const ordersController = new OrdersController(client);

  const amountValue = (input.amountCents / 100).toFixed(2);

  const response = await ordersController.createOrder({
    body: {
      intent: "CAPTURE",
      purchaseUnits: [
        {
          amount: {
            currencyCode: input.currency,
            value: amountValue,
          },
          description: input.description,
          customId: JSON.stringify(input.metadata),
        },
      ],
      applicationContext: {
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
        brandName: input.description,
        userAction: "PAY_NOW",
      },
    } as any,
  });

  const body = response.result as any;
  const approvalLink = body.links?.find((l: any) => l.rel === "approve" || l.rel === "payer-action");

  if (!approvalLink) {
    throw new Error("PayPal order created but no approval URL returned");
  }

  return {
    orderId: body.id,
    approvalUrl: approvalLink.href,
  };
}

// Indirection seam so tests can stub the network call without monkey-patching
// the export. Runtime callers go through `createPayPalOrder`, which always
// delegates to whatever impl is currently installed (real by default).
let payPalOrderImpl: (input: PayPalStartInput) => Promise<PayPalStartOutput> = realCreatePayPalOrder;

export async function createPayPalOrder(input: PayPalStartInput): Promise<PayPalStartOutput> {
  return payPalOrderImpl(input);
}

export function __setPayPalOrderForTests(
  fn: (input: PayPalStartInput) => Promise<PayPalStartOutput>,
): void {
  payPalOrderImpl = fn;
}

export function __resetPayPalOrderForTests(): void {
  payPalOrderImpl = realCreatePayPalOrder;
}

export interface PayPalCaptureResult {
  ok: boolean;
  captureId?: string;
  amountCents?: number;
  currency?: string;
  raw?: any;
  error?: string;
}

export async function capturePayPalOrder(
  clientId: string,
  clientSecret: string,
  mode: string,
  orderId: string
): Promise<PayPalCaptureResult> {
  try {
    const client = getPayPalClient(clientId, clientSecret, mode);
    const ordersController = new OrdersController(client);

    const response = await ordersController.captureOrder({ id: orderId });
    const body = response.result as any;

    if (body.status !== "COMPLETED") {
      return { ok: false, error: `PayPal order status: ${body.status}` };
    }

    const capture = body.purchaseUnits?.[0]?.payments?.captures?.[0];
    const amountValue = parseFloat(capture?.amount?.value || "0");

    return {
      ok: true,
      captureId: capture?.id,
      amountCents: Math.round(amountValue * 100),
      currency: capture?.amount?.currencyCode || "USD",
      raw: body,
    };
  } catch (err: any) {
    return { ok: false, error: err.message || "PayPal capture failed" };
  }
}

export async function testPayPalConnection(
  clientId: string,
  clientSecret: string,
  mode: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getPayPalClient(clientId, clientSecret, mode);
    const ordersController = new OrdersController(client);

    const response = await ordersController.createOrder({
      body: {
        intent: "CAPTURE",
        purchaseUnits: [
          {
            amount: {
              currencyCode: "USD",
              value: "1.00",
            },
            description: "Connection test",
          },
        ],
      } as any,
    });

    const body = response.result as any;
    if (body.id) {
      return { ok: true };
    }
    return { ok: false, error: "Unexpected response from PayPal" };
  } catch (err: any) {
    const msg = err.message || "Invalid PayPal credentials";
    return { ok: false, error: msg };
  }
}
