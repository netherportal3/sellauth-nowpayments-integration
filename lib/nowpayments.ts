import { getConfig } from "./config";

const NOWPAYMENTS_API_BASE = "https://api.nowpayments.io/v1";

async function getApiKey(): Promise<string> {
  const key = await getConfig("NOWPAYMENTS_API_KEY");
  if (!key) throw new Error("NOWPAYMENTS_API_KEY is not configured");
  return key;
}

async function npFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = `${NOWPAYMENTS_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `NOWPayments API error ${response.status}: ${JSON.stringify(body)}`
    );
  }

  return body;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateInvoiceParams {
  price_amount: number;
  price_currency: string;
  order_id?: string;
  order_description?: string;
  ipn_callback_url?: string;
  success_url?: string;
  cancel_url?: string;
  pay_currency?: string;
}

export interface NowPaymentsInvoice {
  id: string;
  token_id: string;
  order_id: string;
  order_description: string;
  price_amount: string;
  price_currency: string;
  pay_currency: string | null;
  ipn_callback_url: string;
  invoice_url: string;
  success_url: string;
  cancel_url: string;
  created_at: string;
  updated_at: string;
  is_fixed_rate: boolean;
  is_fee_paid_by_user: boolean;
}

export interface NowPaymentsPaymentStatus {
  payment_id: number;
  invoice_id: number | null;
  payment_status: string;
  pay_address: string;
  payin_extra_id: string | null;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  actually_paid_at_fiat: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  purchase_id: number;
  outcome_amount: number;
  outcome_currency: string;
  created_at: string;
  updated_at: string;
  burning_percent: string | null;
  type: string;
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

/**
 * Create a NOWPayments invoice. Returns a hosted payment page URL where the
 * customer can pick their preferred crypto and pay.
 *
 * Docs: POST https://api.nowpayments.io/v1/invoice
 */
export async function createInvoice(
  params: CreateInvoiceParams
): Promise<NowPaymentsInvoice> {
  const result = await npFetch("/invoice", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result as NowPaymentsInvoice;
}

/**
 * Get the status of a specific payment by its NOWPayments payment_id.
 *
 * Docs: GET https://api.nowpayments.io/v1/payment/{payment_id}
 */
export async function getPaymentStatus(
  paymentId: string | number
): Promise<NowPaymentsPaymentStatus> {
  const result = await npFetch(`/payment/${paymentId}`);
  return result as NowPaymentsPaymentStatus;
}

/**
 * Check API status / health.
 *
 * Docs: GET https://api.nowpayments.io/v1/status
 */
export async function getApiStatus(): Promise<{ message: string }> {
  const result = await npFetch("/status");
  return result as { message: string };
}
